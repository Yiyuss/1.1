// 敵人類
class Enemy extends Entity {
    constructor(x, y, type) {
        const enemyConfig = CONFIG.ENEMIES[type];
        super(x, y, enemyConfig.SIZE, enemyConfig.SIZE);
        
        this.type = type;
        this.name = enemyConfig.NAME;
        // 基礎血量，後續依波次倍率提升
        this.maxHealth = enemyConfig.HEALTH;
        // 依照目前波次提高血量（每波乘以倍率），第5波後稍微提高倍率
        const wave = (typeof WaveSystem !== 'undefined' && WaveSystem.currentWave) ? WaveSystem.currentWave : 1;
        const earlyMult = CONFIG.WAVES.HEALTH_MULTIPLIER_PER_WAVE || 1;
        const lateMult = CONFIG.WAVES.HEALTH_MULTIPLIER_PER_WAVE_LATE || earlyMult;
        const earlyWaves = Math.min(Math.max(0, wave - 1), 4); // 前4波使用earlyMult
        const lateWaves = Math.max(0, wave - 5);
        const growthMult = (Game.difficulty && Game.difficulty.enemyHealthGrowthRateMultiplier) ? Game.difficulty.enemyHealthGrowthRateMultiplier : 1;
        const hpMult = Math.pow(earlyMult, earlyWaves * growthMult) * Math.pow(lateMult, lateWaves * growthMult);
        const diffHp = (Game.difficulty && Game.difficulty.enemyHealthMultiplier) ? Game.difficulty.enemyHealthMultiplier : 1;
        this.maxHealth = Math.floor(this.maxHealth * hpMult * diffHp);
        this.health = this.maxHealth;
        this.damage = enemyConfig.DAMAGE;
        this.speed = enemyConfig.SPEED * ((Game.difficulty && Game.difficulty.enemySpeedMultiplier) ? Game.difficulty.enemySpeedMultiplier : 1);
        this.experienceValue = enemyConfig.EXPERIENCE;
        this.collisionRadius = enemyConfig.COLLISION_RADIUS;
        this.lastAttackTime = 0;
        this.attackCooldown = 1000; // 攻擊冷卻時間（毫秒）
        // 受傷紅閃效果
        this.hitFlashTime = 0;
        this.hitFlashDuration = 150; // 毫秒
        
        // 新增：BOSS 遠程攻擊相關屬性
        if (this.type === 'BOSS' && enemyConfig.RANGED_ATTACK) {
            const enableRanged = enemyConfig.RANGED_ATTACK.ENABLED || (Game.difficulty && Game.difficulty.bossRangedEnabled);
            if (enableRanged) {
                this.rangedAttack = enemyConfig.RANGED_ATTACK;
                this.lastRangedAttackTime = 0;
            }
        }
    }
    
    update(deltaTime) {
        const deltaMul = deltaTime / 16.67;
        // 向玩家移動
        const player = Game.player;
        const angle = Utils.angle(this.x, this.y, player.x, player.y);
        
        // 計算候選位置（分軸移動）
        const candX = this.x + Math.cos(angle) * this.speed * deltaMul;
        const candY = this.y + Math.sin(angle) * this.speed * deltaMul;

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

        // 與障礙物分離/滑動：若接觸則沿法線微推開，避免卡住
        const slideStrength = (this.type === 'BOSS') ? 0.45 : 0.25;
        for (const obs of Game.obstacles || []) {
            const halfW = obs.width / 2;
            const halfH = obs.height / 2;
            const left = obs.x - halfW;
            const right = obs.x + halfW;
            const top = obs.y - halfH;
            const bottom = obs.y + halfH;
            const closestX = Utils.clamp(this.x, left, right);
            const closestY = Utils.clamp(this.y, top, bottom);
            let dx = this.x - closestX;
            let dy = this.y - closestY;
            const dist2 = dx * dx + dy * dy;
            const r = this.collisionRadius;
            if (dist2 < r * r) {
                const dist = Math.max(0.0001, Math.sqrt(dist2));
                dx /= dist; dy /= dist; // 法線方向（若在邊界上則為邊界法線）
                const push = (r - dist) * slideStrength;
                this.x += dx * push;
                this.y += dy * push;
            }
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

        // 新增：BOSS 遠程攻擊邏輯
        if (this.rangedAttack) {
            this.updateRangedAttack(deltaTime, player);
        }

        // 更新受傷紅閃計時
        if (this.hitFlashTime > 0) {
            this.hitFlashTime = Math.max(0, this.hitFlashTime - deltaTime);
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

        // 受傷紅色覆蓋閃爍
        if (this.hitFlashTime > 0) {
            const alpha = 0.35;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(this.width, this.height) / 2 + 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
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
    
    // 新增：BOSS 遠程攻擊更新邏輯
    updateRangedAttack(deltaTime, player) {
        const currentTime = Date.now();
        
        // 計算與玩家的距離
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 檢查是否在攻擊範圍內且冷卻時間已過
        if (distance <= this.rangedAttack.RANGE && 
            currentTime - this.lastRangedAttackTime >= this.rangedAttack.COOLDOWN) {
            
            // 發射火彈
            this.fireProjectile(player);
            this.lastRangedAttackTime = currentTime;
        }
    }
    
    // 新增：發射火彈投射物
    fireProjectile(target) {
        // 計算發射角度
        const angle = Utils.angle(this.x, this.y, target.x, target.y);
        
        // 創建 BOSS 火彈投射物
        const projectile = new BossProjectile(
            this.x, 
            this.y, 
            angle,
            this.rangedAttack.PROJECTILE_SPEED,
            this.rangedAttack.PROJECTILE_DAMAGE,
            this.rangedAttack.PROJECTILE_SIZE,
            this.rangedAttack.HOMING,
            this.rangedAttack.TURN_RATE
        );
        
        // 添加到遊戲的投射物陣列
        if (!Game.bossProjectiles) {
            Game.bossProjectiles = [];
        }
        Game.bossProjectiles.push(projectile);
    }
    
    // 受到傷害
    takeDamage(amount) {
        this.health -= amount;
        // 啟動紅閃
        this.hitFlashTime = this.hitFlashDuration;
        
        if (this.health <= 0) {
            this.die();
        }
    }
    
    // 死亡
    die() {
        // 生成經驗寶石
        Game.spawnExperienceOrb(this.x, this.y, this.experienceValue);
        
        // BOSS或小BOSS死亡掉落寶箱（觸發一次免費升級）
        if (this.type === 'MINI_BOSS' || this.type === 'BOSS') {
            Game.spawnChest(this.x, this.y);
        }

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
