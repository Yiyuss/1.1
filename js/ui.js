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
        // 新增：EXP 音效切換按鈕
        this.expSoundToggle = document.getElementById('exp-sound-toggle');
        this.expSoundToggleText = document.getElementById('exp-sound-toggle-text');

        // 統一綁定技能頁音量滑桿（不改文案與行為）
        try { this.bindVolumeSliders(this.skillsMenu); } catch (_) {}
        // 新增：綁定 EXP 音效切換
        try { this.bindExpSoundToggle(); } catch (_) {}

        // 初始化UI
        this.updateHealthBar(CONFIG.PLAYER.MAX_HEALTH, CONFIG.PLAYER.MAX_HEALTH);
        this.updateLevel(1);
        this.updateExpBar(0, CONFIG.EXPERIENCE.LEVEL_UP_BASE);
        this.updateEnergyBar(0, CONFIG.ENERGY.MAX);
        this.updateTimer(0);
        this.updateWaveInfo(1);

        // 初始化每場動作次數（未來由天賦擴充；不寫入存檔）
        this._actionCharges = { reroll: 1, replace: 1, hold: 1 };
        this._currentUpgradeOptions = [];
        this._heldOptionIndex = null;
        this._pendingOptionIndex = null;
        this._actionsBound = false;
        // 啟用：手機螢幕旋轉適應（僅行動裝置；不影響PC）
        try { this.initMobileViewportRotation(); } catch (_) {}
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
        try { if (AudioManager && AudioManager.setMuted) { AudioManager.setMuted(false); } else { AudioManager.isMuted = false; } } catch (_) {}
        // 先確保停止殘留的音樂，再切入選單場景
        try { if (AudioManager && AudioManager.stopAllMusic) { AudioManager.stopAllMusic(); } } catch (_) {}
        try {
            if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                AudioScene.enterMenu();
            } else if (AudioManager.playMusic) {
                AudioManager.playMusic('menu_music');
            }
        } catch (_) {}
        // 若因瀏覽器策略未能自動播放，提供一次點擊恢復
        try {
            const track = (AudioManager && AudioManager.music) ? AudioManager.music['menu_music'] : null;
            if (track && track.paused) {
                document.addEventListener('click', function _restoreMenuMusicOnce(){
                    try {
                        if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                            AudioScene.enterMenu();
                        } else if (AudioManager.playMusic) {
                            AudioManager.playMusic('menu_music');
                        }
                    } catch (_) {}
                    document.removeEventListener('click', _restoreMenuMusicOnce);
                }, { once: true });
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

    // 金幣顯示：ESC選單不再顯示金幣（右上角已有），此函數改為空操作
    ensureCoinsElement: function() { return; },
    updateCoins: function(total) { return; },
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
            const skillIcons = {
                SING: 'assets/images/A1.png',
                DAGGER: 'assets/images/A2.png',
                LASER: 'assets/images/A3.png',
                CHAIN_LIGHTNING: 'assets/images/A4.png',
                FIREBALL: 'assets/images/A5.png',
                LIGHTNING: 'assets/images/A6.png',
                ORBIT: 'assets/images/A7.png',
                ATTR_ATTACK: 'assets/images/A8.png',
                ATTR_CRIT: 'assets/images/A9.png'
            };
            const iconSrc = skillIcons[info.type] || 'assets/images/A1.png';
            div.innerHTML = `<div class="skill-icon"><img src="${iconSrc}" alt="${name}"></div><div class="skill-name">${name}</div><div class="skill-level">Lv.${info.level}</div>`;
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
                // 一律置於技能選單的最後，確保順序為：音量 -> 技能 -> 天賦
                this.skillsMenu.appendChild(talentsSection);
            }
        }
        
        // 清空現有天賦列表
        this.talentsList.innerHTML = '';
        
        try {
            // 以階梯系統為主：只顯示每個天賦的最高階描述
            // 新增 pickup_range_boost、damage_boost 兩項：維持同樣渲染流程
            const ids = ['hp_boost','defense_boost','speed_boost','pickup_range_boost','damage_boost','damage_specialization','crit_enhance','regen_speed_boost'];
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
     * 不變式：格式與文字不可更動；目前選項數量為 4；必須處理 ultimate 狀態備份邏輯不變。
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

        // 新增：屬性升級選項（每局生效，不寫入localStorage）
        try {
            const atkLv = Math.max(0, Math.min(10, player.attackUpgradeLevel || 0));
            if (atkLv < 10) {
                options.push({
                    type: 'ATTR_ATTACK',
                    name: '攻擊力強化',
                    level: atkLv + 1,
                    description: '每級+5%傷害'
                });
            }
            const crtLv = Math.max(0, Math.min(10, player.critUpgradeLevel || 0));
            if (crtLv < 10) {
                options.push({
                    type: 'ATTR_CRIT',
                    name: '爆擊率強化',
                    level: crtLv + 1,
                    description: '每級+2%爆擊率'
                });
            }
        } catch (_) {}

        // 每次升級隨機挑選4個（不足4則返回全部）
        const shuffled = Utils.shuffleArray(options);
        return shuffled.slice(0, 4);
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

        // 屬性升級：直接作用於玩家（不受大招備份影響）
        if (weaponType === 'ATTR_ATTACK') {
            if (player.attackUpgradeLevel < 10) player.attackUpgradeLevel += 1;
            if (typeof BuffSystem !== 'undefined' && BuffSystem.applyAttributeUpgrades) {
                BuffSystem.applyAttributeUpgrades(player);
            }
            // 更新技能列表與音效/關閉選單
            try { this.updateSkillsList(); } catch (_) {}
            this._playClick();
            this.hideLevelUpMenu();
            return;
        }
        if (weaponType === 'ATTR_CRIT') {
            if (player.critUpgradeLevel < 10) player.critUpgradeLevel += 1;
            if (typeof BuffSystem !== 'undefined' && BuffSystem.applyAttributeUpgrades) {
                BuffSystem.applyAttributeUpgrades(player);
            }
            try { this.updateSkillsList(); } catch (_) {}
            this._playClick();
            this.hideLevelUpMenu();
            return;
        }

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
        try { if (AudioManager.stopAllMusic) AudioManager.stopAllMusic(); } catch (e) {}
        Game.pause(true);
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
        
        // 更新失敗結算視窗
        this.updateGameOverSummary();
    
        const el = this._get('game-over-video');
        if (!el) return;
        try { el.pause(); } catch (_) {}
        el.muted = false;
        el.loop = false;
        el.currentTime = 0;
        
        // 確保影片顯示
        el.style.display = 'block';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
    
        const onEnded = () => this._returnToStartFrom('game-over-screen');
        el.addEventListener('ended', onEnded, { once: true });
    
        // 確保影片播放
        setTimeout(() => {
            try { 
                const playPromise = el.play(); 
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.error("播放失敗影片時出錯:", error);
                        // 如果自動播放失敗，嘗試添加用戶交互後再播放
                        document.addEventListener('click', function playOnClick() {
                            el.play();
                            document.removeEventListener('click', playOnClick);
                        }, { once: true });
                    });
                }
            } catch (err) {
                console.error("播放失敗影片時出錯:", err);
            }
        }, 100);
    },
    
    // 更新失敗結算視窗
    updateGameOverSummary: function() {
        try {
            // 遊戲時間（秒）
            const gameTimeInSeconds = Math.floor(Game.gameTime / 1000) || 0;
            document.getElementById('game-over-time').textContent = gameTimeInSeconds;
            
            // 玩家等級
            const playerLevel = Game.player ? Game.player.level : 1;
            document.getElementById('game-over-level').textContent = playerLevel;
            
            // 獲得金幣（當場遊戲）
            const coinsCollected = Game.coinsCollected || 0;
            document.getElementById('game-over-coins').textContent = coinsCollected;
            
            // 最終波數（替代經驗）
            let currentWave = WaveSystem.currentWave || 0;
            console.log("WaveSystem.currentWave:", WaveSystem.currentWave);
            document.getElementById('game-over-exp').textContent = currentWave + "/30";
            
            console.log("遊戲結算數據:", {
                gameTimeInSeconds,
                playerLevel,
                enemiesKilled,
                coinsCollected,
                currentWave
            });
        } catch (err) {
            console.error("更新失敗結算視窗時出錯:", err);
        }
    },
    
    // 顯示勝利畫面
    /**
     * 顯示勝利畫面（恢復：自動播放與自動返回起始介面）
     * 依賴：DOM id 'game-screen','victory-screen','victory-video','victory-overlay','victory-play'；AudioManager；Game。
     * 不變式：流程與顯示文字不可更動；僅抽出重複邏輯至私有方法。
     * 新增：結算視窗顯示遊戲數據
     */
    showVictoryScreen: function() {
        try { if (AudioManager.stopMusic) AudioManager.stopMusic(); } catch (e) {}
        Game.pause(true);
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('victory-screen').classList.remove('hidden');
    
        // 更新結算數據
        this.updateVictorySummary();
    
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
    
    /**
     * 更新勝利結算視窗的數據
     * 依賴：Game對象的統計數據；DOM id 'summary-time','summary-level','summary-kills','summary-coins','summary-exp'
     * 不變式：不影響引繼碼系統；僅顯示數據，不修改任何存檔內容
     */
    updateVictorySummary: function() {
        try {
            // 獲取遊戲數據
            // 遊戲時間（秒）
            const gameTimeInSeconds = Math.floor(Game.gameTime / 1000) || 0;
            const playerLevel = Game.player ? Game.player.level : 1;
            
            const coins = Game.coinsCollected || 0;
            
            // 最終波數（替代經驗）
            let currentWave = WaveSystem.currentWave || 0;
            console.log("WaveSystem.currentWave (Victory):", WaveSystem.currentWave);
            
            // 更新DOM
            document.getElementById('summary-time').textContent = gameTimeInSeconds;
            document.getElementById('summary-level').textContent = playerLevel;
            document.getElementById('summary-coins').textContent = coins;
            document.getElementById('summary-exp').textContent = currentWave + "/30";
            
            console.log("勝利結算數據:", {
                gameTimeInSeconds,
                playerLevel,
                kills,
                coins,
                currentWave
            });
        } catch (err) {
            console.error("更新勝利結算視窗時出錯:", err);
        }
    },

    /**
     * 確保升級選單佈局（左右分欄）與背景容器存在
     * 依賴：this.levelUpMenu, this.upgradeOptions
     * 不變式：不更動任何既有文字節點（如 LEVEL UP! 標題與選項內容），僅調整 DOM 包裝層級
     * SaveCode：不涉及 localStorage，嚴禁在此寫入存檔
     */
    ensureLevelUpLayout: function() {
        const menu = this.levelUpMenu || document.getElementById('level-up-menu');
        const options = this.upgradeOptions || document.getElementById('upgrade-options');
        if (!menu || !options) return;
        // 背景容器（置於最底層，僅視覺）
        let bg = menu.querySelector('.lum-bg');
        if (!bg) {
            bg = document.createElement('div');
            bg.className = 'lum-bg';
            bg.setAttribute('aria-hidden', 'true');
            menu.insertBefore(bg, menu.firstChild);
        }
        // 兩欄容器（左側屬性、右側選項）
        let columns = menu.querySelector('.lum-columns');
        if (!columns) {
            columns = document.createElement('div');
            columns.className = 'lum-columns';
            // 左欄：屬性
            const sidebar = document.createElement('div');
            sidebar.className = 'lum-sidebar';
            // 右欄：包住原 #upgrade-options
            const optWrap = document.createElement('div');
            optWrap.className = 'lum-options';
            // 將既有選項容器移入右欄（不改其內容）
            optWrap.appendChild(options);
            // 插入兩欄
            columns.appendChild(sidebar);
            columns.appendChild(optWrap);
            // 置於標題之後（保留原標題）
            const header = menu.querySelector('h2');
            if (header && header.nextSibling) {
                menu.insertBefore(columns, header.nextSibling);
            } else {
                menu.appendChild(columns);
            }
        }
        // 暫存參考以供更新
        this._lumSidebar = menu.querySelector('.lum-sidebar');
        this._lumBg = menu.querySelector('.lum-bg');
        this._lumOptionsWrap = menu.querySelector('.lum-options');
        // 建立底部動作列（與選項同欄，僅建立一次）
        if (this._lumOptionsWrap) {
            let actions = this._lumOptionsWrap.querySelector('.lum-actions');
            if (!actions) {
                actions = document.createElement('div');
                actions.className = 'lum-actions';
                actions.innerHTML = `
                    <button class="action-btn action-btn--reroll" type="button">重抽 (1)</button>
                    <button class="action-btn action-btn--replace" type="button">換一個 (1)</button>
                    <button class="action-btn action-btn--hold" type="button">保留 (1)</button>
                `;
                this._lumOptionsWrap.appendChild(actions);
            }
            this._lumActionsWrap = actions;
            this._btnReroll = actions.querySelector('.action-btn--reroll');
            this._btnReplace = actions.querySelector('.action-btn--replace');
            this._btnHold = actions.querySelector('.action-btn--hold');
            if (!this._actionsBound) { try { this._bindLevelUpActionEvents(); } catch (_) {} }
        }
    },

    /**
     * 綁定升級視窗背景圖到當前角色（預設 player -> player1-2.png）
     * 依賴：Game.selectedCharacter.avatarImageKey；若缺失則回退到 'player'
     * 不變式：不更動任何文字顯示；僅設定背景圖片樣式
     */
    setLevelUpBackgroundForCharacter: function() {
        const bgEl = this._lumBg || (this.levelUpMenu ? this.levelUpMenu.querySelector('.lum-bg') : null);
        if (!bgEl) return;
        const ch = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
        const key = (ch && ch.avatarImageKey) ? ch.avatarImageKey : 'player';
        const map = {
            // 現有唯一角色：使用指定底圖
            player: 'assets/images/player1-2.png'
        };
        const url = map[key] || map['player'];
        bgEl.style.backgroundImage = `url('${url}')`;
    },

    /**
     * 更新左側屬性欄（HP/DEF/ATK/SPD/CRT/Pickup/Haste）
     * 依賴：Game.player 與 BuffSystem 設定之屬性
     * 不變式：只渲染左欄，不更動升級選項文案與行為
     */
    updateLevelUpSidebar: function() {
        const sidebar = this._lumSidebar || (this.levelUpMenu ? this.levelUpMenu.querySelector('.lum-sidebar') : null);
        const player = (typeof Game !== 'undefined') ? Game.player : null;
        if (!sidebar || !player) return;
        // 計算屬性值（百分比以整數顯示）
        const hpText = `${player.health} / ${player.maxHealth}`;
        const atkPct = Math.round(((player.damageTalentBaseBonusPct || 0) + (player.damageAttributeBonusPct || 0)) * 100);
        const spdBase = (CONFIG && CONFIG.PLAYER && CONFIG.PLAYER.SPEED) ? CONFIG.PLAYER.SPEED : (player.speed || 1);
        const spdPct = Math.round(((player.speed / spdBase) - 1) * 100);
        const crtPct = Math.round(((player.critChanceBonusPct || 0) * 100));
        const pickupPct = Math.round(((player.pickupRangeMultiplier || 1) - 1) * 100);
        const hastePct = Math.round(((player.healthRegenSpeedMultiplier || 1) - 1) * 100);
        const defFlat = Math.max(0, ((player.baseDefense || 0) + (player.damageReductionFlat || 0)));
        // 渲染（純文字，不改語系/文案來源）
        sidebar.innerHTML = '';
        const rows = [
            { label: 'HP', value: hpText },
            { label: 'DEF', value: `+${defFlat}` },
            { label: 'ATK', value: `+${Math.max(0, atkPct)}%` },
            { label: 'SPD', value: `+${Math.max(0, spdPct)}%` },
            { label: 'CRT', value: `+${Math.max(0, crtPct)}%` },
            { label: 'Pickup', value: `+${Math.max(0, pickupPct)}%` },
            { label: 'Haste', value: `+${Math.max(0, hastePct)}%` }
        ];
        rows.forEach(r => {
            const row = document.createElement('div');
            row.className = 'stat-row';
            const l = document.createElement('span');
            l.className = 'stat-label';
            l.textContent = r.label;
            const v = document.createElement('span');
            v.className = 'stat-value';
            v.textContent = r.value;
            row.appendChild(l);
            row.appendChild(v);
            sidebar.appendChild(row);
        });
    },

    // 顯示升級選單
    /*
     * 維護備註（升級選單）
     * - 僅改視覺與 DOM 結構（卡片：左圖示、右文字）。
     * - 不更動文字內容、順序、數值與點擊行為；事件仍呼叫 selectUpgrade。
     * - SaveCode 相容性：本畫面不寫入 localStorage，不可於此地新增/改動任何存檔鍵名、資料結構或簽章。
     * - 新增武器類型或屬性時：請在本函式內的 iconMap 中補上圖示映射；未映射會使用預設 A1。
     * - 資料來源：getUpgradeOptions() 決定可選項目；請勿在此地做額外的規則判斷，以避免重複邏輯。
     * - UI 微調：僅調整 css/style.css 內 #level-up-menu 命名空間樣式；避免影響其他畫面（天賦/選角/選地圖等）。
     */
    showLevelUpMenu: function() {
        // 暫停遊戲，但不靜音，避免升級音效與BGM被切斷
        if (typeof Game !== 'undefined' && Game.pause) {
            Game.pause(false);
        }
        // 新增：確保佈局與背景綁定，再更新左側屬性欄
        try { this.ensureLevelUpLayout(); } catch (_) {}
        try { this.setLevelUpBackgroundForCharacter(); } catch (_) {}
        try { this.updateLevelUpSidebar(); } catch (_) {}
        // 清空升級選項
        if (this.upgradeOptions) this.upgradeOptions.innerHTML = '';
        // 獲取可用的升級選項
        const options = this.getUpgradeOptions();
        // 若無任何選項（所有技能已滿級且無新武器），直接略過並恢復遊戲
        if (!options || options.length === 0) {
            this.hideLevelUpMenu();
            return;
        }
        // 添加升級選項（抽出渲染以避免重複程式碼；不更動文案與行為）
        this._currentUpgradeOptions = options;
        this._renderUpgradeOptions(options);
        // 顯示選單（使用 .hidden 切換，與既有邏輯一致）
        if (this.levelUpMenu) this.levelUpMenu.classList.remove('hidden');
        
        // 空白鍵/Enter 確認；上下方向鍵導航高亮
        this._levelUpKeyHandler = (e) => {
            try {
                const children = this.upgradeOptions ? Array.from(this.upgradeOptions.children) : [];
                const count = children.length;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    let next = (this._pendingOptionIndex == null) ? 0 : Math.min(this._pendingOptionIndex + 1, count - 1);
                    const card = children[next];
                    if (card) {
                        const type = this._currentUpgradeOptions[next] && this._currentUpgradeOptions[next].type;
                        this._highlightPending(card, type);
                        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                            AudioManager.playSound('button_click2');
                        }
                    }
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    let next = (this._pendingOptionIndex == null) ? (count - 1) : Math.max(this._pendingOptionIndex - 1, 0);
                    const card = children[next];
                    if (card) {
                        const type = this._currentUpgradeOptions[next] && this._currentUpgradeOptions[next].type;
                        this._highlightPending(card, type);
                        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                            AudioManager.playSound('button_click2');
                        }
                    }
                    return;
                }
                if (e.code === 'Space' || e.key === ' ') {
                    e.preventDefault();
                    if (this._pendingOptionType) {
                        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                            AudioManager.playSound('button_click');
                        }
                        this.selectUpgrade(this._pendingOptionType);
                    }
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this._pendingOptionType) {
                        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                            AudioManager.playSound('button_click');
                        }
                        this.selectUpgrade(this._pendingOptionType);
                    }
                    return;
                }
            } catch (_) {}
        };
        document.addEventListener('keydown', this._levelUpKeyHandler);
        
        // 手機自適應：僅在手機套用 sizing，不改 PC
        this._applyMobileLevelUpSizing();
    },
    // 隱藏升級選單
    hideLevelUpMenu: function() {
        // 清理選擇暫存與鍵盤事件
        try {
            if (this._levelUpKeyHandler) {
                document.removeEventListener('keydown', this._levelUpKeyHandler);
                this._levelUpKeyHandler = null;
            }
            if (this._pendingOptionEl) {
                this._pendingOptionEl.classList.remove('uop-pending');
            }
            this._pendingOptionEl = null;
            this._pendingOptionType = null;
            this._pendingOptionIndex = null;
            this._heldOptionIndex = null;
        } catch (_) {}
        if (this.levelUpMenu) this.levelUpMenu.classList.add('hidden');
        // 恢復遊戲
        if (typeof Game !== 'undefined' && Game.resume) {
            Game.resume();
        }
    },

    // 私有：標記升級卡片待確認高亮
    _highlightPending: function(el, optionType) {
        try {
            if (this._pendingOptionEl) {
                this._pendingOptionEl.classList.remove('uop-pending');
            }
        } catch (_) {}
        try { if (el) { el.classList.add('uop-pending'); } } catch (_) {}
        this._pendingOptionEl = el || null;
        this._pendingOptionType = optionType || null;
        // 同步索引（渲染時掛在 data-index）
        try { this._pendingOptionIndex = el ? parseInt(el.dataset.index, 10) : null; } catch (_) {}
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
                menu.style.position = '';
                menu.style.top = '';
                menu.style.left = '';
                menu.style.right = '';
                menu.style.bottom = '';
                menu.style.width = '';
                menu.style.height = '';
                menu.style.maxWidth = '';
                menu.style.maxHeight = '';
                menu.style.overflowY = '';
                menu.style.overflowX = '';
                if (menu.style.transform) {
                    // 保留原本 CSS translate(-50%,-50%)，移除內聯 scale
                    menu.style.transform = 'translate(-50%, -50%)';
                }
                menu.style.transformOrigin = '';
                menu.classList.remove('lum-mobile-full');
                return;
            }

            // 手機：全螢幕覆蓋 + 垂直捲動（不縮放）
            menu.classList.add('lum-mobile-full');
            menu.style.position = 'fixed';
            menu.style.top = '0';
            menu.style.left = '0';
            menu.style.right = '0';
            menu.style.bottom = '0';
            menu.style.width = '100vw';
            menu.style.height = '100vh';
            menu.style.maxWidth = '';
            menu.style.maxHeight = '';
            menu.style.overflowY = 'auto';
            menu.style.overflowX = 'hidden';
            menu.style.transformOrigin = 'center';
            menu.style.transform = 'none';
        } catch (_) {}
    },


// 綁定底部動作列事件（僅一次）
_bindLevelUpActionEvents: function() {
  if (this._actionsBound) return;
  if (!this._btnReroll || !this._btnReplace || !this._btnHold) return;
  this._btnReroll.addEventListener('click', () => this._actionReroll());
  this._btnReplace.addEventListener('click', () => this._actionReplace());
  this._btnHold.addEventListener('click', () => this._actionHold());
  this._actionsBound = true;
},
// 依目前剩餘次數與待確認狀態更新按鈕
_renderLevelUpActions: function() {
  const ch = this._actionCharges || { reroll: 0, replace: 0, hold: 0 };
  if (this._btnReroll) {
    this._btnReroll.textContent = `重抽 (${ch.reroll})`;
    this._btnReroll.disabled = ch.reroll <= 0;
  }
  const hasPending = (this._pendingOptionIndex !== null && this._pendingOptionIndex !== undefined);
  if (this._btnReplace) {
    this._btnReplace.textContent = `換一個 (${ch.replace})`;
    this._btnReplace.disabled = (ch.replace <= 0 || !hasPending);
  }
  if (this._btnHold) {
    this._btnHold.textContent = `保留 (${ch.hold})`;
    this._btnHold.disabled = (ch.hold <= 0 || !hasPending || this._heldOptionIndex !== null);
  }
},
// 產生單一卡片（抽象渲染，避免重複碼）
_createOptionCard: function(option, index) {
  const optionElement = document.createElement('div');
  optionElement.className = 'upgrade-option';
  optionElement.dataset.index = index;
  const iconMap = {
    SING: 'assets/images/A1.png',
    DAGGER: 'assets/images/A2.png',
    LASER: 'assets/images/A3.png',
    CHAIN_LIGHTNING: 'assets/images/A4.png',
    FIREBALL: 'assets/images/A5.png',
    LIGHTNING: 'assets/images/A6.png',
    ORBIT: 'assets/images/A7.png',
    ATTR_ATTACK: 'assets/images/A8.png',
    ATTR_CRIT: 'assets/images/A9.png'
  };
  const iconSrc = iconMap[option.type] || 'assets/images/A1.png';
  const iconWrap = document.createElement('div');
  iconWrap.className = 'uop-icon';
  const img = document.createElement('img');
  img.src = iconSrc;
  img.alt = option.name;
  iconWrap.appendChild(img);
  const textWrap = document.createElement('div');
  textWrap.className = 'uop-text';
  const nameElement = document.createElement('h3');
  nameElement.textContent = `${option.name} Lv.${option.level}`;
  const descElement = document.createElement('p');
  descElement.textContent = option.description;
  textWrap.appendChild(nameElement);
  textWrap.appendChild(descElement);
  optionElement.appendChild(iconWrap);
  optionElement.appendChild(textWrap);
  const category = (option.type === 'ATTR_ATTACK' || option.type === 'ATTR_CRIT')
    ? 'StatUp'
    : (option.type === 'SING' ? 'Skill' : 'Weapon');
  const tagEl = document.createElement('div');
  tagEl.className = 'uop-tag';
  tagEl.textContent = `>> ${category}`;
  optionElement.appendChild(tagEl);
  function _ensureAudioUnmutedForOverlay() {
    try {
      if (typeof AudioManager !== 'undefined' && AudioManager.setMuted) {
        AudioManager.setMuted(false);
      }
    } catch (_) {}
  }
  optionElement.addEventListener('click', (e) => {
    e.stopPropagation();
    _ensureAudioUnmutedForOverlay();
    this._pendingOptionType = option.type;
    this._highlightPending(optionElement, option.type);
    if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
      AudioManager.playSound('button_click2');
    }
    this._renderLevelUpActions();
  });
  optionElement.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    this.selectUpgrade(option.type);
  });
  if (this._heldOptionIndex === index) {
    optionElement.classList.add('uop-held');
  }
  return optionElement;
},
// 渲染整組選項（供首次顯示與重抽/換一個使用）
_renderUpgradeOptions: function(options) {
  if (!this.upgradeOptions) return;
  this.upgradeOptions.innerHTML = '';
  options.forEach((opt, i) => {
    const el = this._createOptionCard(opt, i);
    this.upgradeOptions.appendChild(el);
  });
  this._renderLevelUpActions();
},
// 動作：重抽（保留已保留的卡，其他重抽）
_actionReroll: function() {
  if (!this._actionCharges || this._actionCharges.reroll <= 0) return;
  const fresh = this.getUpgradeOptions();
  // 保留 held
  if (this._heldOptionIndex !== null && this._currentUpgradeOptions[this._heldOptionIndex]) {
    const held = this._currentUpgradeOptions[this._heldOptionIndex];
    const next = fresh.slice(0, 4);
    next[this._heldOptionIndex] = held;
    this._currentUpgradeOptions = next;
  } else {
    this._currentUpgradeOptions = fresh.slice(0, 4);
  }
  this._pendingOptionEl = null; this._pendingOptionType = null; this._pendingOptionIndex = null;
  this._actionCharges.reroll -= 1;
  this._renderUpgradeOptions(this._currentUpgradeOptions);
},
// 動作：換一個（需要先選定待確認的卡）
_actionReplace: function() {
  if (!this._actionCharges || this._actionCharges.replace <= 0) return;
  const idx = this._pendingOptionIndex;
  if (idx === null || idx === undefined) return;
  const currentTypes = (this._currentUpgradeOptions || []).map(o => o.type);
  const pool = this.getUpgradeOptions();
  let candidate = pool.find(o => o.type !== this._currentUpgradeOptions[idx].type && !currentTypes.includes(o.type));
  if (!candidate) candidate = pool.find(o => o.type !== this._currentUpgradeOptions[idx].type) || this._currentUpgradeOptions[idx];
  this._currentUpgradeOptions[idx] = candidate;
  this._actionCharges.replace -= 1;
  this._pendingOptionEl = null; this._pendingOptionType = null; this._pendingOptionIndex = null;
  this._renderUpgradeOptions(this._currentUpgradeOptions);
},
// 動作：保留（鎖住目前卡，重抽時不被替換）
_actionHold: function() {
  if (!this._actionCharges || this._actionCharges.hold <= 0) return;
  const idx = this._pendingOptionIndex;
  if (idx === null || idx === undefined) return;
  this._heldOptionIndex = idx;
  this._actionCharges.hold -= 1;
  // 標記視覺
  try { const card = this.upgradeOptions.children[idx]; if (card) card.classList.add('uop-held'); } catch (_) {}
  this._renderLevelUpActions();
},
    bindExpSoundToggle: function() {
        const btn = this.expSoundToggle;
        const label = this.expSoundToggleText;
        if (!btn || !label) return;
        const refresh = () => {
            const enabled = (typeof AudioManager !== 'undefined') ? (AudioManager.expSoundEnabled !== false) : true;
            label.textContent = enabled ? 'EXP音效：開' : 'EXP音效：關';
        };
        refresh();
        btn.addEventListener('click', () => {
            try {
                if (typeof AudioManager !== 'undefined') {
                    // 修正：真正反轉開關狀態
                    AudioManager.expSoundEnabled = !AudioManager.expSoundEnabled;
                }
                if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                    AudioManager.playSound('button_click2');
                }
            } catch (_) {}
            refresh();
        });
    },

    /**
     * 初始化：手機螢幕旋轉適應（僅行動裝置）
     * 依賴：#viewport、CONFIG.CANVAS_WIDTH/HEIGHT、window.matchMedia、window.addEventListener
     * 不變式：不改動任何既有文字/流程；PC不受影響。
     * 維護提示：此功能只調整 #viewport 的定位與變形；不動 SaveCode。
     */
    initMobileViewportRotation: function() {
        try {
            const isMobile = (window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 768px)').matches))
                || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            if (!isMobile) return;
            if (this._mobileRotationBound) return;
            this._mobileRotationHandler = this.applyMobileViewportRotation.bind(this);
            window.addEventListener('resize', this._mobileRotationHandler);
            window.addEventListener('orientationchange', this._mobileRotationHandler);
            this._mobileRotationBound = true;
            this.applyMobileViewportRotation();
        } catch(_) {}
    },

    /**
     * 執行：手機直立時旋轉 90 度並縮放；橫向時僅縮放
     * 依賴：#viewport、CONFIG.CANVAS_WIDTH/HEIGHT、document.documentElement.style --ui-scale
     * 不變式：不更改任何文案與UI排列；PC不觸發。
     */
    applyMobileViewportRotation: function() {
        try {
            const viewport = document.getElementById('viewport');
            if (!viewport) return;
            const w = window.innerWidth || document.documentElement.clientWidth;
            const h = window.innerHeight || document.documentElement.clientHeight;
            const baseW = (typeof CONFIG !== 'undefined' && CONFIG.CANVAS_WIDTH) ? CONFIG.CANVAS_WIDTH : 1280;
            const baseH = (typeof CONFIG !== 'undefined' && CONFIG.CANVAS_HEIGHT) ? CONFIG.CANVAS_HEIGHT : 720;
            const isPortrait = window.matchMedia ? window.matchMedia('(orientation: portrait)').matches : (h >= w);

            if (isPortrait) {
                // 直立：旋轉90度並居中。以旋轉後寬高（baseH, baseW）計算縮放
                const scale = Math.max(0.1, Math.min(w / baseH, h / baseW));
                viewport.style.position = 'fixed';
                viewport.style.top = '50%';
                viewport.style.left = '50%';
                viewport.style.transformOrigin = 'center center';
                viewport.style.transform = `translate(-50%, -50%) rotate(90deg) scale(${scale})`;
                // 使用基準尺寸，避免 main.js 的寬高縮放與旋轉互相抵觸
                viewport.style.width = baseW + 'px';
                viewport.style.height = baseH + 'px';
                // 標記：手機直立旋轉中，避免 main.js 再次縮放
                document.documentElement.classList.add('mobile-rotation-active');
                document.documentElement.style.setProperty('--ui-scale', String(scale));
            } else {
                // 橫向：移除旋轉，交由既有等比縮放邏輯處理
                viewport.style.position = '';
                viewport.style.top = '';
                viewport.style.left = '';
                viewport.style.transformOrigin = '';
                viewport.style.transform = '';
                viewport.style.width = '';
                viewport.style.height = '';
                // 取消標記：不在直立旋轉狀態
                document.documentElement.classList.remove('mobile-rotation-active');
                const scale = Math.max(0.1, Math.min(w / baseW, h / baseH));
                document.documentElement.style.setProperty('--ui-scale', String(scale));
            }
        } catch(_) {}
    }
};
