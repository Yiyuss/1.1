// UI系統
const UI = {
    init: function() {
        // 獲取UI元素
        this.healthBar = document.getElementById('health-fill');
        this.healthText = document.getElementById('health-text');
        this.levelText = document.getElementById('level-text');
        this.expBar = document.getElementById('exp-fill');
        this.expText = document.getElementById('exp-text');
        this.energyBar = document.getElementById('energy-fill');
        this.energyText = document.getElementById('energy-text');
        this.timer = document.getElementById('timer');
        this.waveInfo = document.getElementById('wave-info');
        this.levelUpMenu = document.getElementById('level-up-menu');
        this.upgradeOptions = document.getElementById('upgrade-options');

        // 技能頁（ESC）元素
        this.skillsMenu = document.getElementById('skills-menu');
        this.skillsList = document.getElementById('skills-list');
        this.skillsMusicSlider = document.getElementById('skills-music-volume');
        this.skillsSoundSlider = document.getElementById('skills-sound-volume');
        this.skillsMusicText = document.getElementById('skills-music-volume-text');
        this.skillsSoundText = document.getElementById('skills-sound-volume-text');

        // 綁定技能頁音量滑桿事件
        if (this.skillsMusicSlider && this.skillsMusicText) {
            this.skillsMusicSlider.addEventListener('input', () => {
                if (typeof AudioManager !== 'undefined' && AudioManager.setMusicVolume) {
                    AudioManager.setMusicVolume(parseFloat(this.skillsMusicSlider.value));
                }
                this.skillsMusicText.textContent = Math.round(this.skillsMusicSlider.value * 100) + '%';
            });
        }
        if (this.skillsSoundSlider && this.skillsSoundText) {
            this.skillsSoundSlider.addEventListener('input', () => {
                if (typeof AudioManager !== 'undefined' && AudioManager.setSoundVolume) {
                    AudioManager.setSoundVolume(parseFloat(this.skillsSoundSlider.value));
                }
                this.skillsSoundText.textContent = Math.round(this.skillsSoundSlider.value * 100) + '%';
            });
        }
        
        // 初始化UI
        this.updateHealthBar(CONFIG.PLAYER.MAX_HEALTH, CONFIG.PLAYER.MAX_HEALTH);
        this.updateLevel(1);
        this.updateExpBar(0, CONFIG.EXPERIENCE.LEVEL_UP_BASE);
        this.updateEnergyBar(0, CONFIG.ENERGY.MAX);
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

    // 更新能量條
    updateEnergyBar: function(current, max) {
        const percentage = Math.max(0, current / max * 100);
        this.energyBar.style.width = percentage + '%';
        this.energyText.textContent = `${Math.floor(current)}/${max}`;
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
        // 暫停遊戲，但不靜音，避免升級音效與BGM被切斷
        Game.pause(false);
        
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

    // 顯示技能頁（ESC），包含技能清單與音量調整
    showSkillsMenu: function() {
        if (!this.skillsMenu) return;
        // 暫停但不靜音
        Game.pause(false);
        // 建構技能清單
        this.updateSkillsList();
        this.skillsMenu.classList.remove('hidden');
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound('button_click');
        }
    },
    hideSkillsMenu: function() {
        if (!this.skillsMenu) return;
        this.skillsMenu.classList.add('hidden');
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound('button_click');
        }
        Game.resume();
    },
    isSkillsMenuOpen: function() {
        const el = this.skillsMenu;
        return el && !el.classList.contains('hidden');
    },
    updateSkillsList: function() {
        if (!this.skillsList) return;
        const player = Game.player;
        const sourceWeaponsInfo = (player.isUltimateActive && player._ultimateBackup)
            ? player._ultimateBackup.weapons
            : player.weapons.map(w => ({ type: w.type, level: w.level }));
        this.skillsList.innerHTML = '';
        sourceWeaponsInfo.forEach(info => {
            const cfg = CONFIG.WEAPONS[info.type];
            const name = cfg ? cfg.NAME : info.type;
            const div = document.createElement('div');
            div.className = 'skill-item';
            div.innerHTML = `<div class="skill-name">${name}</div><div class="skill-level">Lv.${info.level}</div>`;
            this.skillsList.appendChild(div);
        });
        // 若沒有任何武器
        if (sourceWeaponsInfo.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'skill-empty';
            empty.textContent = '尚未獲得任何技能';
            this.skillsList.appendChild(empty);
        }
        // 初始化技能頁音量滑桿（若存在）
        if (this.skillsMusicSlider && this.skillsMusicText) {
            this.skillsMusicSlider.value = (typeof AudioManager !== 'undefined' ? AudioManager.musicVolume : 0.5);
            this.skillsMusicText.textContent = Math.round(this.skillsMusicSlider.value * 100) + '%';
        }
        if (this.skillsSoundSlider && this.skillsSoundText) {
            this.skillsSoundSlider.value = (typeof AudioManager !== 'undefined' ? AudioManager.soundVolume : 0.7);
            this.skillsSoundText.textContent = Math.round(this.skillsSoundSlider.value * 100) + '%';
        }
    },
    
    // 獲取升級選項
    getUpgradeOptions: function() {
        const options = [];
        const player = Game.player;

        // 在大招期間，升級選項基於「大招前的武器狀態」生成，避免因LV10臨時武器導致無選項
        const sourceWeaponsInfo = (player.isUltimateActive && player._ultimateBackup)
            ? player._ultimateBackup.weapons // [{ type, level }]
            : player.weapons.map(w => ({ type: w.type, level: w.level }));

        // 現有武器升級選項（使用CONFIG計算下一級描述）
        for (const info of sourceWeaponsInfo) {
            const cfg = CONFIG.WEAPONS[info.type];
            if (!cfg) continue;
            if (info.level < cfg.LEVELS.length) {
                options.push({
                    type: info.type,
                    name: cfg.NAME,
                    level: info.level + 1,
                    description: cfg.LEVELS[info.level].DESCRIPTION
                });
            }
        }

        // 新武器選項（基於來源狀態判定）
        const availableWeapons = ['DAGGER', 'FIREBALL', 'LIGHTNING', 'ORBIT', 'LASER', 'SING'];
        const playerWeaponTypes = sourceWeaponsInfo.map(w => w.type);
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

        // 每次升級隨機挑選3個（不足3則返回全部）
        const shuffled = Utils.shuffleArray(options);
        return shuffled.slice(0, 3);
    },
    
    // 選擇升級
    selectUpgrade: function(weaponType) {
        const player = Game.player;

        // 大招期間：將升級作用在「大招前的武器狀態」上，避免臨時LV10武器干擾
        if (player.isUltimateActive && player._ultimateBackup) {
            const idx = player._ultimateBackup.weapons.findIndex(w => w.type === weaponType);
            if (idx >= 0) {
                const info = player._ultimateBackup.weapons[idx];
                const cfg = CONFIG.WEAPONS[info.type];
                if (cfg && info.level < cfg.LEVELS.length) {
                    info.level++;
                }
            } else {
                // 添加新武器到備份狀態（LV1）
                player._ultimateBackup.weapons.push({ type: weaponType, level: 1 });
            }
        } else {
            // 平常狀態：直接升級/新增到當前玩家武器
            const existingWeapon = player.weapons.find(w => w.type === weaponType);
            if (existingWeapon) {
                player.upgradeWeapon(weaponType);
            } else {
                player.addWeapon(weaponType);
            }
        }

        // 隱藏升級選單
        this.hideLevelUpMenu();
    },
    
    // 顯示遊戲結束畫面
    showGameOverScreen: function() {
        // 停止BGM，避免與影片音訊重疊
        if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) {
            AudioManager.stopAllMusic();
        }
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
        
        // 播放失敗影片（若為回退圖片則不播放，改用ended事件或定時器）
        const el = document.getElementById('game-over-video');
        try {
            if (el && typeof el.play === 'function') {
                el.pause();
                el.muted = false;
                el.loop = false;
                el.currentTime = 0;
                el.play();
            }
        } catch (e) {
            console.warn('播放遊戲結束影片失敗，將使用回退邏輯');
        }
        
        // 結束後返回開始畫面（圖片回退會在main.js裡模擬ended事件）
        if (el && typeof el.addEventListener === 'function') {
            el.addEventListener('ended', () => {
                document.getElementById('game-over-screen').classList.add('hidden');
                document.getElementById('start-screen').classList.remove('hidden');
                Game.isGameOver = false;
                // 確保影片完全停止
                if (typeof el.pause === 'function') { el.pause(); el.currentTime = 0; }
                if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                    AudioManager.playMusic('menu_music');
                }
            }, { once: true });
        }
        
        // 設置自動返回開始畫面的定時器（3秒後）
        setTimeout(() => {
            if (document.getElementById('game-over-screen').classList.contains('hidden') === false) {
                document.getElementById('game-over-screen').classList.add('hidden');
                document.getElementById('start-screen').classList.remove('hidden');
                // 重置遊戲狀態
                Game.isGameOver = false;
                if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                    AudioManager.playMusic('menu_music');
                }
            }
        }, 3000);
    },
    
    // 顯示勝利畫面
    showVictoryScreen: function() {
        // 停止BGM，避免與影片音訊重疊
        if (typeof AudioManager !== 'undefined' && AudioManager.stopAllMusic) {
            AudioManager.stopAllMusic();
        }
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('victory-screen').classList.remove('hidden');
        
        // 播放勝利影片（若為回退圖片則不播放，改用ended事件或定時器）
        const el = document.getElementById('victory-video');
        try {
            if (el && typeof el.play === 'function') {
                el.pause();
                el.muted = false;
                el.loop = false;
                el.currentTime = 0;
                el.play();
            }
        } catch (e) {
            console.warn('播放勝利影片失敗，將使用回退邏輯');
        }
        
        // 結束後返回開始畫面（圖片回退會在main.js裡模擬ended事件）
        if (el && typeof el.addEventListener === 'function') {
            el.addEventListener('ended', () => {
                document.getElementById('victory-screen').classList.add('hidden');
                document.getElementById('start-screen').classList.remove('hidden');
                Game.isGameOver = false;
                if (typeof el.pause === 'function') { el.pause(); el.currentTime = 0; }
            }, { once: true });
        } else {
            // 最保險的回退：3秒後返回開始畫面
            setTimeout(() => {
                document.getElementById('victory-screen').classList.add('hidden');
                document.getElementById('start-screen').classList.remove('hidden');
            }, 3000);
        }
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
