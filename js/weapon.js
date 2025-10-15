// 武器類
class Weapon {
    constructor(player, type) {
        this.player = player;
        this.type = type;
        this.config = CONFIG.WEAPONS[type];
        this.level = 1;
        this.lastFireTime = 0;
        this.projectileCount = this.config.LEVELS[0].COUNT;
    }
    
    update(deltaTime) {
        const currentTime = Date.now();
        
        // 檢查是否可以發射
        if (currentTime - this.lastFireTime >= this.config.COOLDOWN) {
            this.fire();
            this.lastFireTime = currentTime;
        }
    }
    
    // 發射投射物
    fire() {
        // 根據武器等級發射不同數量的投射物
        for (let i = 0; i < this.projectileCount; i++) {
            let angle;
            
            // 根據投射物數量計算發射角度
            if (this.projectileCount === 1) {
                // 單個投射物朝最近的敵人發射
                const nearestEnemy = this.findNearestEnemy();
                if (nearestEnemy) {
                    angle = Utils.angle(this.player.x, this.player.y, nearestEnemy.x, nearestEnemy.y);
                } else {
                    // 如果沒有敵人，則向右發射
                    angle = 0;
                }
            } else {
                // 多個投射物呈扇形發射
                const spreadAngle = Math.PI / 4; // 45度扇形
                const startAngle = -spreadAngle / 2;
                angle = startAngle + (spreadAngle / (this.projectileCount - 1)) * i;
            }
            
            // 創建投射物
            const projectile = new Projectile(
                this.player.x,
                this.player.y,
                angle,
                this.type,
                this.config.DAMAGE,
                this.config.PROJECTILE_SPEED,
                this.config.PROJECTILE_SIZE
            );
            
            Game.addProjectile(projectile);
        }
    }
    
    // 尋找最近的敵人
    findNearestEnemy() {
        let nearestEnemy = null;
        let minDistance = Infinity;
        
        for (const enemy of Game.enemies) {
            const distance = Utils.distance(this.player.x, this.player.y, enemy.x, enemy.y);
            if (distance < minDistance) {
                minDistance = distance;
                nearestEnemy = enemy;
            }
        }
        
        return nearestEnemy;
    }
    
    // 升級武器
    levelUp() {
        if (this.level < this.config.LEVELS.length) {
            this.level++;
            this.projectileCount = this.config.LEVELS[this.level - 1].COUNT;
        }
    }
    
    // 獲取武器描述
    getDescription() {
        return {
            name: this.config.NAME,
            level: this.level,
            description: this.config.LEVELS[this.level - 1].DESCRIPTION
        };
    }
    
    // 獲取下一級描述（用於升級選單）
    getNextLevelDescription() {
        if (this.level < this.config.LEVELS.length) {
            return {
                name: this.config.NAME,
                level: this.level + 1,
                description: this.config.LEVELS[this.level].DESCRIPTION
            };
        }
        return null;
    }
}