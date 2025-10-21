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

        // 統一綁定技能頁音量滑桿（不改文案與行為）
        try { this.bindVolumeSliders(this.skillsMenu); } catch (_) {}
        
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
        this._updateBar(this.healthBar, this.healthText, current, max);
    },
    
    // 更新等級
    updateLevel: function(level) {
        this.levelText.textContent = level;
    },
    
    // 更新經驗條
    updateExpBar: function(current, max) {
        this._updateBar(this.expBar, this.expText, current, max);
    },

    // 更新能量條
    updateEnergyBar: function(current, max) {
        this._updateBar(this.energyBar, this.energyText, current, max);
    },
    
    // 更新計時器
    updateTimer: function(time) {
        this.timer.textContent = Utils.formatTime(time);
    },
    
    // 更新波次信息
    updateWaveInfo: function(wave) {
        this.waveInfo.textContent = `波次: ${wave}`;
    },
    /**
     * 私有：統一更新進度條
     * 依賴：HTML元素 fillEl、textEl；數值 current、max。
     * 不變式：文字格式 `${Math.floor(current)}/${max}` 與寬度百分比計算不可更動。
     */
    _updateBar: function(fillEl, textEl, current, max) {
        try {
            const c = Number(current) || 0;
            const m = Number(max) || 0;
            const percentage = m > 0 ? Math.max(0, (c / m) * 100) : 0;
            if (fillEl) fillEl.style.width = percentage + '%';
            if (textEl) textEl.textContent = `${Math.floor(c)}/${m}`;
        } catch (_) {}
    },
    /**
     * 私有：統一按鈕點擊音效
     * 依賴：AudioManager.playSound('button_click')
     * 不變式：音效鍵名與播放條件不可更動。
     */
    _playClick: function() {
        try {
            if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                AudioManager.playSound('button_click');
            }
        } catch (_) {}
    },
    /**
     * 私有：DOM 取用包裝
     * 依賴：document.getElementById
     * 不變式：僅作包裝，不更動行為。
     */
    _get: function(id) { return document.getElementById(id); },

    /**
     * 判斷畫面是否可見（依 .hidden class）
     * 依賴：既定 DOM id；.hidden 隱藏規則。
     * 不變式：回傳布林值，不改任何顯示狀態。
     */
    isScreenVisible: function(id) {
        const el = this._get(id);
        return !!(el && !el.classList.contains('hidden'));
    },

    /**
     * 判斷是否有覆蓋層選單開啟（升級/技能）
     * 依賴：#level-up-menu、#skills-menu；.hidden 隱藏規則。
     * 不變式：僅檢查兩者是否可見；不影響其他畫面判斷。
     */
    isAnyOverlayOpen: function() {
        const levelMenu = this._get('level-up-menu');
        const skillsMenu = this._get('skills-menu');
        const levelOpen = !!(levelMenu && !levelMenu.classList.contains('hidden'));
        const skillsOpen = !!(skillsMenu && !skillsMenu.classList.contains('hidden'));
        return levelOpen || skillsOpen;
    },

    /**
     * 綁定音量滑桿（技能頁或起始頁）
     * 依賴：AudioManager.setMusicVolume/setSoundVolume/toggleMute；既定 id 與文案。
     * 不變式：不改動文案與 id；滑桿行為維持原有「即時更新數值與文字」。
     */
    bindVolumeSliders: function(container) {
        if (!container) return;
        // 技能頁滑桿
        const skillsMusic = container.querySelector('#skills-music-volume');
        const skillsSound = container.querySelector('#skills-sound-volume');
        const skillsMusicText = container.querySelector('#skills-music-volume-text');
        const skillsSoundText = container.querySelector('#skills-sound-volume-text');
        if (skillsMusic && skillsMusicText) {
            const initVal = (typeof AudioManager !== 'undefined' ? AudioManager.musicVolume : parseFloat(skillsMusic.value) || 0.5);
            skillsMusic.value = initVal;
            skillsMusicText.textContent = Math.round(initVal * 100) + '%';
            skillsMusic.addEventListener('input', function() {
                const v = parseFloat(skillsMusic.value) || 0;
                if (AudioManager.setMusicVolume) AudioManager.setMusicVolume(v);
                skillsMusicText.textContent = Math.round(v * 100) + '%';
            });
        }
        if (skillsSound && skillsSoundText) {
            const initVal = (typeof AudioManager !== 'undefined' ? AudioManager.soundVolume : parseFloat(skillsSound.value) || 0.7);
            skillsSound.value = initVal;
            skillsSoundText.textContent = Math.round(initVal * 100) + '%';
            skillsSound.addEventListener('input', function() {
                const v = parseFloat(skillsSound.value) || 0;
                if (AudioManager.setSoundVolume) AudioManager.setSoundVolume(v);
                skillsSoundText.textContent = Math.round(v * 100) + '%';
            });
        }
        
        // 起始頁滑桿與靜音切換
        const startMusic = container.querySelector('#music-volume');
        const startSound = container.querySelector('#sound-volume');
        const startMusicText = container.querySelector('#music-volume-text');
        const startSoundText = container.querySelector('#sound-volume-text');
        const muteToggle = container.querySelector('#mute-toggle');
        const muteStatus = container.querySelector('#mute-status');
        if (startMusic && startMusicText) {
            const initVal = (typeof AudioManager !== 'undefined' ? AudioManager.musicVolume : parseFloat(startMusic.value) || 0.5);
            startMusic.value = initVal;
            startMusicText.textContent = Math.round(initVal * 100) + '%';
            startMusic.addEventListener('input', function() {
                const v = parseFloat(startMusic.value) || 0;
                if (AudioManager.setMusicVolume) AudioManager.setMusicVolume(v);
                startMusicText.textContent = Math.round(v * 100) + '%';
            });
        }
        if (startSound && startSoundText) {
            const initVal = (typeof AudioManager !== 'undefined' ? AudioManager.soundVolume : parseFloat(startSound.value) || 0.7);
            startSound.value = initVal;
            startSoundText.textContent = Math.round(initVal * 100) + '%';
            startSound.addEventListener('input', function() {
                const v = parseFloat(startSound.value) || 0;
                if (AudioManager.setSoundVolume) AudioManager.setSoundVolume(v);
                startSoundText.textContent = Math.round(v * 100) + '%';
            });
        }
        if (muteToggle && muteStatus) {
            // 初始化文案
            const isMuted = !!(typeof AudioManager !== 'undefined' && AudioManager.isMuted);
            muteStatus.textContent = isMuted ? '開' : '關';
            muteToggle.addEventListener('click', function() {
                const muted = AudioManager.toggleMute ? AudioManager.toggleMute() : false;
                muteStatus.textContent = muted ? '開' : '關';
            });
        }
    },
    /**
     * 私有：從結束/勝利畫面返回起始畫面
     * 依賴：既定 DOM id；AudioManager、Game。
     * 不變式：DOM 隱藏/顯示順序與狀態更新不可更動。
     */
    _returnToStartFrom: function(screenId) {
        const screen = this._get(screenId);
        if (screen) screen.classList.add('hidden');
        const charSel = this._get('character-select-screen'); if (charSel) charSel.classList.add('hidden');
        const mapSel = this._get('map-select-screen'); if (mapSel) mapSel.classList.add('hidden');
        const start = this._get('start-screen'); if (start) start.classList.remove('hidden');
        Game.isGameOver = false;
        try { AudioManager.isMuted = false; } catch (_) {}
        // 若有 AudioScene，使用選單場景；否則保留原行為
        try {
            if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                AudioScene.enterMenu();
            } else if (AudioManager.playMusic) {
                AudioManager.playMusic('menu_music');
            }
        } catch (_) {}
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
                const volumeSection = this.skillsMenu.querySelector('.volume-section');
                if (volumeSection) {
                    this.skillsMenu.insertBefore(talentsSection, volumeSection);
                } else {
                    this.skillsMenu.appendChild(talentsSection);
                }
            }
        }
        
        // 清空現有天賦列表
        this.talentsList.innerHTML = '';
        
        try {
            // 以階梯系統為主：只顯示每個天賦的最高階描述
            // 新增 pickup_range_boost、damage_boost 兩項：維持同樣渲染流程
            const ids = ['hp_boost','defense_boost','speed_boost','pickup_range_boost','damage_boost'];
            const items = [];
            ids.forEach(id => {
                const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel) ? TalentSystem.getTalentLevel(id) : 0;
                if (lv > 0) {
                    const nameMap = {
                        hp_boost: '生命強化',
                        defense_boost: '防禦強化',
                        speed_boost: '移動加速',
                        pickup_range_boost: '拾取範圍增加',
                        damage_boost: '傷害強化'
                    };
                    const talentItem = document.createElement('div');
                    talentItem.className = 'talent-item';
                    const desc = (typeof TalentSystem !== 'undefined' && TalentSystem.getHighestTierDescription) ? TalentSystem.getHighestTierDescription(id) : '';
                    // 只顯示天賦效果（左對齊），顏色不變；不更動全局CSS。
                    talentItem.innerHTML = `<div class="talent-row">`+
                        `<span class="talent-desc" style="color:#9ed0ff;">${desc}</span>`+
                    `</div>`;
                    items.push(talentItem);
                }
            });
            if (items.length === 0) {
                const emptyTalent = document.createElement('div');
                emptyTalent.className = 'talent-empty';
                emptyTalent.textContent = '尚未解鎖任何天賦';
                this.talentsList.appendChild(emptyTalent);
                return;
            }
            items.forEach(el => this.talentsList.appendChild(el));
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
     * 維護備註：
     * - 非大招期間，必須使用 Player.addWeapon / Player.upgradeWeapon，保持 player.weapons 為 Weapon 實例陣列；
     *   避免以純物件覆蓋導致 Game._updateWeapons 調用 weapon.update 時拋錯（造成敵人/武器停滯、玩家仍可移動的假凍結）。
     * - 大招期間（isUltimateActive），只更新 _ultimateBackup（純資料），以保證大招結束後恢復正確的武器等級與新增武器。
     */
    selectUpgrade: function(weaponType) {
        const player = Game.player;

        // 大招期間：將升級作用在「大招前的武器狀態」上，避免臨時LV10武器干擾
        if (player.isUltimateActive && player._ultimateBackup) {
            const idx = player._ultimateBackup.weapons.findIndex(w => w.type === weaponType);
            if (idx >= 0) {
                player._ultimateBackup.weapons[idx].level += 1;
            } else {
                player._ultimateBackup.weapons.push({ type: weaponType, level: 1 });
            }
        } else {
            // 非大招期間：改用 Player API，保持 Weapon 實例不被破壞
            const existing = player.weapons.find(w => w.type === weaponType);
            if (existing) {
                player.upgradeWeapon(weaponType);
            } else {
                player.addWeapon(weaponType);
            }
        }

        // 更新技能列表與音量滑桿
        this.updateSkillsList();
        this._playClick();
        // 選擇完成後關閉升級選單並恢復遊戲（維持原流程）
        this.hideLevelUpMenu();
    },
    
    /**
     * 影片播放輔助：解決自動播放限制
     * 依賴：HTMLVideoElement、AudioManager（可選，僅播放音效）。
     * 不變式：不更動影片與文字；僅處理點擊播放行為。
     */
    _setupAndPlayVideo: function(el, overlay, playBtn, onEnded) {
        if (!el || !overlay || !playBtn) return;
        overlay.classList.remove('hidden');
        playBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
            try { el.play(); } catch (_) {}
            this._playClick();
        });
        el.addEventListener('ended', () => { if (onEnded) onEnded(); });
    },
    
    // 顯示遊戲結束畫面
    /**
     * 顯示遊戲結束畫面（恢復：自動播放與自動返回起始介面）
     * 依賴：DOM id 'game-screen','game-over-screen','game-over-video','game-over-overlay','game-over-play'；AudioManager；Game。
     * 不變式：流程與顯示文字不可更動；僅抽出重複邏輯至私有方法。
     */
    showGameOverScreen: function() {
        try { if (AudioManager.stopMusic) AudioManager.stopMusic(); } catch (e) {}
        Game.pause(true);
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
    
        const el = this._get('game-over-video');
        if (!el) return;
        try { el.pause(); } catch (_) {}
        el.muted = false;
        el.loop = false;
        el.currentTime = 0;
    
        const onEnded = () => this._returnToStartFrom('game-over-screen');
        el.addEventListener('ended', onEnded, { once: true });
    
        try { el.play(); } catch (_) {}
    },
    
    // 顯示勝利畫面
    /**
     * 顯示勝利畫面（恢復：自動播放與自動返回起始介面）
     * 依賴：DOM id 'game-screen','victory-screen','victory-video','victory-overlay','victory-play'；AudioManager；Game。
     * 不變式：流程與顯示文字不可更動；僅抽出重複邏輯至私有方法。
     */
    showVictoryScreen: function() {
        try { if (AudioManager.stopMusic) AudioManager.stopMusic(); } catch (e) {}
        Game.pause(true);
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('victory-screen').classList.remove('hidden');
    
        const el = this._get('victory-video');
        if (!el) return;
        try { el.pause(); } catch (_) {}
        el.muted = false;
        el.loop = false;
        el.currentTime = 0;
    
        const onEnded = () => this._returnToStartFrom('victory-screen');
        el.addEventListener('ended', onEnded, { once: true });
    
        try { el.play(); } catch (_) {}
    },

    // 顯示升級選單
    showLevelUpMenu: function() {
        // 暫停遊戲，但不靜音，避免升級音效與BGM被切斷
        if (typeof Game !== 'undefined' && Game.pause) {
            Game.pause(false);
        }
        // 清空升級選項
        if (this.upgradeOptions) this.upgradeOptions.innerHTML = '';
        // 獲取可用的升級選項
        const options = this.getUpgradeOptions();
        // 若無任何選項（所有技能已滿級且無新武器），直接略過並恢復遊戲
        if (!options || options.length === 0) {
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
            // 點擊事件：套用升級
            optionElement.addEventListener('click', () => {
                this.selectUpgrade(option.type);
            });
            this.upgradeOptions.appendChild(optionElement);
        });
        // 顯示選單（使用 .hidden 切換，與既有邏輯一致）
        if (this.levelUpMenu) this.levelUpMenu.classList.remove('hidden');
        // 手機自適應：僅在手機套用 sizing，不改 PC
        this._applyMobileLevelUpSizing();
    },
    // 隱藏升級選單
    hideLevelUpMenu: function() {
        if (this.levelUpMenu) this.levelUpMenu.classList.add('hidden');
        // 恢復遊戲
        if (typeof Game !== 'undefined' && Game.resume) {
            Game.resume();
        }
    },

    // 顯示技能頁（ESC）
    showSkillsMenu: function() {
        if (!this.skillsMenu) return;
        // 暫停但不靜音
        if (typeof Game !== 'undefined' && Game.pause) {
            Game.pause(false);
        }
        // 更新技能、天賦與金幣顯示
        try { this.updateSkillsList(); } catch (_) {}
        try { this.updateTalentsList(); } catch (_) {}
        try { this.updateCoins(Game.coins || 0); } catch (_) {}
        this.skillsMenu.classList.remove('hidden');
        // 按鈕點擊音效
        this._playClick();
    },
    // 隱藏技能頁（ESC）
    hideSkillsMenu: function() {
        if (!this.skillsMenu) return;
        this.skillsMenu.classList.add('hidden');
        // 按鈕點擊音效
        this._playClick();
        // 恢復遊戲
        if (typeof Game !== 'undefined' && Game.resume) {
            Game.resume();
        }
    },

    // 私有：手機升級視窗尺寸自適應（不影響 PC）
    _applyMobileLevelUpSizing: function() {
        const menu = this.levelUpMenu;
        if (!menu) return;
        try {
            const isMobile = (typeof window !== 'undefined') && (
                (window.matchMedia && (window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches))
            );
            // PC：移除可能殘留的手機內聯樣式
            if (!isMobile) {
                menu.style.maxWidth = '';
                menu.style.maxHeight = '';
                menu.style.overflowY = '';
                if (menu.style.transform) {
                    // 保留原本 CSS translate(-50%,-50%)，移除內聯 scale
                    menu.style.transform = 'translate(-50%, -50%)';
                }
                menu.style.transformOrigin = '';
                return;
            }

            // 手機：限制寬高並允許滾動
            menu.style.maxWidth = '95vw';
            menu.style.maxHeight = '90vh';
            menu.style.overflowY = 'auto';

            // 量測並視需要縮放（保留置中位移）
            const rect = menu.getBoundingClientRect();
            const vw = window.innerWidth || document.documentElement.clientWidth || 0;
            const vh = window.innerHeight || document.documentElement.clientHeight || 0;
            const scaleW = rect.width > 0 ? (vw * 0.95) / rect.width : 1;
            const scaleH = rect.height > 0 ? (vh * 0.90) / rect.height : 1;
            let scale = Math.min(scaleW, scaleH);
            // 下限 0.72，避免過度縮小影響閱讀；上限 1 不放大
            scale = Math.max(0.72, Math.min(1, scale));
            if (scale < 1) {
                menu.style.transformOrigin = 'center top';
                menu.style.transform = `translate(-50%, -50%) scale(${scale})`;
            } else {
                menu.style.transformOrigin = '';
                menu.style.transform = 'translate(-50%, -50%)';
            }
        } catch (_) {}
    },
 };
