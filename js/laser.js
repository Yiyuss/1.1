// 雷射光束：從玩家位置朝最近敵人方向，延伸至世界邊界，持續造成傷害
class LaserBeam extends Entity {
    constructor(player, angle, damage, widthPx, durationMs, tickIntervalMs) {
        // 使用極細的碰撞包圍盒，不依賴圓形碰撞；實際碰撞用線段距離計算
        super(player.x, player.y, 1, 1);
        this.player = player;
        this.angle = angle;
        this.damage = damage;
        this.width = widthPx; // 畫面線寬（像素）
        this.duration = durationMs;
        this.tickIntervalMs = tickIntervalMs;
        this.tickAccumulator = 0;
        this.startTime = Date.now();
        this.weaponType = 'LASER';
        // 預先計算端點
        const pts = this.computeEndpoints();
        this.startX = pts.startX;
        this.startY = pts.startY;
        this.endX = pts.endX;
        this.endY = pts.endY;
    }

    computeEndpoints() {
        const sx = this.player.x;
        const sy = this.player.y;
        const dx = Math.cos(this.angle);
        const dy = Math.sin(this.angle);
        const worldW = Game.worldWidth || Game.canvas.width;
        const worldH = Game.worldHeight || Game.canvas.height;

        // 計算到四個邊界的 t，僅取正值（前方交點），最後選最小的正 t
        const candidates = [];
        if (dx > 0) {
            candidates.push((worldW - sx) / dx);
        } else if (dx < 0) {
            candidates.push((0 - sx) / dx);
        }
        if (dy > 0) {
            candidates.push((worldH - sy) / dy);
        } else if (dy < 0) {
            candidates.push((0 - sy) / dy);
        }
        // 過濾非正值，避免選到背後交點
        const positive = candidates.filter(t => t > 0);
        const t = positive.length ? Math.min(...positive) : 0;
        const ex = sx + dx * t;
        const ey = sy + dy * t;

        return { startX: sx, startY: sy, endX: ex, endY: ey };
    }

    // 點到線段距離（世界座標），用於碰撞近似
    pointSegmentDistance(px, py, x1, y1, x2, y2) {
        const vx = x2 - x1;
        const vy = y2 - y1;
        const len2 = vx * vx + vy * vy;
        if (len2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * vx + (py - y1) * vy) / len2;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * vx;
        const projY = y1 + t * vy;
        return Math.hypot(px - projX, py - projY);
    }

    update(deltaTime) {
        // 追隨玩家位置（方向固定），重新計算端點
        const pts = this.computeEndpoints();
        this.startX = pts.startX;
        this.startY = pts.startY;
        this.endX = pts.endX;
        this.endY = pts.endY;

        // 固定時間間隔對穿過的敵人造成傷害（不衰減，使用原傷害）
        this.tickAccumulator += deltaTime;
        if (this.tickAccumulator >= this.tickIntervalMs) {
            const half = this.width / 2;
            for (const enemy of Game.enemies) {
                const d = this.pointSegmentDistance(enemy.x, enemy.y, this.startX, this.startY, this.endX, this.endY);
                if (d <= half + enemy.collisionRadius) {
                    enemy.takeDamage(this.damage);
                }
            }
            this.tickAccumulator = 0;
        }

        // 到期銷毀
        if (Date.now() - this.startTime >= this.duration) {
            this.destroy();
        }
    }

    draw(ctx) {
        ctx.save();
        // 主要雷射線
        ctx.strokeStyle = '#0ff';
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = this.width;
        ctx.beginPath();
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(this.endX, this.endY);
        ctx.stroke();

        // 外圈光暈
        ctx.strokeStyle = '#9ff';
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = this.width * 1.6;
        ctx.beginPath();
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(this.endX, this.endY);
        ctx.stroke();

        ctx.restore();
    }
}