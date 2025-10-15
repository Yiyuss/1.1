// UI系統
const UI = {
    init: function() {
        // 獲取UI元素
        this.healthBar = document.getElementById('health-fill');
        this.healthText = document.getElementById('health-text');
        this.levelText = document.getElementById('level-text');
        this.expBar = document.getElementById('exp-fill');
        this.expText = document.getElementById('exp-text');
        this.timer = document.getElementById('timer');
        this.waveInfo = document.getElementById('wave-info');
        this.levelUpMenu = document.getElementById('level-up-menu');
        this.upgradeOptions = document.getElementById('upgrade-options');
        
        // 初始化UI
        this.updateHealthBar(CONFIG.PLAYER.MAX_HEALTH, CONFIG.PLAYER.MAX_HEALTH);
        this.updateLevel(1);
        this.updateExpBar(0, CONFIG.EXPERIENCE.LEVEL_UP_BASE);
        this.updateTimer(0);
        this.updateWaveInfo(1);
    },
    
    // 更新血量條
    updateHealthBar: function(current, max) {
        const percentage = Math.max(0, current / max * 100);
        this.healthBar.style.width = percentage + '%';
        this.healthText.textContent = `${Math.floor(current)}/${max}`;
    },
    
    // 更新等級
    updateLevel: function(level) {
        this.levelText.textContent = level;
    },
    
    // 更新經驗條
    updateExpBar: function(current, max) {
        const percentage = Math.max(0, current / max * 100);
        this.expBar.style.width = percentage + '%';
        this.expText.textContent = `${Math.floor(current)}/${max}`;
    },
    
    // 更新計時器
    updateTimer: function(time) {
        this.timer.textContent = Utils.formatTime(time);
    },
    
    // 更新波次信息
    updateWaveInfo: function(wave) {
        this.waveInfo.textContent = `波次: ${wave}`;
    },
    
    // 顯示升級選單
    showLevelUpMenu: function() {
        // 暫停遊戲
        Game.pause();
        
        // 清空升級選項
        this.upgradeOptions.innerHTML = '';
        
        // 獲取可用的升級選項
        const options = this.getUpgradeOptions();

        // 若無任何選項（所有技能已滿級且無新武器），直接略過並恢復遊戲
        if (options.length === 0) {
            this.hideLevelUpMenu();
            return;
        }
        
        // 添加升級選項
        options.forEach(option => {
            const optionElement = document.createElement('div');
            optionElement.className = 'upgrade-option';
            
            const nameElement = document.createElement('h3');
            nameElement.textContent = `${option.name} Lv.${option.level}`;
            
            const descElement = document.createElement('p');
            descElement.textContent = option.description;
            
            optionElement.appendChild(nameElement);
            optionElement.appendChild(descElement);
            
            // 添加點擊事件
            optionElement.addEventListener('click', () => {
                this.selectUpgrade(option.type);
            });
            
            this.upgradeOptions.appendChild(optionElement);
        });
        
        // 顯示選單
        this.levelUpMenu.classList.remove('hidden');
    },
    
    // 隱藏升級選單
    hideLevelUpMenu: function() {
        this.levelUpMenu.classList.add('hidden');
        
        // 恢復遊戲
        Game.resume();
    },
    
    // 獲取升級選項
    getUpgradeOptions: function() {
        const options = [];
        const player = Game.player;
        
        // 現有武器升級選項
        for (const weapon of player.weapons) {
            const nextLevel = weapon.getNextLevelDescription();
            if (nextLevel) {
                options.push({
                    type: weapon.type,
                    name: nextLevel.name,
                    level: nextLevel.level,
                    description: nextLevel.description
                });
            }
        }
        
        // 新武器選項
        const availableWeapons = ['DAGGER', 'FIREBALL', 'LIGHTNING', 'ORBIT'];
        const playerWeaponTypes = player.weapons.map(w => w.type);
        
        for (const weaponType of availableWeapons) {
            if (!playerWeaponTypes.includes(weaponType)) {
                const weaponConfig = CONFIG.WEAPONS[weaponType];
                options.push({
                    type: weaponType,
                    name: weaponConfig.NAME,
                    level: 1,
                    description: weaponConfig.LEVELS[0].DESCRIPTION
                });
            }
        }
        
        // 隨機選擇3個選項（如果有足夠的選項）
        if (options.length > 3) {
            return Utils.shuffleArray(options).slice(0, 3);
        }
        
        return options;
    },
    
    // 選擇升級
    selectUpgrade: function(weaponType) {
        const player = Game.player;
        
        // 檢查玩家是否已有此武器
        const existingWeapon = player.weapons.find(w => w.type === weaponType);
        
        if (existingWeapon) {
            // 升級現有武器
            player.upgradeWeapon(weaponType);
        } else {
            // 添加新武器
            player.addWeapon(weaponType);
        }
        
        // 隱藏升級選單
        this.hideLevelUpMenu();
    },
    
    // 顯示遊戲結束畫面
    showGameOverScreen: function() {
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
        
        // 播放失敗影片
        const video = document.getElementById('game-over-video');
        video.play();
        
        // 影片結束後返回開始畫面
        video.addEventListener('ended', () => {
            document.getElementById('game-over-screen').classList.add('hidden');
            document.getElementById('start-screen').classList.remove('hidden');
        });
    },
    
    // 顯示勝利畫面
    showVictoryScreen: function() {
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('victory-screen').classList.remove('hidden');
        
        // 播放勝利影片
        const video = document.getElementById('victory-video');
        video.play();
        
        // 影片結束後返回開始畫面
        video.addEventListener('ended', () => {
            document.getElementById('victory-screen').classList.add('hidden');
            document.getElementById('start-screen').classList.remove('hidden');
        });
    }
};

// 工具函數 - 洗牌數組
Utils.shuffleArray = function(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};
