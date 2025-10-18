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
        try { if (AudioManager.stopMusic) AudioManager.stopMusic(); } catch (e) {}
        Game.pause(true);
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
    
        const el = document.getElementById('game-over-video');
        const overlay = document.getElementById('game-over-overlay');
        const playBtn = document.getElementById('game-over-play');
    
        if (!el) return;
    
        // 確保影片初始狀態
        try { el.pause(); } catch (_) {}
        el.muted = false;
        el.loop = false;
        el.currentTime = 0;
    
        // 結束事件：回到起始畫面並恢復選單音樂
        const onEnded = () => {
            document.getElementById('game-over-screen').classList.add('hidden');
            document.getElementById('character-select-screen').classList.add('hidden');
            document.getElementById('map-select-screen').classList.add('hidden');
            document.getElementById('start-screen').classList.remove('hidden');
            Game.isGameOver = false;
            // 解除靜音並播放選單音樂（避免回到選單仍靜音）
            try { AudioManager.isMuted = false; } catch (e) {}
            try { if (AudioManager.playMusic) AudioManager.playMusic('menu_music'); } catch (e) {}
        };
        el.addEventListener('ended', onEnded, { once: true });
    
        // 嘗試播放並處理瀏覽器手勢限制
        try {
            const p = el.play();
            if (p && typeof p.then === 'function') {
                p.then(() => {
                    if (overlay) overlay.classList.add('hidden');
                }).catch(() => {
                    if (overlay) overlay.classList.remove('hidden');
                });
            }
        } catch (err) {
            if (overlay) overlay.classList.remove('hidden');
        }
    
        if (playBtn) {
            playBtn.onclick = () => {
                try {
                    el.muted = false;
                    el.loop = false;
                    el.currentTime = 0;
                    const p2 = el.play();
                    if (overlay) overlay.classList.add('hidden');
                    if (p2 && typeof p2.catch === 'function') {
                        p2.catch(() => { if (overlay) overlay.classList.remove('hidden'); });
                    }
                } catch (_) { if (overlay) overlay.classList.remove('hidden'); }
            };
        }
    },
    
    // 顯示勝利畫面
    showVictoryScreen: function() {
        try { if (AudioManager.stopMusic) AudioManager.stopMusic(); } catch (e) {}
        Game.pause(true);
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('victory-screen').classList.remove('hidden');
    
        const el = document.getElementById('victory-video');
        const overlay = document.getElementById('victory-overlay');
        const playBtn = document.getElementById('victory-play');
    
        if (!el) return;
    
        try { el.pause(); } catch (_) {}
        el.muted = false;
        el.loop = false;
        el.currentTime = 0;
    
        const onEnded = () => {
            document.getElementById('victory-screen').classList.add('hidden');
            document.getElementById('character-select-screen').classList.add('hidden');
            document.getElementById('map-select-screen').classList.add('hidden');
            document.getElementById('start-screen').classList.remove('hidden');
            Game.isGameOver = false;
            // 解除靜音並播放選單音樂（避免回到選單仍靜音）
            try { AudioManager.isMuted = false; } catch (e) {}
            try { if (AudioManager.playMusic) AudioManager.playMusic('menu_music'); } catch (e) {}
        };
        el.addEventListener('ended', onEnded, { once: true });
    
        try {
            const p = el.play();
            if (p && typeof p.then === 'function') {
                p.then(() => {
                    if (overlay) overlay.classList.add('hidden');
                }).catch(() => {
                    if (overlay) overlay.classList.remove('hidden');
                });
            }
        } catch (err) {
            if (overlay) overlay.classList.remove('hidden');
        }
    
        if (playBtn) {
            playBtn.onclick = () => {
                try {
                    el.muted = false;
                    el.loop = false;
                    el.currentTime = 0;
                    const p2 = el.play();
                    if (overlay) overlay.classList.add('hidden');
                    if (p2 && typeof p2.catch === 'function') {
                        p2.catch(() => { if (overlay) overlay.classList.remove('hidden'); });
                    }
                } catch (_) { if (overlay) overlay.classList.remove('hidden'); }
            };
        }
    },
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
