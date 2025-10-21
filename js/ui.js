// UI系統
/**
 * UI 模組（全域 UI 物件）
 * 職責：畫面元素更新（血量/經驗/能量/計時/波次/金幣）、升級選單、技能頁（ESC）、天賦清單、結束/勝利畫面展示。
 * 依賴：DOM（index.html 既定 id 與 .hidden class）、Game、AudioManager、CONFIG、Utils、localStorage。
 * 不變式：
 * - 任一 DOM id 與 CSS 類名不可更動（避免跨檔壞連結）。
 * - 所有人眼可見文字與排版不可更動（除非另行要求）。
 * - 金幣/天賦等資料鍵（如 'unlocked_talents'）不可更動；流程與數值格式不可更動。
 * - 僅允許結構性抽取重複邏輯；不得改變行為順序或數值。
 * 維護提示：請於新增功能時先補JSDoc註解與依賴備註，再實作，避免不同AI造成行為偏移。
 */
const UI = {
    /**
     * 初始化 UI 元素與事件綁定
     * 依賴：既定 DOM id；AudioManager（可選）；Game、CONFIG。
     * 不變式：id 與 class 名不可變；事件綁定與初始顯示狀態不可改；不可改動文字與數值格式。
     */
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
        
        // 金幣顯示元素
        this.coinsText = document.getElementById('coins-text');

        // 技能頁（ESC）元素
        this.skillsMenu = document.getElementById('skills-menu');
        this.skillsList = document.getElementById('skills-list');
        this.skillsMusicSlider = document.getElementById('skills-music-volume');
        this.skillsSoundSlider = document.getElementById('skills-sound-volume');
        this.skillsMusicText = document.getElementById('skills-music-volume-text');
        this.skillsSoundText = document.getElementById('skills-sound-volume-text');
        // 金幣顯示元素（動態建立）
        this.skillsCoinsEl = document.getElementById('skills-coins');

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
        // 更新天賦清單
        this.updateTalentsList();
        // 更新金幣顯示
        this.updateCoins(Game.coins || 0);
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
    // 更新金幣顯示
    updateCoinsDisplay: function(coins) {
        if (this.coinsText) {
            this.coinsText.textContent = Math.max(0, Math.floor(coins || 0));
        }
    },

    // 金幣顯示：確保元素存在並更新內容
    ensureCoinsElement: function() {
        if (!this.skillsMenu) return;
        if (this.skillsCoinsEl && this.skillsCoinsEl.parentElement) return;
        const el = document.createElement('div');
        el.id = 'skills-coins';
        el.className = 'skills-coins';
        el.textContent = '金幣: 0';
        // 插入在標題之後，避免影響既有內容
        const title = this.skillsMenu.querySelector('.skills-title');
        if (title) {
            title.insertAdjacentElement('afterend', el);
        } else {
            this.skillsMenu.insertBefore(el, this.skillsMenu.firstChild);
        }
        this.skillsCoinsEl = el;
    },
    updateCoins: function(total) {
        try {
            this.ensureCoinsElement();
            if (this.skillsCoinsEl) {
                this.skillsCoinsEl.textContent = `金幣: ${Math.max(0, Math.floor(total || 0))}`;
            }
        } catch (_) {}
    },
    /**
     * 更新技能列表（武器清單）
     * 依賴：Game.player.weapons、CONFIG、AudioManager（可選，僅處理滑桿綁定）。
     * 不變式：DOM id 與文案不可更動；列表結構與排序不可更動；處理「尚未獲得任何技能」文案。
     */
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
    
    // 更新天賦列表
    /**
     * 更新天賦清單（從 localStorage 讀取）
     * 依賴：localStorage 'unlocked_talents'；DOM 結構；JSON.parse。
     * 不變式：鍵名與顯示文案不可更動；若讀取失敗維持空清單或錯誤提示；動態建立容器邏輯不可更動。
     */
    updateTalentsList: function() {
        // 檢查天賦列表元素是否存在
        if (!this.talentsList) {
            // 如果不存在，創建天賦列表區域
            const talentsSection = document.createElement('div');
            talentsSection.className = 'talents-section';
            
            const talentsTitle = document.createElement('h3');
            talentsTitle.className = 'talents-title';
            talentsTitle.textContent = '已解鎖天賦';
            talentsSection.appendChild(talentsTitle);
            
            this.talentsList = document.createElement('div');
            this.talentsList.id = 'talents-list';
            this.talentsList.className = 'talents-list';
            talentsSection.appendChild(this.talentsList);
            
            // 將天賦區域添加到技能選單中
            if (this.skillsMenu) {
                // 找到音量控制區域，在其前面插入天賦區域
                const volumeSection = this.skillsMenu.querySelector('.volume-section');
                if (volumeSection) {
                    this.skillsMenu.insertBefore(talentsSection, volumeSection);
                } else {
                    // 如果找不到音量區域，直接添加到選單末尾
                    this.skillsMenu.appendChild(talentsSection);
                }
            }
        }
        
        // 清空現有天賦列表
        this.talentsList.innerHTML = '';
        
        try {
            // 從本地存儲獲取已解鎖的天賦
            const unlockedTalents = JSON.parse(localStorage.getItem('unlocked_talents') || '[]');
            
            if (unlockedTalents.length === 0) {
                const emptyTalent = document.createElement('div');
                emptyTalent.className = 'talent-empty';
                emptyTalent.textContent = '尚未解鎖任何天賦';
                this.talentsList.appendChild(emptyTalent);
                return;
            }
            
            // 添加每個已解鎖的天賦
            unlockedTalents.forEach(talentId => {
                const talentItem = document.createElement('div');
                talentItem.className = 'talent-item';
                
                // 根據天賦ID設置顯示名稱和描述
                let talentName = '未知天賦';
                let talentDesc = '';
                
                if (talentId === 'hp_boost') {
                    talentName = '生命強化';
                    talentDesc = '增加初始生命值20點';
                } else if (talentId === 'damage_boost') {
                    talentName = '攻擊強化';
                    talentDesc = '增加所有武器傷害10%';
                } else if (talentId === 'speed_boost') {
                    talentName = '速度強化';
                    talentDesc = '增加移動速度15%';
                }
                
                talentItem.innerHTML = `<div class="talent-name">${talentName}</div><div class="talent-desc">${talentDesc}</div>`;
                this.talentsList.appendChild(talentItem);
            });
        } catch (e) {
            console.error('載入天賦失敗:', e);
            const errorItem = document.createElement('div');
            errorItem.className = 'talent-error';
            errorItem.textContent = '載入天賦失敗';
            this.talentsList.appendChild(errorItem);
        }
    },
    
    // 獲取升級選項
    /**
     * 取得升級選項（含現有武器升級與新武器）
     * 依賴：Game.player、CONFIG.WEAPONS、Utils.shuffleArray。
     * 不變式：選項數量、格式、文字不可更動；必須處理 ultimate 狀態備份邏輯不變。
     */
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
        const availableWeapons = ['DAGGER', 'FIREBALL', 'LIGHTNING', 'ORBIT', 'LASER', 'SING', 'CHAIN_LIGHTNING'];
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
    
    /**
     * 套用選擇的升級（升級現有武器或新增武器）
     * 依賴：Game.player 武器 API；CONFIG.WEAPONS；ultimate 備份狀態。
     * 不變式：所有數值與流程不可更動；需維持對 ultimate 狀態的備份/恢復處理；UI 更新流程不可更動。
     */
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
    
    /**
     * 私有：初始化並安全播放影片
     * 依賴：HTMLVideoElement、overlay、playBtn；回調 onEnded。
     * 不變式：播放流程與 overlay 顯示/隱藏策略不可更動；不要改參數名稱或順序。
     */
    _setupAndPlayVideo: function(el, overlay, playBtn, onEnded) {
        if (!el) return;
        try { el.pause(); } catch (_) {}
        el.muted = false;
        el.loop = false;
        el.currentTime = 0;
        if (typeof onEnded === 'function') {
            el.addEventListener('ended', onEnded, { once: true });
        }
        try {
            const p = el.play();
            if (p && typeof p.then === 'function') {
                p.then(function() { if (overlay) overlay.classList.add('hidden'); })
                 .catch(function() { if (overlay) overlay.classList.remove('hidden'); });
            }
        } catch (err) {
            if (overlay) overlay.classList.remove('hidden');
        }
        if (playBtn) {
            playBtn.onclick = function() {
                try {
                    el.muted = false;
                    el.loop = false;
                    el.currentTime = 0;
                    const p2 = el.play();
                    if (overlay) overlay.classList.add('hidden');
                    if (p2 && typeof p2.catch === 'function') {
                        p2.catch(function() { if (overlay) overlay.classList.remove('hidden'); });
                    }
                } catch (_) { if (overlay) overlay.classList.remove('hidden'); }
            };
        }
    },
    
    // 顯示遊戲結束畫面
    /**
     * 顯示遊戲結束畫面
     * 依賴：DOM id 'game-screen','game-over-screen','game-over-video','game-over-overlay','game-over-play'；AudioManager；Game。
     * 不變式：流程與顯示文字不可更動；僅抽出重複邏輯至私有方法。
     */
    showGameOverScreen: function() {
        try { if (AudioManager.stopMusic) AudioManager.stopMusic(); } catch (e) {}
        Game.pause(true);
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
    
        const onEnded = function() {
            document.getElementById('game-over-screen').classList.add('hidden');
            document.getElementById('character-select-screen').classList.add('hidden');
            document.getElementById('map-select-screen').classList.add('hidden');
            document.getElementById('start-screen').classList.remove('hidden');
            Game.isGameOver = false;
            try { AudioManager.isMuted = false; } catch (e) {}
            try { if (AudioManager.playMusic) AudioManager.playMusic('menu_music'); } catch (e) {}
        };
    
        this._setupAndPlayVideo(
            document.getElementById('game-over-video'),
            document.getElementById('game-over-overlay'),
            document.getElementById('game-over-play'),
            onEnded
        );
    },
    
    // 顯示勝利畫面
    /**
     * 顯示勝利畫面
     * 依賴：DOM id 'game-screen','victory-screen','victory-video','victory-overlay','victory-play'；AudioManager；Game。
     * 不變式：流程與顯示文字不可更動；僅抽出重複邏輯至私有方法。
     */
    showVictoryScreen: function() {
        try { if (AudioManager.stopMusic) AudioManager.stopMusic(); } catch (e) {}
        Game.pause(true);
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('victory-screen').classList.remove('hidden');
    
        const onEnded = function() {
            document.getElementById('victory-screen').classList.add('hidden');
            document.getElementById('character-select-screen').classList.add('hidden');
            document.getElementById('map-select-screen').classList.add('hidden');
            document.getElementById('start-screen').classList.remove('hidden');
            Game.isGameOver = false;
            try { AudioManager.isMuted = false; } catch (e) {}
            try { if (AudioManager.playMusic) AudioManager.playMusic('menu_music'); } catch (e) {}
        };
    
        this._setupAndPlayVideo(
            document.getElementById('victory-video'),
            document.getElementById('victory-overlay'),
            document.getElementById('victory-play'),
            onEnded
        );
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
