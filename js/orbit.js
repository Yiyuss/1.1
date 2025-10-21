// 旋球投射物：在玩家周圍以固定半徑旋轉，持續一段時間
class OrbitBall extends Entity {
    constructor(player, initialAngle, radius, damage, size, durationMs, angularSpeedRadPerSec) {
        super(player.x + Math.cos(initialAngle) * radius, player.y + Math.sin(initialAngle) * radius, size, size);
        this.player = player;
        this.angle = initialAngle;
        this.radius = radius;
        this.damage = damage;
        // 調整為更高頻率的持續傷害，提升命中感
        this.tickDamage = Math.max(1, Math.round(this.damage));
        this.tickIntervalMs = 120; // 每0.12秒一次，類似雷射頻率
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

        // 對碰到的敵人造成傷害（每球每秒一次）。若延遲較大，逐步補齊間隔。
        this.tickAccumulator += deltaTime;
        while (this.tickAccumulator >= this.tickIntervalMs) {
            for (const enemy of Game.enemies) {
                if (this.isColliding(enemy)) {
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(this.tickDamage, enemy, { weaponType: this.weaponType });
                        enemy.takeDamage(result.amount);
                        if (typeof DamageNumbers !== 'undefined') {
                            // 顯示層：傳入 enemyId 用於每敵人節流（僅影響顯示密度）
                            DamageNumbers.show(result.amount, enemy.x, enemy.y - (enemy.height||0)/2, result.isCrit, { dirX: (enemy.x - this.x), dirY: (enemy.y - this.y), enemyId: enemy.id });
                        }
                    } else {
                        enemy.takeDamage(this.tickDamage);
                    }
                }
            }
            this.tickAccumulator -= this.tickIntervalMs;
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
