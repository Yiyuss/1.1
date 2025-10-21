// 玩家類
class Player extends Entity {
    constructor(x, y) {
        super(x, y, CONFIG.PLAYER.SIZE, CONFIG.PLAYER.SIZE);
        this.speed = CONFIG.PLAYER.SPEED;
        
        // 基礎屬性
        this.maxHealth = CONFIG.PLAYER.MAX_HEALTH;
        this.health = this.maxHealth;
        console.log(`玩家初始血量: ${this.health}/${this.maxHealth}`);
        this.collisionRadius = CONFIG.PLAYER.COLLISION_RADIUS;
        this.level = 1;
        this.experience = 0;
        this.experienceToNextLevel = CONFIG.EXPERIENCE.LEVEL_UP_BASE;
        this.weapons = [];
        this.isInvulnerable = false;
        this.invulnerabilityTime = 0;
        this.invulnerabilityDuration = 1000; // 受傷後1秒無敵時間
        
        // 增益系統 - 存儲所有持續性增益效果
        this.buffs = {
            hp_boost: false,  // 生命強化
            // 未來可以添加更多增益
        };
        // 防禦平減（由防禦強化天賦設定）
        this.damageReductionFlat = 0;

        // 受傷紅閃效果
        this.hitFlashTime = 0;
        this.hitFlashDuration = 180; // 毫秒
        
        // 能量與大招狀態
        this.energy = 0;
        this.maxEnergy = CONFIG.ENERGY.MAX;
        this.energyRegenRate = CONFIG.ENERGY.REGEN_PER_SEC;
        this.isUltimateActive = false;
        this.ultimateEndTime = 0;
        this._ultimateBackup = null;
        this.ultimateKeyHeld = false;

        // 生命自然恢復：每5秒回1HP（不溢出，上限100）
        this.healthRegenIntervalMs = 5000;
        this.healthRegenAccumulator = 0;
        
        // 初始武器 - 飛鏢
        this.addWeapon('DAGGER');
    }
    
    update(deltaTime) {
        // 處理移動（套用deltaTime，以60FPS為基準）
        const deltaMul = deltaTime / 16.67;
        const direction = Input.getMovementDirection();
        // 嘗試分軸移動，並以障礙物進行阻擋
        const tryMove = (newX, newY) => {
            for (const obs of Game.obstacles || []) {
                if (Utils.circleRectCollision(newX, newY, this.collisionRadius, obs.x, obs.y, obs.width, obs.height)) {
                    return false;
                }
            }
            return true;
        };
        // X軸
        const candX = this.x + direction.x * this.speed * deltaMul;
        if (tryMove(candX, this.y)) {
            this.x = candX;
        }
        // Y軸
        const candY = this.y + direction.y * this.speed * deltaMul;
        if (tryMove(this.x, candY)) {
            this.y = candY;
        }
        
        // 限制玩家在世界範圍內（不循環）
        this.x = Utils.clamp(this.x, this.width / 2, (Game.worldWidth || CONFIG.CANVAS_WIDTH) - this.width / 2);
        this.y = Utils.clamp(this.y, this.height / 2, (Game.worldHeight || CONFIG.CANVAS_HEIGHT) - this.height / 2);
        
        // 能量自然恢復（每秒+1，封頂100）
        this.energy = Math.min(this.maxEnergy, this.energy + this.energyRegenRate * (deltaTime / 1000));
        UI.updateEnergyBar(this.energy, this.maxEnergy);

        // 生命自然恢復：每5秒+1（上限100）
        if (this.health < this.maxHealth) {
            this.healthRegenAccumulator += deltaTime;
            if (this.healthRegenAccumulator >= this.healthRegenIntervalMs) {
                const ticks = Math.floor(this.healthRegenAccumulator / this.healthRegenIntervalMs);
                this.healthRegenAccumulator -= ticks * this.healthRegenIntervalMs;
                this.health = Math.min(this.maxHealth, this.health + ticks);
                UI.updateHealthBar(this.health, this.maxHealth);
            }
        } else {
            // 滿血時維持計時器但不回復；避免溢出
            this.healthRegenAccumulator = 0;
        }

        // 監聽大招觸發（Q鍵）
        const qDown = Input.isKeyDown('q') || Input.isKeyDown('Q');
        if (qDown && !this.ultimateKeyHeld) {
            this.tryActivateUltimate();
        }
        this.ultimateKeyHeld = qDown;

        // 大招結束判定
        if (this.isUltimateActive && Date.now() >= this.ultimateEndTime) {
            this.deactivateUltimate();
        }

        // 更新無敵狀態
        if (this.isInvulnerable) {
            this.invulnerabilityTime += deltaTime;
            if (this.invulnerabilityTime >= this.invulnerabilityDuration) {
                this.isInvulnerable = false;
                this.invulnerabilityTime = 0;
            }
        }

        // 更新受傷紅閃計時
        if (this.hitFlashTime > 0) {
            this.hitFlashTime = Math.max(0, this.hitFlashTime - deltaTime);
        }
    }
    
    draw(ctx) {
        // 繪製玩家
        ctx.save();
        
        // 無敵狀態閃爍效果
        if (this.isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        
        // 使用玩家圖片（大招期間使用playerN）
        const imgKey = (this.isUltimateActive && Game.images && Game.images[CONFIG.ULTIMATE.IMAGE_KEY]) ? CONFIG.ULTIMATE.IMAGE_KEY : 'player';
        if (Game.images && Game.images[imgKey]) {
            // 確保圖片以1:1比例繪製
            const size = Math.max(this.width, this.height);
            ctx.drawImage(Game.images[imgKey], this.x - size / 2, this.y - size / 2, size, size);
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

        // 受傷紅色覆蓋閃爍
        if (this.hitFlashTime > 0) {
            const alpha = 0.35;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(this.width, this.height) / 2 + 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    // 受到傷害
    takeDamage(amount) {
        if (this.isInvulnerable) return;
        
        // 防禦平減：每次受傷減免固定值（不為負）
        const reduction = this.damageReductionFlat || 0;
        const effective = Math.max(0, amount - reduction);
        
        this.health -= effective;
        if (this.health <= 0) {
            this.health = 0;
            this.die();
        } else {
            // 受傷後短暫無敵
            this.isInvulnerable = true;
            this.invulnerabilityTime = 0;
            // 啟動紅閃
            this.hitFlashTime = this.hitFlashDuration;
        }
        
        // 更新UI
        UI.updateHealthBar(this.health, this.maxHealth);
    }
    
    // 死亡
     die() {
         if (Game.isGameOver || this._isDead) return;
         this._isDead = true;
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

    // 嘗試啟動大招
    tryActivateUltimate() {
        if (this.isUltimateActive) return;
        if (Math.floor(this.energy) < this.maxEnergy) return; // 需要100能量
        this.activateUltimate();
    }

    // 啟動大招：變身、體型變大、四技能LV10、能量消耗
    activateUltimate() {
        // 保存必要的玩家狀態，不初始化玩家
        this._ultimateBackup = {
            width: this.width,
            height: this.height,
            collisionRadius: this.collisionRadius,
            weapons: this.weapons.map(w => ({ type: w.type, level: w.level }))
        };
        
        // 變身狀態
        this.isUltimateActive = true;
        this.ultimateEndTime = Date.now() + CONFIG.ULTIMATE.DURATION_MS;
        
        // 體型變大
        this.width = Math.floor(this.width * CONFIG.ULTIMATE.PLAYER_SIZE_MULTIPLIER);
        this.height = Math.floor(this.height * CONFIG.ULTIMATE.PLAYER_SIZE_MULTIPLIER);
        this.collisionRadius = Math.max(this.width, this.height) / 2;
        
        // 啟用四種武器，全部LV10
        this.weapons = CONFIG.ULTIMATE.ULTIMATE_WEAPONS.map(type => {
            const w = new Weapon(this, type);
            w.level = CONFIG.ULTIMATE.ULTIMATE_LEVEL;
            w.projectileCount = w.config.LEVELS[w.level - 1].COUNT;
            return w;
        });
        
        // 消耗能量
        this.energy = 0;
        UI.updateEnergyBar(this.energy, this.maxEnergy);
    }

    // 結束大招：恢復原始狀態與武器、能量歸零
    deactivateUltimate() {
        if (!this.isUltimateActive || !this._ultimateBackup) return;
        this.isUltimateActive = false;
        
        // 恢復尺寸與碰撞半徑
        this.width = this._ultimateBackup.width;
        this.height = this._ultimateBackup.height;
        this.collisionRadius = this._ultimateBackup.collisionRadius;
        
        // 恢復原本武器與等級
        this.weapons = this._ultimateBackup.weapons.map(info => {
            const w = new Weapon(this, info.type);
            w.level = info.level;
            w.projectileCount = w.config.LEVELS[w.level - 1].COUNT;
            return w;
        });
        
        // 能量歸零
        this.energy = 0;
        UI.updateEnergyBar(this.energy, this.maxEnergy);
        
        // 清理備份
        this._ultimateBackup = null;
        this.ultimateEndTime = 0;
    }
}
