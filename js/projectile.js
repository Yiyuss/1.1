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
