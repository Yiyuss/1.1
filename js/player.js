// 玩家類
class Player extends Entity {
    constructor(x, y) {
        super(x, y, CONFIG.PLAYER.SIZE, CONFIG.PLAYER.SIZE);
        this.speed = CONFIG.PLAYER.SPEED;
        this.maxHealth = CONFIG.PLAYER.MAX_HEALTH;
        this.health = this.maxHealth;
        this.collisionRadius = CONFIG.PLAYER.COLLISION_RADIUS;
        this.level = 1;
        this.experience = 0;
        this.experienceToNextLevel = CONFIG.EXPERIENCE.LEVEL_UP_BASE;
        this.weapons = [];
        this.isInvulnerable = false;
        this.invulnerabilityTime = 0;
        this.invulnerabilityDuration = 1000; // 受傷後1秒無敵時間
        
        // 初始武器 - 飛鏢
        this.addWeapon('DAGGER');
    }
    
    update(deltaTime) {
        // 處理移動
        const direction = Input.getMovementDirection();
        this.x += direction.x * this.speed;
        this.y += direction.y * this.speed;
        
        // 限制玩家在畫布範圍內
        this.x = Utils.clamp(this.x, this.width / 2, CONFIG.CANVAS_WIDTH - this.width / 2);
        this.y = Utils.clamp(this.y, this.height / 2, CONFIG.CANVAS_HEIGHT - this.height / 2);
        
        // 更新無敵狀態
        if (this.isInvulnerable) {
            this.invulnerabilityTime += deltaTime;
            if (this.invulnerabilityTime >= this.invulnerabilityDuration) {
                this.isInvulnerable = false;
                this.invulnerabilityTime = 0;
            }
        }
    }
    
    draw(ctx) {
        // 繪製玩家
        ctx.save();
        
        // 無敵狀態閃爍效果
        if (this.isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        
        // 使用玩家圖片
        if (Game.images && Game.images.player) {
            // 確保圖片以1:1比例繪製
            const size = Math.max(this.width, this.height);
            ctx.drawImage(Game.images.player, this.x - size / 2, this.y - size / 2, size, size);
        } else {
            // 備用：使用純色球體
            ctx.fillStyle = '#00f';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
            
            // 繪製方向指示器
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 3, this.y - this.height / 3, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    // 受到傷害
    takeDamage(amount) {
        if (this.isInvulnerable) return;
        
        this.health -= amount;
        if (this.health <= 0) {
            this.health = 0;
            this.die();
        } else {
            // 受傷後短暫無敵
            this.isInvulnerable = true;
            this.invulnerabilityTime = 0;
        }
        
        // 更新UI
        UI.updateHealthBar(this.health, this.maxHealth);
    }
    
    // 死亡
    die() {
        Game.gameOver();
    }
    
    // 獲得經驗
    gainExperience(amount) {
        this.experience += amount;
        
        // 檢查是否升級
        if (this.experience >= this.experienceToNextLevel) {
            this.levelUp();
        }
        
        // 更新UI
        UI.updateExpBar(this.experience, this.experienceToNextLevel);
    }
    
    // 升級
    levelUp() {
        this.level++;
        this.experience -= this.experienceToNextLevel;
        this.experienceToNextLevel = Math.floor(CONFIG.EXPERIENCE.LEVEL_UP_BASE * Math.pow(CONFIG.EXPERIENCE.LEVEL_UP_MULTIPLIER, this.level - 1));
        
        // 更新UI
        UI.updateLevel(this.level);
        UI.updateExpBar(this.experience, this.experienceToNextLevel);
        
        // 顯示升級選單
        UI.showLevelUpMenu();

        // 播放升級音效
        if (typeof AudioManager !== 'undefined') {
            AudioManager.playSound('level_up');
        }
    }
    
    // 添加武器
    addWeapon(weaponType) {
        // 檢查是否已有此武器
        const existingWeapon = this.weapons.find(w => w.type === weaponType);
        
        if (existingWeapon) {
            // 如果已有此武器，則升級
            existingWeapon.levelUp();
        } else {
            // 否則添加新武器
            const newWeapon = new Weapon(this, weaponType);
            this.weapons.push(newWeapon);
        }
    }
    
    // 升級武器
    upgradeWeapon(weaponType) {
        const weapon = this.weapons.find(w => w.type === weaponType);
        if (weapon) {
            weapon.levelUp();
        }
    }
}
