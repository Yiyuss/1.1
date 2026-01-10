// 守護領域（常駐場域）：在玩家腳底生成持續傷害區域，靠近持續扣血
// 職責：
// - 跟隨玩家位置（中心對齊）
// - 使用與綿羊護體（ORBIT）相同的傷害間隔與傷害量（tickIntervalMs=120ms，tickDamage=round(damage)）
// - 適度顯示傷害數字，沿用 DamageNumbers 每敵人節流機制
// 依賴：Entity、Game、DamageSystem、DamageNumbers、CONFIG、Utils
// 維護備註：
// - SaveCode 不涉及武器狀態與臨時武器的存檔，無需變更 SCHEMA_VERSION 或 localStorage 鍵名
// - 視覺資源鍵：'field'（於 main.js 的 createDefaultImages 中載入 assets/images/field.png，拼接雪碧圖）
// - 半徑由 CONFIG.WEAPONS.AURA_FIELD.FIELD_RADIUS 與 FIELD_RADIUS_PER_LEVEL 決定；
//   Weapon.fire 會動態同步半徑與傷害，避免重複生成導致堆疊
class AuraField extends Entity {
    constructor(player, radius, damage) {
        super(player.x, player.y, radius * 2, radius * 2);
        this.player = player;
        this.radius = radius;
        this.damage = damage;
        this.tickDamage = Math.max(1, Math.round(this.damage));
        this.tickIntervalMs = 120; // 與 ORBIT/LASER 相同節奏
        this.tickAccumulator = 0;
        this.weaponType = 'AURA_FIELD';
        // 碰撞以圓形為主
        this.collisionRadius = radius;

        // 視覺倍率（只影響 DOM 圖像尺寸，不影響實際傷害/碰撞半徑）
        this.visualScale = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS.AURA_FIELD && CONFIG.WEAPONS.AURA_FIELD.VISUAL_SCALE) || 1.95;

        // DOM 動態雪碧圖：建立於獨立層，使用濾色混合去背
        this._layer = null;
        this.el = null;
        // 雪碧圖動畫參數（60 張 / 10x6，每格 512x512）
        this.frameWidth = 512;
        this.frameHeight = 512;
        this.sheetCols = 10;
        this.sheetRows = 6;
        this.frameCount = 60;
        this.frameIndex = 0;
        this.animationFps = 30; // 30fps，接近原 GIF 節奏
        this.animAccumulator = 0;
        this._createOrUpdateDom();
    }

    update(deltaTime) {
        // 跟隨玩家中心
        this.x = this.player.x;
        this.y = this.player.y;

        // 確保碰撞半徑與尺寸與半徑一致（支援升級動態同步）
        this.collisionRadius = this.radius;
        this.width = this.radius * 2;
        this.height = this.radius * 2;

        // 依間隔造成持續傷害（補齊延遲）
        this.tickAccumulator += deltaTime;
        while (this.tickAccumulator >= this.tickIntervalMs) {
            for (const enemy of Game.enemies) {
                if (this.isColliding(enemy)) {
                    let finalDamage = this.tickDamage;
                    let isCrit = false;
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(this.tickDamage, enemy, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
                        finalDamage = result.amount;
                        isCrit = result.isCrit;
                    }
                    
                    // 組隊模式：隊員的光環領域攻擊敵人時，同步傷害到隊長端
                    try {
                        let isSurvivalMode = false;
                        try {
                            const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                                ? GameModeManager.getCurrent()
                                : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                                    ? ModeManager.getActiveModeId()
                                    : null);
                            isSurvivalMode = (activeId === 'survival' || activeId === null);
                        } catch (_) {}
                        
                        if (isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.role === "guest" && enemy && enemy.id) {
                            if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
                                window.SurvivalOnlineRuntime.sendToNet({
                                    t: "enemy_damage",
                                    enemyId: enemy.id,
                                    damage: finalDamage,
                                    weaponType: this.weaponType || "AURA_FIELD",
                                    isCrit: isCrit
                                });
                            }
                        }
                    } catch (_) {}
                    
                    enemy.takeDamage(finalDamage);
                    if (typeof DamageNumbers !== 'undefined') {
                        DamageNumbers.show(finalDamage, enemy.x, enemy.y - (enemy.height||0)/2, isCrit, { dirX: (enemy.x - this.x), dirY: (enemy.y - this.y), enemyId: enemy.id });
                    }
                }
            }
            this.tickAccumulator -= this.tickIntervalMs;
        }

        // 同步GIF位置與尺寸
        this._updateDomPosition();
        // 更新雪碧圖動畫
        this._updateAnimation(deltaTime);
    }

    draw(ctx) {
        // 視覺僅由 DOM 疊層呈現，避免與畫布重疊產生黑圈/範圍顯示
        return;
    }

    // 建立或更新DOM 雪碧圖元素
    _ensureLayer() {
        const viewport = document.getElementById('viewport');
        if (!viewport) return null;
        if (this._layer && this._layer.isConnected) return this._layer;
        let layer = document.getElementById('aura-effects-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'aura-effects-layer';
            layer.style.position = 'absolute';
            layer.style.left = '0';
            layer.style.top = '0';
            layer.style.width = '100%';
            layer.style.height = '100%';
            layer.style.pointerEvents = 'none';
            layer.style.zIndex = '4'; // 低於傷害數字（6）與其他技能特效（7），高於畫布（1）
            // 使用濾色混合，讓火焰與背景融合
            layer.style.mixBlendMode = 'screen';
            viewport.appendChild(layer);
        }
        this._layer = layer;
        return layer;
    }

    _createOrUpdateDom() {
        const layer = this._ensureLayer();
        if (!layer) return;
        if (!this.el) {
            const el = document.createElement('div');
            el.setAttribute('role', 'img');
            el.setAttribute('aria-label', 'Aura Field');
            el.style.position = 'absolute';
            el.style.width = (this.radius * 2 * this.visualScale) + 'px';
            el.style.height = (this.radius * 2 * this.visualScale) + 'px';
            el.style.imageRendering = 'pixelated';
            el.style.transform = 'translate(-50%, -50%)'; // 以中心對齊
            el.style.willChange = 'transform, opacity, width, height, background-position, background-size';
            // 使用濾色混合，讓火焰與背景融合
            el.style.mixBlendMode = 'screen';
            el.style.opacity = '1';
            el.style.backgroundColor = 'transparent';
            // 設定雪碧圖背景
            const imgSrc = (Game.images && Game.images['field']) ? Game.images['field'].src : 'assets/images/field.png';
            el.style.backgroundImage = `url(${imgSrc})`;
            el.style.backgroundRepeat = 'no-repeat';
            // 初始化背景尺寸與位置（依元素尺寸動態計算）
            this.el = el;
            layer.appendChild(el);
        } else {
            this.el.style.width = (this.radius * 2 * this.visualScale) + 'px';
            this.el.style.height = (this.radius * 2 * this.visualScale) + 'px';
        }
        // 不使用裁剪遮罩，僅靠混合模式去背
        this._updateDomPosition();
    }

    _updateDomPosition() {
        if (!this.el || !this._layer) return;
        try {
            const canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width / canvas.width;
            const scaleY = rect.height / canvas.height;
            const camX = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0;
            const camY = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0;
            const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');
            let sx, sy;
            if (rotatedPortrait) {
                sx = this.x - camX;
                sy = this.y - camY;
            } else {
                sx = (this.x - camX) * scaleX;
                sy = (this.y - camY) * scaleY;
            }
            this.el.style.left = sx + 'px';
            this.el.style.top = sy + 'px';
            // 同步尺寸（半徑可能動態成長）
            const w = (this.radius * 2 * this.visualScale);
            const h = (this.radius * 2 * this.visualScale);
            this.el.style.width = w + 'px';
            this.el.style.height = h + 'px';
            // 動態計算背景尺寸，使每格對應元素尺寸
            const scaleBgX = w / this.frameWidth;
            const scaleBgY = h / this.frameHeight;
            const bgW = this.sheetCols * this.frameWidth * scaleBgX;
            const bgH = this.sheetRows * this.frameHeight * scaleBgY;
            this.el.style.backgroundSize = `${bgW}px ${bgH}px`;
        } catch(_) {}
    }

    // 逐幀更新：依 FPS 累積切換 frameIndex，並套用背景偏移
    _updateAnimation(deltaTime) {
        if (!this.el) return;
        const frameDuration = 1000 / this.animationFps;
        this.animAccumulator += deltaTime || 0;
        while (this.animAccumulator >= frameDuration) {
            this.frameIndex = (this.frameIndex + 1) % this.frameCount;
            this.animAccumulator -= frameDuration;
        }
        const col = this.frameIndex % this.sheetCols;
        const row = Math.floor(this.frameIndex / this.sheetCols);
        const w = (this.radius * 2 * this.visualScale);
        const h = (this.radius * 2 * this.visualScale);
        const offsetX = -col * w;
        const offsetY = -row * h;
        this.el.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
    }

    // 已移除裁剪遮罩（GIF 動畫無法靠裁剪達到理想效果）

    destroy() {
        this.markedForDeletion = true;
        try {
            if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
            this.el = null;
        } catch(_) {}
    }
}

// 導出至全域（與其他投射物類相同風格）
window.AuraField = AuraField;
