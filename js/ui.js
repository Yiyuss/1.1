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
        // 新增：EXP 音效切換按鈕
        this.expSoundToggle = document.getElementById('exp-sound-toggle');
        this.expSoundToggleText = document.getElementById('exp-sound-toggle-text');
        // 新增：死亡音效切換按鈕
        this.deathSoundToggle = document.getElementById('death-sound-toggle');
        this.deathSoundToggleText = document.getElementById('death-sound-toggle-text');

        // 統一綁定技能頁音量滑桿（不改文案與行為）
        try { this.bindVolumeSliders(this.skillsMenu); } catch (_) {}
        // 新增：綁定 EXP 音效切換
        try { this.bindExpSoundToggle(); } catch (_) {}
        // 新增：綁定 死亡音效切換
        try { this.bindDeathSoundToggle(); } catch (_) {}

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
        if (typeof this._actionsBound !== 'boolean') {
            this._actionsBound = false;
        }
        // ✅ 组队模式：升级队列（用于处理连续升级时不覆盖前一个升级菜单）
        this._pendingLevelUps = [];
        // 依天賦等級擴充升級選單的操作次數（不改文字與版面）
        try { this.applyLevelUpActionChargesFromTalents(); } catch (_) {}
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
        const achModal = this._get('achievements-modal');
        const levelOpen = !!(levelMenu && !levelMenu.classList.contains('hidden'));
        const skillsOpen = !!(skillsMenu && !skillsMenu.classList.contains('hidden'));
        const achOpen = !!(achModal && !achModal.classList.contains('hidden'));
        return levelOpen || skillsOpen || achOpen;
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
        
        // 起始頁音量設置已移除，改為序號輸入系統
        // 音量控制現在由 AudioManager 直接管理，不再需要開始界面的音量設置選項
        // 以下代碼保留作為備註，但不再執行（因為對應的 DOM 元素已移除）
        /*
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
        */
    },
    /**
     * 私有：從結束/勝利畫面返回起始畫面
     * 依賴：既定 DOM id；AudioManager、Game。
     * 不變式：DOM 隱藏/顯示順序與狀態更新不可更動。
     */
    _returnToStartFrom: function(screenId) {
        // ⚠️ 修复：先停止并重置视频，防止视频继续播放
        try {
            if (screenId === 'game-over-screen') {
                const videoEl = this._get('game-over-video');
                if (videoEl) {
                    videoEl.pause();
                    videoEl.currentTime = 0;
                    videoEl.loop = false;
                    // 移除所有事件监听器
                    if (videoEl._gameOverOnEnded) {
                        videoEl.removeEventListener('ended', videoEl._gameOverOnEnded);
                        videoEl._gameOverOnEnded = null;
                    }
                }
            } else if (screenId === 'victory-screen') {
                const videoEl = this._get('victory-video');
                if (videoEl) {
                    videoEl.pause();
                    videoEl.currentTime = 0;
                    videoEl.loop = false;
                }
            }
        } catch (e) {
            console.warn("[UI] _returnToStartFrom: 清理视频失败:", e);
        }
        
        const screen = this._get(screenId);
        if (screen) screen.classList.add('hidden');
        
        // ✅ 組隊模式：正常結束時回到房間大廳，不返回開始畫面
        try {
            let isSurvivalMode = false;
            try {
                const activeId = Utils.getActiveModeId();
                isSurvivalMode = (activeId === 'survival' || activeId === null);
            } catch (_) {}
            
            if (isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                // ✅ 最终方案：组队模式下，游戏结束后直接刷新页面（与F5相同效果）
                // 放弃一切清理方案，直接刷新页面，完全清空所有状态
                // 与单机模式一致：页面刷新会清空所有状态，不会有任何残留
                // 只有重新建立组队大厅时，才是新的一轮
                console.log('[UI] _returnToStartFrom: 组队模式，游戏结束后刷新页面（与F5相同效果）');
                try {
                    // 延迟一小段时间，确保视频播放完成
                    setTimeout(() => {
                        if (typeof window !== 'undefined' && window.location) {
                            window.location.reload();
                        }
                    }, 100);
                    return; // 直接返回，不执行后续清理逻辑
                } catch (e) {
                    console.error('[UI] _returnToStartFrom: 刷新页面失败:', e);
                    // 如果刷新失败，fallback 到原来的逻辑
                }
            }
            
            // ✅ 單機模式：正常清理邏輯（含純單機與「有房但未啟用」）
            // ⚠️ 修復：純單機勝利返回選單時也要執行延遲 Game.reset()，避免 _victoryEventSent/exit 等殘留污染後續進入多人模式
            if (isSurvivalMode && typeof Game !== 'undefined' && (!Game.multiplayer || !Game.multiplayer.enabled)) {
                // ⚠️ 单机模式：正常清理逻辑
                try {
                    // ⚠️ 修复：先清理玩家和武器，确保游戏循环不会继续运行
                    // 完全清理玩家和武器，防止武器继续发射
                    // ⚠️ 注意：这里只清理玩家和武器，不调用 Game.reset()，因为 reset() 会重新创建玩家
                    // 清理逻辑应该在视频播放完成后才执行，确保视频能正常播放完成
                    if (typeof Game !== 'undefined' && Game.player) {
                        try {
                            // 清理玩家武器
                            if (Game.player.weapons && Array.isArray(Game.player.weapons)) {
                                for (const weapon of Game.player.weapons) {
                                    if (weapon && typeof weapon.destroy === 'function') {
                                        try { weapon.destroy(); } catch (_) { }
                                    }
                                }
                                Game.player.weapons = [];
                            }
                            // 清理玩家
                            if (typeof Game.player.destroy === 'function') {
                                try { Game.player.destroy(); } catch (_) { }
                            }
                            Game.player = null;
                        } catch (e) {
                            console.warn('[UI] _returnToStartFrom: 清理玩家失败:', e);
                        }
                    }
                    
                    // ⚠️ 修复：确保游戏循环不会重新开始
                    // 游戏结束后应该保持暂停状态，直到开始新游戏
                    Game.isPaused = true;
                    Game.isGameOver = true;
                    
                    // ⚠️ 修复：延迟调用 Game.reset()，确保视频播放完成后再清理
                    // 这样可以避免 reset() 影响视频播放
                    // 完全重置游戏状态会在视频播放完成后执行（通过延迟调用）
                    // ⚠️ 关键修复：保存清理定时器，以便在新游戏开始时取消
                    let cleanupTimer = setTimeout(() => {
                        try {
                            // ✅ 已移除状态机检查（采用页面刷新方案，组队模式下不会执行到这里）
                            
                            if (typeof Game !== 'undefined' && typeof Game.reset === 'function') {
                                // ⚠️ 修复：在 reset 之前，先清理多人模式相关状态
                                // 确保完全清理，避免残留状态影响下一局
                                try {
                                    // 清理遠程玩家
                                    if (typeof RemotePlayerManager !== "undefined" && typeof RemotePlayerManager.clear === "function") {
                                        RemotePlayerManager.clear();
                                    }
                                    // 清理 Game.remotePlayers
                                    if (Array.isArray(Game.remotePlayers)) {
                                        Game.remotePlayers.length = 0;
                                    }
                                    // 停用 Runtime（停止狀態同步）
                                    if (typeof Runtime !== "undefined" && typeof Runtime.setEnabled === "function") {
                                        Runtime.setEnabled(false);
                                    }
                                } catch (e) {
                                    console.warn('[UI] _returnToStartFrom: 清理多人模式状态失败:', e);
                                }
                                
                                // ✅ 已移除状态机（采用页面刷新方案，组队模式下不会执行到这里）
                                
                                // ⚠️ 修复：保存 _gameOverEventSent 的状态，防止 Game.reset() 重置后导致重复触发
                                // 因为服务器可能还在持续发送 state.isGameOver = true
                                const wasGameOver = Game._gameOverEventSent;
                                
                                Game.reset();
                                
                                // ⚠️ 修复：恢复 _gameOverEventSent 的状态，防止服务器持续发送 isGameOver 导致重复触发
                                // 只有在真正开始新游戏时（startGame 中）才重置 _gameOverEventSent
                                if (wasGameOver) {
                                    Game._gameOverEventSent = true;
                                }
                                
                                // ⚠️ 修复：确保游戏保持在大厅状态（暂停和结束状态）
                                // 因为 Game.reset() 会设置 isPaused = false 和 isGameOver = false
                                Game.isPaused = true;
                                Game.isGameOver = true;
                                
                                // ✅ 已移除状态机和地图ID清理（采用页面刷新方案，组队模式下不会执行到这里）
                                // ⚠️ 修复：不要在这里将 Game.player = null
                                // Game.reset() 会重新创建 Game.player，如果在这里设置为 null，
                                // 而 startGame 在 Game.reset() 执行之前执行，会导致 Game.player 为 null
                                // 让 Game.reset() 自己处理玩家清理和创建
                                // ⚠️ 修复：不要清理 _newGameStarted 标志
                                // _newGameStarted 应该在 startGame 中设置，在 handleServerGameState 中清理
                                // 如果在这里清理，可能会导致新游戏开始时无法正确识别
                            }
                        } catch (e) {
                            console.warn('[UI] _returnToStartFrom: 延迟清理游戏状态失败:', e);
                        }
                    }, 100); // 延迟100ms，确保视频播放完成
                    
                    // ⚠️ 关键修复：保存清理定时器到 Game 对象，以便在新游戏开始时取消
                    if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                        Game._returnToStartFromCleanupTimer = cleanupTimer;
                    }
                } catch (e) {
                    console.warn('[UI] _returnToStartFrom: 清理游戏状态失败:', e);
                }
                
                // 先顯示開始畫面（作為背景）
                const charSel = this._get('character-select-screen'); if (charSel) charSel.classList.add('hidden');
                const mapSel = this._get('map-select-screen'); if (mapSel) mapSel.classList.add('hidden');
                const start = this._get('start-screen'); if (start) start.classList.remove('hidden');
                
                // 然後顯示房間大廳覆蓋層（會蓋在開始畫面上方）
                if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                    if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.openLobbyScreen === 'function') {
                        window.SurvivalOnlineUI.openLobbyScreen();
                    }
                }
                
                // 確保結束目前模式並釋放其事件
                try {
                    if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.stop === 'function') {
                        window.GameModeManager.stop();
                    } else if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.stop === 'function') {
                        window.ModeManager.stop();
                    }
                } catch(_) {}
                Game.isGameOver = false;
                
                // ✅ 組隊模式：顯示成就彈窗（如果有的話）
                try {
                    if ((screenId === 'victory-screen' || screenId === 'game-over-screen') && typeof Achievements !== 'undefined') {
                        const ids = (typeof Achievements.consumeSessionUnlocked === 'function')
                            ? Achievements.consumeSessionUnlocked()
                            : (typeof Achievements.getSessionUnlocked === 'function' ? Achievements.getSessionUnlocked() : []);
                        if (ids && ids.length) {
                            this.showAchievementsUnlockModal(ids);
                            try {
                                const am = (typeof window !== 'undefined' && window.AudioManager) ? window.AudioManager : (typeof AudioManager !== 'undefined' ? AudioManager : null);
                                if (am && typeof am.playSound === 'function') {
                                    const wasMuted = am.isMuted;
                                    if (wasMuted) am.isMuted = false;
                                    am.playSound('achievements');
                                    if (wasMuted) am.isMuted = true;
                                    this._achievementSoundPlayedForModal = true;
                                }
                            } catch (_) {}
                        }
                    }
                } catch (_) {}
                
                return; // 組隊模式：已顯示開始畫面和房間大廳，直接返回
            }
        } catch (_) {}
        
        // 單機模式：正常返回開始畫面
        const charSel = this._get('character-select-screen'); if (charSel) charSel.classList.add('hidden');
        const mapSel = this._get('map-select-screen'); if (mapSel) mapSel.classList.add('hidden');
        const start = this._get('start-screen'); if (start) start.classList.remove('hidden');
        // 確保結束目前模式並釋放其事件（特別是生存模式在 visibility/focus 會自動恢復 BGM）
        try {
            if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.stop === 'function') {
                window.GameModeManager.stop();
            } else if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.stop === 'function') {
                window.ModeManager.stop();
            }
        } catch(_) {}
        Game.isGameOver = false;
        // 不呼叫 setMuted(false) 以避免其自動恢復生存 BGM（game_music）造成汙染。
        // 改為直接解除靜音旗標，後續以 stopAllMusic + enterMenu 顯式切入選單音樂。
        try { if (AudioManager) { AudioManager.isMuted = false; } } catch (_) {}
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

        // 回到開始介面後（勝利/失敗流程）顯示成就彈窗與音效，不改動既有流程
        try {
            if ((screenId === 'victory-screen' || screenId === 'game-over-screen') && typeof Achievements !== 'undefined') {
                const ids = (typeof Achievements.consumeSessionUnlocked === 'function')
                    ? Achievements.consumeSessionUnlocked()
                    : (typeof Achievements.getSessionUnlocked === 'function' ? Achievements.getSessionUnlocked() : []);
                if (ids && ids.length) {
                    this.showAchievementsUnlockModal(ids);
                    try {
                        const am = (typeof window !== 'undefined' && window.AudioManager) ? window.AudioManager : (typeof AudioManager !== 'undefined' ? AudioManager : null);
                        if (am && typeof am.playSound === 'function') {
                            const wasMuted = am.isMuted;
                            if (wasMuted) am.isMuted = false;
                            am.playSound('achievements');
                            if (wasMuted) am.isMuted = true;
                            this._achievementSoundPlayedForModal = true;
                        }
                    } catch (_) {}
                }
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
            const isDeathline = (info.type === 'DEATHLINE_WARRIOR' || info.type === 'DEATHLINE_SUPERMAN');
            div.className = isDeathline ? 'skill-item has-toggle' : 'skill-item';
            const skillIcons = (CONFIG && CONFIG.UI && CONFIG.UI.SKILL_ICONS) ? CONFIG.UI.SKILL_ICONS : {};
            const iconSrc = skillIcons[info.type] || 'assets/images/A1.png';
            div.innerHTML = `<div class="skill-icon"><img src="${iconSrc}" alt="${name}"></div><div class="skill-name">${name}</div><div class="skill-level">Lv.${info.level}</div>`;
            if (isDeathline) {
                if (!Game._deathlineToggle) Game._deathlineToggle = {};
                if (Game._deathlineToggle[info.type] === undefined) Game._deathlineToggle[info.type] = true;
                const isOn = Game._deathlineToggle[info.type];
                const toggle = document.createElement('div');
                toggle.className = 'skill-toggle' + (isOn ? ' active' : '');
                toggle.innerHTML = `<span class="skill-toggle-label">${isOn ? 'ON' : 'OFF'}</span><div class="skill-toggle-switch"></div>`;
                const wType = info.type;
                toggle.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (!Game._deathlineToggle) Game._deathlineToggle = {};
                    Game._deathlineToggle[wType] = !Game._deathlineToggle[wType];
                    const nowOn = Game._deathlineToggle[wType];
                    this.className = 'skill-toggle' + (nowOn ? ' active' : '');
                    this.querySelector('.skill-toggle-label').textContent = nowOn ? 'ON' : 'OFF';
                    if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                        try { AudioManager.playSound('click'); } catch (_) {}
                    }
                });
                div.appendChild(toggle);
            }
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
            const ids = ['hp_boost','defense_boost','speed_boost','pickup_range_boost','damage_boost','damage_specialization','crit_enhance','regen_speed_boost','experience_boost','levelup_action_charges','dodge_enhance','chicken_blessing_boost','sheep_guard_boost','heart_companion_boost','rotating_muffin_boost','pineapple_orbit_boost','stellar_orbit_boost','gabriel_orbit_boost','wedding_call_orbit_boost','gravity_wave_boost','ai_boost','awakening_hp','awakening_regen','awakening_attack','awakening_crit_damage','awakening_cooldown','awakening_energy','sing_advanced','young_dada_glory_advanced','devouring_power_advanced'];
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

    /**
     * 依天賦擴充升級操作次數（重抽/換一個/保留）。
     * 來源：TalentSystem.tieredTalents.levelup_action_charges 的等級效果。
     * 不變式：不改現有文案與版面；僅在本局計算次數。
     */
    applyLevelUpActionChargesFromTalents: function() {
        try {
            // 重算：先回復本局的基礎次數，再依天賦加成
            this._actionCharges = { reroll: 1, replace: 1, hold: 1 };
            const lv = (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel)
                ? (TalentSystem.getTalentLevel('levelup_action_charges') || 0)
                : 0;
            if (lv > 0 && TalentSystem && TalentSystem.tieredTalents && TalentSystem.tieredTalents.levelup_action_charges) {
                const cfg = TalentSystem.tieredTalents.levelup_action_charges;
                const idx = Math.min(lv, cfg.levels.length) - 1;
                const eff = cfg.levels[idx] || {};
                const addR = eff.reroll || 0;
                const addP = eff.replace || 0;
                const addH = eff.hold || 0;
                this._actionCharges.reroll = Math.max(0, 1 + addR);
                this._actionCharges.replace = Math.max(0, 1 + addP);
                this._actionCharges.hold = Math.max(0, 1 + addH);
            }
            // 若升級選單已開或元素存在，順手刷新按鈕文案與禁用狀態
            if (this._renderLevelUpActions) this._renderLevelUpActions();
        } catch (e) {
            console.warn('套用升級操作次數天賦失敗', e);
        }
    },
    
    // 獲取升級選項
    /**
     * 取得升級選項（含現有武器升級與新武器）
     * 依賴：Game.player、CONFIG.WEAPONS、Utils.shuffleArray。
     * 不變式：格式與文字不可更動；目前選項數量為 4；必須處理 ultimate 狀態備份邏輯不變。
     */
    getUpgradeOptions: function() {
        const player = Game.player;

        // 在大招期間，升級選項基於「大招前的武器狀態」生成，避免因LV10臨時武器導致無選項
        // 安全檢查：確保 _ultimateBackup 存在且是有效的陣列，且玩家確實在大招狀態
        const sourceWeaponsInfo = (player.isUltimateActive && player._ultimateBackup && Array.isArray(player._ultimateBackup.weapons))
            ? player._ultimateBackup.weapons // [{ type, level }]
            : (Array.isArray(player.weapons) ? player.weapons.map(w => ({ type: w.type, level: w.level })) : []);

        const ch = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
        const options = UpgradeRegistry.collectCandidates({
            sourceWeaponsInfo: sourceWeaponsInfo,
            character: ch,
            characters: (CONFIG.CHARACTERS && Array.isArray(CONFIG.CHARACTERS)) ? CONFIG.CHARACTERS : [],
            player: player,
            weaponsConfig: CONFIG.WEAPONS
        });

        // 每次升級隨機挑選4個（不足4則返回全部）
        const shuffled = Utils.shuffleArray(options);
        return shuffled.slice(0, 4);
    },

    /**
     * 標準融合：移除來源技、加入或升級結果技。不含投射物清理（那些仍走 selectUpgrade 專段）。
     */
    _applyStandardFusion: function(player, resultType, sourceTypes) {
        const sources = Array.isArray(sourceTypes) ? sourceTypes : [];
        if (player.isUltimateActive && player._ultimateBackup) {
            const list = Array.isArray(player._ultimateBackup.weapons) ? player._ultimateBackup.weapons : [];
            player._ultimateBackup.weapons = list.filter(info => sources.indexOf(info.type) === -1);
            const idx = player._ultimateBackup.weapons.findIndex(info => info.type === resultType);
            const cfgF = CONFIG.WEAPONS[resultType];
            if (idx >= 0) {
                const curLv = player._ultimateBackup.weapons[idx].level || 1;
                if (cfgF && curLv < cfgF.LEVELS.length) player._ultimateBackup.weapons[idx].level += 1;
            } else {
                player._ultimateBackup.weapons.push({ type: resultType, level: 1 });
            }
        } else {
            player.weapons = (player.weapons || []).filter(w => sources.indexOf(w.type) === -1);
            const existingF = player.weapons.find(w => w.type === resultType);
            if (existingF) {
                player.upgradeWeapon(resultType);
            } else {
                player.addWeapon(resultType);
            }
        }
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
            // 更新技能列表與音效
            try { this.updateSkillsList(); } catch (_) {}
            this._playClick();
            // ✅ 修复：属性升级后立即关闭菜单（与武器升级一致）
            this.hideLevelUpMenu();
            return;
        }
        if (weaponType === 'ATTR_CRIT') {
            if (player.critUpgradeLevel < 10) player.critUpgradeLevel += 1;
            if (typeof BuffSystem !== 'undefined' && BuffSystem.applyAttributeUpgrades) {
                BuffSystem.applyAttributeUpgrades(player);
            }
            // 組隊爆擊立刻送：否則伺服器最多半秒後才用新爆擊率
            try {
                if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.requestImmediatePlayerMeta === 'function') {
                    window.SurvivalOnlineRuntime.requestImmediatePlayerMeta();
                }
            } catch (_) {}
            try { this.updateSkillsList(); } catch (_) {}
            this._playClick();
            // ✅ 修复：属性升级后立即关闭菜单（与武器升级一致）
            this.hideLevelUpMenu();
            return;
        }
        if (weaponType === 'ATTR_ATTACK_POWER') {
            if (player.attackPowerUpgradeLevel < 10) player.attackPowerUpgradeLevel += 1;
            if (typeof BuffSystem !== 'undefined' && BuffSystem.applyAttributeUpgrades) {
                BuffSystem.applyAttributeUpgrades(player);
            }
            try { this.updateSkillsList(); } catch (_) {}
            this._playClick();
            // ✅ 修复：属性升级后立即关闭菜单（与武器升级一致）
            this.hideLevelUpMenu();
            return;
        }
        if (weaponType === 'ATTR_HEALTH') {
            if (player.healthUpgradeLevel == null) player.healthUpgradeLevel = 0;
            // 升級前記錄上限，用於計算補血量
            const prevMax = player.maxHealth || (CONFIG && CONFIG.PLAYER ? CONFIG.PLAYER.MAX_HEALTH : 200);
            if (player.healthUpgradeLevel < 10) player.healthUpgradeLevel += 1;
            if (typeof BuffSystem !== 'undefined' && BuffSystem.applyAttributeUpgrades) {
                BuffSystem.applyAttributeUpgrades(player);
            }
            // 按上限增加量補血（每級+20，但以差值計算更穩健）
            const deltaMax = Math.max(0, (player.maxHealth || prevMax) - prevMax);
            player.health = Math.min(player.maxHealth, (player.health || 0) + deltaMax);
            player._teamHealthUpgradeBonus = deltaMax;
            // 更新血量條
            try { UI.updateHealthBar(player.health, player.maxHealth); } catch (_) {}
            
            // ✅ 組隊模式：立即同步 maxHealth 到伺服器（影響復活時的血量，是多人元素）
            // 通過強制觸發 player-meta 更新來同步 maxHealth
            const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
            let isSurvivalMode = false;
            try {
                const activeId = Utils.getActiveModeId();
                isSurvivalMode = (activeId === 'survival' || activeId === null);
            } catch (_) { }
            
            if (isSurvivalMode && isMultiplayer && typeof window !== 'undefined' && window.SurvivalOnlineRuntime) {
                // ✅ 強制觸發 player-meta 更新（通過清除上次的簽名，讓 tick 函數立即發送）
                const rt = window.SurvivalOnlineRuntime;
                if (rt && rt.tick && typeof rt.tick === 'function') {
                    // 清除上次的簽名，強制下次 tick 時發送 player-meta
                    if (rt.tick._lastMetaSig) {
                        rt.tick._lastMetaSig = null;
                    }
                    if (rt.tick._lastMetaAt) {
                        rt.tick._lastMetaAt = 0; // 強制立即發送
                    }
                }
            }
            
            try { this.updateSkillsList(); } catch (_) {}
            this._playClick();
            // ✅ 修复：属性升级后立即关闭菜单（与武器升级一致）
            this.hideLevelUpMenu();
            return;
        }
        if (weaponType === 'ATTR_DEFENSE') {
            if (player.defenseUpgradeLevel == null) player.defenseUpgradeLevel = 0;
            if (player.defenseUpgradeLevel < 10) player.defenseUpgradeLevel += 1;
            if (typeof BuffSystem !== 'undefined' && BuffSystem.applyAttributeUpgrades) {
                BuffSystem.applyAttributeUpgrades(player);
            }
            // 組隊防禦立刻送：否則伺服器最多半秒後才用新防禦
            try {
                if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.requestImmediatePlayerMeta === 'function') {
                    window.SurvivalOnlineRuntime.requestImmediatePlayerMeta();
                }
            } catch (_) {}
            try { this.updateSkillsList(); } catch (_) {}
            this._playClick();
            // ✅ 修复：属性升级后立即关闭菜单（与武器升级一致）
            this.hideLevelUpMenu();
            return;
        }

        const standardFusion = (typeof UpgradeRegistry !== 'undefined' && UpgradeRegistry.getStandardSelect)
            ? UpgradeRegistry.getStandardSelect(weaponType)
            : null;
        if (standardFusion) {
            this._applyStandardFusion(player, standardFusion.result, standardFusion.sourceTypes);
            if (standardFusion.result === 'PINEAPPLE_SUPPLEMENT') {
                player._sessionKeptAdrenalineRegenLevel = 10;
                try {
                    if (typeof BuffSystem !== 'undefined' && BuffSystem.applyBuffsFromTalents) {
                        BuffSystem.applyBuffsFromTalents(player);
                    }
                } catch (_) {}
            }
            try { this.updateSkillsList(); } catch (_) {}
            this._playClick();
            this.hideLevelUpMenu();
            return;
        }

        // 融合：引力波（移除 守護領域(AURA_FIELD)/無敵(INVINCIBLE)，加入或升級 GRAVITY_WAVE）
        if (weaponType === 'GRAVITY_WAVE') {
            // 先清理守護領域的實體（避免重疊，無論是否在大招模式）
            try {
                if (typeof Game !== 'undefined' && Array.isArray(Game.projectiles)) {
                    for (const p of Game.projectiles) {
                        if (p && p.weaponType === 'AURA_FIELD' && p.player === player && !p.markedForDeletion) {
                            if (typeof p.destroy === 'function') p.destroy(); else p.markedForDeletion = true;
                        }
                    }
                }
                // 清理武器實例中的 _auraEntity 引用（正常模式）
                if (!player.isUltimateActive) {
                    const auraWeapon = player.weapons.find(w => w.type === 'AURA_FIELD');
                    if (auraWeapon && auraWeapon._auraEntity) {
                        try {
                            if (typeof auraWeapon._auraEntity.destroy === 'function') {
                                auraWeapon._auraEntity.destroy();
                            } else {
                                auraWeapon._auraEntity.markedForDeletion = true;
                            }
                        } catch(_) {}
                        auraWeapon._auraEntity = null;
                    }
                }
            } catch(_) {}
            
            if (player.isUltimateActive && player._ultimateBackup) {
                const list = Array.isArray(player._ultimateBackup.weapons) ? player._ultimateBackup.weapons : [];
                // 移除基礎武器
                player._ultimateBackup.weapons = list.filter(info => info.type !== 'AURA_FIELD' && info.type !== 'INVINCIBLE');
                // 加入或升級融合武器
                const idx = player._ultimateBackup.weapons.findIndex(info => info.type === 'GRAVITY_WAVE');
                const cfgGW = CONFIG.WEAPONS['GRAVITY_WAVE'];
                if (idx >= 0) {
                    const curLv = player._ultimateBackup.weapons[idx].level || 1;
                    if (cfgGW && curLv < cfgGW.LEVELS.length) player._ultimateBackup.weapons[idx].level += 1;
                } else {
                    player._ultimateBackup.weapons.push({ type: 'GRAVITY_WAVE', level: 1 });
                }
            } else {
                // 正常期間：保持 Weapon 實例陣列，直接移除基礎武器
                player.weapons = (player.weapons || []).filter(w => w.type !== 'AURA_FIELD' && w.type !== 'INVINCIBLE');
                const existingGW = player.weapons.find(w => w.type === 'GRAVITY_WAVE');
                if (existingGW) {
                    player.upgradeWeapon('GRAVITY_WAVE');
                } else {
                    player.addWeapon('GRAVITY_WAVE');
                }
            }
            try { this.updateSkillsList(); } catch (_) {}
            this._playClick();
            // ✅ 修复：合成技能必须关闭菜单，否则菜单无法关闭
            this.hideLevelUpMenu();
            return;
        }

        // 融合：先天氣質（移除 守護領域(AURA_FIELD)/恆星領域(STELLAR_FIELD)，加入或升級 INNATE_TEMPERAMENT）
        if (weaponType === 'INNATE_TEMPERAMENT') {
            // 先清理守護領域/恆星領域的實體（避免重疊，無論是否在大招模式）
            try {
                if (typeof Game !== 'undefined' && Array.isArray(Game.projectiles)) {
                    for (const p of Game.projectiles) {
                        if (p && (p.weaponType === 'AURA_FIELD' || p.weaponType === 'STELLAR_FIELD') && p.player === player && !p.markedForDeletion) {
                            if (typeof p.destroy === 'function') p.destroy(); else p.markedForDeletion = true;
                        }
                    }
                }
                // 清理武器實例中的 _auraEntity 引用（正常模式）
                if (!player.isUltimateActive) {
                    const auraWeapon = player.weapons.find(w => w.type === 'AURA_FIELD');
                    if (auraWeapon && auraWeapon._auraEntity) {
                        try {
                            if (typeof auraWeapon._auraEntity.destroy === 'function') auraWeapon._auraEntity.destroy();
                            else auraWeapon._auraEntity.markedForDeletion = true;
                        } catch (_) { }
                        auraWeapon._auraEntity = null;
                    }
                    const stellarWeapon = player.weapons.find(w => w.type === 'STELLAR_FIELD');
                    if (stellarWeapon && stellarWeapon._auraEntity) {
                        try {
                            if (typeof stellarWeapon._auraEntity.destroy === 'function') stellarWeapon._auraEntity.destroy();
                            else stellarWeapon._auraEntity.markedForDeletion = true;
                        } catch (_) { }
                        stellarWeapon._auraEntity = null;
                    }
                }
            } catch (_) { }

            if (player.isUltimateActive && player._ultimateBackup) {
                const list = Array.isArray(player._ultimateBackup.weapons) ? player._ultimateBackup.weapons : [];
                // 移除基礎武器
                player._ultimateBackup.weapons = list.filter(info => info.type !== 'AURA_FIELD' && info.type !== 'STELLAR_FIELD');
                // 加入或升級融合武器
                const idx = player._ultimateBackup.weapons.findIndex(info => info.type === 'INNATE_TEMPERAMENT');
                const cfgIT = CONFIG.WEAPONS['INNATE_TEMPERAMENT'];
                if (idx >= 0) {
                    const curLv = player._ultimateBackup.weapons[idx].level || 1;
                    if (cfgIT && curLv < cfgIT.LEVELS.length) player._ultimateBackup.weapons[idx].level += 1;
                } else {
                    player._ultimateBackup.weapons.push({ type: 'INNATE_TEMPERAMENT', level: 1 });
                }
            } else {
                // 正常期間：保持 Weapon 實例陣列，直接移除基礎武器
                player.weapons = (player.weapons || []).filter(w => w.type !== 'AURA_FIELD' && w.type !== 'STELLAR_FIELD');
                const existingIT = player.weapons.find(w => w.type === 'INNATE_TEMPERAMENT');
                if (existingIT) {
                    player.upgradeWeapon('INNATE_TEMPERAMENT');
                } else {
                    player.addWeapon('INNATE_TEMPERAMENT');
                }
            }
            try { this.updateSkillsList(); } catch (_) { }
            this._playClick();
            this.hideLevelUpMenu();
            return;
        }

        // 融合：白虹光束（移除 雷射(LASER)/白夜光束(WHITE_NIGHT_BEAM)，加入或升級 WHITE_RAINBOW_BEAM）
        if (weaponType === 'WHITE_RAINBOW_BEAM') {
            try {
                if (typeof Game !== 'undefined' && Array.isArray(Game.projectiles)) {
                    for (const p of Game.projectiles) {
                        if (p && (p.weaponType === 'LASER' || p.weaponType === 'WHITE_NIGHT_BEAM') && p.player === player && !p.markedForDeletion) {
                            if (typeof p.destroy === 'function') p.destroy(); else p.markedForDeletion = true;
                        }
                    }
                }
            } catch(_) {}
            if (player.isUltimateActive && player._ultimateBackup) {
                const list = Array.isArray(player._ultimateBackup.weapons) ? player._ultimateBackup.weapons : [];
                player._ultimateBackup.weapons = list.filter(info => info.type !== 'LASER' && info.type !== 'WHITE_NIGHT_BEAM');
                const idx = player._ultimateBackup.weapons.findIndex(info => info.type === 'WHITE_RAINBOW_BEAM');
                const cfgWRB = CONFIG.WEAPONS['WHITE_RAINBOW_BEAM'];
                if (idx >= 0) {
                    const curLv = player._ultimateBackup.weapons[idx].level || 1;
                    if (cfgWRB && curLv < cfgWRB.LEVELS.length) player._ultimateBackup.weapons[idx].level += 1;
                } else {
                    player._ultimateBackup.weapons.push({ type: 'WHITE_RAINBOW_BEAM', level: 1 });
                }
            } else {
                player.weapons = (player.weapons || []).filter(w => w.type !== 'LASER' && w.type !== 'WHITE_NIGHT_BEAM');
                const existingWRB = player.weapons.find(w => w.type === 'WHITE_RAINBOW_BEAM');
                if (existingWRB) {
                    player.upgradeWeapon('WHITE_RAINBOW_BEAM');
                } else {
                    player.addWeapon('WHITE_RAINBOW_BEAM');
                }
            }
            try { this.updateSkillsList(); } catch (_) {}
            this._playClick();
            this.hideLevelUpMenu();
            return;
        }

        // 融合：召喚AI LV2（移除 連鎖閃電(CHAIN_LIGHTNING)，升級 召喚AI(SUMMON_AI) 至 LV2）
        // 檢查是否為升級到LV2的情況（需要檢查玩家是否已有召喚AI LV1且連鎖閃電LV10）
        if (weaponType === 'SUMMON_AI') {
            const summonAIWeapon = player.weapons.find(w => w.type === 'SUMMON_AI');
            const chainLightningWeapon = player.weapons.find(w => w.type === 'CHAIN_LIGHTNING');
            const summonAILevel = (summonAIWeapon && typeof summonAIWeapon.level === 'number') ? summonAIWeapon.level : 0;
            const chainLightningLevel = (chainLightningWeapon && typeof chainLightningWeapon.level === 'number') ? chainLightningWeapon.level : 0;
            if (summonAILevel === 1 && chainLightningLevel >= 10) {
                // 這是合成召喚AI LV2的情況
                // 先清理連鎖閃電的投射物（避免重疊）
                try {
                    if (typeof Game !== 'undefined' && Array.isArray(Game.projectiles)) {
                        for (const p of Game.projectiles) {
                            if (p && p.weaponType === 'CHAIN_LIGHTNING' && p.player === player && !p.markedForDeletion) {
                                if (typeof p.destroy === 'function') p.destroy(); else p.markedForDeletion = true;
                            }
                        }
                    }
                    // 清理武器實例中的投射物引用（正常模式）
                    if (!player.isUltimateActive) {
                        const chainLightningWeapon = player.weapons.find(w => w.type === 'CHAIN_LIGHTNING');
                        if (chainLightningWeapon && chainLightningWeapon._chainEntity) {
                            try {
                                if (typeof chainLightningWeapon._chainEntity.destroy === 'function') {
                                    chainLightningWeapon._chainEntity.destroy();
                                } else {
                                    chainLightningWeapon._chainEntity.markedForDeletion = true;
                                }
                            } catch(_) {}
                            chainLightningWeapon._chainEntity = null;
                        }
                    }
                } catch(_) {}
                
                if (player.isUltimateActive && player._ultimateBackup) {
                    const list = Array.isArray(player._ultimateBackup.weapons) ? player._ultimateBackup.weapons : [];
                    // 移除連鎖閃電
                    player._ultimateBackup.weapons = list.filter(info => info.type !== 'CHAIN_LIGHTNING');
                    // 升級召喚AI至LV2
                    const idx = player._ultimateBackup.weapons.findIndex(info => info.type === 'SUMMON_AI');
                    if (idx >= 0) {
                        player._ultimateBackup.weapons[idx].level = 2;
                    }
                } else {
                    // 正常期間：保持 Weapon 實例陣列，直接移除連鎖閃電
                    player.weapons = (player.weapons || []).filter(w => w.type !== 'CHAIN_LIGHTNING');
                    // 升級召喚AI至LV2
                    const summonAIWeapon = player.weapons.find(w => w.type === 'SUMMON_AI');
                    if (summonAIWeapon) {
                        // 直接設置等級為2（因為召喚AI只有2級）
                        summonAIWeapon.level = 2;
                        // 如果AI已經被召喚，更新AI的技能
                        if (player.aiCompanion && typeof player.aiCompanion.setSkillLevel === 'function') {
                            player.aiCompanion.setSkillLevel(2);
                            // ✅ 組隊模式：AI升級時重新廣播給其他玩家，讓遠程玩家的AI也更新等級
                            if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                                try {
                                    const ai = player.aiCompanion;
                                    if (ai && typeof window !== 'undefined' && window.SurvivalOnlineBroadcastEvent) {
                                        const playerUid = (Game.multiplayer && Game.multiplayer.uid) ? Game.multiplayer.uid : null;
                                        if (playerUid && ai.id) {
                                            const projectileData = {
                                                id: ai.id,
                                                x: ai.x || player.x,
                                                y: ai.y || player.y,
                                                angle: ai.angle || 0,
                                                weaponType: "SUMMON_AI",
                                                playerUid: playerUid,
                                                damage: 0,
                                                summonAILevel: 2, // ✅ 廣播升級後的等級
                                                width: ai.width || CONFIG.PLAYER.SIZE,
                                                height: ai.height || CONFIG.PLAYER.SIZE
                                            };
                                            window.SurvivalOnlineBroadcastEvent("projectile_spawn", projectileData);
                                        }
                                    }
                                } catch (e) {
                                    console.warn('[UI] AI升級廣播失敗:', e);
                                }
                            }
                        }
                    }
                }
                try { this.updateSkillsList(); } catch (_) {}
                this._playClick();
                this.hideLevelUpMenu();
                return;
            }
            
            // 如果玩家選擇升級召喚AI，但等級是1且不滿足合成條件，則阻止升級
            if (summonAILevel === 1 && chainLightningLevel < 10) {
                // 不滿足合成條件，不允許升級（召喚AI LV2只能通過合成獲得）
                try { this.updateSkillsList(); } catch (_) {}
                this._playClick();
                // ✅ 修复：阻止升级时立即关闭菜单（特殊情况）
                this.hideLevelUpMenu();
                return;
            }
        }

        // 融合：光芒萬丈（移除 連鎖閃電(CHAIN_LIGHTNING)/雷射(LASER)，加入或升級 RADIANT_GLORY）
        if (weaponType === 'RADIANT_GLORY') {
            // 先清理連鎖閃電和雷射的投射物（避免重疊）
            try {
                if (typeof Game !== 'undefined' && Array.isArray(Game.projectiles)) {
                    for (const p of Game.projectiles) {
                        if (p && (p.weaponType === 'CHAIN_LIGHTNING' || p.weaponType === 'LASER') && p.player === player && !p.markedForDeletion) {
                            if (typeof p.destroy === 'function') p.destroy(); else p.markedForDeletion = true;
                        }
                    }
                }
                // 清理武器實例中的投射物引用（正常模式）
                if (!player.isUltimateActive) {
                    const chainLightningWeapon = player.weapons.find(w => w.type === 'CHAIN_LIGHTNING');
                    if (chainLightningWeapon && chainLightningWeapon._chainEntity) {
                        try {
                            if (typeof chainLightningWeapon._chainEntity.destroy === 'function') {
                                chainLightningWeapon._chainEntity.destroy();
                            } else {
                                chainLightningWeapon._chainEntity.markedForDeletion = true;
                            }
                        } catch(_) {}
                        chainLightningWeapon._chainEntity = null;
                    }
                    // 清理雷射的投射物（LaserBeam是直接添加到projectiles的，没有实体引用）
                }
            } catch(_) {}
            if (player.isUltimateActive && player._ultimateBackup) {
                const list = Array.isArray(player._ultimateBackup.weapons) ? player._ultimateBackup.weapons : [];
                // 移除基礎武器
                player._ultimateBackup.weapons = list.filter(info => info.type !== 'CHAIN_LIGHTNING' && info.type !== 'LASER');
                // 加入或升級融合武器
                const idx = player._ultimateBackup.weapons.findIndex(info => info.type === 'RADIANT_GLORY');
                const cfgRG = CONFIG.WEAPONS['RADIANT_GLORY'];
                if (idx >= 0) {
                    const curLv = player._ultimateBackup.weapons[idx].level || 1;
                    if (cfgRG && curLv < cfgRG.LEVELS.length) player._ultimateBackup.weapons[idx].level += 1;
                } else {
                    player._ultimateBackup.weapons.push({ type: 'RADIANT_GLORY', level: 1 });
                }
            } else {
                // 正常期間：保持 Weapon 實例陣列，直接移除基礎武器
                player.weapons = (player.weapons || []).filter(w => w.type !== 'CHAIN_LIGHTNING' && w.type !== 'LASER');
                const existingRG = player.weapons.find(w => w.type === 'RADIANT_GLORY');
                if (existingRG) {
                    player.upgradeWeapon('RADIANT_GLORY');
                } else {
                    player.addWeapon('RADIANT_GLORY');
                }
            }
            try { this.updateSkillsList(); } catch (_) {}
            this._playClick();
            // ✅ 修复：合成技能必须关闭菜单，否则菜单无法关闭
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

        // ✅ MMORPG 架構：所有玩家選擇武器升級時，都同步給其他玩家
        // ✅ 防污染：只在生存模式下發送武器升級消息
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
        let isSurvivalMode = false;
        try {
            const activeId = Utils.getActiveModeId();
            isSurvivalMode = (activeId === 'survival' || activeId === null);
        } catch (_) { }
        
        if (isSurvivalMode && isMultiplayer) {
            try {
                // 發送武器升級消息給所有玩家（不依賴室長端）
                if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                    window.SurvivalOnlineRuntime.sendToNet({ 
                        t: "weapon_upgrade", 
                        weaponType: weaponType 
                    });
                }
            } catch (_) {}
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
        // ⚠️ 修复：防止重复调用，避免视频无限循环播放
        // 如果游戏结束画面已经显示，直接返回
        const gameOverScreen = document.getElementById('game-over-screen');
        if (gameOverScreen && !gameOverScreen.classList.contains('hidden')) {
            console.warn("[UI] showGameOverScreen: 游戏结束画面已经显示，跳过重复调用");
            return;
        }
        
        try { if (AudioManager.stopAllMusic) AudioManager.stopAllMusic(); } catch (e) {}
        Game.pause(true);
        document.getElementById('game-screen').classList.add('hidden');
        if (gameOverScreen) gameOverScreen.classList.remove('hidden');
        
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
    
        // ✅ 修復：清理之前的事件監聽器，避免重複綁定導致卡住
        const oldOnEnded = el._gameOverOnEnded;
        if (oldOnEnded) {
            el.removeEventListener('ended', oldOnEnded);
        }
        
        // ⚠️ 修复：使用一个标志来防止重复处理 ended 事件
        let endedHandled = false;
        
        const onEnded = () => {
            // ⚠️ 修复：防止重复处理 ended 事件
            if (endedHandled) {
                console.warn("[UI] showGameOverScreen: ended 事件已处理，跳过");
                return;
            }
            endedHandled = true;
            
            try {
                console.log("[UI] showGameOverScreen: 影片播放完成，返回大厅");
                // 清除超时
                clearTimeout(timeoutId);
                // 確保影片停止
                el.pause();
                el.currentTime = 0;
                // 移除所有事件监听器，防止重复触发
                if (el._gameOverOnEnded) {
                    el.removeEventListener('ended', el._gameOverOnEnded);
                    el._gameOverOnEnded = null;
                }
                // ⚠️ 组队模式：直接刷新页面（与F5相同效果）
                if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                    console.log('[UI] showGameOverScreen: 组队模式，游戏结束后刷新页面');
                    if (typeof window !== 'undefined' && window.location) {
                        window.location.reload();
                    }
                    return;
                }
                // 单机模式：返回開始畫面
                this._returnToStartFrom('game-over-screen');
            } catch (e) {
                console.warn("[UI] showGameOverScreen: 處理影片結束事件失敗:", e);
                // ⚠️ 组队模式：即使出错也刷新页面
                if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                    if (typeof window !== 'undefined' && window.location) {
                        window.location.reload();
                    }
                    return;
                }
                // 单机模式：即使出錯也返回開始畫面
                this._returnToStartFrom('game-over-screen');
            }
        };
        el._gameOverOnEnded = onEnded; // 保存引用以便清理
        el.addEventListener('ended', onEnded, { once: true });
        
        // ✅ 修復：添加超時保護，如果影片卡住超過30秒，自動返回
        const timeoutId = setTimeout(() => {
            // ⚠️ 修复：防止重复处理
            if (endedHandled) {
                return;
            }
            endedHandled = true;
            
            try {
                console.warn("[UI] showGameOverScreen: 影片播放超時，自動返回");
                el.pause();
                el.currentTime = 0;
                // 移除所有事件监听器
                if (el._gameOverOnEnded) {
                    el.removeEventListener('ended', el._gameOverOnEnded);
                    el._gameOverOnEnded = null;
                }
                // ⚠️ 组队模式：超时也刷新页面
                if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                    if (typeof window !== 'undefined' && window.location) {
                        window.location.reload();
                    }
                    return;
                }
                // 单机模式：超时也返回開始畫面
                this._returnToStartFrom('game-over-screen');
            } catch (e) {
                console.warn("[UI] showGameOverScreen: 超時處理失敗:", e);
            }
        }, 30000); // 30秒超時
    
        // 確保影片播放
        setTimeout(() => {
            try { 
                const playPromise = el.play(); 
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        // ⚠️ 修复：AbortError 是正常的（当 pause() 被调用时），不需要报错
                        // 只有当错误不是 AbortError 时才报错
                        if (error && error.name !== 'AbortError') {
                            console.error("播放失敗影片時出錯:", error);
                        }
                        // 如果自動播放失敗，嘗試添加用戶交互後再播放
                        document.addEventListener('click', function playOnClick() {
                            el.play().catch((playError) => {
                                // ⚠️ 修复：AbortError 是正常的，不需要报错
                                if (playError && playError.name !== 'AbortError') {
                                    console.warn("點擊播放失敗:", playError);
                                }
                                // 如果播放仍然失敗，直接返回
                                clearTimeout(timeoutId);
                                this._returnToStartFrom('game-over-screen');
                            });
                            document.removeEventListener('click', playOnClick);
                        }.bind(this), { once: true });
                    });
                }
            } catch (err) {
                // ⚠️ 修复：AbortError 是正常的（当 pause() 被调用时），不需要报错
                if (err && err.name !== 'AbortError') {
                    console.error("播放失敗影片時出錯:", err);
                }
                clearTimeout(timeoutId);
                this._returnToStartFrom('game-over-screen');
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
            document.getElementById('game-over-exp').textContent = currentWave + "/20";
            // 擊殺數（若可用）
            try {
                const enemiesKilled = (typeof Game !== 'undefined' && Game.enemiesKilled != null) ? Game.enemiesKilled : 0;
                const elKills = document.getElementById('game-over-kills');
                if (elKills) elKills.textContent = enemiesKilled;
            } catch(_) {}

            // 顯示當次新解鎖成就（若有）
            try {
                const achDiv = document.getElementById('game-over-achievements');
                if (achDiv && typeof Achievements !== 'undefined') {
                    const ids = Achievements.getSessionUnlocked();
                    if (ids && ids.length) {
                        const names = ids.map(id => (Achievements.DEFINITIONS[id] && Achievements.DEFINITIONS[id].name) ? Achievements.DEFINITIONS[id].name : id);
                        achDiv.textContent = `新成就解鎖：${names.join('、')}`;
                    } else {
                        achDiv.textContent = '';
                    }
                }
            } catch(_) {}
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
        // ⚠️ 修复：防止重复调用，避免视频无限循环播放
        // 如果胜利画面已经显示，直接返回
        const victoryScreen = document.getElementById('victory-screen');
        if (victoryScreen && !victoryScreen.classList.contains('hidden')) {
            console.warn("[UI] showVictoryScreen: 胜利画面已经显示，跳过重复调用");
            return;
        }
        
        // 統一使用 stopAllMusic，避免生存/挑戰 BGM 殘留到開始介面
        try { if (AudioManager.stopAllMusic) AudioManager.stopAllMusic(); else if (AudioManager.stopMusic) AudioManager.stopMusic(); } catch (e) {}
        Game.pause(true);
        document.getElementById('game-screen').classList.add('hidden');
        if (victoryScreen) victoryScreen.classList.remove('hidden');
    
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
    
        // 嘗試播放，若被瀏覽器的自動播放策略阻擋，提供一次點擊後備
        try {
            const playPromise = el.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch((error) => {
                    console.warn('播放勝利影片失敗，啟用點擊恢復:', error);
                    const overlay = this._get('victory-overlay');
                    const playBtn = this._get('victory-play');
                    const playOnClick = () => {
                        try { el.play(); } catch(_){}
                        if (overlay) overlay.classList.add('hidden');
                        document.removeEventListener('click', playOnClick);
                    };
                    if (playBtn) playBtn.addEventListener('click', playOnClick, { once: true });
                    document.addEventListener('click', playOnClick, { once: true });
                });
            }
        } catch(_) {}
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
            document.getElementById('summary-exp').textContent = currentWave + "/20";
            // 擊殺數（若可用）
            try {
                const kills = (typeof Game !== 'undefined' && Game.enemiesKilled != null) ? Game.enemiesKilled : 0;
                const elKills = document.getElementById('summary-kills');
                if (elKills) elKills.textContent = kills;
            } catch(_) {}

            // 顯示當次新解鎖成就（若有）
            try {
                const achDiv = document.getElementById('victory-achievements');
                if (achDiv && typeof Achievements !== 'undefined') {
                    const ids = Achievements.getSessionUnlocked();
                    if (ids && ids.length) {
                        const names = ids.map(id => (Achievements.DEFINITIONS[id] && Achievements.DEFINITIONS[id].name) ? Achievements.DEFINITIONS[id].name : id);
                        achDiv.textContent = `新成就解鎖：${names.join('、')}`;
                    } else {
                        achDiv.textContent = '';
                    }
                }
            } catch(_) {}
            
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
     * 依賴：Game.selectedCharacter.levelUpBgKey / hudImageKey / avatarImageKey；若缺失則回退到 'player'
     * 不變式：不更動任何文字顯示；僅設定背景圖片樣式
     */
    setLevelUpBackgroundForCharacter: function() {
        const bgEl = this._lumBg || (this.levelUpMenu ? this.levelUpMenu.querySelector('.lum-bg') : null);
        if (!bgEl) return;
        const ch = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
        // 角色優先順序：levelUpBgKey > hudImageKey > avatarImageKey > 'player'
        const key = (ch && (ch.levelUpBgKey || ch.hudImageKey || ch.avatarImageKey))
            ? (ch.levelUpBgKey || ch.hudImageKey || ch.avatarImageKey)
            : 'player';
        const map = {
            // 第一位角色（瑪格麗特）：使用 player1-2.png
            player: 'assets/images/player1-2.png',
            'player1-2': 'assets/images/player1-2.png',
            // 第二位角色（灰妲DaDa）：使用 player2-2.png
            'player2-2': 'assets/images/player2-2.png',
            // 第三位角色（森森鈴蘭）：使用 player3-2.png
            'player3-2': 'assets/images/player3-2.png',
            // 第四位角色（洛可洛斯特）：使用 player4-2.png
            'player4-2': 'assets/images/player4-2.png',
            // 第五位角色（艾比Rabi）：使用 player5-2.png
            'player5-2': 'assets/images/player5-2.png',
            // 第六位角色（鳳梨不咬舌）：使用 player6-2.png
            'player6-2': 'assets/images/player6-2.png',
            'player7-2': 'assets/images/player7-2.png',
            // 白白虹：使用 player8-2.png
            'player8-2': 'assets/images/player8-2.png',
            // 熙歌Cygnus：使用 player9-2.png
            'player9-2': 'assets/images/player9-2.png'
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
        // 組隊模式下，不暫停遊戲（避免所有玩家等待）
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
        
        // ✅ 單機與組隊：若升級選單已顯示，將此次升級加入隊列（修復重疊寶箱只升1次的問題）
        // 單機：兩個寶箱重疊時，第二個會覆蓋第一個的選單；改為隊列後兩次都能升
        if (this.levelUpMenu && !this.levelUpMenu.classList.contains('hidden')) {
            if (this._pendingLevelUps) {
                this._pendingLevelUps.push('pending');
            }
            return;
        }
        
        // 組隊升級選單要出現：選單關著就要顯示。不要因為後面還排著升級就把這次吃掉
        // 暫停遊戲，但不靜音，避免升級音效與BGM被切斷（僅單人模式）
        if (!isMultiplayer && typeof Game !== 'undefined' && Game.pause) {
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
        if (this.levelUpMenu) {
            this.levelUpMenu.classList.remove('hidden');
            // 組隊模式：升級視窗層級高於 ESC 技能頁（#skills-menu z-index: 120），避免同時按 ESC 時被蓋住
            if (isMultiplayer) this.levelUpMenu.style.zIndex = '130';
        }
        
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
        

    },
    /**
     * 遊戲結束時強制清除升級選單狀態（勝利/失敗/重置時呼叫）
     * 避免進入新地圖時升級介面殘留上一局的技能進度
     */
    clearLevelUpStateOnGameEnd: function() {
        try {
            if (this._pendingLevelUps) this._pendingLevelUps = [];
            if (this._levelUpKeyHandler) {
                document.removeEventListener('keydown', this._levelUpKeyHandler);
                this._levelUpKeyHandler = null;
            }
            if (this._pendingOptionEl) {
                try { this._pendingOptionEl.classList.remove('uop-pending'); } catch (_) {}
            }
            this._pendingOptionEl = null;
            this._pendingOptionType = null;
            this._pendingOptionIndex = null;
            this._heldOptionIndex = null;
            if (this.levelUpMenu) {
                this.levelUpMenu.classList.add('hidden');
                if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                    this.levelUpMenu.style.zIndex = '';
                }
            }
            if (this.upgradeOptions) this.upgradeOptions.innerHTML = '';
        } catch (_) {}
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
        if (this.levelUpMenu) {
            this.levelUpMenu.classList.add('hidden');
            // 組隊模式：關閉時還原 z-index，下次顯示再由 showLevelUpMenu 設定
            if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                this.levelUpMenu.style.zIndex = '';
            }
        }

        // ✅ 單機與組隊：檢查隊列，若有待處理升級則顯示下一個（修復重疊寶箱只升1次）
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
        if (this._pendingLevelUps && this._pendingLevelUps.length > 0) {
            // ⚠️ 关键修复：不在这里移除标记，而是在处理完后再移除
            // 延迟一帧，确保菜单完全关闭后再显示下一个
            setTimeout(() => {
                // ✅ 修复：处理队列中的升级（包括经验升级和宝箱升级）
                // ⚠️ 关键：需要智能判断是经验升级还是宝箱升级
                // ⚠️ 关键修复：检查队列是否还有标记，如果没有标记，说明已经被处理了，直接返回
                if (!this._pendingLevelUps || this._pendingLevelUps.length === 0) {
                    return; // 队列已空，不需要处理
                }
                if (typeof Game !== 'undefined' && Game.player && !Game.player._isRemotePlayer) {
                    const player = Game.player;
                    // ✅ 修复：优先处理经验升级（如果经验足够）
                    // 这样可以确保经验升级优先于宝箱升级
                    if (player.experience >= player.experienceToNextLevel) {
                        // 经验升级：调用 levelUp()，这会调用 showLevelUpMenu()
                        // ⚠️ 关键：先移除一个标记，然后处理经验升级
                        if (this._pendingLevelUps && this._pendingLevelUps.length > 0) {
                            this._pendingLevelUps.shift(); // 移除一个标记（经验升级）
                        }
                        player.levelUp(); // 这会调用 showLevelUpMenu，但此时队列中还有标记，会继续处理
                        // 如果升级后经验仍然足够，将下一个升级加入队列（等待下一次 hideLevelUpMenu 处理）
                        if (player.experience >= player.experienceToNextLevel && this._pendingLevelUps) {
                            this._pendingLevelUps.push('exp');
                        }
                    } else {
                        // ✅ 修复：如果没有经验升级，但队列中还有标记，说明是宝箱升级
                        // 直接显示升级菜单（宝箱升级不需要扣除经验）
                        // ⚠️ 关键：先移除一个标记，然后处理宝箱升级
                        if (this._pendingLevelUps && this._pendingLevelUps.length > 0) {
                            this._pendingLevelUps.shift(); // 移除一个标记（宝箱升级）
                            // 显示升级菜单（宝箱升级）
                            this.showLevelUpMenu();
                        } else {
                            // ⚠️ 修复：如果队列为空，但进入了这个分支，说明队列处理可能有问题
                            // 清空队列，避免卡住
                            if (this._pendingLevelUps) {
                                this._pendingLevelUps = [];
                            }
                        }
                    }
                } else {
                    // ⚠️ 修复：如果玩家不存在，清空队列，避免卡住
                    if (this._pendingLevelUps) {
                        this._pendingLevelUps = [];
                    }
                }
            }, 50);
            return; // 不恢復遊戲，即將顯示下一個升級選單
        }
        
        // 恢復遊戲（僅單機模式，隊列為空時）
        if (!isMultiplayer && typeof Game !== 'undefined' && Game.resume) {
            Game.resume();
        }
        
        // 組隊連續升級接著出：一次吃到兩級，選完這次若經驗還夠，要接著出下一次。單機本來就會。組隊仍然不暫停
            try {
                if (typeof Game !== 'undefined' && Game.player && !Game.player._isRemotePlayer) {
                    const player = Game.player;
                    if (player.experience >= player.experienceToNextLevel) {
                        setTimeout(() => {
                            if (player.experience >= player.experienceToNextLevel) {
                                player.levelUp();
                            }
                        }, 50);
                    }
                }
            } catch (_) {}
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
        // 檢查是否為組隊模式
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.sessionId);
        // 組隊模式下不暫停遊戲，避免影響其他玩家
        if (!isMultiplayer) {
            // 暫停但不靜音（僅單機模式）
            if (typeof Game !== 'undefined' && Game.pause) {
                Game.pause(false);
            }
        }
        // 更新技能、天賦與金幣顯示
        try { this.updateSkillsList(); } catch (_) {}
        try { this.updateTalentsList(); } catch (_) {}
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
        // 檢查是否為組隊模式
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.sessionId);
        // 組隊模式下不恢復遊戲（因為沒有暫停），避免影響其他玩家
        if (!isMultiplayer) {
            // 恢復遊戲（僅單機模式）
            if (typeof Game !== 'undefined' && Game.resume) {
                Game.resume();
            }
        }
    },

    // 私有：手機升級視窗尺寸自適應（不影響 PC）


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
  const iconMap = (CONFIG && CONFIG.UI && CONFIG.UI.SKILL_ICONS) ? CONFIG.UI.SKILL_ICONS : {};
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
const category = (option.type === 'ATTR_ATTACK' || option.type === 'ATTR_ATTACK_POWER' || option.type === 'ATTR_CRIT' || option.type === 'ATTR_HEALTH' || option.type === 'ATTR_DEFENSE')
    ? 'StatUp'
    : (option.type === 'SING' || option.type === 'YOUNG_DADA_GLORY' || option.type === 'DEVOURING_POWER' ? 'Skill' : 'Weapon');
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
        // 組隊模式修復：UI.init() 會因 Game.reset() 被多次呼叫，只綁定一次避免重複 listener 導致開關無效
        if (this._expSoundToggleBound) {
            refresh();
            return;
        }
        this._expSoundToggleBound = true;
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

    // 新增：死亡音效切換綁定
    bindDeathSoundToggle: function() {
        const btn = this.deathSoundToggle;
        const label = this.deathSoundToggleText;
        if (!btn || !label) return;
        const refresh = () => {
            const enabled = (typeof AudioManager !== 'undefined') ? (AudioManager.deathSoundEnabled !== false) : true;
            label.textContent = enabled ? '死亡音效：開' : '死亡音效：關';
        };
        // 組隊模式修復：UI.init() 會因 Game.reset() 被多次呼叫，只綁定一次避免重複 listener 導致開關無效
        if (this._deathSoundToggleBound) {
            refresh();
            return;
        }
        this._deathSoundToggleBound = true;
        refresh();
        btn.addEventListener('click', () => {
            try {
                if (typeof AudioManager !== 'undefined') {
                    AudioManager.deathSoundEnabled = !AudioManager.deathSoundEnabled;
                }
                if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                    AudioManager.playSound('button_click2');
                }
            } catch (_) {}
            refresh();
        });
    },

    // 手機橫放。直的不旋轉畫面，改蓋一層請橫放。電腦不進這條。
    _initPhoneLandscape: function() {
        if (this._phonePlayBound) return;
        this._phonePlayBound = true;
        this._phoneViewScale = 1;
        try { document.documentElement.classList.add('phone-play'); } catch (_) {}
        this._buildPhoneControls();
        this._phoneSync = this._syncPhoneLandscape.bind(this);
        window.addEventListener('resize', this._phoneSync);
        window.addEventListener('orientationchange', this._phoneSync);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', this._phoneSync);
        this._phoneSyncTimer = setInterval(this._phoneSync, 400);
        this._syncPhoneLandscape();
    },

    _buildPhoneControls: function() {
        const screen = document.getElementById('game-screen');
        if (!screen || document.getElementById('phone-pause-btn')) return;

        const overlay = document.createElement('div');
        overlay.id = 'phone-rotate-overlay';
        overlay.className = 'hidden';
        const card = document.createElement('div');
        card.className = 'phone-rotate-card';
        const line1 = document.createElement('p');
        line1.textContent = '請把手機橫過來';
        const line2 = document.createElement('p');
        line2.textContent = '橫放後就能玩';
        const lockBtn = document.createElement('button');
        lockBtn.type = 'button';
        lockBtn.textContent = '試著轉成橫的';
        lockBtn.addEventListener('click', function () {
            const go = function () {
                try {
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch(function () {});
                    }
                } catch (_) {}
            };
            try {
                const root = document.documentElement;
                const req = root.requestFullscreen || root.webkitRequestFullscreen;
                if (req) {
                    const pending = req.call(root);
                    if (pending && pending.then) pending.then(go).catch(go);
                    else go();
                } else go();
            } catch (_) { go(); }
        });
        card.appendChild(line1);
        card.appendChild(line2);
        card.appendChild(lockBtn);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        const pause = document.createElement('button');
        pause.type = 'button';
        pause.id = 'phone-pause-btn';
        pause.className = 'hidden';
        pause.textContent = '暫停';
        pause.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const skills = document.getElementById('skills-menu');
            const open = skills && !skills.classList.contains('hidden');
            if (open) this.hideSkillsMenu();
            else this.showSkillsMenu();
        });

        const ult = document.createElement('button');
        ult.type = 'button';
        ult.id = 'phone-ult-btn';
        ult.className = 'hidden';
        ult.textContent = '大招';
        ult.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof Game !== 'undefined' && Game.player && typeof Game.player.tryActivateUltimate === 'function') {
                Game.player.tryActivateUltimate();
            }
        });

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.id = 'phone-upgrade-confirm';
        confirmBtn.className = 'hidden';
        confirmBtn.textContent = '確定';
        confirmBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this._pendingOptionType) this.selectUpgrade(this._pendingOptionType);
        });

        const skills = document.getElementById('skills-menu');
        if (skills && !document.getElementById('phone-skills-close')) {
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.id = 'phone-skills-close';
            closeBtn.textContent = '關閉';
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hideSkillsMenu();
            });
            skills.appendChild(closeBtn);
        }

        screen.appendChild(pause);
        screen.appendChild(ult);
        screen.appendChild(confirmBtn);

        const viewStep = (dir) => {
            const steps = [1, 1.4, 1.8, 2.2];
            let i = 0;
            for (let n = 0; n < steps.length; n++) {
                if (Math.abs(steps[n] - this._phoneViewScale) < 0.05) i = n;
            }
            i = Math.max(0, Math.min(steps.length - 1, i + dir));
            this._phoneViewScale = steps[i];
            this._syncPhoneLandscape();
        };
        const viewBtn = (id, label, dir) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = id;
            btn.className = 'hidden';
            btn.textContent = label;
            let touched = false;
            btn.addEventListener('touchend', (e) => {
                touched = true;
                e.preventDefault();
                e.stopPropagation();
                viewStep(dir);
            });
            btn.addEventListener('click', (e) => {
                if (touched) { touched = false; return; }
                e.preventDefault();
                e.stopPropagation();
                viewStep(dir);
            });
            screen.appendChild(btn);
        };
        viewBtn('phone-view-near', '近', 1);
        viewBtn('phone-view-far', '遠', -1);

        const modeMenu = document.createElement('button');
        modeMenu.type = 'button';
        modeMenu.id = 'phone-mode-menu';
        modeMenu.className = 'hidden';
        modeMenu.textContent = '暫停';
        let modeMenuTouched = false;
        modeMenu.addEventListener('touchend', (e) => {
            modeMenuTouched = true;
            e.preventDefault();
            e.stopPropagation();
            const hooks = window.phoneModeHooks;
            if (hooks && typeof hooks.menu === 'function') hooks.menu();
        });
        modeMenu.addEventListener('click', (e) => {
            if (modeMenuTouched) { modeMenuTouched = false; return; }
            e.preventDefault();
            e.stopPropagation();
            const hooks = window.phoneModeHooks;
            if (hooks && typeof hooks.menu === 'function') hooks.menu();
        });
        screen.appendChild(modeMenu);

        const hold = (id, label, downName, upName) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = id;
            btn.className = 'hidden';
            btn.textContent = label;
            const down = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const hooks = window.phoneModeHooks;
                if (hooks && typeof hooks[downName] === 'function') hooks[downName]();
            };
            const up = (e) => {
                if (e && e.cancelable) e.preventDefault();
                const hooks = window.phoneModeHooks;
                if (hooks && typeof hooks[upName] === 'function') hooks[upName]();
            };
            btn.addEventListener('touchstart', down, { passive: false });
            btn.addEventListener('touchend', up);
            btn.addEventListener('touchcancel', up);
            screen.appendChild(btn);
            return btn;
        };
        hold('phone-challenge-dash', '衝刺', 'dashDown', 'dashUp');
        const tapToggle = (id, label, toggleName) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = id;
            btn.className = 'hidden';
            btn.textContent = label;
            let touched = false;
            const run = () => {
                const hooks = window.phoneModeHooks;
                if (hooks && typeof hooks[toggleName] === 'function') hooks[toggleName]();
                if (UI && UI._syncPhoneLandscape) UI._syncPhoneLandscape();
            };
            btn.addEventListener('touchend', (e) => {
                touched = true;
                e.preventDefault();
                e.stopPropagation();
                run();
            });
            btn.addEventListener('click', (e) => {
                if (touched) { touched = false; return; }
                e.preventDefault();
                e.stopPropagation();
                run();
            });
            screen.appendChild(btn);
        };
        tapToggle('phone-challenge-fire', '自動', 'toggleAuto');
        tapToggle('phone-challenge-focus', '集中', 'toggleFocus');

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.id = 'phone-defense-cancel';
        cancel.className = 'hidden';
        cancel.textContent = '取消';
        let cancelTouched = false;
        cancel.addEventListener('touchend', (e) => {
            cancelTouched = true;
            e.preventDefault();
            e.stopPropagation();
            const hooks = window.phoneModeHooks;
            if (hooks && typeof hooks.cancel === 'function') hooks.cancel();
        });
        cancel.addEventListener('click', (e) => {
            if (cancelTouched) { cancelTouched = false; return; }
            e.preventDefault();
            e.stopPropagation();
            const hooks = window.phoneModeHooks;
            if (hooks && typeof hooks.cancel === 'function') hooks.cancel();
        });
        screen.appendChild(cancel);
    },

    _syncPhoneLandscape: function() {
        try {
            if (!(window.isPhonePlayDevice && window.isPhonePlayDevice())) return;
            const game = document.getElementById('game-screen');
            const overlay = document.getElementById('phone-rotate-overlay');
            const pause = document.getElementById('phone-pause-btn');
            const ult = document.getElementById('phone-ult-btn');
            const confirmBtn = document.getElementById('phone-upgrade-confirm');
            const gameOn = !!(game && !game.classList.contains('hidden'));
            const portrait = window.matchMedia
                ? window.matchMedia('(orientation: portrait)').matches
                : ((window.innerHeight || 0) > (window.innerWidth || 0));
            const survival = (typeof Utils !== 'undefined' && Utils.isSurvivalModeContext)
                ? Utils.isSurvivalModeContext()
                : false;
            const levelUp = document.getElementById('level-up-menu');
            const skills = document.getElementById('skills-menu');
            const levelOn = !!(levelUp && !levelUp.classList.contains('hidden'));
            const skillsOn = !!(skills && !skills.classList.contains('hidden'));
            const over = (typeof Game !== 'undefined' && Game.isGameOver);
            const showRotate = gameOn && portrait;
            const showPlay = gameOn && !portrait && survival && !over;
            const mp = typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled;

            if (overlay) overlay.classList.toggle('hidden', !showRotate);
            if (pause) {
                pause.classList.toggle('hidden', !showPlay || levelOn || skillsOn);
                pause.textContent = (Game && Game.multiplayer && Game.multiplayer.sessionId) ? '選單' : '暫停';
            }
            if (ult) {
                ult.classList.toggle('hidden', !showPlay || levelOn);
                let ready = false;
                try {
                    const p = Game && Game.player;
                    ready = !!(p && !p.isUltimateActive && Math.floor(p.energy) >= p.maxEnergy);
                } catch (_) {}
                ult.classList.toggle('is-ready', ready);
            }
            if (confirmBtn) confirmBtn.classList.toggle('hidden', !(showPlay && levelOn));
            const showZoom = showPlay && !levelOn && !skillsOn;
            const nearBtn = document.getElementById('phone-view-near');
            const farBtn = document.getElementById('phone-view-far');
            if (nearBtn) nearBtn.classList.toggle('hidden', !showZoom);
            if (farBtn) farBtn.classList.toggle('hidden', !showZoom);
            this._applyPhoneSurvivalZoom(survival);

            const hooks = window.phoneModeHooks;
            const modeId = (typeof Utils !== 'undefined' && Utils.getActiveModeId) ? Utils.getActiveModeId() : null;
            const modeOn = gameOn && !portrait && !survival && hooks && hooks.mode === modeId;
            const modeMenuOpen = !!(modeOn && typeof hooks.menuOpen === 'function' && hooks.menuOpen());
            const modeMenuBtn = document.getElementById('phone-mode-menu');
            if (modeMenuBtn) {
                modeMenuBtn.classList.toggle('hidden', !modeOn);
                modeMenuBtn.textContent = modeMenuOpen ? '關閉' : '暫停';
            }
            const showChallenge = modeOn && hooks.mode === 'challenge' && !modeMenuOpen;
            const fireBtn = document.getElementById('phone-challenge-fire');
            const dashBtn = document.getElementById('phone-challenge-dash');
            const focusBtn = document.getElementById('phone-challenge-focus');
            if (fireBtn) {
                fireBtn.classList.toggle('hidden', !showChallenge);
                fireBtn.classList.toggle('is-on', !!(showChallenge && hooks.autoOn && hooks.autoOn()));
            }
            if (dashBtn) dashBtn.classList.toggle('hidden', !showChallenge);
            if (focusBtn) {
                focusBtn.classList.toggle('hidden', !showChallenge);
                focusBtn.classList.toggle('is-on', !!(showChallenge && hooks.focusOn && hooks.focusOn()));
            }
            const cancelBtn = document.getElementById('phone-defense-cancel');
            if (cancelBtn) {
                const showCancel = modeOn && hooks.mode === 'defense' && !modeMenuOpen && typeof hooks.showCancel === 'function' && hooks.showCancel();
                cancelBtn.classList.toggle('hidden', !showCancel);
            }

            if (showRotate && survival && !mp && Game && typeof Game.pause === 'function' && !Game.isPaused && !over) {
                Game.pause(false);
                this._phoneHeldPause = true;
            } else if (!showRotate && this._phoneHeldPause) {
                this._phoneHeldPause = false;
                if (gameOn && !levelOn && !skillsOn && Game && typeof Game.resume === 'function' && !over) Game.resume();
            }
        } catch (_) {}
    },

    // 只放大生存畫布的畫面。鏡頭、走路、血條都不改。離開生存就收回。
    _applyPhoneSurvivalZoom: function(survival) {
        const canvas = document.getElementById('game-canvas');
        if (!canvas) return;
        const scale = survival ? (this._phoneViewScale || 1) : 1;
        if (scale <= 1) {
            if (canvas.style.transform) canvas.style.transform = '';
            return;
        }
        canvas.style.transformOrigin = 'center center';
        canvas.style.transform = 'scale(' + scale + ')';
    },

    /**
     * 初始化：手機螢幕旋轉適應（僅行動裝置）
     * 依賴：#viewport、CONFIG.CANVAS_WIDTH/HEIGHT、window.matchMedia、window.addEventListener
     * 不變式：不改動任何既有文字/流程；PC不受影響。
     * 維護提示：此功能只調整 #viewport 的定位與變形；不動 SaveCode。
     */
    initMobileViewportRotation: function() {
        try {
            if (window.isPhonePlayDevice && window.isPhonePlayDevice()) {
                this._initPhoneLandscape();
                return;
            }
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
                // 直立旋轉時由 viewport 的 transform 控制縮放，避免 UI 變數再次縮放
                document.documentElement.style.setProperty('--ui-scale', '1');
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
// 附加：顯示成就解鎖彈窗（可列出多項；點外側關閉）
UI.showAchievementsUnlockModal = function(ids) {
        try {
            const overlay = this._get('achievements-modal');
            const listEl = this._get('achievements-modal-list');
            if (!overlay || !listEl) return;
            listEl.innerHTML = '';
            const defs = (typeof Achievements !== 'undefined' && Achievements.DEFINITIONS) ? Achievements.DEFINITIONS : {};
            ids.forEach(id => {
                const def = defs[id] || { name: id, desc: '', icon: 'assets/images/A1.png', reward: '' };
                const item = document.createElement('div');
                item.className = 'ach-item';
                const iconWrap = document.createElement('div');
                iconWrap.className = 'ach-item-icon';
                const img = document.createElement('img');
                img.src = def.icon || 'assets/images/A1.png';
                img.alt = def.name || id;
                iconWrap.appendChild(img);
                const text = document.createElement('div');
                text.className = 'ach-item-text';
                const name = document.createElement('div');
                name.className = 'ach-item-name';
                name.textContent = def.name || id;
                const desc = document.createElement('div');
                desc.className = 'ach-item-desc';
                desc.textContent = def.desc || '';
                const reward = document.createElement('div');
                reward.className = 'ach-item-reward';
                reward.textContent = def.reward ? String(def.reward) : '';
                text.appendChild(name);
                text.appendChild(desc);
                if (reward.textContent) text.appendChild(reward);
                item.appendChild(iconWrap);
                item.appendChild(text);
                listEl.appendChild(item);
            });
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-hidden', 'false');
            this._achievementSoundPlayedForModal = false;
            // 點擊外層關閉；若顯示時音效被瀏覽器阻擋（非使用者手勢），關閉時補播一次
            const onClose = (e) => {
                if (e.target === overlay) {
                    if (!this._achievementSoundPlayedForModal) {
                        const am = (typeof window !== 'undefined' && window.AudioManager) ? window.AudioManager : (typeof AudioManager !== 'undefined' ? AudioManager : null);
                        if (am && typeof am.playSound === 'function') {
                            const wasMuted = am.isMuted;
                            if (wasMuted) am.isMuted = false;
                            try { am.playSound('achievements'); } catch (_) {}
                            if (wasMuted) am.isMuted = true;
                        }
                    }
                    overlay.classList.add('hidden');
                    overlay.setAttribute('aria-hidden', 'true');
                    overlay.removeEventListener('click', onClose);
                }
            };
            overlay.addEventListener('click', onClose);
        } catch (_) {}
    };
