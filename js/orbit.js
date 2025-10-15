// 旋球投射物：在玩家周圍以固定半徑旋轉，持續一段時間
class OrbitBall extends Entity {
    constructor(player, initialAngle, radius, damage, size, durationMs, angularSpeedRadPerSec) {
        super(player.x + Math.cos(initialAngle) * radius, player.y + Math.sin(initialAngle) * radius, size, size);
        this.player = player;
        this.angle = initialAngle;
        this.radius = radius;
        this.damage = damage;
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

        // 對碰到的敵人造成傷害（持續技能，不會立即消失）
        for (const enemy of Game.enemies) {
            if (this.isColliding(enemy)) {
                enemy.takeDamage(this.damage);
            }
        }

        // 到期銷毀
        if (Date.now() - this.startTime >= this.duration) {
            this.destroy();
        }
    }

    draw(ctx) {
        ctx.save();
        // 旋球以顏色球表示（若需圖片可替換）
        ctx.fillStyle = '#ff0';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}