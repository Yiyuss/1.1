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
    }
    
    update(deltaTime) {
        // 移動投射物
        const dx = Math.cos(this.angle) * this.speed;
        const dy = Math.sin(this.angle) * this.speed;
        
        this.x += dx;
        this.y += dy;
        
        // 計算已飛行距離
        this.distance += Math.sqrt(dx * dx + dy * dy);
        
        // 檢查是否超出最大飛行距離
        if (this.distance >= this.maxDistance) {
            this.destroy();
            return;
        }
        
        // 檢查是否超出畫布範圍
        if (Utils.isOutOfBounds(this.x, this.y, Game.canvas)) {
            this.destroy();
            return;
        }
        
        // 檢查與敵人的碰撞
        for (const enemy of Game.enemies) {
            if (this.isColliding(enemy)) {
                enemy.takeDamage(this.damage);
                this.destroy();
                break;
            }
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        // 根據武器類型選擇顏色
        let color;
        switch(this.weaponType) {
            case 'DAGGER':
                color = '#fff';
                break;
            case 'FIREBALL':
                color = '#f50';
                break;
            case 'LIGHTNING':
                color = '#0ff';
                break;
            default:
                color = '#fff';
        }
        
        // 繪製投射物
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // 繪製尾跡效果
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(this.x - Math.cos(this.angle) * 10, this.y - Math.sin(this.angle) * 10, this.width / 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}