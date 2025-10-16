// 敵人類
class Enemy extends Entity {
    constructor(x, y, type) {
        const enemyConfig = CONFIG.ENEMIES[type];
        super(x, y, enemyConfig.SIZE, enemyConfig.SIZE);
        
        this.type = type;
        this.name = enemyConfig.NAME;
        // 基礎血量，後續依波次倍率提升
        this.maxHealth = enemyConfig.HEALTH;
        // 依照目前波次提高血量（每波乘以倍率）
        const wave = (typeof WaveSystem !== 'undefined' && WaveSystem.currentWave) ? WaveSystem.currentWave : 1;
        const hpMult = Math.pow(CONFIG.WAVES.HEALTH_MULTIPLIER_PER_WAVE || 1, Math.max(0, wave - 1));
        this.maxHealth = Math.floor(this.maxHealth * hpMult);
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
        
        // 計算候選位置（分軸移動）
        const candX = this.x + Math.cos(angle) * this.speed;
        const candY = this.y + Math.sin(angle) * this.speed;

        const blockedByObs = (nx, ny) => {
            for (const obs of Game.obstacles || []) {
                if (Utils.circleRectCollision(nx, ny, this.collisionRadius, obs.x, obs.y, obs.width, obs.height)) {
                    return true;
                }
            }
            return false;
        };

        const blockedByEnemies = (nx, ny) => {
            for (const otherEnemy of Game.enemies || []) {
                if (otherEnemy === this) continue;
                const dx = nx - otherEnemy.x;
                const dy = ny - otherEnemy.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDistance = this.collisionRadius + otherEnemy.collisionRadius;
                if (distance < minDistance) {
                    return true;
                }
            }
            return false;
        };

        // 嘗試X軸位移
        if (!blockedByObs(candX, this.y) && !blockedByEnemies(candX, this.y)) {
            this.x = candX;
        }
        // 嘗試Y軸位移
        if (!blockedByObs(this.x, candY) && !blockedByEnemies(this.x, candY)) {
            this.y = candY;
        }

        // 限制在世界範圍內（非循環邊界）
        const maxX = (Game.worldWidth || Game.canvas.width) - this.width / 2;
        const maxY = (Game.worldHeight || Game.canvas.height) - this.height / 2;
        this.x = Utils.clamp(this.x, this.width / 2, maxX);
        this.y = Utils.clamp(this.y, this.height / 2, maxY);
        
        // 檢查與玩家的碰撞
        if (this.isColliding(player)) {
            this.attackPlayer(deltaTime);
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        // 根據敵人類型選擇圖片或顏色
        let imageName;
        let color;
        
        switch(this.type) {
            case 'ZOMBIE':
                imageName = 'zombie';
                color = '#0a0';
                break;
            case 'SKELETON':
                imageName = 'skeleton';
                color = '#aaa';
                break;
            case 'GHOST':
                imageName = 'ghost';
                color = '#aaf';
                break;
            case 'MINI_BOSS':
                imageName = 'mini_boss';
                color = '#f80';
                break;
            case 'BOSS':
                imageName = 'boss';
                color = '#f00';
                break;
            default:
                imageName = 'zombie';
                color = '#0a0';
        }
        
        // 繪製敵人 - 優先使用圖片
        if (Game.images && Game.images[imageName]) {
            // 確保圖片以1:1比例繪製
            const size = Math.max(this.width, this.height);
            ctx.drawImage(Game.images[imageName], this.x - size / 2, this.y - size / 2, size, size);
        } else {
            // 備用：使用純色圓形
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
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

        // 播放死亡音效
        if (typeof AudioManager !== 'undefined') {
            AudioManager.playSound('enemy_death');
        }
    }
}
