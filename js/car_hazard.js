// 路口地圖：車輛危險物（每 10 秒生成 3 台，直線穿越場景）
// - 不與障礙/敵人發生物理碰撞（可穿過）
// - 僅在與玩家重疊時造成一次性傷害（吃防禦與無敵）
class CarHazard extends Entity {
    /**
     * @param {Object} opts
     * @param {number} opts.x
     * @param {number} opts.y
     * @param {number} opts.vx  以「每 16.67ms」為基準的速度分量（與 Enemy.speed 同尺度）
     * @param {number} opts.vy
     * @param {number} opts.width
     * @param {number} opts.height
     * @param {string} opts.imageKey Game.images key
     * @param {number} [opts.damage=100]
     * @param {number} opts.despawnPad 額外超出邊界多少就刪除（像素）
     */
    constructor(opts) {
        super(opts.x, opts.y, opts.width, opts.height);
        this.vx = opts.vx;
        this.vy = opts.vy;
        this.imageKey = opts.imageKey;
        this.damage = (typeof opts.damage === 'number') ? opts.damage : 100;
        this.despawnPad = (typeof opts.despawnPad === 'number') ? opts.despawnPad : 200;
        this.hitPlayer = false; // 每台車只打一次
        this.weaponType = 'INTERSECTION_CAR'; // 用於渲染層級控制
    }

    update(deltaTime) {
        const deltaMul = deltaTime / 16.67;
        this.x += this.vx * deltaMul;
        this.y += this.vy * deltaMul;

        // 玩家碰撞：只觸發一次傷害
        const player = (typeof Game !== 'undefined') ? Game.player : null;
        if (!this.hitPlayer && player) {
            const pr = (player.collisionRadius != null) ? player.collisionRadius : (Math.max(player.width || 48, player.height || 60) / 2);
            const rectX = this.x - this.width / 2;
            const rectY = this.y - this.height / 2;
            if (typeof Utils !== 'undefined' && Utils.circleRectCollision && Utils.circleRectCollision(player.x, player.y, pr, rectX, rectY, this.width, this.height)) {
                this.hitPlayer = true;
                try {
                    if (typeof player.takeDamage === 'function') {
                        player.takeDamage(this.damage);
                    }
                } catch (_) {}

                // 命中音效（bo.mp3）
                try {
                    if (typeof AudioManager !== 'undefined' && typeof AudioManager.playSound === 'function') {
                        AudioManager.playSound('bo');
                    }
                } catch (_) {}

                // 撞擊特效：螢幕白閃 + 爆炸粒子（沿用既有管線）
                try {
                    if (typeof Game !== 'undefined') {
                        Game.screenFlash = { active: true, duration: 140, intensity: 0.28 };
                        if (!Game.explosionParticles) Game.explosionParticles = [];
                        const cx = (player && player.x != null) ? player.x : this.x;
                        const cy = (player && player.y != null) ? player.y : this.y;
                        const count = 18;
                        for (let i = 0; i < count; i++) {
                            const ang = Math.random() * Math.PI * 2;
                            const spd = 2.5 + Math.random() * 5.5;
                            Game.explosionParticles.push({
                                x: cx + (Math.random() - 0.5) * 8,
                                y: cy + (Math.random() - 0.5) * 8,
                                vx: Math.cos(ang) * spd,
                                vy: Math.sin(ang) * spd,
                                life: 320 + Math.random() * 220,
                                maxLife: 320 + Math.random() * 220,
                                size: 5 + Math.random() * 4,
                                color: (i % 3 === 0) ? '#ffffff' : '#ff6666',
                                source: 'CAR_HIT'
                            });
                        }
                    }
                } catch (_) {}
            }
        }

        // 出界後刪除
        const w = (typeof Game !== 'undefined' && Game.worldWidth) ? Game.worldWidth : (CONFIG && CONFIG.CANVAS_WIDTH);
        const h = (typeof Game !== 'undefined' && Game.worldHeight) ? Game.worldHeight : (CONFIG && CONFIG.CANVAS_HEIGHT);
        if (
            this.x < -this.despawnPad ||
            this.y < -this.despawnPad ||
            this.x > (w + this.despawnPad) ||
            this.y > (h + this.despawnPad)
        ) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        if (!ctx) return;
        const img = (typeof Game !== 'undefined' && Game.images) ? Game.images[this.imageKey] : null;
        ctx.save();
        if (img && img.complete) {
            ctx.drawImage(img, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        } else {
            // 後備：灰色矩形
            ctx.fillStyle = '#888';
            ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }
        ctx.restore();
    }
}


