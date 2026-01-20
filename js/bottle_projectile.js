// HUMAN2 投擲物：拋物線瓶子（路口地圖）
// - 無音效
// - 只打玩家（吃防禦、吃受傷無敵、吃技能無敵）
// - 拋物線：以固定重力（像素/幀²）做簡單彈道
class BottleProjectile extends Entity {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} targetX
     * @param {number} targetY
     * @param {number} speedPerFrame 以「每 16.67ms」為基準的速度尺度（與 BossProjectile/Enemy 同尺度）
     * @param {number} damage
     * @param {number} width
     * @param {number} height
     */
    constructor(x, y, targetX, targetY, speedPerFrame, damage, width, height) {
        super(x, y, width, height);
        this.damage = (typeof damage === 'number') ? damage : 15;
        this.lifeTime = 5000;
        this.createdTime = Date.now();

        // 簡易彈道解算：以距離/速度估算飛行幀數，解出 vx/vy
        const dx = targetX - x;
        const dy = targetY - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const spd = Math.max(0.01, (typeof speedPerFrame === 'number') ? speedPerFrame : 5);
        // 以「每幀移動 spd 像素」估算，並限制幀數避免太扁/太高
        const frames = Utils && Utils.clamp
            ? Utils.clamp(dist / spd, 18, 72)
            : Math.max(18, Math.min(72, dist / spd));

        // 重力：像素/幀²（y 向下為正）
        this.g = 0.08;
        this.vx = dx / frames;
        // dy = vy*t + 0.5*g*t^2  => vy = (dy - 0.5*g*t^2)/t
        this.vy = (dy - 0.5 * this.g * frames * frames) / frames;

        this.hitPlayer = false;
        this.weaponType = 'HUMAN2_BOTTLE';
    }

    update(deltaTime) {
        // ✅ 權威多人：此類投射物由伺服器權威模擬與扣血；客戶端只做插值顯示
        try {
            if (this._isVisualOnly && typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                if (typeof this._netTargetX === 'number' && typeof this._netTargetY === 'number') {
                    const dx = this._netTargetX - this.x;
                    const dy = this._netTargetY - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 600) { this.x = this._netTargetX; this.y = this._netTargetY; }
                    else { const lerp = 0.35; this.x += dx * lerp; this.y += dy * lerp; }
                }
                return;
            }
        } catch (_) { }
        const now = Date.now();
        if (now - this.createdTime > this.lifeTime) {
            this.destroy();
            return;
        }

        const deltaMul = deltaTime / 16.67;
        // 套用重力
        this.vy += this.g * deltaMul;
        // 位移
        this.x += this.vx * deltaMul;
        this.y += this.vy * deltaMul;

        // 碰撞玩家（一次）
        const player = (typeof Game !== 'undefined') ? Game.player : null;
        if (!this.hitPlayer && player) {
            const pr = (player.collisionRadius != null)
                ? player.collisionRadius
                : (Math.max(player.width || 48, player.height || 60) / 2);
            const rectX = this.x - this.width / 2;
            const rectY = this.y - this.height / 2;
            if (typeof Utils !== 'undefined' && Utils.circleRectCollision &&
                Utils.circleRectCollision(player.x, player.y, pr, rectX, rectY, this.width, this.height)) {
                this.hitPlayer = true;
                try {
                    if (typeof player.takeDamage === 'function') {
                        // 不忽略無敵；吃防禦、吃技能無敵
                        player.takeDamage(this.damage);
                    }
                } catch (_) {}
                this.destroy();
                return;
            }
        }

        // 出界刪除
        const w = (typeof Game !== 'undefined' && Game.worldWidth) ? Game.worldWidth : (CONFIG && CONFIG.CANVAS_WIDTH);
        const h = (typeof Game !== 'undefined' && Game.worldHeight) ? Game.worldHeight : (CONFIG && CONFIG.CANVAS_HEIGHT);
        const pad = 200;
        if (this.x < -pad || this.y < -pad || this.x > (w + pad) || this.y > (h + pad)) {
            this.destroy();
        }
    }

    draw(ctx) {
        if (!ctx) return;
        const img = (typeof Game !== 'undefined' && Game.images) ? Game.images['bottle'] : null;
        ctx.save();

        // 依速度方向旋轉（讓投擲更像拋出）
        const ang = Math.atan2(this.vy, this.vx) + Math.PI / 2;
        ctx.translate(this.x, this.y);
        ctx.rotate(ang);

        if (img && img.complete) {
            ctx.drawImage(img, -this.width / 2, -this.height / 2, this.width, this.height);
        } else {
            ctx.fillStyle = '#55a';
            ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        }
        ctx.restore();
    }
}

// ✅ 讓 ES module（例如 survival_online.js）可以從 globalThis 取得建構子
try { if (typeof window !== 'undefined') window.BottleProjectile = BottleProjectile; } catch (_) {}


