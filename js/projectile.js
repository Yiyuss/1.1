// 投射物類
class Projectile extends Entity {
    constructor(x, y, angle, weaponType, damage, speed, size) {
        super(x, y, size, size);
        this.angle = angle;
        this.weaponType = weaponType;
        this.damage = damage;
        this.speed = speed;
        this.distance = 0;
        this.maxDistance = 1000; // 最大飛行距離
        // 追蹤屬性（僅閃電使用）
        this.homing = false;
        this.turnRatePerSec = 0; // 每秒最大轉向弧度（rad/s）
    }
    
    update(deltaTime) {
        // 閃電追蹤：優先追蹤分配的唯一目標，避免全部鎖定同一敵人
        if (this.homing && Game.enemies && Game.enemies.length) {
            let target = null;
            if (this.assignedTargetId) {
                target = Game.enemies.find(e => e.id === this.assignedTargetId) || null;
            }
            // 若分配目標不存在，退回最近敵人
            if (!target) {
                let minDist = Infinity;
                for (const enemy of Game.enemies) {
                    const d = Utils.distance(this.x, this.y, enemy.x, enemy.y);
                    if (d < minDist) { minDist = d; target = enemy; }
                }
            }
            if (target) {
                const desired = Utils.angle(this.x, this.y, target.x, target.y);
                let delta = desired - this.angle;
                // 將角度差規範化到 [-PI, PI]
                if (delta > Math.PI) delta -= Math.PI * 2;
                if (delta < -Math.PI) delta += Math.PI * 2;
                const maxTurn = (this.turnRatePerSec || 0) * (deltaTime / 1000);
                // 限制每幀最大轉向量
                if (delta > maxTurn) delta = maxTurn;
                if (delta < -maxTurn) delta = -maxTurn;
                this.angle += delta;
            }
        }

        // 移動投射物（先檢查障礙物阻擋）
        const deltaMul = deltaTime / 16.67;
        const dx = Math.cos(this.angle) * this.speed * deltaMul;
        const dy = Math.sin(this.angle) * this.speed * deltaMul;
        const candX = this.x + dx;
        const candY = this.y + dy;

        // 與障礙物相交則銷毀投射物
        for (const obs of Game.obstacles || []) {
            if (Utils.circleRectCollision(candX, candY, this.collisionRadius, obs.x, obs.y, obs.width, obs.height)) {
                this.destroy();
                return;
            }
        }

        // 套用位移
        this.x = candX;
        this.y = candY;
        
        // 計算已飛行距離
        this.distance += Math.sqrt(dx * dx + dy * dy);
        
        // 檢查是否超出最大飛行距離
        if (this.distance >= this.maxDistance) {
            this.destroy();
            return;
        }
        
        // 檢查是否超出世界範圍
        if (Utils.isOutOfWorldBounds(this.x, this.y, (Game.worldWidth || Game.canvas.width), (Game.worldHeight || Game.canvas.height))) {
            this.destroy();
            return;
        }
        
        // 檢查與敵人的碰撞
        for (const enemy of Game.enemies) {
            if (this.isColliding(enemy)) {
                // 使用 DamageSystem 計算浮動與爆擊；若不可用則維持原邏輯
                if (typeof DamageSystem !== 'undefined') {
                    const result = DamageSystem.computeHit(this.damage, enemy, { weaponType: this.weaponType });
                    enemy.takeDamage(result.amount);
                    if (typeof DamageNumbers !== 'undefined') {
                        // 顯示層：傳入 enemyId 用於每敵人節流（僅影響顯示密度）
                        DamageNumbers.show(
                          result.amount,
                          enemy.x,
                          enemy.y - (enemy.height||0)/2,
                          result.isCrit,
                          { dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), enemyId: enemy.id }
                        );
                    }
                } else {
                    enemy.takeDamage(this.damage);
                }
                // 紳士綿羊（FIREBALL）命中未被消滅的敵人時施加暫時減速
                if (this.weaponType === 'FIREBALL' && enemy.health > 0 && typeof enemy.applySlow === 'function') {
                    enemy.applySlow(1000, 0.5);
                }
                this.destroy();
                break;
            }
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        // 優先使用圖片繪製（1:1比例）
        let imageName = null;
        switch(this.weaponType) {
            case 'DAGGER':
                imageName = 'dagger';
                break;
            case 'FIREBALL':
                imageName = 'fireball';
                break;
            case 'LIGHTNING':
                imageName = 'lightning';
                break;
        }
        
        if (imageName && Game.images && Game.images[imageName]) {
            const size = Math.max(this.width, this.height);
            ctx.drawImage(Game.images[imageName], this.x - size / 2, this.y - size / 2, size, size);
        } else {
            // 備用：使用純色圓形
            let color = '#fff';
            if (this.weaponType === 'FIREBALL') color = '#f50';
            if (this.weaponType === 'LIGHTNING') color = '#0ff';
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 繪製尾跡效果
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(this.x - Math.cos(this.angle) * 10, this.y - Math.sin(this.angle) * 10, this.width / 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}
