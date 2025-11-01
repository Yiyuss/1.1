// 守護領域（常駐場域）：在玩家腳底生成持續傷害區域，靠近持續扣血
// 職責：
// - 跟隨玩家位置（中心對齊）
// - 使用與綿羊護體（ORBIT）相同的傷害間隔與傷害量（tickIntervalMs=120ms，tickDamage=round(damage)）
// - 適度顯示傷害數字，沿用 DamageNumbers 每敵人節流機制
// 依賴：Entity、Game、DamageSystem、DamageNumbers、CONFIG、Utils
// 維護備註：
// - SaveCode 不涉及武器狀態與臨時武器的存檔，無需變更 SCHEMA_VERSION 或 localStorage 鍵名
// - 視覺資源鍵：'field'（於 main.js 的 createDefaultImages 中載入 assets/images/field.gif）
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

        // DOM 動態GIF：建立於獨立層，使用濾色混合去背
        this._layer = null;
        this.el = null;
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
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(this.tickDamage, enemy, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
                        enemy.takeDamage(result.amount);
                        if (typeof DamageNumbers !== 'undefined') {
                            DamageNumbers.show(result.amount, enemy.x, enemy.y - (enemy.height||0)/2, result.isCrit, { dirX: (enemy.x - this.x), dirY: (enemy.y - this.y), enemyId: enemy.id });
                        }
                    } else {
                        enemy.takeDamage(this.tickDamage);
                    }
                }
            }
            this.tickAccumulator -= this.tickIntervalMs;
        }

        // 同步GIF位置與尺寸
        this._updateDomPosition();
    }

    draw(ctx) {
        // 視覺僅由 DOM 疊層呈現，避免與畫布重疊產生黑圈/範圍顯示
        return;
    }

    // 建立或更新DOM GIF元素
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
            // 讓整個容器採用 Screen 混合，強制與底層畫面混合
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
            const img = document.createElement('img');
            img.alt = 'Aura Field';
            // 優先直接引用GIF（與 Game.images 相同資源）
            img.src = (Game.images && Game.images['field']) ? Game.images['field'].src : 'assets/images/field.gif';
            img.style.position = 'absolute';
            img.style.width = (this.radius * 2 * this.visualScale) + 'px';
            img.style.height = (this.radius * 2 * this.visualScale) + 'px';
            img.style.imageRendering = 'pixelated';
            img.style.transform = 'translate(-50%, -50%)'; // 以中心對齊
            img.style.willChange = 'transform, opacity, width, height';
            // 濾色去背：使用 screen（與 Premiere 濾色一致，黑色視為透明）
            img.style.mixBlendMode = 'screen';
            img.style.opacity = '1';
            img.style.backgroundColor = 'transparent';
            // 若GIF載入失敗退回靜態PNG（可選）
            img.addEventListener('error', () => {
                img.src = 'assets/images/field.gif';
            }, { once: true });
            layer.appendChild(img);
            this.el = img;
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
            this.el.style.width = (this.radius * 2 * this.visualScale) + 'px';
            this.el.style.height = (this.radius * 2 * this.visualScale) + 'px';
        } catch(_) {}
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