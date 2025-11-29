// 旋球投射物：在玩家周圍以固定半徑旋轉，持續一段時間
class OrbitBall extends Entity {
    constructor(player, initialAngle, radius, damage, size, durationMs, angularSpeedRadPerSec, imageKey = 'lightning') {
        super(player.x + Math.cos(initialAngle) * radius, player.y + Math.sin(initialAngle) * radius, size, size);
        this.player = player;
        this.angle = initialAngle;
        this.radius = radius;
        this.damage = damage;
        
        // 根據武器類型決定傷害模式
        this.weaponType = (imageKey === 'chicken') ? 'CHICKEN_BLESSING' : 'ORBIT';
        
        // 雞腿庇佑和綿羊護體：改為單次碰撞傷害（移除持續傷害，避免BOSS被秒殺）
        if (this.weaponType === 'CHICKEN_BLESSING' || this.weaponType === 'ORBIT') {
            // 單次碰撞傷害模式：每個敵人只造成一次傷害，然後有冷卻時間
            this.collisionCooldown = new Map(); // 記錄每個敵人的最後碰撞時間
            this.collisionCooldownMs = 500; // 每個敵人500ms內只能受到一次傷害
            this.singleHitDamage = Math.max(1, Math.round(this.damage));
        } else {
            // 其他武器：保持原來的持續傷害模式（如果有其他使用OrbitBall的武器）
            this.tickDamage = Math.max(1, Math.round(this.damage));
            this.tickIntervalMs = 120; // 每0.12秒一次，類似雷射頻率
            this.tickAccumulator = 0;
        }
        
        this.duration = durationMs;
        this.angularSpeed = angularSpeedRadPerSec; // 弧度/秒
        this.startTime = Date.now();
        // 視覺圖片鍵（預設為 lightning，可傳入其他鍵如 'chicken'）
        this.imageKey = imageKey;
        // 視覺：輕量拖尾緩存（不影響傷害或判定）
        this.trail = [];
        this.trailMax = 12;
    }

    update(deltaTime) {
        // 更新角度
        this.angle += this.angularSpeed * (deltaTime / 1000);
        // 跟隨玩家位置旋轉
        this.x = this.player.x + Math.cos(this.angle) * this.radius;
        this.y = this.player.y + Math.sin(this.angle) * this.radius;

        // 視覺：更新拖尾記錄
        this.trail.push({ x: this.x, y: this.y, size: this.width });
        if (this.trail.length > this.trailMax) this.trail.shift();

        // 根據武器類型選擇傷害模式
        if (this.weaponType === 'CHICKEN_BLESSING' || this.weaponType === 'ORBIT') {
            // 雞腿庇佑和綿羊護體：單次碰撞傷害模式（避免持續傷害導致BOSS被秒殺）
            const currentTime = Date.now();
            for (const enemy of Game.enemies) {
                if (this.isColliding(enemy)) {
                    const enemyId = enemy.id || enemy;
                    const lastHitTime = this.collisionCooldown.get(enemyId) || 0;
                    
                    // 檢查冷卻時間：每個敵人500ms內只能受到一次傷害
                    if (currentTime - lastHitTime >= this.collisionCooldownMs) {
                        // 造成單次碰撞傷害
                        if (typeof DamageSystem !== 'undefined') {
                            const result = DamageSystem.computeHit(this.singleHitDamage, enemy, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
                            enemy.takeDamage(result.amount);
                            if (typeof DamageNumbers !== 'undefined') {
                                // 顯示層：傳入 enemyId 用於每敵人節流（僅影響顯示密度）
                                DamageNumbers.show(result.amount, enemy.x, enemy.y - (enemy.height||0)/2, result.isCrit, { dirX: (enemy.x - this.x), dirY: (enemy.y - this.y), enemyId: enemyId });
                            }
                        } else {
                            enemy.takeDamage(this.singleHitDamage);
                        }
                        
                        // 記錄碰撞時間
                        this.collisionCooldown.set(enemyId, currentTime);
                    }
                }
            }
            
            // 清理過期的碰撞記錄（避免內存泄漏）
            if (this.collisionCooldown.size > 100) {
                const expiredTime = currentTime - this.collisionCooldownMs * 2;
                for (const [enemyId, time] of this.collisionCooldown.entries()) {
                    if (time < expiredTime) {
                        this.collisionCooldown.delete(enemyId);
                    }
                }
            }
        } else {
            // 其他武器（如ORBIT）：保持原來的持續傷害模式
            this.tickAccumulator += deltaTime;
            while (this.tickAccumulator >= this.tickIntervalMs) {
                for (const enemy of Game.enemies) {
                    if (this.isColliding(enemy)) {
                        if (typeof DamageSystem !== 'undefined') {
                            const result = DamageSystem.computeHit(this.tickDamage, enemy, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
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
        }

        // 到期銷毀
        if (Date.now() - this.startTime >= this.duration) {
            this.destroy();
        }
    }

    draw(ctx) {
        ctx.save();
        const size = Math.max(this.width, this.height);

        // 視覺：拖尾繪製（輕量、僅顯示）
        if (this.trail && this.trail.length) {
            for (let i = 0; i < this.trail.length; i++) {
                const t = this.trail[i];
                const alpha = 0.08 + (i / this.trail.length) * 0.18;
                ctx.globalAlpha = alpha;
                const trailImg = (Game.images && Game.images[this.imageKey]) ? Game.images[this.imageKey] : null;
                if (trailImg) {
                    ctx.drawImage(trailImg, t.x - size / 2, t.y - size / 2, size * (0.9 - i * 0.02), size * (0.9 - i * 0.02));
                } else {
                    ctx.fillStyle = '#fff59d';
                    ctx.beginPath();
                    ctx.arc(t.x, t.y, (t.size / 2) * (0.9 - i * 0.02), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        }

        const img = (Game.images && Game.images[this.imageKey]) ? Game.images[this.imageKey] : null;
        if (img) {
            ctx.drawImage(img, this.x - size / 2, this.y - size / 2, size, size);
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
