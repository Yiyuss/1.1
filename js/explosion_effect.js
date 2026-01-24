// 爆炸效果（艾比大绝专用）
// 使用Explosion.png雪碧图，5行6列共25帧，每帧517x517
class ExplosionEffect extends Entity {
    constructor(player, x, y) {
        super(x, y, 517, 517);
        this.player = player;
        this.startTime = Date.now();
        this.durationMs = 1000; // 1秒动画
        this.frameDuration = this.durationMs / 25; // 每帧40ms
        
        // 雪碧图参数：5行6列，共25帧（实际只使用前25帧）
        this.frameWidth = 517;
        this.frameHeight = 517;
        this.framesPerRow = 6;
        this.framesPerCol = 5;
        this.totalFrames = 25;
        this.currentFrame = 0;
        this.animAccumulator = 0;
        
        // 加载雪碧图
        this.spriteSheet = null;
        this.spriteSheetLoaded = false;
        this._loadSpriteSheet();
        
        // 伤害已应用标记
        this.damageApplied = false;
        
        // 被击中的敌人列表（用于显示knife2.gif效果）
        this.hitEnemies = [];
    }
    
    _loadSpriteSheet() {
        const img = new Image();
        img.onload = () => {
            this.spriteSheet = img;
            this.spriteSheetLoaded = true;
        };
        img.onerror = () => {
            console.warn('[ExplosionEffect] 爆炸雪碧图载入失败');
            this.spriteSheetLoaded = false;
        };
        img.src = 'assets/images/Explosion.png';
    }
    
    update(deltaTime) {
        // 僅視覺效果：需要從遠程玩家位置更新
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            if (rt && typeof rt.RemotePlayerManager !== 'undefined' && typeof rt.RemotePlayerManager.get === 'function') {
                const remotePlayer = rt.RemotePlayerManager.get(this._remotePlayerUid);
                if (remotePlayer) {
                    this.player.x = remotePlayer.x;
                    this.player.y = remotePlayer.y;
                    // 爆炸位置保持不變（使用構造函數中的 x, y）
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                    }
                } else {
                    this.markedForDeletion = true;
                    return;
                }
            } else {
                this.markedForDeletion = true;
                return;
            }
            // 僅視覺模式：只更新位置和動畫，不進行傷害計算
            const elapsed = Date.now() - this.startTime;
            if (this.spriteSheetLoaded) {
                this.animAccumulator += deltaTime;
                while (this.animAccumulator >= this.frameDuration && this.currentFrame < this.totalFrames - 1) {
                    this.currentFrame++;
                    this.animAccumulator -= this.frameDuration;
                }
            }
            if (elapsed >= this.durationMs) {
                this.markedForDeletion = true;
                this._destroyHitOverlays();
            }
            return;
        }
        
        const elapsed = Date.now() - this.startTime;
        
        // 更新动画帧
        if (this.spriteSheetLoaded) {
            this.animAccumulator += deltaTime;
            while (this.animAccumulator >= this.frameDuration && this.currentFrame < this.totalFrames - 1) {
                this.currentFrame++;
                this.animAccumulator -= this.frameDuration;
            }
        }
        
        // 在动画开始后立即应用伤害（只应用一次）
        if (!this.damageApplied && elapsed >= 50) {
            this._applyDamage();
            this.damageApplied = true;
        }
        
        // 动画结束后标记删除
        if (elapsed >= this.durationMs) {
            this.markedForDeletion = true;
            this._destroyHitOverlays();
        }
    }
    
    _applyDamage() {
        // 僅視覺效果：不進行傷害計算
        if (this._isVisualOnly) return;
        
        if (!Game || !Game.enemies) return;
        
        const fixedDamage = 15000; // 固定伤害，不被任何加成影响
        
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
        
        // ✅ 組隊模式：發送 aoe_tick 到伺服器（全地圖爆炸，使用很大的半徑覆蓋整個地圖）
        // 注意：EXPLOSION 是固定傷害，不經過 DamageSystem，所以沒有吸血和爆擊
        if (isSurvivalMode && isMultiplayer && !this._isVisualOnly && this.player && this.player === Game.player) {
            if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
                // 使用很大的半徑覆蓋整個地圖（確保所有敵人都受到傷害）
                const worldWidth = (typeof Game !== 'undefined' && Game.worldWidth) ? Game.worldWidth : 3840;
                const worldHeight = (typeof Game !== 'undefined' && Game.worldHeight) ? Game.worldHeight : 2160;
                const maxRadius = Math.max(worldWidth, worldHeight) * 2; // 使用地圖尺寸的2倍作為半徑，確保覆蓋整個地圖
                
                window.SurvivalOnlineRuntime.sendToNet({
                    type: 'aoe_tick',
                    weaponType: 'EXPLOSION',
                    x: this.x,
                    y: this.y,
                    radius: maxRadius,
                    damage: fixedDamage,
                    allowCrit: false, // 固定傷害，不允許爆擊
                    critChanceBonusPct: 0,
                    timestamp: Date.now()
                });
            }
        }
        
        for (const enemy of Game.enemies) {
            if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
            
            // ✅ 權威伺服器模式：爆炸傷害應該由伺服器權威處理
            // 單機模式：直接造成傷害並顯示傷害數字
            // 多人模式：不調用 takeDamage（避免雙重傷害），傷害由伺服器處理
            // 注意：EXPLOSION 是固定傷害，不經過 DamageSystem，所以沒有吸血
            // 單機模式：直接造成傷害並顯示傷害數字
            if (!isSurvivalMode || !isMultiplayer) {
                enemy.takeDamage(fixedDamage);
                if (typeof DamageNumbers !== 'undefined') {
                    this._showSpecialDamageNumber(fixedDamage, enemy.x, enemy.y - (enemy.height || 0) / 2);
                }
            }
            // 多人模式：傷害由伺服器權威處理，伺服器透過 hitEvents 返回傷害數字
            // ✅ 修復：在多人模式下也需要記錄命中的敵人，以便創建 knife2.gif 覆蓋層
            this.hitEnemies.push({
                enemy: enemy,
                x: enemy.x,
                y: enemy.y,
                enemyId: enemy.id || null
            });
        }
        
        // 创建knife2.gif效果覆盖层
        this._createHitOverlays();
    }
    
    _showSpecialDamageNumber(value, x, y) {
        // 由于DamageNumbers不支持自定义颜色和大小，我们需要直接创建DOM元素
        // 使用DamageNumbers的ensureLayer方法来获取或创建layer
        let layer = null;
        try {
            if (typeof DamageNumbers !== 'undefined' && DamageNumbers.ensureLayer) {
                layer = DamageNumbers.ensureLayer();
            } else if (typeof DamageNumbers !== 'undefined' && DamageNumbers._layer) {
                layer = DamageNumbers._layer;
            }
        } catch (_) {}
        if (!layer) return;
        
        const canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        const camX = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0;
        const camY = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0;
        const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
        
        let sx = x - camX;
        let sy = y - camY;
        if (!rotatedPortrait) {
            sx *= scaleX;
            sy *= scaleY;
        }
        
        const el = document.createElement('div');
        el.textContent = String(value);
        el.style.position = 'absolute';
        el.style.left = Math.round(sx) + 'px';
        el.style.top = Math.round(sy) + 'px';
        el.style.transform = 'translate(-50%, -50%)';
        el.style.fontFamily = 'GenSenRounded-H, sans-serif';
        el.style.fontWeight = '800';
        
        // 放大2倍：一般伤害数字是28px，这里使用56px
        try {
            const isMobile = (typeof window !== 'undefined') && (
                (window.matchMedia && (window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches))
            );
            const baseSize = 56; // 28 * 2
            const size = isMobile ? Math.round(baseSize * 0.75) : baseSize;
            el.style.fontSize = size + 'px';
        } catch (_) {
            el.style.fontSize = '56px';
        }
        
        // 特殊的红色特效
        el.style.color = '#ff0000';
        el.style.webkitTextStroke = '2px #ffffff';
        el.style.textShadow = '0 0 20px rgba(255, 0, 0, 1), 0 0 10px rgba(255, 255, 255, 0.8), 0 0 4px #000, 3px 0 0 #000, -3px 0 0 #000, 0 3px 0 #000, 0 -3px 0 #000';
        el.style.willChange = 'transform, opacity';
        
        layer.appendChild(el);
        
        // 显示时间2倍：一般伤害数字是1700ms，这里使用3400ms
        const duration = 3400; // 1700 * 2
        const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
        const mag = 72; // 36 * 2（位移量也放大2倍）
        const dx = 0;
        const dy = -mag;
        
        const anim = el.animate([
            { transform: 'translate(-50%, -50%)', opacity: 1 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`, opacity: 0 }
        ], { duration, easing, fill: 'forwards' });
        
        anim.onfinish = () => {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        };
    }
    
    _createHitOverlays() {
        const viewport = document.getElementById('viewport');
        if (!viewport) return;
        
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
            layer.style.zIndex = '7';
            layer.style.mixBlendMode = 'normal';
            viewport.appendChild(layer);
        }
        
        const hitImg = (Game && Game.images) ? Game.images['knife2'] : null;
        if (!hitImg || !hitImg.complete || !(hitImg.naturalWidth > 0)) return;
        
        const cap = Math.min(50, this.hitEnemies.length); // 上限50个，避免DOM过载
        const sizePx = 80; // knife2.gif显示大小
        
        for (let i = 0; i < cap; i++) {
            const hit = this.hitEnemies[i];
            if (!hit) continue;
            
            const el = document.createElement('img');
            const src = hitImg.src + (hitImg.src.includes('?') ? '&' : '?') + 'cb=' + Date.now();
            el.src = src;
            el.alt = 'ExplosionHit';
            el.style.position = 'absolute';
            el.style.width = sizePx + 'px';
            el.style.height = sizePx + 'px';
            el.style.transform = 'translate(-50%, -50%)';
            el.style.imageRendering = 'pixelated';
            el.style.backgroundColor = 'transparent';
            el.style.opacity = '1';
            el.style.visibility = 'hidden';
            el.loading = 'eager';
            el.decoding = 'sync';
            el.addEventListener('load', () => { el.style.visibility = 'visible'; }, { once: true });
            el.dataset.logic = 'explosion-hit';
            el.dataset.hitIndex = i;
            layer.appendChild(el);
            
            hit.domEl = el;
        }
        
        // 初始位置同步
        this._updateHitOverlayPositions();
    }
    
    _updateHitOverlayPositions() {
        if (!this.hitEnemies.length) return;
        
        const canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        const camX = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0;
        const camY = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0;
        const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
        
        for (const hit of this.hitEnemies) {
            if (!hit || !hit.domEl) continue;
            
            const enemy = hit.enemy;
            const ex = (enemy && !enemy.markedForDeletion) ? enemy.x : (hit.x || 0);
            const ey = (enemy && !enemy.markedForDeletion) ? enemy.y : (hit.y || 0);
            
            let sx = ex - camX;
            let sy = ey - camY;
            if (!rotatedPortrait) {
                sx *= scaleX;
                sy *= scaleY;
            }
            
            hit.domEl.style.left = sx + 'px';
            hit.domEl.style.top = sy + 'px';
        }
    }
    
    _destroyHitOverlays() {
        for (const hit of this.hitEnemies) {
            if (hit && hit.domEl && hit.domEl.parentNode) {
                hit.domEl.parentNode.removeChild(hit.domEl);
            }
        }
        this.hitEnemies = [];
    }
    
    draw(ctx) {
        if (!this.spriteSheetLoaded || !this.spriteSheet) return;
        
        // 计算当前帧在雪碧图中的位置
        const col = this.currentFrame % this.framesPerRow;
        const row = Math.floor(this.currentFrame / this.framesPerRow);
        
        // 计算源矩形
        const sx = col * this.frameWidth;
        const sy = row * this.frameHeight;
        
        // 使用世界坐标绘制（Game.draw()已经做了ctx.translate，所以直接使用this.x和this.y）
        // 绘制位置：玩家中心（this.x, this.y），以中心为基准绘制
        // 放大1.5倍
        const drawWidth = this.frameWidth * 1.5;
        const drawHeight = this.frameHeight * 1.5;
        ctx.save();
        ctx.drawImage(
            this.spriteSheet,
            sx, sy, this.frameWidth, this.frameHeight,
            this.x - drawWidth / 2, this.y - drawHeight / 2,
            drawWidth, drawHeight
        );
        ctx.restore();
        
        // 更新knife2.gif覆盖层位置
        this._updateHitOverlayPositions();
    }
}

