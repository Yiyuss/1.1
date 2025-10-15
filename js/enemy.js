// 敵人類
class Enemy extends Entity {
    constructor(x, y, type) {
        const enemyConfig = CONFIG.ENEMIES[type];
        super(x, y, enemyConfig.SIZE, enemyConfig.SIZE);
        
        this.type = type;
        this.name = enemyConfig.NAME;
        this.maxHealth = enemyConfig.HEALTH;
        this.health = this.maxHealth;
        this.damage = enemyConfig.DAMAGE;
        this.speed = enemyConfig.SPEED;
        this.experienceValue = enemyConfig.EXPERIENCE;
        this.collisionRadius = enemyConfig.COLLISION_RADIUS;
        this.lastAttackTime = 0;
        this.attackCooldown = 1000; // 攻擊冷卻時間（毫秒）
    }
    
    update(deltaTime) {
        // 向玩家移動
        const player = Game.player;
        const angle = Utils.angle(this.x, this.y, player.x, player.y);
        
        this.x += Math.cos(angle) * this.speed;
        this.y += Math.sin(angle) * this.speed;
        
        // 檢查與玩家的碰撞
        if (this.isColliding(player)) {
            this.attackPlayer(deltaTime);
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        // 根據敵人類型選擇顏色
        let color;
        switch(this.type) {
            case 'ZOMBIE':
                color = '#0a0';
                break;
            case 'SKELETON':
                color = '#aaa';
                break;
            case 'GHOST':
                color = '#aaf';
                break;
            case 'MINI_BOSS':
                color = '#f80';
                break;
            case 'BOSS':
                color = '#f00';
                break;
            default:
                color = '#0a0';
        }
        
        // 繪製敵人
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // 繪製血條
        const healthBarWidth = this.width;
        const healthBarHeight = 5;
        const healthPercentage = this.health / this.maxHealth;
        
        ctx.fillStyle = '#333';
        ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.height / 2 - 10, healthBarWidth, healthBarHeight);
        
        ctx.fillStyle = '#f00';
        ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.height / 2 - 10, healthBarWidth * healthPercentage, healthBarHeight);
        
        ctx.restore();
    }
    
    // 攻擊玩家
    attackPlayer(deltaTime) {
        const currentTime = Date.now();
        
        // 檢查攻擊冷卻
        if (currentTime - this.lastAttackTime >= this.attackCooldown) {
            Game.player.takeDamage(this.damage);
            this.lastAttackTime = currentTime;
        }
    }
    
    // 受到傷害
    takeDamage(amount) {
        this.health -= amount;
        
        if (this.health <= 0) {
            this.die();
        }
    }
    
    // 死亡
    die() {
        // 生成經驗寶石
        Game.spawnExperienceOrb(this.x, this.y, this.experienceValue);
        
        // 如果是大BOSS，觸發勝利
        if (this.type === 'BOSS') {
            Game.victory();
        }
        
        // 標記為刪除
        this.destroy();
    }
}