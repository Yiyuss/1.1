// 斬擊效果：在玩家面前形成扇形範圍，短時間演出並瞬時造成傷害
class SlashEffect extends Entity {
    constructor(player, angle, damage, radius, arcDeg, durationMs) {
        super(player.x, player.y, 2, 2);
        this.player = player;
        this.angle = angle || 0;
        this.damage = Math.max(0, damage || 0);
        this.radius = Math.max(1, radius || 60);
        this.arcRad = Math.max(0.1, (arcDeg || 80) * Math.PI / 180);
        this.durationMs = Math.max(60, durationMs || 1000);
        this.startTime = Date.now();
        this.weaponType = 'SLASH';
        this.appliedDamage = false;
        // 命中的敵人（用於覆蓋 GIF 演出）
        this.hitEnemies = [];
        // 動圖鍵（預設使用 knife.gif 作為扇形斬擊前景）
        this.overlayImageKey = 'knife';
        // 命中濺血 GIF（預設 knife2.gif）
        this.hitOverlayImageKey = 'knife2';
        // GIF 只顯示一次：在一次斬擊週期中顯示一段時間後隱藏
        // 預設顯示時間採用週期的一半（例如 1200ms 週期則顯示約 600ms）
        this.overlayPlayOnceMs = Math.floor(this.durationMs * 0.5);
        this._overlayHidden = false;
        // 色鍵設定（畫布後備用）：去除 #192631 背景（近似容差）
        this.keyColor = { r: 0x19, g: 0x26, b: 0x31 };
        this.keyTolerance = 64; // 強化容差以可靠去除 #192631 背景
        // 固定前方播放位置（不隨半徑遠離玩家）
        this.overlayOffset = 60;
        this._offscreenCanvas = null;
        this._offscreenCtx = null;
        this._offW = 0;
        this._offH = 0;
        // DOM 疊層：以 CSS 濾色（screen）混合顯示 GIF，避免畫布黑塊
        this._domLayer = null;
        this._domEls = [];
        this._hitDomEls = [];
        this._domInitialized = false;
        this._hitDomCreated = false;
        // 視覺倍率：隨半徑放大（只影響 DOM 圖像尺寸）
        this.visualScale = 1.0;
        // 視覺相位（用於光暈脈動）
        this.phase = 0;
        // 斬擊描邊寬度（像素）
        this.strokeWidth = 8;
        // 粒子（簡易火花）
        this.particles = [];
        this._spawnInitialSparks();
    }

    _normalizedAngleDiff(a, b) {
        let d = a - b;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return Math.abs(d);
    }

    _applyDamageOnce() {
        // 僅視覺效果：不進行傷害計算
        if (this._isVisualOnly) return;
        
        if (this.appliedDamage) return;
        const enemies = (Game && Game.enemies) ? Game.enemies : [];
        const halfArc = this.arcRad / 2;
        // 計算 GIF 的旋轉矩形（貼齊視覺圖）
        const ratio = (this.overlayAspectW || 192) / (this.overlayAspectH || 250);
        const heightPx = Math.max(56, this.radius * 0.75) * (this.visualScale || 1.0);
        const widthPx = Math.max(1, Math.floor(heightPx * ratio));
        const cx = this.player.x + Math.cos(this.angle) * (this.overlayOffset || 60);
        const cy = this.player.y + Math.sin(this.angle) * (this.overlayOffset || 60);
        const cosA = Math.cos(this.angle), sinA = Math.sin(this.angle);
        for (const enemy of enemies) {
            if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
            const dx = enemy.x - this.player.x;
            const dy = enemy.y - this.player.y;
            const ang = Math.atan2(dy, dx);
            const diff = this._normalizedAngleDiff(ang, this.angle);
            if (diff <= halfArc) {
                // 旋轉到 GIF 的局部座標並做矩形邊界檢查
                const ex = enemy.x - cx;
                const ey = enemy.y - cy;
                const localX =  cosA * ex + sinA * ey; // 旋轉 -angle
                const localY = -sinA * ex + cosA * ey;
                if (Math.abs(localX) > widthPx / 2 || Math.abs(localY) > heightPx / 2) continue;
                let finalDamage = this.damage;
                let isCrit = false;
                let lifestealAmount = 0;
                if (typeof DamageSystem !== 'undefined') {
                    const result = DamageSystem.computeHit(this.damage, enemy, {
                        weaponType: this.weaponType,
                        critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0)
                    });
                    finalDamage = result.amount;
                    isCrit = result.isCrit;
                    lifestealAmount = (typeof result.lifestealAmount === 'number') ? result.lifestealAmount : 0;
                }
                
                // ✅ 權威伺服器模式：傷害應該由伺服器權威處理
                // 單機模式：直接造成傷害並顯示傷害數字
                // 多人模式：不調用 takeDamage（避免雙重傷害），傷害由伺服器 hitEvents 處理
                const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
                let isSurvivalMode = false;
                try {
                    const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                    isSurvivalMode = (activeId === 'survival' || activeId === null);
                } catch (_) {}
                
                // 單機模式：直接造成傷害並顯示傷害數字
                if (!isSurvivalMode || !isMultiplayer) {
                    enemy.takeDamage(finalDamage);
                    if (typeof DamageNumbers !== 'undefined') {
                        DamageNumbers.show(finalDamage, enemy.x, enemy.y - (enemy.height||0)/2, isCrit, { dirX: dy, dirY: dx, enemyId: enemy.id });
                    }
                }
                // 多人模式：傷害由伺服器權威處理，伺服器透過 hitEvents 返回傷害數字
                this.hitEnemies.push(enemy);
            }
        }
        this.appliedDamage = true;
    }

    _spawnInitialSparks() {
        const count = 18;
        for (let i = 0; i < count; i++) {
            const t = (i / count - 0.5) * this.arcRad; // 中心±扇形
            const ang = this.angle + t;
            const r = this.radius * (0.7 + Math.random() * 0.3);
            const px = this.player.x + Math.cos(ang) * r;
            const py = this.player.y + Math.sin(ang) * r;
            this.particles.push({
                x: px,
                y: py,
                vx: (Math.random() - 0.5) * 1.4,
                vy: (Math.random() - 0.5) * 1.4,
                life: 240 + Math.random() * 160,
                maxLife: 400,
                size: 3 + Math.random() * 2,
                color: '#ffcc66'
            });
        }
    }

    _updateParticles(dt) {
        const particles = this.particles;
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.98;
            p.vy *= 0.98;
        }
    }

    update(deltaTime) {
        const elapsed = Date.now() - this.startTime;
        this.phase += deltaTime || 16;
        if (!this.appliedDamage) this._applyDamageOnce();
        this._updateParticles(deltaTime || 16);
        // 若已建立 DOM 視覺則持續更新位置與尺寸
        if (this._domInitialized) {
            this._updateDomPositions();
            // 在週期中只顯示一次：到達 overlayPlayOnceMs 後隱藏 GIF
            if (!this._overlayHidden && elapsed >= this.overlayPlayOnceMs) {
                for (const item of this._domEls) {
                    if (item.el) item.el.style.display = 'none';
                }
                for (const item of this._hitDomEls) {
                    if (item.el) item.el.style.display = 'none';
                }
                this._overlayHidden = true;
            }
        }
        if (elapsed >= this.durationMs) {
            this.markedForDeletion = true;
            this._destroyDom();
        }
    }

    draw(ctx) {
        // 以 GIF 覆蓋命中目標，並在前景層繪製（由 Game.drawEntities 控制層級）
        const img = (Game && Game.images) ? Game.images[this.overlayImageKey] : null;
        if (!img || !img.complete || !(img.naturalWidth > 0)) {
            // 後備：若 GIF 尚未載入，使用原本的描邊與粒子演出
            const t = (this.phase || 0) / 1000;
            const pulse = 0.6 + 0.4 * Math.sin(t * 10);
            const inner = Math.max(6, this.strokeWidth * (0.8 + 0.2 * pulse));
            const outer = inner * 1.7;
            const startAng = this.angle - this.arcRad / 2;
            const endAng = this.angle + this.arcRad / 2;
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#fff';
            ctx.globalAlpha = 0.85;
            ctx.lineWidth = inner;
            ctx.beginPath();
            ctx.arc(this.player.x, this.player.y, this.radius, startAng, endAng);
            ctx.stroke();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.28;
            ctx.strokeStyle = '#ffd27f';
            ctx.lineWidth = outer;
            ctx.beginPath();
            ctx.arc(this.player.x, this.player.y, this.radius, startAng, endAng);
            ctx.stroke();
            ctx.globalAlpha = 0.22;
            ctx.strokeStyle = '#ffa64d';
            ctx.lineWidth = inner * 1.25;
            ctx.beginPath();
            ctx.arc(this.player.x, this.player.y, this.radius * 0.96, startAng, endAng);
            ctx.stroke();
            for (const p of this.particles) {
                const alpha = Math.max(0.04, Math.min(1, p.life / (p.maxLife || 400)));
                ctx.globalAlpha = alpha * 0.6;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 1.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            return;
        }

        // 使用 DOM 疊層顯示 GIF，避免畫布色鍵造成黑塊
        if (!this._domInitialized) {
            try {
                this._createDomImages(img.src);
                this._domInitialized = true;
            } catch (_) {
                // DOM 建立失敗則保留描邊後備
            }
        }
        // 建立命中濺血 GIF（每次斬擊只建立一次）
        if (!this._hitDomCreated) {
            try {
                this._createHitDomImages();
                this._hitDomCreated = true;
            } catch (_) {}
        }
        return;
    }

    // ===== DOM 疊層：建立/更新/銷毀 =====
    _ensureDomLayer() {
        const viewport = document.getElementById('viewport');
        if (!viewport) return null;
        if (this._domLayer && this._domLayer.isConnected) return this._domLayer;
        let layer = document.getElementById('skill-effects-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'skill-effects-layer';
            layer.style.position = 'absolute';
            layer.style.left = '0';
            layer.style.top = '0';
            layer.style.width = '100%';
            layer.style.height = '100%';
            layer.style.pointerEvents = 'none';
            layer.style.zIndex = '7'; // 高於 aura-effects-layer(4) 與畫布(1)，低於傷害數字(6)時可視需求調整
            // 正常混合（使用者已去背，不需濾色）
            layer.style.mixBlendMode = 'normal';
            viewport.appendChild(layer);
        }
        this._domLayer = layer;
        return layer;
    }

    _createDomImages(src) {
        const layer = this._ensureDomLayer();
        if (!layer) return;
        const makeImg = (x, y, sizePx, angle) => {
            const el = document.createElement('img');
            // 每次建立唯一資源 URL，確保 GIF 從第1偵開始播放
            const freshSrc = this._freshGifSrc(src);
            el.src = freshSrc;
            el.alt = 'Slash';
            el.style.position = 'absolute';
            // 依 192x250 比例設定寬高（維持原始長寬比）
            const ratio = (this.overlayAspectW || 192) / (this.overlayAspectH || 250);
            const heightPx = sizePx;
            const widthPx = Math.max(1, Math.floor(heightPx * ratio));
            el.style.width = widthPx + 'px';
            el.style.height = heightPx + 'px';
            el.style.transform = 'translate(-50%, -50%) rotate(' + angle + 'rad)';
            el.style.imageRendering = 'pixelated';
            // 不使用任何濾色或濾鏡（已去背）
            el.style.backgroundColor = 'transparent';
            el.style.opacity = '1';
            // 等待載入完成再顯示，避免半截畫面
            el.style.visibility = 'hidden';
            el.loading = 'eager';
            el.decoding = 'sync';
            el.addEventListener('load', () => { el.style.visibility = 'visible'; }, { once: true });
            el.dataset.logic = 'slash';
            layer.appendChild(el);
            return el;
        };
        const baseSize = Math.max(56, this.radius * 0.75) * this.visualScale;
        // 無論是否命中敵人，僅建立一個前景 GIF，避免密集敵人造成 DOM 過載或多重顯示
        const sx = this.player.x + Math.cos(this.angle) * (this.overlayOffset || 60);
        const sy = this.player.y + Math.sin(this.angle) * (this.overlayOffset || 60);
        const el = makeImg(sx, sy, baseSize, this.angle);
        this._domEls.push({ el, x: sx, y: sy });
        // 初始位置同步
        this._updateDomPositions();
    }

    _createHitDomImages() {
        const layer = this._ensureDomLayer();
        if (!layer) return;
        const hitImg = (Game && Game.images) ? Game.images[this.hitOverlayImageKey] : null;
        if (!hitImg || !hitImg.complete || !(hitImg.naturalWidth > 0)) return;
        const makeHit = (x, y, sizePx) => {
            const el = document.createElement('img');
            const src = this._freshGifSrc(hitImg.src);
            el.src = src;
            el.alt = 'SlashHit';
            el.style.position = 'absolute';
            const ratio = (this.overlayAspectW || 192) / (this.overlayAspectH || 250);
            const heightPx = sizePx;
            const widthPx = Math.max(1, Math.floor(heightPx * ratio));
            el.style.width = widthPx + 'px';
            el.style.height = heightPx + 'px';
            el.style.transform = 'translate(-50%, -50%)'; // 濺血不旋轉
            el.style.imageRendering = 'pixelated';
            el.style.backgroundColor = 'transparent';
            el.style.opacity = '1';
            el.style.visibility = 'hidden';
            el.loading = 'eager';
            el.decoding = 'sync';
            el.addEventListener('load', () => { el.style.visibility = 'visible'; }, { once: true });
            el.dataset.logic = 'slash-hit';
            layer.appendChild(el);
            return el;
        };
        const cap = 10; // 上限避免 DOM 過載
        const sizePx = Math.max(48, Math.min(120, this.radius * 0.45)) * Math.max(0.8, this.visualScale * 0.7);
        const enemies = this.hitEnemies.slice(0, cap);
        for (const enemy of enemies) {
            if (!enemy) continue;
            // 記錄命中當下的位置，確保即使敵人死亡也能在最後位置顯示濺血
            const lastX = enemy.x;
            const lastY = enemy.y;
            const el = makeHit(lastX, lastY, sizePx);
            this._hitDomEls.push({ el, enemy, x: lastX, y: lastY });
        }
        // 初始位置同步
        this._updateDomPositions();
    }

    _freshGifSrc(src) {
        try {
            const hasQuery = src.includes('?');
            const buster = 'cb=' + Math.floor(performance.now());
            return src + (hasQuery ? '&' : '?') + buster;
        } catch (_) {
            const hasQuery = src.includes('?');
            const buster = 'cb=' + Date.now();
            return src + (hasQuery ? '&' : '?') + buster;
        }
    }

    _updateDomPositions() {
        if ((!this._domEls.length && !this._hitDomEls.length) || !this._domLayer) return;
        const canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        const camX = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0;
        const camY = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0;
        const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
        for (const item of this._domEls) {
            // 固定在玩家前方 overlayOffset（不隨半徑距離變動）
            let sx = (this.player.x + Math.cos(this.angle) * (this.overlayOffset || 60)) - camX;
            let sy = (this.player.y + Math.sin(this.angle) * (this.overlayOffset || 60)) - camY;
            if (!rotatedPortrait) { sx *= scaleX; sy *= scaleY; }
            item.el.style.left = sx + 'px';
            item.el.style.top = sy + 'px';
            // 角度可能隨玩家方向改變（保持一致即可）
            item.el.style.transform = 'translate(-50%, -50%) rotate(' + this.angle + 'rad)';
            // 尺寸隨半徑變化（維持 192x250 比例）
            const heightPx = Math.max(56, this.radius * 0.75) * this.visualScale;
            const ratio = (this.overlayAspectW || 192) / (this.overlayAspectH || 250);
            const widthPx = Math.max(1, Math.floor(heightPx * ratio));
            item.el.style.width = widthPx + 'px';
            item.el.style.height = heightPx + 'px';
        }
        for (const item of this._hitDomEls) {
            const enemy = item.enemy;
            // 即使敵人死亡或被標記刪除，也保留在最後命中的位置顯示濺血
            const ex = (enemy && !enemy.markedForDeletion) ? enemy.x : (item.x || 0);
            const ey = (enemy && !enemy.markedForDeletion) ? enemy.y : (item.y || 0);
            let sx = ex - camX;
            let sy = ey - camY;
            if (!rotatedPortrait) { sx *= scaleX; sy *= scaleY; }
            item.el.style.left = sx + 'px';
            item.el.style.top = sy + 'px';
        }
    }

    _destroyDom() {
        try {
            for (const item of this._domEls) {
                if (item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el);
            }
            for (const item of this._hitDomEls) {
                if (item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el);
            }
        } catch(_) {}
        this._domEls.length = 0;
        this._hitDomEls.length = 0;
        this._domInitialized = false;
    }

    // 已移除舊版畫布色鍵法（避免黑塊與跨域限制），保留 DOM 疊層與描邊後備。
}
