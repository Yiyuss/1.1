// 旋球投射物：在玩家周圍以固定半徑旋轉，持續一段時間
class OrbitBall extends Entity {
    constructor(player, initialAngle, radius, damage, size, durationMs, angularSpeedRadPerSec) {
        super(player.x + Math.cos(initialAngle) * radius, player.y + Math.sin(initialAngle) * radius, size, size);
        this.player = player;
        this.angle = initialAngle;
        this.radius = radius;
        this.damage = damage;
        // 持續傷害改為約原始傷害的60%，並以固定間隔觸發一次
        this.tickDamage = Math.max(1, Math.round(this.damage * 0.6));
        this.tickIntervalMs = 120; // 約每0.12秒一次，避免每幀秒殺
        this.tickAccumulator = 0;
        this.duration = durationMs;
        this.angularSpeed = angularSpeedRadPerSec; // 弧度/秒
        this.startTime = Date.now();
        this.weaponType = 'ORBIT';
    }

    update(deltaTime) {
        // 更新角度
        this.angle += this.angularSpeed * (deltaTime / 1000);
        // 跟隨玩家位置旋轉
        this.x = this.player.x + Math.cos(this.angle) * this.radius;
        this.y = this.player.y + Math.sin(this.angle) * this.radius;

        // 對碰到的敵人造成傷害（固定時間間隔的持續傷害）
        this.tickAccumulator += deltaTime;
        if (this.tickAccumulator >= this.tickIntervalMs) {
            for (const enemy of Game.enemies) {
                if (this.isColliding(enemy)) {
                    enemy.takeDamage(this.tickDamage);
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
        const size = Math.max(this.width, this.height);
        if (Game.images && Game.images.lightning) {
            ctx.drawImage(Game.images.lightning, this.x - size / 2, this.y - size / 2, size, size);
        } else {
            // 備用：使用黃色球體
            ctx.fillStyle = '#ff0';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}
