// 遊戲主入口
// 維護註解與依賴關係：
// - 本檔案負責 UI 事件綁定、畫面切換、與遊戲初始化；不改動數值或機制邏輯
// - 直接依賴：DOM 結構 (index.html)、CSS 排版 (css/style.css)、AudioManager/AudioScene、Game、UI、EventSystem/GameEvents、CONFIG
// - 間接依賴：player/enemy/weapon 等內部邏輯（透過 Game.startNewGame() 啟動）
// - 設計原則：
//   1) 不改任何玩家可見文字（標題、技能介紹、版權聲明等）；此檔新增註解僅供維護者閱讀
//   2) 不改 CSS 排版；若須視覺變化，先確認現有 CSS 是否已提供覆蓋樣式
//   3) 不改遊戲數值與機制（ESC 開技能、升級彈窗等維持原有行為）；此檔僅做事件與顯示層優化
//   4) 任何新增事件監聽需在 EventSystem.init() 之後執行（由 index.html 載入順序保證）
//   5) 音樂切換統一走 AudioScene（保留 AudioManager.playMusic 以防相容）
//   6) 變更點集中在 setupMapAndDifficultySelection 以維持選角畫面為底層、其他視窗覆蓋顯示

document.addEventListener('DOMContentLoaded', function() {
    if (typeof ModeHud !== 'undefined' && ModeHud.renderModeHuds) ModeHud.renderModeHuds();
    if (typeof SummaryPanels !== 'undefined' && SummaryPanels.renderSummaryPanels) SummaryPanels.renderSummaryPanels();
    renderStartMenuButtons();
    renderStartInfoPages();
    renderRegardingLinks();
    renderConfirmDialogs();
    renderPromptModals();
    renderBackupSections();
    // 開始按鈕
    const startButton = document.getElementById('start-button');
    startButton.addEventListener('click', function() {
        playClick(); // 使用輔助函數替換 AudioManager.playSound('button_click')
        // 進入加載頁面
        hide(DOMCache.get('start-screen'));
        show(DOMCache.get('loading-screen'));
        // 開始預加載資源
        preloadAllResources();
    });

    // 音量設置已移除，改為序號輸入系統
    // 音量控制現在由 AudioManager 直接管理，不再需要開始界面的音量設置選項
    
    // 影片結束事件改由 UI.showGameOverScreen / UI.showVictoryScreen 內管理，避免重複綁定與行為衝突
    
    // 創建預設的視頻文件
    createDefaultVideos();
    
    // 創建預設的圖片資源
    createDefaultImages();
    
    // 初始化音效系統
    AudioManager.init();
    
    // 初始化遊戲（但不開始）- 若 Game 未定義則跳過，避免整頁崩潰
    if (typeof Game === 'undefined') {
        console.error('[main.js] Game 未定義，無法初始化遊戲。請檢查 game.js 是否正確載入。');
        return;
    }
    Game.init();
    // 預設暫停，但不靜音，以保留選單音樂與音效
    Game.pause(false);

    // 自動暫停與音效抑制（分頁切換/縮小/失焦）
    setupAutoPause();

    // 設定選角介面事件
    setupCharacterSelection();

    // 地圖與難度選擇事件
    setupMapAndDifficultySelection();

    // 設定視窗縮放（PC與手機皆可）
    setupResponsiveViewport();

    // 設定 ESC 技能頁面切換
    setupSkillsMenuToggle();

    // 新增：天賦介面切換事件
    setupTalentScreenToggle();

    // 天賦選取音效（點擊天賦卡片時）
    (function bindTalentClickSound(){
        const talentGrid = document.querySelector('#talent-select-screen .talent-grid');
        if (!talentGrid) return;
        const cards = talentGrid.querySelectorAll('.char-card.selectable');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                playClick2(); // 使用輔助函數替換 AudioManager.playSound('button_click2')
            });
        });
    })();
    
    // （如需主選單音樂，請於assets/audio添加menu_music.mp3後再啟用）
    // if (AudioManager.playMusic) AudioManager.playMusic('menu_music');
    
    console.log('遊戲已初始化，等待開始...');
});

// 創建預設視頻文件
function createDefaultVideos() {
    // 檢查視頻是否存在，如果不存在則使用預設視頻
    const gameOverVideo = document.getElementById('game-over-video');
    const victoryVideo = document.getElementById('victory-video');
    
    // 如果視頻源無效，使用預設視頻（這裡使用 base64 編碼的簡單視頻）
    gameOverVideo.onerror = function() {
        console.log('失敗視頻載入失敗，使用預設視頻');
        createDefaultVideo('game-over-video', '遊戲結束');
    };
    
    victoryVideo.onerror = function() {
        console.log('勝利視頻載入失敗，使用預設視頻');
        createDefaultVideo('victory-video', '勝利！');
    };
}

// 創建預設視頻
function createDefaultVideo(videoId, text) {
    const video = document.getElementById(videoId);
    
    // 創建一個 canvas 元素
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    
    // 繪製文字
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = videoId === 'game-over-video' ? '#f00' : '#0f0';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    // 將 canvas 轉換為 data URL
    const dataURL = canvas.toDataURL();
    
    // 創建一個 img 元素
    const img = document.createElement('img');
    img.src = dataURL;
    // 保留原有ID，讓UI可以找到此元素並綁定事件
    img.id = videoId;
    
    // 替換視頻元素
    video.parentNode.replaceChild(img, video);
    
    // 模擬視頻播放結束事件
    setTimeout(function() {
        const event = new Event('ended');
        img.dispatchEvent(event);
    }, 3000);
}

// 創建預設圖片資源（Legacy fallback）
// 重要備註（避免未來維護/AI 誤導）：
// - 目前「正式的全域資源預載」已集中在 `js/resource_loader.js`：
//   - `preloadAllResources()` → `ResourceLoader.preloadAll()` → `ResourceLoader.getImageList()`
// - 本函數屬於歷史遺留的 Game.images 初始化/後備預載，內容與 ResourceLoader 的 imageList 高度重疊。
// - 若你新增的是「UI 圖示」(技能卡/成就卡)：通常直接用 `<img src="assets/...">`，不需要加到這裡。
// - 若你新增的是「Canvas/特效要用 Game.images[key]」：請加到 `ResourceLoader.getImageList()`（而不是改這裡），避免兩套清單越來越難維護。
function createDefaultImages() {
    if (typeof Game === 'undefined') {
        console.warn('[main.js] createDefaultImages: Game 未定義，略過');
        return;
    }
    // 初始化遊戲圖片對象
    Game.images = {};
    
    // 定義需要加載的圖片（去除重複：以 ResourceLoader.getImageList() 為唯一來源）
    // 不變式：仍會把同一批圖片預載到 Game.images，確保現有流程不變。
    let imagesToLoad = [];
    try {
        if (typeof ResourceLoader !== 'undefined' && typeof ResourceLoader.getImageList === 'function') {
            imagesToLoad = ResourceLoader.getImageList() || [];
        }
    } catch (_) {}
    // 後備：若 ResourceLoader 不可用，至少保留玩家圖以避免空集合
    if (!Array.isArray(imagesToLoad) || imagesToLoad.length === 0) {
        imagesToLoad = [{ name: 'player', src: 'assets/images/player.gif' }];
    }
    
    // 加載所有圖片
    let loadedCount = 0;
    
    imagesToLoad.forEach(img => {
        const image = new Image();
        image.src = img.src;
        
        // 圖片加載成功
        image.onload = function() {
            Game.images[img.name] = image;
            loadedCount++;
            console.log(`已加載圖片: ${img.name}`);
            
            // 所有圖片加載完成
            if (loadedCount === imagesToLoad.length) {
                console.log('所有圖片加載完成');
            }
        };
        
        // 圖片加載失敗
        image.onerror = function() {
            console.warn(`無法加載圖片: ${img.name} (${img.src})，使用預設圖形`);
            // 即使加載失敗，也將圖片對象存入 Game.images，避免後續重複嘗試
            Game.images[img.name] = image;
            loadedCount++;
        };
    });
}

// 自動暫停與音效抑制（分頁切換/縮小/失焦）
function setupAutoPause() {
    // 使用 UI 輔助方法統一判斷，避免重複邏輯
    const isAnyMenuOpen = () => {
        try { return typeof UI !== 'undefined' && UI.isAnyOverlayOpen ? UI.isAnyOverlayOpen() : false; } catch (_) { return false; }
    };

    const isMenuVisible = () => {
        // 起始、選角、選地圖、選難度、天賦、成就畫面是否可見
        const startVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('start-screen') : !document.getElementById('start-screen').classList.contains('hidden'));
        const charVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('character-select-screen') : !document.getElementById('character-select-screen').classList.contains('hidden'));
        const mapVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('map-select-screen') : !document.getElementById('map-select-screen').classList.contains('hidden'));
        const diffVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('difficulty-select-screen') : !document.getElementById('difficulty-select-screen').classList.contains('hidden'));
        const talentVisible = Array.from(document.querySelectorAll('#talent-select-screen')).some(el => !el.classList.contains('hidden'));
        const achVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('achievements-screen') : !document.getElementById('achievements-screen').classList.contains('hidden'));
        const backupVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('backup-screen') : (document.getElementById('backup-screen') && !document.getElementById('backup-screen').classList.contains('hidden')));
        return startVisible || charVisible || mapVisible || diffVisible || talentVisible || achVisible || backupVisible;
    };

    // 可見性變更：當回到可見時，若覆蓋層（升級/技能）開啟，保持暫停但解除靜音以恢復 BGM 與音效
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && typeof Input !== 'undefined' && Input.releaseHeldKeys) Input.releaseHeldKeys();
        // 組隊模式下不暫停，避免影響其他玩家
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.sessionId);
        if (document.hidden && !isMultiplayer) {
            Game.pause();
            AudioManager.setMuted && AudioManager.setMuted(true);
        } else if (document.hidden && isMultiplayer) {
            // 組隊模式下失焦時只靜音，不暫停遊戲
            AudioManager.setMuted && AudioManager.setMuted(true);
        } else {
            // 若目前為非生存模式（主線/挑戰），維持暫停並不恢復生存迴圈或BGM
            try {
                if (!Utils.isSurvivalModeContext()) {
                    Game.pause(true);
                    return;
                }
            } catch(_) {}
            // 檢查是否在勝利/失敗畫面（不應恢復遊戲音樂）
            const victoryVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('victory-screen') : !document.getElementById('victory-screen').classList.contains('hidden'));
            const gameOverVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('game-over-screen') : !document.getElementById('game-over-screen').classList.contains('hidden'));
            const gameVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('game-screen') : !document.getElementById('game-screen').classList.contains('hidden'));
            
            if (victoryVisible || gameOverVisible) {
                // 勝利/失敗畫面：不恢復遊戲音樂，避免修羅音樂污染
                return;
            }
            
            if (gameVisible && !Game.isGameOver && !isAnyMenuOpen()) {
                Game.resume();
                AudioManager.setMuted && AudioManager.setMuted(false);
            } else if (isAnyMenuOpen()) {
                // 升級/技能覆蓋層開啟：不恢復遊戲邏輯，但解除靜音讓 BGM 與選項音效可用
                Game.pause(false);
                AudioManager.setMuted && AudioManager.setMuted(false);
            } else if (isMenuVisible()) {
                // 解除靜音並恢復選單音樂（不觸發遊戲音樂）
                AudioManager.isMuted = false;
                try {
                    if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                        AudioScene.enterMenu();
                    } else if (AudioManager.playMusic) {
                        AudioManager.playMusic('menu_music');
                    }
                } catch (_) {}
            }
        }
    });

    window.addEventListener('blur', () => {
        if (typeof Input !== 'undefined' && Input.releaseHeldKeys) Input.releaseHeldKeys();
        // 組隊模式下不暫停，避免影響其他玩家
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.sessionId);
        if (!isMultiplayer) {
            Game.pause();
            AudioManager.setMuted && AudioManager.setMuted(true);
        } else {
            // 組隊模式下失焦時只靜音，不暫停遊戲
            AudioManager.setMuted && AudioManager.setMuted(true);
        }
    });

    window.addEventListener('focus', () => {
        // ✅ 修復：組隊模式下不應該恢復遊戲（因為組隊模式從未暫停過）
        // 組隊模式不能暫停遊戲（Game.pause），所以也不應該恢復遊戲（Game.resume）
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.sessionId);
        if (isMultiplayer) {
            // 組隊模式下，只恢復音效，不調用 Game.resume()
            // 遊戲循環繼續運行，只接收服務器狀態，tick 函數會自動恢復發送輸入（通過 document.hasFocus() 檢查）
            AudioManager.setMuted && AudioManager.setMuted(false);
            return;
        }
        
        try {
            if (!Utils.isSurvivalModeContext()) {
                Game.pause(true);
                return;
            }
        } catch(_) {}
        // 檢查是否在勝利/失敗畫面（不應恢復遊戲音樂）
        const victoryVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('victory-screen') : !document.getElementById('victory-screen').classList.contains('hidden'));
        const gameOverVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('game-over-screen') : !document.getElementById('game-over-screen').classList.contains('hidden'));
        const gameVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('game-screen') : !document.getElementById('game-screen').classList.contains('hidden'));
        
        if (victoryVisible || gameOverVisible) {
            // 勝利/失敗畫面：不恢復遊戲音樂，避免修羅音樂污染
            return;
        }
        
        if (gameVisible && !Game.isGameOver && !isAnyMenuOpen()) {
            Game.resume();
            AudioManager.setMuted && AudioManager.setMuted(false);
        } else if (isAnyMenuOpen()) {
            // 升級/技能覆蓋層開啟：保持暫停但解除靜音，確保 BGM 與音效恢復
            Game.pause(false);
            AudioManager.setMuted && AudioManager.setMuted(false);
        } else if (isMenuVisible()) {
            // 解除靜音並恢復選單音樂（不觸發遊戲音樂）
            AudioManager.isMuted = false;
            try {
                if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                    AudioScene.enterMenu();
                } else if (AudioManager.playMusic) {
                    AudioManager.playMusic('menu_music');
                }
            } catch (_) {}
        }
    });
}

// ESC 技能頁面切換
function setupSkillsMenuToggle() {
    // 註冊 ESC 鍵處理器到 KeyboardRouter
    KeyboardRouter.register('game', 'Escape', (e) => {
        // 僅在「生存模式」開啟全域技能頁（避免污染挑戰/闖關/防禦）
        try {
            const activeId = Utils.getActiveModeId();
            if (activeId !== 'survival') {
                return; // 非生存模式不處理 ESC（交由各模式自己的 ESC 菜單）
            }
        } catch(_) {}
        
        const gameVisible = !document.getElementById('game-screen').classList.contains('hidden');
        const isGameOver = Game.isGameOver;
        const levelUpOpen = (() => { const el = document.getElementById('level-up-menu'); return el && !el.classList.contains('hidden'); })();
        if (!gameVisible || isGameOver || levelUpOpen) return;

        const skillsEl = document.getElementById('skills-menu');
        if (!skillsEl) return;
        const open = !skillsEl.classList.contains('hidden');
        if (open) {
            UI.hideSkillsMenu();
        } else {
            UI.showSkillsMenu();
        }
    });
}

// 選角格由 CONFIG.CHAR_SELECT_SLOTS 生成。順序凍結（含三格空位、森森最後）。
function renderCharSelectGrid() {
    const grid = document.querySelector('#character-select-screen .char-grid');
    if (!grid || grid.getAttribute('data-rendered') === '1') return;
    const slots = (typeof CONFIG !== 'undefined' && CONFIG.CHAR_SELECT_SLOTS) ? CONFIG.CHAR_SELECT_SLOTS : [];
    if (!Array.isArray(slots) || !slots.length) return;
    const byId = {};
    ((CONFIG && CONFIG.CHARACTERS) || []).forEach(function (c) { byId[c.id] = c; });
    grid.innerHTML = '';
    slots.forEach(function (id) {
        if (!id) {
            const empty = document.createElement('div');
            empty.className = 'char-slot empty';
            grid.appendChild(empty);
            return;
        }
        const ch = byId[id];
        if (!ch) return;
        const btn = document.createElement('button');
        btn.className = 'char-card selectable';
        btn.setAttribute('data-char-id', ch.id);
        const img = document.createElement('img');
        img.src = ch.selectCardSrc || ('assets/images/' + (ch.avatarImageKey || 'player1-2') + '.png');
        img.alt = ch.name || '';
        const name = document.createElement('div');
        name.className = 'char-name';
        name.textContent = ch.name || '';
        btn.appendChild(img);
        btn.appendChild(name);
        grid.appendChild(btn);
    });
    grid.setAttribute('data-rendered', '1');
}

// 選角介面事件與確認流程（回復原行為：單擊僅更新預覽，雙擊/空白鍵進入選圖）
function setupCharacterSelection() {
    renderConfirmDialogs();
    renderCharSelectGrid();
    const screen = document.getElementById('character-select-screen');
    const cards = screen.querySelectorAll('.char-card.selectable');
    const previewImg = document.getElementById('char-preview-img');
    const previewName = document.getElementById('char-preview-name');
    const previewDesc = document.getElementById('char-preview-desc');
    let picked = null;
    let lastTapTime = 0;

    // 角色解鎖狀態管理（使用獨立 localStorage 鍵 'unlocked_characters'，會包含在引繼碼中）
    const CHAR_UNLOCK_KEY = 'unlocked_characters';
    const loadUnlockedCharacters = () => {
        try {
            const raw = localStorage.getItem(CHAR_UNLOCK_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(arr)) return ['margaret']; // 預設第一位角色解鎖
            // 確保第一位角色永遠可用
            if (!arr.includes('margaret')) arr.push('margaret');
            return arr;
        } catch (_) {
            return ['margaret'];
        }
    };
    const saveUnlockedCharacters = (list) => {
        try {
            const arr = Array.isArray(list) ? list.slice() : [];
            if (!arr.includes('margaret')) arr.push('margaret');
            localStorage.setItem(CHAR_UNLOCK_KEY, JSON.stringify(arr));
        } catch (_) {}
    };
    const unlockedSet = new Set(loadUnlockedCharacters());
    const isUnlocked = (id, ch) => {
        // 若角色未設定解鎖價格或價格<=0，視為預設解鎖
        if (ch && (!ch.unlockCost || ch.unlockCost <= 0)) return true;
        return unlockedSet.has(id);
    };
    // 引繼碼套用後刷新角色：選角畫面的解鎖名單只在進頁時讀一次，不刷新的話卡片還是鎖的。
    window.refreshUnlockedCharacterCards = () => {
        unlockedSet.clear();
        loadUnlockedCharacters().forEach((id) => unlockedSet.add(id));
        const charScreen = document.getElementById('character-select-screen');
        if (charScreen) {
            charScreen.querySelectorAll('.char-card.selectable').forEach((card) => {
                const id = card.getAttribute('data-char-id');
                const ch = (CONFIG.CHARACTERS || []).find(c => c.id === id);
                if (!ch) return;
                const unlocked = isUnlocked(id, ch);
                if (unlocked) {
                    card.classList.remove('locked');
                    const img = card.querySelector('img');
                    if (img) img.classList.remove('grayscale');
                } else {
                    card.classList.add('locked');
                    const img = card.querySelector('img');
                    if (img) img.classList.add('grayscale');
                }
            });
        }
        try {
            if (typeof window.__refreshTeamCharacterList === 'function') window.__refreshTeamCharacterList();
        } catch (_) {}
    };
    const unlockCharacter = (id) => {
        if (!unlockedSet.has(id)) {
            unlockedSet.add(id);
            saveUnlockedCharacters(Array.from(unlockedSet));
        }
    };

    const updatePreview = (ch) => {
        if (!ch) return;
        picked = ch;
        const key = ch.avatarImageKey || 'player';
        const imgObj = (Game.images && Game.images[key]) ? Game.images[key] : null;
        if (previewImg) previewImg.src = imgObj ? imgObj.src : `assets/images/${key}.png`;
        if (previewName) previewName.textContent = ch.name || '角色';
        if (previewDesc) previewDesc.textContent = ch.description || '角色介紹';

        // 渲染專屬技能圖示（依介紹文字解析）
        const skillsBox = document.getElementById('char-preview-skills');
        if (skillsBox) {
            skillsBox.innerHTML = '';
            const descText = ch.description || '';
            const m = descText.match(/專屬技能：(.+?)(?:[，。\n]|$)/);
            let names = [];
            if (m && m[1]) {
                names = m[1].split(/[、，\s]+/).map(s => s.trim()).filter(Boolean);
            }
            // 以 CONFIG.WEAPONS 的中文名稱比對對應 type
            const nameToType = {};
            try {
                Object.keys(CONFIG.WEAPONS || {}).forEach(t => {
                    const cfg = CONFIG.WEAPONS[t];
                    if (cfg && cfg.NAME) nameToType[cfg.NAME] = t;
                });
            } catch (_) {}
            // iconMap 是「角色預覽用 UI 圖示」：走 <img src="assets/..."> 直接載入，與 Game.images 預載無直接關係
            // 集中由 CONFIG.UI.SKILL_ICONS 提供，避免 main.js / ui.js 各自維護一份造成誤導
            const iconMap = (CONFIG && CONFIG.UI && CONFIG.UI.SKILL_ICONS) ? CONFIG.UI.SKILL_ICONS : {};
            names.filter(n => nameToType[n]).forEach(n => {
                const type = nameToType[n];
                const iconSrc = iconMap[type] || 'assets/images/A1.png';
                const chip = document.createElement('div');
                chip.className = 'skill-chip';
                chip.innerHTML = `<div class="chip-icon"><img src="${iconSrc}" alt="${n}" /></div><div class="chip-name">${n}</div>`;
                skillsBox.appendChild(chip);
            });
        }
    };

    cards.forEach(card => {
        const id = card.getAttribute('data-char-id');
        const ch = (CONFIG.CHARACTERS || []).find(c => c.id === id);
        if (!ch) return;

        // 初始根據解鎖狀態調整卡片外觀（簡單使用 locked 類別與灰階樣式）
        const refreshCardLockState = () => {
            const unlocked = isUnlocked(id, ch);
            if (unlocked) {
                card.classList.remove('locked');
                const img = card.querySelector('img');
                if (img) img.classList.remove('grayscale');
            } else {
                card.classList.add('locked');
                const img = card.querySelector('img');
                if (img) img.classList.add('grayscale');
            }
        };
        refreshCardLockState();

        // 顯示角色解鎖確認對話框
        const showCharacterConfirm = (card, character) => {
            const confirmEl = document.getElementById('character-confirm');
            const titleEl = document.getElementById('character-confirm-title');
            const descEl = document.getElementById('character-confirm-desc');
            if (!confirmEl) return;
            document.querySelectorAll('#character-select-screen .char-card.active').forEach(el => { el.classList.remove('active'); });
            card.classList.add('active');
            const price = character.unlockCost || 0;
            if (titleEl && card.querySelector('.char-name')) {
                titleEl.textContent = `解鎖${card.querySelector('.char-name').textContent}`;
            }
            if (descEl) {
                descEl.textContent = price > 0 ? `使用${price}金幣解鎖該角色？` : '解鎖該角色？';
            }
            confirmEl.classList.remove('hidden');
        };
        
        // 隱藏角色解鎖確認對話框
        const hideCharacterConfirm = () => {
            const confirmEl = document.getElementById('character-confirm');
            if (confirmEl) {
                confirmEl.classList.add('hidden');
            }
        };
        
        const tryUnlockCharacter = () => {
            const unlocked = isUnlocked(id, ch);
            if (unlocked) return true;
            const price = ch.unlockCost || 0;
            // 若設定了解鎖價格，檢查金幣是否足夠
            if (price > 0) {
                const currentCoins = Game.coins || 0;
                if (currentCoins < price) {
                    return false;
                }
                // 顯示確認對話框
                showCharacterConfirm(card, ch);
                return false; // 返回false，等待確認
            }
            return true;
        };
        
        // 執行角色解鎖（確認後調用）
        const executeUnlockCharacter = () => {
            const unlocked = isUnlocked(id, ch);
            if (unlocked) return true;
            const price = ch.unlockCost || 0;
            if (price > 0) {
                const currentCoins = Game.coins || 0;
                if (currentCoins < price) {
                    return false;
                }
                // 扣除金幣並即時存檔與更新 UI（金幣鍵名與 SaveCode 結構保持不變）
                Game.coins = Math.max(0, Math.floor(currentCoins - price));
                try { Game.saveCoins(); } catch (_) {}
                try { if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) UI.updateCoinsDisplay(Game.coins); } catch (_) {}
                unlockCharacter(id);
                refreshCardLockState();
                hideCharacterConfirm();
                return true;
            }
            return true;
        };

        // 單擊：僅更新預覽（若未解鎖，仍可查看介紹）
        card.addEventListener('click', () => {
            playClick2();
            updatePreview(ch);
        });
        // 雙擊：若角色已解鎖則進入選圖；否則顯示解鎖確認對話框
        card.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isUnlocked(id, ch)) {
                // 顯示確認對話框
                showCharacterConfirm(card, ch);
                return; // 不繼續，等待確認
            }
            // 只有已解鎖才進入選圖
            Game.selectedCharacter = ch;
            show(DOMCache.get('map-select-screen'));
        });
        // 觸控雙擊（兩次點擊間隔<=300ms）：雙擊進入選圖，單擊更新預覽
        card.addEventListener('touchend', () => {
            const now = Date.now();
            if (now - lastTapTime <= 300) {
                if (!isUnlocked(id, ch)) {
                    // 顯示確認對話框
                    showCharacterConfirm(card, ch);
                    lastTapTime = now;
                    return; // 不繼續，等待確認
                }
                // 只有已解鎖才進入選圖
                Game.selectedCharacter = ch;
                show(DOMCache.get('map-select-screen'));
            } else {
                updatePreview(ch);
            }
            lastTapTime = now;
        }, { passive: true });
    });
    
    // 綁定角色解鎖確認對話框按鈕事件
    const characterConfirmOk = document.getElementById('character-confirm-ok');
    const characterConfirmCancel = document.getElementById('character-confirm-cancel');
    if (characterConfirmOk) {
        characterConfirmOk.addEventListener('click', () => {
            const activeCard = document.querySelector('#character-select-screen .char-card.active');
            if (activeCard) {
                const charId = activeCard.getAttribute('data-char-id');
                const ch = (CONFIG.CHARACTERS || []).find(c => c.id === charId);
                if (ch) {
                    // 執行解鎖（使用閉包中的函數，確保 unlockedSet 被正確更新）
                    const price = ch.unlockCost || 0;
                    if (price > 0) {
                        const currentCoins = Game.coins || 0;
                        if (currentCoins >= price) {
                            Game.coins = Math.max(0, Math.floor(currentCoins - price));
                            try { Game.saveCoins(); } catch (_) {}
                            try { if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) UI.updateCoinsDisplay(Game.coins); } catch (_) {}
                            // 使用閉包中的 unlockCharacter 函數，確保 unlockedSet 被更新
                            unlockCharacter(charId);
                            // 更新卡片狀態（使用閉包中的 refreshCardLockState 邏輯）
                            activeCard.classList.remove('locked');
                            const img = activeCard.querySelector('img');
                            if (img) img.classList.remove('grayscale');
                            // 隱藏確認對話框
                            const confirmEl = document.getElementById('character-confirm');
                            if (confirmEl) confirmEl.classList.add('hidden');
                            // 進入選圖
                            Game.selectedCharacter = ch;
                            show(DOMCache.get('map-select-screen'));
                        } else {
                            // 金幣不足，隱藏確認對話框
                            const confirmEl = document.getElementById('character-confirm');
                            if (confirmEl) confirmEl.classList.add('hidden');
                        }
                    } else {
                        // 無需解鎖，直接進入選圖
                        const confirmEl = document.getElementById('character-confirm');
                        if (confirmEl) confirmEl.classList.add('hidden');
                        Game.selectedCharacter = ch;
                        show(DOMCache.get('map-select-screen'));
                    }
                }
            }
        });
    }
    if (characterConfirmCancel) {
        characterConfirmCancel.addEventListener('click', () => {
            const confirmEl = document.getElementById('character-confirm');
            if (confirmEl) confirmEl.classList.add('hidden');
        });
    }

    // 空白鍵：在選角畫面時，若已有 picked，檢查是否已解鎖後進入選圖；若確認對話框開啟，則確認解鎖
    KeyboardRouter.register('character-select', 'Space', (e) => {
        e.preventDefault();
        const confirmDialog = document.getElementById('character-confirm');
        if (confirmDialog && !confirmDialog.classList.contains('hidden')) {
            // 若確認對話框開啟，觸發確認按鈕
            if (characterConfirmOk) characterConfirmOk.click();
            return;
        }
        if (picked) {
            // 檢查角色是否已解鎖
            const charId = picked.id;
            const CHAR_UNLOCK_KEY = 'unlocked_characters';
            const loadUnlockedCharacters = () => {
                try {
                    const raw = localStorage.getItem(CHAR_UNLOCK_KEY);
                    const arr = raw ? JSON.parse(raw) : [];
                    if (!Array.isArray(arr)) return ['margaret'];
                    if (!arr.includes('margaret')) arr.push('margaret');
                    return arr;
                } catch (_) {
                    return ['margaret'];
                }
            };
            const unlockedSet = new Set(loadUnlockedCharacters());
            const isUnlocked = (id, ch) => {
                if (ch && (!ch.unlockCost || ch.unlockCost <= 0)) return true;
                return unlockedSet.has(id);
            };
            // 只有已解鎖的角色才能進入選圖
            if (isUnlocked(charId, picked)) {
                Game.selectedCharacter = picked;
                playClick();
                show(DOMCache.get('map-select-screen'));
            } else {
                // 未解鎖：顯示確認對話框
                const activeCard = document.querySelector(`#character-select-screen .char-card[data-char-id="${charId}"]`);
                if (activeCard) {
                    const showCharacterConfirm = (card, character) => {
                        const confirmEl = document.getElementById('character-confirm');
                        const titleEl = document.getElementById('character-confirm-title');
                        const descEl = document.getElementById('character-confirm-desc');
                        if (!confirmEl) return;
                        document.querySelectorAll('#character-select-screen .char-card.active').forEach(el => { el.classList.remove('active'); });
                        card.classList.add('active');
                        const price = character.unlockCost || 0;
                        if (titleEl && card.querySelector('.char-name')) {
                            titleEl.textContent = `解鎖${card.querySelector('.char-name').textContent}`;
                        }
                        if (descEl) {
                            descEl.textContent = price > 0 ? `使用${price}金幣解鎖該角色？` : '解鎖該角色？';
                        }
                        confirmEl.classList.remove('hidden');
                    };
                    showCharacterConfirm(activeCard, picked);
                }
            }
        }
    });
    
    // ESC：返回開始畫面（優先關閉角色確認對話框）
    KeyboardRouter.register('character-select', 'Escape', (e) => {
        e.preventDefault();
        const confirmDialog = document.getElementById('character-confirm');
        if (confirmDialog && !confirmDialog.classList.contains('hidden')) {
            // 若確認對話框開啟，先關閉對話框
            if (characterConfirmCancel) characterConfirmCancel.click();
            return;
        }
        const isVisible = (el) => el && !el.classList.contains('hidden');
        const mapScreen = document.getElementById('map-select-screen');
        const diffScreen = document.getElementById('difficulty-select-screen');
        const desertDiffScreen = document.getElementById('desert-difficulty-select-screen');
        // 若覆蓋層已開啟，交由全域 ESC 回退處理，不在此攔截
        if (isVisible(mapScreen) || isVisible(diffScreen) || isVisible(desertDiffScreen)) return;
        const startScreen = document.getElementById('start-screen');
        const charScreen = document.getElementById('character-select-screen');
        if (startScreen && charScreen) {
            playClick();
            switchScreen(charScreen, startScreen);
        }
    });
}

// 地圖與難度選擇事件
// 選圖格由 CONFIG.MAP_SELECT_GRIDS 生成。未開放格、闖關「(施工中)」、主線卡名「冒險村莊」凍結。
// 選圖格容器由 MAP_SELECT_GRIDS 的 key 生成。生存格預設顯示，其餘 hidden。須在 renderMapSelectGrids 之前。
function renderMapGridHosts() {
    const main = document.querySelector('#map-select-screen .map-main');
    if (!main || main.getAttribute('data-grid-hosts') === '1') return;
    const grids = (typeof CONFIG !== 'undefined' && CONFIG.MAP_SELECT_GRIDS) ? CONFIG.MAP_SELECT_GRIDS : null;
    if (!grids) return;
    const info = main.querySelector('.map-info');
    Object.keys(grids).forEach(function (gridId) {
        if (!gridId || document.getElementById(gridId)) return;
        const el = document.createElement('div');
        el.id = gridId;
        el.className = gridId === 'grid-survival' ? 'map-grid' : 'map-grid hidden';
        if (info) main.insertBefore(el, info);
        else main.appendChild(el);
    });
    main.setAttribute('data-grid-hosts', '1');
}

function renderMapSelectGrids() {
    const grids = (typeof CONFIG !== 'undefined' && CONFIG.MAP_SELECT_GRIDS) ? CONFIG.MAP_SELECT_GRIDS : null;
    if (!grids) return;
    const byId = {};
    ((CONFIG && CONFIG.MAPS) || []).forEach(function (m) { byId[m.id] = m; });
    const lockedSrc = 'assets/images/background3.jpg';
    Object.keys(grids).forEach(function (gridId) {
        const el = document.getElementById(gridId);
        if (!el || el.getAttribute('data-rendered') === '1') return;
        const slots = grids[gridId] || [];
        el.innerHTML = '';
        slots.forEach(function (slot) {
            if (!slot || !slot.id) return;
            const locked = !!slot.disabled;
            const cfg = byId[slot.id];
            const btn = document.createElement('button');
            btn.className = locked ? 'map-card disabled' : 'map-card selectable';
            btn.setAttribute('data-map-id', slot.id);
            const img = document.createElement('img');
            const nameText = slot.cardName || (locked ? '尚未開放' : ((cfg && (cfg.selectCardName || cfg.name)) || ''));
            const altText = slot.cardAlt || (locked ? '尚未開放' : ((cfg && (cfg.selectCardAlt || nameText)) || ''));
            img.src = locked ? lockedSrc : (slot.cardSrc || (cfg && cfg.selectCardSrc) || lockedSrc);
            img.alt = altText;
            const name = document.createElement('div');
            name.className = 'map-name';
            name.textContent = nameText;
            btn.appendChild(img);
            btn.appendChild(name);
            el.appendChild(btn);
        });
        el.setAttribute('data-rendered', '1');
    });
}

// 選圖左側模式鈕由 CONFIG.MODE_SELECT_BUTTONS 生成。順序與文案凍結。
function renderModeSelectButtons() {
    const menu = document.querySelector('#map-select-screen .map-menu');
    if (!menu || menu.getAttribute('data-modes-rendered') === '1') return;
    const slots = (typeof CONFIG !== 'undefined' && CONFIG.MODE_SELECT_BUTTONS) ? CONFIG.MODE_SELECT_BUTTONS : [];
    Array.prototype.slice.call(menu.querySelectorAll('.mode-btn')).forEach(function (btn) {
        try { menu.removeChild(btn); } catch (_) {}
    });
    slots.forEach(function (slot) {
        if (!slot || !slot.mode) return;
        const btn = document.createElement('button');
        btn.id = 'mode-' + slot.mode;
        btn.className = slot.primary ? 'mode-btn primary' : 'mode-btn';
        const label = slot.label || '';
        btn.setAttribute('aria-label', label);
        btn.textContent = label;
        menu.appendChild(btn);
    });
    menu.setAttribute('data-modes-rendered', '1');
}

function _appendRegardingLinks(host, slots) {
    if (!host || host.getAttribute('data-rendered') === '1') return;
    host.innerHTML = '';
    (slots || []).forEach(function (slot, i) {
        if (!slot || !slot.href) return;
        if (i) host.appendChild(document.createTextNode('、'));
        const a = document.createElement('a');
        a.href = slot.href;
        a.setAttribute('target', 'blank');
        a.setAttribute('rel', 'noopener');
        a.textContent = slot.label || '';
        host.appendChild(a);
    });
    host.setAttribute('data-rendered', '1');
}

// 引繼碼表單由 BACKUP_SECTIONS 生成。主體上下兩塊、冒險同一塊。不改 SaveCode。
function renderBackupSections() {
    const host = document.getElementById('backup-sections-host');
    if (!host || host.getAttribute('data-rendered') === '1') return;
    const slots = (typeof CONFIG !== 'undefined' && CONFIG.BACKUP_SECTIONS) ? CONFIG.BACKUP_SECTIONS : [];
    host.innerHTML = '';
    const h2Style = 'margin:0 0 6px;';
    const fieldStyle = 'width:100%;';
    const copyStyle = 'margin-top:6px;';
    function addOut(parent, slot) {
        const box = document.createElement('div');
        box.setAttribute('style', 'margin-top:8px;');
        const label = document.createElement('label');
        label.setAttribute('for', slot.outId);
        label.textContent = slot.outLabel || '';
        const input = document.createElement('input');
        input.id = slot.outId;
        input.type = 'text';
        input.readOnly = true;
        input.placeholder = slot.outPlaceholder || '';
        input.setAttribute('style', fieldStyle);
        const copy = document.createElement('button');
        copy.id = slot.copyId;
        copy.className = 'ghost';
        copy.setAttribute('style', copyStyle);
        copy.textContent = '複製';
        box.appendChild(label);
        box.appendChild(input);
        box.appendChild(copy);
        parent.appendChild(box);
    }
    slots.forEach(function (slot) {
        if (!slot || !slot.layout) return;
        const content = document.createElement('div');
        content.className = 'content';
        if (slot.contentStyle) content.setAttribute('style', slot.contentStyle);
        const title = document.createElement('h2');
        title.setAttribute('style', h2Style);
        title.textContent = slot.title || '';
        const desc = document.createElement('p');
        desc.textContent = slot.desc || '';
        content.appendChild(title);
        content.appendChild(desc);
        if (slot.layout === 'split-out') {
            const gen = document.createElement('button');
            gen.id = slot.genId;
            gen.className = 'primary';
            gen.textContent = slot.genLabel || '';
            content.appendChild(gen);
            addOut(content, slot);
        } else if (slot.layout === 'split-in') {
            const label = document.createElement('label');
            label.setAttribute('for', slot.inId);
            label.textContent = slot.inLabel || '';
            const input = document.createElement('input');
            input.id = slot.inId;
            input.type = 'text';
            input.placeholder = slot.inPlaceholder || '';
            input.setAttribute('style', fieldStyle);
            const apply = document.createElement('button');
            apply.id = slot.applyId;
            apply.className = 'primary';
            apply.setAttribute('style', copyStyle);
            apply.textContent = slot.applyLabel || '';
            content.appendChild(label);
            content.appendChild(input);
            content.appendChild(apply);
        } else if (slot.layout === 'nested') {
            const genWrap = document.createElement('div');
            genWrap.setAttribute('style', 'margin-bottom:12px;');
            const gen = document.createElement('button');
            gen.id = slot.genId;
            gen.className = 'primary';
            gen.textContent = slot.genLabel || '';
            genWrap.appendChild(gen);
            addOut(genWrap, slot);
            content.appendChild(genWrap);
            const inWrap = document.createElement('div');
            const inTitle = document.createElement('h2');
            inTitle.setAttribute('style', h2Style);
            inTitle.textContent = slot.inTitle || '';
            const inDesc = document.createElement('p');
            inDesc.setAttribute('style', 'margin:0 0 4px;');
            inDesc.textContent = slot.inDesc || '';
            const label = document.createElement('label');
            label.setAttribute('for', slot.inId);
            label.textContent = slot.inLabel || '';
            const input = document.createElement('input');
            input.id = slot.inId;
            input.type = 'text';
            input.placeholder = slot.inPlaceholder || '';
            input.setAttribute('style', fieldStyle);
            const apply = document.createElement('button');
            apply.id = slot.applyId;
            apply.className = 'primary';
            apply.setAttribute('style', copyStyle);
            apply.textContent = slot.applyLabel || '';
            inWrap.appendChild(inTitle);
            inWrap.appendChild(inDesc);
            inWrap.appendChild(label);
            inWrap.appendChild(input);
            inWrap.appendChild(apply);
            content.appendChild(inWrap);
        }
        host.appendChild(content);
    });
    host.setAttribute('data-rendered', '1');
}

// 序號兌換／3D 密碼殼由 PROMPT_MODALS 生成。文案與輸入型別凍結。流程不合一。
function renderPromptModals() {
    const slots = (typeof CONFIG !== 'undefined' && CONFIG.PROMPT_MODALS) ? CONFIG.PROMPT_MODALS : [];
    slots.forEach(function (slot) {
        if (!slot || !slot.hostId || !slot.id) return;
        const host = document.getElementById(slot.hostId);
        if (!host || host.getAttribute('data-rendered') === '1') return;
        host.innerHTML = '';
        const overlay = document.createElement('div');
        overlay.id = slot.id;
        overlay.className = 'modal hidden';
        if (slot.overlayStyle) overlay.setAttribute('style', slot.overlayStyle);
        const card = document.createElement('div');
        card.className = 'modal-card';
        if (slot.cardStyle) card.setAttribute('style', slot.cardStyle);
        const title = document.createElement('h2');
        title.textContent = slot.title || '';
        const form = document.createElement('div');
        form.className = 'redeem-code-form';
        const label = document.createElement('label');
        label.setAttribute('for', slot.inputId || '');
        label.textContent = slot.label || '';
        const input = document.createElement('input');
        input.type = slot.inputType || 'text';
        if (slot.inputId) input.id = slot.inputId;
        input.placeholder = slot.placeholder || '';
        input.setAttribute('maxlength', '50');
        const message = document.createElement('div');
        if (slot.messageId) message.id = slot.messageId;
        message.className = 'redeem-code-message';
        form.appendChild(label);
        form.appendChild(input);
        form.appendChild(message);
        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const ok = document.createElement('button');
        if (slot.okId) ok.id = slot.okId;
        ok.className = 'ghost';
        ok.textContent = slot.okLabel || '';
        const cancel = document.createElement('button');
        if (slot.cancelId) cancel.id = slot.cancelId;
        cancel.className = 'ghost';
        cancel.textContent = slot.cancelLabel || '';
        actions.appendChild(ok);
        actions.appendChild(cancel);
        card.appendChild(title);
        card.appendChild(form);
        card.appendChild(actions);
        overlay.appendChild(card);
        host.appendChild(overlay);
        host.setAttribute('data-rendered', '1');
    });
}

// 角色／天賦解鎖確認殼由 CONFIRM_DIALOGS 生成。標題／預設說明／確認取消凍結。解鎖邏輯不合一。
function renderConfirmDialogs() {
    const slots = (typeof CONFIG !== 'undefined' && CONFIG.CONFIRM_DIALOGS) ? CONFIG.CONFIRM_DIALOGS : [];
    slots.forEach(function (slot) {
        if (!slot || !slot.prefix || !slot.hostId) return;
        const host = document.getElementById(slot.hostId);
        if (!host || host.getAttribute('data-rendered') === '1') return;
        host.innerHTML = '';
        const overlay = document.createElement('div');
        overlay.id = slot.prefix + '-confirm';
        overlay.className = 'hidden';
        const dialog = document.createElement('div');
        dialog.className = 'talent-dialog';
        const title = document.createElement('div');
        title.className = 'talent-dialog-title';
        title.id = slot.prefix + '-confirm-title';
        title.textContent = slot.title || '';
        const desc = document.createElement('div');
        desc.className = 'talent-dialog-desc';
        desc.id = slot.prefix + '-confirm-desc';
        desc.textContent = slot.desc || '';
        const actions = document.createElement('div');
        actions.className = 'talent-dialog-actions';
        const ok = document.createElement('button');
        ok.id = slot.prefix + '-confirm-ok';
        ok.className = 'primary';
        ok.textContent = '確認';
        const cancel = document.createElement('button');
        cancel.id = slot.prefix + '-confirm-cancel';
        cancel.className = 'ghost';
        cancel.textContent = '取消';
        actions.appendChild(ok);
        actions.appendChild(cancel);
        dialog.appendChild(title);
        dialog.appendChild(desc);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        host.appendChild(overlay);
        host.setAttribute('data-rendered', '1');
    });
}

// Regarding 角色／繪師連結由 CONFIG 生成。顯示名與 CHARACTERS.name 可不同。
function renderRegardingLinks() {
    const chars = (typeof CONFIG !== 'undefined' && CONFIG.REGARDING_CHAR_LINKS) ? CONFIG.REGARDING_CHAR_LINKS : [];
    const artists = (typeof CONFIG !== 'undefined' && CONFIG.REGARDING_ARTIST_LINKS) ? CONFIG.REGARDING_ARTIST_LINKS : [];
    _appendRegardingLinks(document.getElementById('regarding-char-host'), chars);
    _appendRegardingLinks(document.getElementById('regarding-artist-host'), artists);
}

// 開始畫面左側文案由 START_INFO_PAGES 生成。badge／字面凍結。
function renderStartInfoPages() {
    const pages = (typeof CONFIG !== 'undefined' && CONFIG.START_INFO_PAGES) ? CONFIG.START_INFO_PAGES : null;
    if (!pages) return;
    Object.keys(pages).forEach(function (key) {
        const el = document.getElementById('tpl-' + key);
        const page = pages[key];
        if (!el || !page || el.getAttribute('data-info-rendered') === '1') return;
        el.innerHTML = '';
        const h2 = document.createElement('h2');
        h2.textContent = page.title || '';
        const content = document.createElement('div');
        content.className = 'content';
        const ul = document.createElement('ul');
        ul.className = 'list';
        (page.items || []).forEach(function (item) {
            if (!item || !item.badge) return;
            const li = document.createElement('li');
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = item.badge;
            li.appendChild(badge);
            li.appendChild(document.createTextNode(' '));
            if (item.host) {
                const host = document.createElement('span');
                host.id = item.host;
                li.appendChild(host);
                if (item.suffix) li.appendChild(document.createTextNode(item.suffix));
            } else if (item.html) {
                const hold = document.createElement('span');
                hold.innerHTML = item.html;
                while (hold.firstChild) li.appendChild(hold.firstChild);
            }
            ul.appendChild(li);
        });
        content.appendChild(ul);
        el.appendChild(h2);
        el.appendChild(content);
        el.setAttribute('data-info-rendered', '1');
    });
}

// 開始畫面右側鈕由 START_MENU_BUTTONS 生成。順序與文案凍結。
function renderStartMenuButtons() {
    const menu = document.querySelector('#start-screen .start-menu');
    if (!menu || menu.getAttribute('data-start-menu-rendered') === '1') return;
    const slots = (typeof CONFIG !== 'undefined' && CONFIG.START_MENU_BUTTONS) ? CONFIG.START_MENU_BUTTONS : [];
    Array.prototype.slice.call(menu.querySelectorAll('.menu-btn')).forEach(function (btn) {
        try { menu.removeChild(btn); } catch (_) {}
    });
    slots.forEach(function (slot) {
        if (!slot || !slot.label) return;
        const btn = document.createElement('button');
        if (slot.id) btn.id = slot.id;
        btn.className = slot.primary ? 'menu-btn primary' : 'menu-btn ghost';
        if (slot.target) btn.setAttribute('data-target', slot.target);
        btn.textContent = slot.label;
        menu.appendChild(btn);
    });
    menu.setAttribute('data-start-menu-rendered', '1');
}

function isHardOnlyDifficultyMap(mapId) {
    const ids = (typeof CONFIG !== 'undefined' && CONFIG.DIFFICULTY_HARD_ONLY_MAP_IDS) ? CONFIG.DIFFICULTY_HARD_ONLY_MAP_IDS : ['desert', 'branch'];
    return ids.indexOf(mapId) !== -1;
}

// 難度畫面殼由 DIFFICULTY_SCREENS 生成。標題／返回 id 凍結。兩套畫面不合一。須在 renderDiffSelectGrids 之前。
function renderDifficultyScreens() {
    const host = document.getElementById('difficulty-screen-host');
    if (!host || host.getAttribute('data-rendered') === '1') return;
    const slots = (typeof CONFIG !== 'undefined' && CONFIG.DIFFICULTY_SCREENS) ? CONFIG.DIFFICULTY_SCREENS : [];
    host.innerHTML = '';
    host.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;');
    slots.forEach(function (slot) {
        if (!slot || !slot.id) return;
        const screen = document.createElement('div');
        screen.id = slot.id;
        screen.className = 'screen hidden';
        screen.style.pointerEvents = 'auto';
        const card = document.createElement('div');
        card.className = 'select-card';
        const title = document.createElement('h1');
        title.className = 'select-title';
        title.textContent = slot.title || '';
        const grid = document.createElement('div');
        grid.className = 'diff-grid';
        const actions = document.createElement('div');
        actions.className = 'select-actions';
        const back = document.createElement('button');
        if (slot.backId) back.id = slot.backId;
        back.className = 'ghost';
        back.textContent = '返回';
        actions.appendChild(back);
        card.appendChild(title);
        card.appendChild(grid);
        card.appendChild(actions);
        screen.appendChild(card);
        host.appendChild(screen);
    });
    host.setAttribute('data-rendered', '1');
}

// 難度卡由 DIFFICULTY_SELECT_GRIDS 生成。兩套畫面不合一。介紹／名稱凍結。
function renderDiffSelectGrids() {
    const grids = (typeof CONFIG !== 'undefined' && CONFIG.DIFFICULTY_SELECT_GRIDS) ? CONFIG.DIFFICULTY_SELECT_GRIDS : null;
    const diffs = (typeof CONFIG !== 'undefined' && CONFIG.DIFFICULTY) ? CONFIG.DIFFICULTY : {};
    if (!grids) return;
    Object.keys(grids).forEach(function (screenId) {
        const screen = document.getElementById(screenId);
        const host = screen ? screen.querySelector('.diff-grid') : null;
        if (!host || host.getAttribute('data-rendered') === '1') return;
        host.innerHTML = '';
        (grids[screenId] || []).forEach(function (id) {
            const d = diffs[id];
            if (!d) return;
            const btn = document.createElement('button');
            btn.className = 'diff-card selectable';
            btn.setAttribute('data-diff-id', id);
            const label = document.createElement('span');
            label.className = 'diff-label';
            label.textContent = d.NAME || id;
            const intro = document.createElement('div');
            intro.className = 'diff-intro';
            intro.innerHTML = d.selectIntro || '';
            btn.appendChild(label);
            btn.appendChild(intro);
            host.appendChild(btn);
        });
        host.setAttribute('data-rendered', '1');
    });
}

function setupMapAndDifficultySelection() {
    renderMapGridHosts();
    renderMapSelectGrids();
    renderModeSelectButtons();
    renderDifficultyScreens();
    renderDiffSelectGrids();
    const mapScreen = document.getElementById('map-select-screen');
    const diffScreen = document.getElementById('difficulty-select-screen');
    const desertDiffScreen = document.getElementById('desert-difficulty-select-screen');
    // 获取所有地图卡片（包括隐藏的3D模式卡片）
    const mapCards = mapScreen.querySelectorAll('.map-card.selectable, .map-card.disabled');
    // 修正：正確的地圖介紹元素ID為 map-desc（避免更新失效）
    const mapDescEl = document.getElementById('map-desc');
    const mapCancel = document.getElementById('map-cancel');
    const diffCancel = document.getElementById('diff-cancel');
    let selectedMapCfg = null;
    let lastTapTime = 0;
    // 將 selectedDiffId 的宣告提前，避免在 confirmMap 中賦值時落入 TDZ（暫時性死區）導致錯誤
    let selectedDiffId = null;

    // 模式切換：grid／鈕都跟 MODE_SELECT_BUTTONS。未知 mode 當生存（與改前 else 相同）。
    const modeSlots = (typeof CONFIG !== 'undefined' && CONFIG.MODE_SELECT_BUTTONS) ? CONFIG.MODE_SELECT_BUTTONS : [];
    const switchMode = (mode) => {
        playClick2();
        const known = modeSlots.some(function (slot) { return slot && slot.mode === mode; });
        const active = known ? mode : 'survival';
        modeSlots.forEach(function (slot) {
            if (!slot || !slot.mode) return;
            const grid = document.getElementById('grid-' + slot.mode);
            if (grid) {
                if (slot.mode === active) show(grid);
                else hide(grid);
            }
            const btn = document.getElementById('mode-' + slot.mode);
            if (btn) {
                if (slot.mode === active) btn.classList.add('primary');
                else btn.classList.remove('primary');
            }
        });
        if (mapDescEl) mapDescEl.textContent = '提示：點擊地圖顯示介紹，雙擊或空白鍵確認';
        selectedMapCfg = null;
    };
    modeSlots.forEach(function (slot) {
        if (!slot || !slot.mode) return;
        const btn = document.getElementById('mode-' + slot.mode);
        if (btn) btn.addEventListener('click', function () { switchMode(slot.mode); });
    });

    // confirmMap 進場路徑不要合一：主線先 TransitionLayer、3D 要密碼、防禦多 isDefenseMap、冒險沒有後備畫面。
    const gridVisible = (mode) => {
        const grid = document.getElementById('grid-' + mode);
        return !!(grid && !grid.classList.contains('hidden'));
    };
    const hideMapSelectMenus = () => {
        hide(mapScreen);
        hide(diffScreen);
        if (desertDiffScreen) hide(desertDiffScreen);
        hide(DOMCache.get('character-select-screen'));
    };
    const startModeSkipDifficulty = (modeId) => {
        hideMapSelectMenus();
        if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
            window.GameModeManager.start(modeId, {
                selectedCharacter: Game.selectedCharacter,
                selectedMap: Game.selectedMap
            });
        } else {
            show(DOMCache.get('game-screen'));
        }
    };

    const showMapDesc = (cfg, card) => {
        Game.selectedMap = cfg || null;
        playClick2();
        if (mapDescEl && cfg && typeof cfg.selectDesc === 'string' && cfg.selectDesc) {
            mapDescEl.textContent = cfg.selectDesc;
        }
    };
    const confirmMap = () => {
        if (!selectedMapCfg) return;
        // 維護備註：
        // - 僅允許一個難度視窗同時顯示；先隱藏所有難度視窗，避免互相覆蓋造成殘留或誤判。
        // - 不更動任何玩家可見文案（保持結果一致）。
        // - SaveCode（引繼碼）未涉入此流程，不更動其鍵名/結構/簽章。

        // 明確設置選定地圖（避免僅在單擊時更新 selectedMap）
        Game.selectedMap = selectedMapCfg;

        // 先關閉所有難度覆蓋層，防止交疊
        hide(diffScreen);
        if (desertDiffScreen) hide(desertDiffScreen);

        // 判定順序凍結：主線 → 挑戰 → 闖關 → 防禦 → 冒險 → 3D → 否則生存難度。
        if (gridVisible('main')) {
            try {
              if (typeof window !== 'undefined' && window.TransitionLayer && typeof window.TransitionLayer.show === 'function') {
                window.TransitionLayer.show();
              }
            } catch(e) {}
            hideMapSelectMenus();
            if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
                window.GameModeManager.start('main', {
                    selectedCharacter: Game.selectedCharacter,
                    selectedMap: Game.selectedMap
                });
            } else {
                show(DOMCache.get('game-screen'));
            }
            return;
        }

        if (gridVisible('challenge')) {
            startModeSkipDifficulty('challenge');
            return;
        }

        if (gridVisible('stage')) {
            startModeSkipDifficulty('stage');
            return;
        }

        const isDefenseMap = selectedMapCfg && typeof selectedMapCfg.id === 'string' && selectedMapCfg.id.indexOf('defense') === 0;
        if (gridVisible('defense') || isDefenseMap) {
            hideMapSelectMenus();
            let started = false;
            try {
                if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
                    window.GameModeManager.start('defense', {
                        selectedCharacter: Game.selectedCharacter,
                        selectedMap: Game.selectedMap
                    });
                    started = true;
                }
            } catch (_) {}
            if (!started) {
                show(DOMCache.get('game-screen'));
            }
            return;
        }

        if (gridVisible('adventure')) {
            hideMapSelectMenus();
            try {
                if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
                    window.GameModeManager.start('adventure', {
                        selectedCharacter: Game.selectedCharacter,
                        selectedMap: Game.selectedMap
                    });
                }
            } catch(_) {}
            return;
        }

        if (gridVisible('3d')) {
            // 檢查是否為DEMO城市地圖
            if (selectedMapCfg && selectedMapCfg.id === '3d-demo-city') {
                // 顯示密碼輸入對話框
                const passwordOverlay = document.getElementById('password-overlay');
                const passwordInput = document.getElementById('password-input');
                const passwordMessage = document.getElementById('password-message');
                const passwordSubmit = document.getElementById('password-submit');
                const passwordClose = document.getElementById('password-close');
                
                if (passwordOverlay) {
                    passwordOverlay.classList.remove('hidden');
                    if (passwordInput) {
                        passwordInput.value = '';
                        passwordInput.focus();
                    }
                    if (passwordMessage) passwordMessage.textContent = '';
                    
                    // 處理密碼驗證
                    const handlePasswordSubmit = () => {
                        const password = passwordInput ? passwordInput.value.trim() : '';
                        if (password === 'DEMO') {
                            // 密碼正確，關閉對話框並啟動3D模式
                            passwordOverlay.classList.add('hidden');
                            hideMapSelectMenus();
                            
                            // 啟動3D模式
                            try {
                                if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
                                    window.GameModeManager.start('3d', {
                                        selectedCharacter: Game.selectedCharacter,
                                        selectedMap: Game.selectedMap
                                    });
                                }
                            } catch(e) {
                                console.error('啟動3D模式失敗:', e);
                            }
                            
                            // 移除事件監聽器
                            if (passwordSubmit) passwordSubmit.removeEventListener('click', handlePasswordSubmit);
                            if (passwordClose) passwordClose.removeEventListener('click', handlePasswordClose);
                            if (passwordInput) passwordInput.removeEventListener('keypress', handlePasswordKeyPress);
                        } else {
                            // 密碼錯誤
                            if (passwordMessage) passwordMessage.textContent = '密碼錯誤，請重新輸入';
                            if (passwordInput) {
                                passwordInput.value = '';
                                passwordInput.focus();
                            }
                        }
                    };
                    
                    const handlePasswordClose = () => {
                        passwordOverlay.classList.add('hidden');
                        if (passwordInput) passwordInput.value = '';
                        if (passwordMessage) passwordMessage.textContent = '';
                        // 移除事件監聽器
                        if (passwordSubmit) passwordSubmit.removeEventListener('click', handlePasswordSubmit);
                        if (passwordClose) passwordClose.removeEventListener('click', handlePasswordClose);
                        if (passwordInput) passwordInput.removeEventListener('keypress', handlePasswordKeyPress);
                    };
                    
                    const handlePasswordKeyPress = (e) => {
                        if (e.key === 'Enter') {
                            handlePasswordSubmit();
                        }
                    };
                    
                    // 綁定事件
                    if (passwordSubmit) passwordSubmit.addEventListener('click', handlePasswordSubmit);
                    if (passwordClose) passwordClose.addEventListener('click', handlePasswordClose);
                    if (passwordInput) passwordInput.addEventListener('keypress', handlePasswordKeyPress);
                }
            } else {
                // 其他3D地圖（尚未開放）
                playClick();
            }
            return;
        }

        // 顯示正確的難度視窗；宇宙/支部地圖僅困難/修羅
        // 難度視窗以覆蓋層形式疊在地圖選擇畫面上方（不隱藏 mapScreen）
        if (selectedMapCfg && isHardOnlyDifficultyMap(selectedMapCfg.id) && desertDiffScreen) {
            selectedDiffId = 'HARD';
            Game.selectedDifficultyId = 'HARD';
            show(desertDiffScreen);
        } else {
            selectedDiffId = 'EASY';
            Game.selectedDifficultyId = 'EASY';
            show(diffScreen);
        }
    };

    // 获取所有地图卡片（包括3D模式的地图卡片）
    const allMapCards = mapScreen.querySelectorAll('.map-card.selectable, .map-card.disabled');
    allMapCards.forEach(card => {
        const id = card.getAttribute('data-map-id');
        const cfg = (CONFIG.MAPS || []).find(m => m.id === id);
        const disabled = card.classList.contains('disabled');

        card.addEventListener('click', () => {
            if (disabled) {
                playClick();
                return;
            }
            selectedMapCfg = cfg;
            // 單擊：僅顯示地圖介紹（不進入難度視窗）
            showMapDesc(cfg, card);
        });
        card.addEventListener('dblclick', () => {
            if (disabled) return;
            selectedMapCfg = cfg;
            confirmMap();
        });
        card.addEventListener('touchend', () => {
            const now = Date.now();
            if (now - lastTapTime <= 300) {
                if (!disabled) {
                    selectedMapCfg = cfg;
                    confirmMap();
                }
            } else {
                if (!disabled) {
                    selectedMapCfg = cfg;
                    showMapDesc(cfg, card);
                }
            }
            lastTapTime = now;
        }, { passive: true });
    });

    KeyboardRouter.register('map-select', 'Space', (e) => {
        e.preventDefault();
        confirmMap();
    });

    if (mapCancel) {
        mapCancel.addEventListener('click', () => {
            // 返回選角：覆蓋視窗僅需隱藏自身；不切換底層畫面
            hide(mapScreen);
            // 輕量刷新：僅檢查並更新角色卡片狀態（避免返回後重複要求購買）
            // 只讀取一次 localStorage，只更新必要的 DOM 類，不重新創建元素
            const charScreen = document.getElementById('character-select-screen');
            if (charScreen) {
                const cards = charScreen.querySelectorAll('.char-card.selectable');
                // 只讀取一次 localStorage（不寫入）
                const CHAR_UNLOCK_KEY = 'unlocked_characters';
                let unlockedSet;
                try {
                    const raw = localStorage.getItem(CHAR_UNLOCK_KEY);
                    const arr = raw ? JSON.parse(raw) : [];
                    unlockedSet = new Set(Array.isArray(arr) ? arr : ['margaret']);
                    if (!unlockedSet.has('margaret')) unlockedSet.add('margaret');
                } catch (_) {
                    unlockedSet = new Set(['margaret']);
                }
                // 只更新角色卡片的 DOM 類（不重新創建元素）
                cards.forEach(card => {
                    const charId = card.getAttribute('data-char-id');
                    const ch = (CONFIG.CHARACTERS || []).find(c => c.id === charId);
                    if (!ch) return;
                    const isUnlocked = (ch && (!ch.unlockCost || ch.unlockCost <= 0)) || unlockedSet.has(charId);
                    if (isUnlocked) {
                        card.classList.remove('locked');
                        const img = card.querySelector('img');
                        if (img) img.classList.remove('grayscale');
                    } else {
                        card.classList.add('locked');
                        const img = card.querySelector('img');
                        if (img) img.classList.add('grayscale');
                    }
                });
            }
        });
    }

    const bindDiffCards = (cards, fallback) => {
        cards.forEach(card => {
            const id = card.getAttribute('data-diff-id') || fallback;
            card.addEventListener('click', () => {
                selectedDiffId = id;
                Game.selectedDifficultyId = id;
                playClick2();
            });
            card.addEventListener('dblclick', () => {
                selectedDiffId = id;
                startGameWithDifficulty(id, false);
            });
            bindDoubleTap(card, () => {
                selectedDiffId = id;
                startGameWithDifficulty(id, false);
            });
        });
    };
    const diffBack = document.getElementById('diff-back');
    const diffBackDesert = document.getElementById('diff-back-desert');

    const startGameWithDifficulty = (id, playSound = true) => {
        const useId = id || 'EASY';
        Game.selectedDifficultyId = useId;
        if (playSound) playClick();

        // 生存模式聯機（測試）：在進入遊戲前先讓玩家選擇「單人/聯機」與房間大廳
        // - 僅影響生存模式的啟動流程
        // - TURN 不可用時會直接提示無法連線，不會降級成會露 IP 的直連
        try {
            if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.startFlowFromMain === 'function') {
                window.SurvivalOnlineUI.startFlowFromMain({
                    selectedDifficultyId: useId,
                    selectedCharacter: Game.selectedCharacter,
                    selectedMap: Game.selectedMap
                });
                return;
            }
        } catch (_) {}

        // 開始遊戲：隱藏覆蓋視窗與選角畫面，進入遊戲畫面
        hide(diffScreen);
        if (desertDiffScreen) hide(desertDiffScreen);
        hide(document.getElementById('map-select-screen'));
        hide(DOMCache.get('character-select-screen'));
        // 透過 GameModeManager 啟動；若不可用則回退至既有流程
        if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
            window.GameModeManager.start('survival', {
                selectedDifficultyId: useId,
                selectedCharacter: Game.selectedCharacter,
                selectedMap: Game.selectedMap
            });
        } else {
            Game.startNewGame();
            if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                let track = 'game_music';
                // 第4張地圖（花園）使用 game_music2
                if (Game.selectedMap && Game.selectedMap.id === 'garden') {
                    track = 'game_music2';
                } else if (Game.selectedMap && Game.selectedMap.id === 'intersection') {
                    track = 'intersection_music';
                } else if (Game.selectedMap && Game.selectedMap.id === 'branch') {
                    track = (useId === 'ASURA') ? 'shura_music' : 'game_music3';
                } else if (useId === 'ASURA') {
                    track = 'shura_music';
                }
                AudioManager.playMusic(track);
            }
            show(DOMCache.get('game-screen'));
        }
    };

    bindDiffCards(diffScreen.querySelectorAll('.diff-card.selectable'), 'EASY');
    bindDiffCards(desertDiffScreen ? desertDiffScreen.querySelectorAll('.diff-card.selectable') : [], 'HARD');

    KeyboardRouter.register('diff-select', 'Space', (e) => {
        e.preventDefault();
        const desertVisible = (() => {
            const el = document.getElementById('desert-difficulty-select-screen');
            return !!(el && !el.classList.contains('hidden'));
        })();
        const fallback = desertVisible ? 'HARD' : 'EASY';
        startGameWithDifficulty(selectedDiffId || fallback);
    });

    if (diffBack) {
        diffBack.addEventListener('click', () => {
            // 返回地圖：難度視窗為覆蓋層，僅需隱藏自身；mapScreen 始終保持可見
            hide(diffScreen);
            if (desertDiffScreen) hide(desertDiffScreen);
        });
    }
    if (diffBackDesert) {
        diffBackDesert.addEventListener('click', () => {
            hide(desertDiffScreen);
            hide(diffScreen);
        });
    }
}

// 等比縮放遊戲視窗，避免變形
function setupResponsiveViewport() {
    const resizeViewport = () => {
        const viewport = document.getElementById('viewport');
        if (!viewport) return;
        // 手機直立旋轉時交由 UI 處理，避免雙重縮放
        const isMobile = (window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 768px)').matches))
            || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const mobileRotationActive = document.documentElement.classList.contains('mobile-rotation-active');
        if (isMobile && mobileRotationActive) {
            return; // 讓 UI 的旋轉/縮放生效，不覆蓋寬高與變數
        }
        const targetW = CONFIG.CANVAS_WIDTH;
        const targetH = CONFIG.CANVAS_HEIGHT;
        const scale = Math.min(window.innerWidth / targetW, window.innerHeight / targetH);
        const displayW = Math.max(1, Math.floor(targetW * scale));
        const displayH = Math.max(1, Math.floor(targetH * scale));
        viewport.style.width = displayW + 'px';
        viewport.style.height = displayH + 'px';
        // 將縮放傳遞給CSS，便於UI元素（如玩家頭像）隨視窗縮放
        document.documentElement.style.setProperty('--ui-scale', String(scale));
    };
    window.addEventListener('resize', resizeViewport);
    window.addEventListener('orientationchange', resizeViewport);
    resizeViewport();
}

// 新增：天賦介面切換（選角 <-> 天賦）
function setupTalentScreenToggle() {
    const openBtn = document.getElementById('talent-open');
    const backBtn = document.getElementById('talent-back');
    const charScreen = document.getElementById('character-select-screen');
    const talentScreen = document.getElementById('talent-select-screen');
    if (!charScreen || !talentScreen) return;

    // 初始化天賦狀態
    renderConfirmDialogs();
    TalentSystem.init();
    // 初始化覺醒系統視窗
    if (typeof TalentSystem.initAwakeningWindow === 'function') {
        TalentSystem.initAwakeningWindow();
    }
    // 初始化專屬系統視窗
    if (typeof TalentSystem.initExclusiveWindow === 'function') {
        TalentSystem.initExclusiveWindow();
    }
    if (typeof TalentSystem.initAssistWindow === 'function') {
        TalentSystem.initAssistWindow();
    }

    // 註冊天賦畫面的空白鍵處理器到 KeyboardRouter
    KeyboardRouter.register('talent-select', 'Space', (e) => {
        // 覺醒 / 專屬視窗開啟時，空白鍵不觸發天賦解鎖
        if (TalentSystem._awakeningWindowOpen || TalentSystem._exclusiveWindowOpen) return;
        e.preventDefault();
        const confirmDialog = document.getElementById('talent-confirm');
        if (!confirmDialog || confirmDialog.classList.contains('hidden')) return;
        
        const activeCard = document.querySelector('#talent-select-screen .char-card.active');
        if (activeCard) {
            const tid = activeCard.dataset.talentId;
            // 覺醒 / 專屬強化特殊處理：空白鍵觸發解鎖流程
            if (tid === 'awakening_enhance' || tid === 'exclusive_enhance') {
                activeCard.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                TalentSystem.hideTalentConfirm();
                return;
            }
            TalentSystem.unlockTalent(tid);
        }
        TalentSystem.hideTalentConfirm();
    });
    
    // ESC：返回至選角（優先關閉專屬/輔助/覺醒視窗，再關閉天賦確認彈窗）
    KeyboardRouter.register('talent-select', 'Escape', (e) => {
        e.preventDefault();
        // 優先關閉專屬視窗
        if (TalentSystem._exclusiveWindowOpen) {
            try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click'); } catch(_){}
            TalentSystem.hideExclusiveWindow();
            return;
        }
        // 其次關閉輔助視窗
        if (TalentSystem._assistWindowOpen) {
            try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click'); } catch(_){}
            TalentSystem.hideAssistWindow();
            return;
        }
        // 其次關閉覺醒視窗
        if (TalentSystem._awakeningWindowOpen) {
            try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('button_click'); } catch(_){}
            TalentSystem.hideAwakeningWindow();
            return;
        }
        const confirmDialog = document.getElementById('talent-confirm');
        if (confirmDialog && !confirmDialog.classList.contains('hidden')) {
            TalentSystem.hideTalentConfirm();
            return;
        }
        const backBtn = document.getElementById('talent-back');
        if (backBtn) backBtn.click();
    });
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            playClick(); // 使用輔助函數替換 AudioManager.playSound('button_click')
            switchScreen(charScreen, talentScreen); // 使用輔助函數替換 classList.add/remove('hidden')
            // 使 UI.updateCoinsDisplay 指向天賦頁的金幣數字
            UI.coinsText = document.getElementById('talent-coins-text');
            if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) {
                UI.updateCoinsDisplay(Game.coins || 0);
            }
        });
    }
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            playClick(); // 使用輔助函數替換 AudioManager.playSound('button_click')
            switchScreen(talentScreen, charScreen); // 使用輔助函數替換 classList.add/remove('hidden')
            // 復原 UI.updateCoinsDisplay 指向遊戲頁金幣數字
            UI.coinsText = document.getElementById('coins-text');
            if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) {
                UI.updateCoinsDisplay(Game.coins || 0);
            }
        });
    }
}

/**
 * ========================================
 * 輔助函數區塊 - Helper Functions Section
 * ========================================
 * 
 * 此區塊包含用於減少代碼重複的輔助函數，提升維護性和一致性。
 * 
 * 設計原則：
 * 1. 統一音效播放 - 避免重複的 AudioManager.playSound 調用
 * 2. 統一畫面切換 - 標準化 DOM 元素的顯示/隱藏操作
 * 3. 抽象化事件綁定 - 簡化雙擊/雙觸檢測邏輯
 * 4. 緩存 DOM 元素 - 減少重複的 getElementById 調用
 * 
 * 維護指南：
 * - 新增音效時，優先使用 playClick() 系列函數
 * - 畫面切換時，使用 show()/hide()/switchScreen() 函數
 * - 需要雙擊檢測時，使用 bindDoubleTap() 工具函數
 * - 頻繁訪問的 DOM 元素應加入 DOMCache 緩存
 */

// ========================================
// 音效輔助函數 - Audio Helper Functions
// ========================================

/**
 * 播放按鈕點擊音效 (button_click)
 * 統一處理所有標準按鈕點擊音效，確保一致性
 */
function playClick() {
    if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
        AudioManager.playSound('button_click');
    }
}

/**
 * 播放次要按鈕點擊音效 (button_click2)
 * 用於卡片選擇、預覽等次要交互音效
 */
function playClick2() {
    if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
        AudioManager.playSound('button_click2');
    }
}

// ========================================
// DOM 緩存系統 - DOM Cache System
// ========================================

/**
 * DOM 元素緩存對象
 * 緩存頻繁訪問的 DOM 元素，提升性能並減少重複查詢
 */
const DOMCache = {
    // 主要畫面元素
    startScreen: null,
    characterSelectScreen: null,
    mapSelectScreen: null,
    difficultySelectScreen: null,
    talentSelectScreen: null,
    gameScreen: null,
    
    // 角色選擇相關元素
    characterConfirm: null,
    characterConfirmOk: null,
    characterConfirmCancel: null,
    
    // 天賦系統相關元素
    talentConfirm: null,
    talentConfirmOk: null,
    talentConfirmCancel: null,
    
    // 技能選單相關元素
    
    // 初始化緩存
    init() {
        // 主要畫面元素
        this.startScreen = document.getElementById('start-screen');
        this.characterSelectScreen = document.getElementById('character-select-screen');
        this.mapSelectScreen = document.getElementById('map-select-screen');
        this.difficultySelectScreen = document.getElementById('difficulty-select-screen');
        this.talentSelectScreen = document.getElementById('talent-select-screen');
        this.gameScreen = document.getElementById('game-screen');
        
        // 角色選擇相關元素
        this.characterConfirm = document.getElementById('character-confirm');
        this.characterConfirmOk = document.getElementById('character-confirm-ok');
        this.characterConfirmCancel = document.getElementById('character-confirm-cancel');
        
        // 天賦系統相關元素
        this.talentConfirm = document.getElementById('talent-confirm');
        this.talentConfirmOk = document.getElementById('talent-confirm-ok');
        this.talentConfirmCancel = document.getElementById('talent-confirm-cancel');
        
        // 技能選單相關元素
    },
    
    // 獲取緩存元素，如果不存在則查詢並緩存
    get(id) {
        if (!this[id]) {
            this[id] = document.getElementById(id);
        }
        return this[id];
    }
};

// ========================================
// 畫面切換輔助函數 - Screen Switching Helpers
// ========================================

/**
 * 顯示指定元素
 * @param {HTMLElement|string} element - DOM 元素或元素 ID
 */
function show(element) {
    const el = typeof element === 'string' ? DOMCache.get(element) || document.getElementById(element) : element;
    if (!el) return;
    const finish = function () { el.classList.remove('hidden'); };
    if (el.id === 'map-select-screen' && typeof MapAssets !== 'undefined' && typeof MapAssets.restoreLargeMapCards === 'function') {
        const pending = MapAssets.restoreLargeMapCards() || [];
        if (pending.length) {
            Promise.all(pending).then(finish);
            return;
        }
    }
    finish();
}

/**
 * 隱藏指定元素
 * @param {HTMLElement|string} element - DOM 元素或元素 ID
 */
function hide(element) {
    const el = typeof element === 'string' ? DOMCache.get(element) || document.getElementById(element) : element;
    if (el) {
        el.classList.add('hidden');
    }
}

/**
 * 畫面切換函數
 * 隱藏當前畫面並顯示目標畫面，同時播放切換音效
 * @param {HTMLElement|string} fromElement - 要隱藏的元素
 * @param {HTMLElement|string} toElement - 要顯示的元素
 * @param {boolean} playSound - 是否播放切換音效，預設為 false
 */
function switchScreen(fromElement, toElement, playSound = false) {
    hide(fromElement);
    show(toElement);
    if (playSound) {
        playClick();
    }
}

// ========================================
// 雙擊/雙觸檢測輔助函數 - Double Tap Helper
// ========================================

/**
 * 為元素綁定雙擊/雙觸檢測
 * 統一處理桌面雙擊和移動端雙觸邏輯
 * @param {HTMLElement} element - 要綁定的元素
 * @param {Function} callback - 雙擊/雙觸時的回調函數
 * @param {number} delay - 雙擊間隔時間限制（毫秒），預設 300ms
 */
function bindDoubleTap(element, callback, delay = 300) {
    if (!element || typeof callback !== 'function') return;
    
    // 使用 WeakMap 存儲每個元素的最後點擊時間
    if (!bindDoubleTap.lastTapTimes) {
        bindDoubleTap.lastTapTimes = new WeakMap();
    }
    
    // 桌面雙擊事件
    element.addEventListener('dblclick', callback);
    
    // 移動端雙觸事件
    element.addEventListener('touchend', (e) => {
        const currentTime = Date.now();
        const lastTapTime = bindDoubleTap.lastTapTimes.get(element) || 0;
        const timeDiff = currentTime - lastTapTime;
        
        if (timeDiff < delay && timeDiff > 0) {
            e.preventDefault(); // 防止觸發其他事件
            callback(e);
        }
        
        bindDoubleTap.lastTapTimes.set(element, currentTime);
    });
}

// ========================================
// 鍵盤事件中央處理器 - Centralized Keyboard Handler
// ========================================

/**
 * 鍵盤事件路由表
 * 根據當前畫面狀態路由不同的按鍵處理邏輯
 */
const KeyboardRouter = {
    handlers: new Map(),
    register(context, key, handler) {
        const contextKey = `${context}:${key}`;
        this.handlers.set(contextKey, handler);
    },
    getCurrentContext() {
        // 讓可見的難度視窗（包含第三張地圖專用）優先於選圖畫面，避免上下文錯誤
        const desertDiff = document.getElementById('desert-difficulty-select-screen');
        if (desertDiff && !desertDiff.classList.contains('hidden')) {
            return 'diff-select';
        }
        if (!document.getElementById('difficulty-select-screen').classList.contains('hidden')) {
            return 'diff-select';
        }
        if (!document.getElementById('map-select-screen').classList.contains('hidden')) {
            return 'map-select';
        }
        if (!document.getElementById('character-select-screen').classList.contains('hidden')) {
            return 'character-select';
        }
        if (!document.getElementById('talent-select-screen').classList.contains('hidden')) {
            return 'talent-select';
        }
        if (!document.getElementById('game-screen').classList.contains('hidden')) {
            return 'game';
        }
        return 'default';
    },
    handle(event) {
        const context = this.getCurrentContext();
        const contextKey = `${context}:${event.code}`;
        const handler = this.handlers.get(contextKey);
        if (handler) {
            handler(event);
        }
    }
};

// 新增：引繼碼介面事件綁定（開始畫面 -> 引繼碼畫面）
function setupBackupInterface() {
    renderBackupSections();
    const backupBtn = document.getElementById('backup-button');
    const backupScreen = document.getElementById('backup-screen');
    const startScreen = document.getElementById('start-screen');
    const backBtn = document.getElementById('backup-back');
    const genBtn = document.getElementById('backup-generate');
    const outputInput = document.getElementById('backup-code-output');
    const copyBtn = document.getElementById('backup-copy');
    const applyBtn = document.getElementById('backup-apply');
    const inputField = document.getElementById('backup-code-input');
    // 冒險模式專用引繼碼欄位
    const advGenBtn = document.getElementById('adventure-backup-generate');
    const advOutputInput = document.getElementById('adventure-backup-code-output');
    const advCopyBtn = document.getElementById('adventure-backup-copy');
    const advApplyBtn = document.getElementById('adventure-backup-apply');
    const advInputField = document.getElementById('adventure-backup-code-input');

    if (backupBtn && backupScreen && startScreen) {
        backupBtn.addEventListener('click', () => {
            playClick();
            hide(startScreen);
            show(backupScreen);
            // 保持選單音樂
            try {
                if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                    AudioScene.enterMenu();
                } else if (AudioManager.playMusic) {
                    AudioManager.playMusic('menu_music');
                }
            } catch (_) {}
        });
    }
    if (backBtn && backupScreen && startScreen) {
        backBtn.addEventListener('click', () => {
            hide(backupScreen);
            show(startScreen);
        });
    }
    if (genBtn && outputInput) {
        genBtn.addEventListener('click', async () => {
            playClick();
            try {
                if (typeof SaveCode !== 'undefined' && SaveCode.generate) {
                    const code = await SaveCode.generate();
                    outputInput.value = code || '';
                }
            } catch (e) {
                console.error('生成引繼碼失敗', e);
                alert('生成引繼碼失敗');
            }
        });
    }
    if (copyBtn && outputInput) {
        copyBtn.addEventListener('click', async () => {
            playClick2();
            const text = outputInput.value || '';
            if (!text) return;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    alert('已複製到剪貼簿');
                } else {
                    // 後備方案：選取輸入框內容，提示使用者手動複製
                    outputInput.focus();
                    outputInput.select();
                    alert('請按 Ctrl+C 進行複製');
                }
            } catch (e) {
                alert('複製失敗，請手動選取後 Ctrl+C');
            }
        });
    }
    if (applyBtn && inputField) {
        applyBtn.addEventListener('click', async () => {
            playClick();
            const code = (inputField.value || '').trim();
            if (!code) {
                alert('請先輸入引繼碼');
                return;
            }
            try {
                if (typeof SaveCode !== 'undefined' && SaveCode.apply) {
                    await SaveCode.apply(code);
                }
            } catch (e) {
                console.error('套用引繼碼失敗', e);
                alert('套用引繼碼失敗');
            }
        });
    }

    // 冒險模式：生成引繼碼（僅包含 terraria_save）
    if (advGenBtn && advOutputInput) {
        advGenBtn.addEventListener('click', async () => {
            playClick();
            try {
                if (typeof AdventureSaveCode === 'undefined' || typeof AdventureSaveCode.generate !== 'function') {
                    alert('冒險模式引繼碼模組不可用，請確認腳本載入順序。');
                    return;
                }
                const code = await AdventureSaveCode.generate();
                advOutputInput.value = code || '';
            } catch (e) {
                console.error('生成冒險模式引繼碼失敗', e);
                alert(e && e.message ? e.message : '生成冒險模式引繼碼失敗');
            }
        });
    }

    // 冒險模式：複製引繼碼
    if (advCopyBtn && advOutputInput) {
        advCopyBtn.addEventListener('click', async () => {
            playClick2();
            const text = advOutputInput.value || '';
            if (!text) return;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    alert('已複製冒險模式引繼碼到剪貼簿');
                } else {
                    advOutputInput.focus();
                    advOutputInput.select();
                    alert('請按 Ctrl+C 複製冒險模式引繼碼');
                }
            } catch (e) {
                alert('複製失敗，請手動選取後 Ctrl+C');
            }
        });
    }

    // 冒險模式：套用引繼碼（只覆蓋 terraria_save）
    if (advApplyBtn && advInputField) {
        advApplyBtn.addEventListener('click', async () => {
            playClick();
            const code = (advInputField.value || '').trim();
            if (!code) {
                alert('請先輸入冒險模式引繼碼');
                return;
            }
            try {
                if (typeof AdventureSaveCode === 'undefined' || typeof AdventureSaveCode.apply !== 'function') {
                    alert('冒險模式引繼碼模組不可用，請確認腳本載入順序。');
                    return;
                }
                await AdventureSaveCode.apply(code);
            } catch (e) {
                console.error('套用冒險模式引繼碼失敗', e);
                alert('套用冒險模式引繼碼失敗');
            }
        });
    }
}

// 新增：成就介面事件綁定（開始畫面 -> 成就畫面）
function setupAchievementsInterface() {
    const achBtn = document.getElementById('achievements-button');
    const achScreen = document.getElementById('achievements-screen');
    const startScreen = document.getElementById('start-screen');
    const backBtn = document.getElementById('achievements-back');
    const list = document.getElementById('achievements-list');

    if (achBtn && achScreen && startScreen) {
        achBtn.addEventListener('click', () => {
            playClick();
            hide(startScreen);
            show(achScreen);
            try {
                if (typeof Achievements !== 'undefined') {
                    Achievements.renderList(list);
                }
            } catch(_) {}
            // 保持選單音樂
            try {
                if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                    AudioScene.enterMenu();
                } else if (AudioManager.playMusic) {
                    AudioManager.playMusic('menu_music');
                }
            } catch (_) {}
        });
    }
    if (backBtn && achScreen && startScreen) {
        backBtn.addEventListener('click', () => {
            playClick();
            hide(achScreen);
            show(startScreen);
            // 保持選單音樂（與其他選單一致）
            try {
                if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                    AudioScene.enterMenu();
                } else if (AudioManager.playMusic) {
                    AudioManager.playMusic('menu_music');
                }
                AudioManager.setMuted && AudioManager.setMuted(false);
            } catch(_) {}
        });
    }
}

// 初始化 DOM 緩存
document.addEventListener('DOMContentLoaded', function() {
    // 初始化 DOM 緩存
    DOMCache.init();

    // 綁定中央鍵盤事件處理器
    document.addEventListener('keydown', (e) => {
        KeyboardRouter.handle(e);
    });

    // 綁定引繼碼介面事件
    setupBackupInterface();
    // 綁定成就介面事件
    setupAchievementsInterface();

    // 開始畫面右側選單：切換左側視窗內容 + 顯示音量疊蓋
    (function setupStartMenuNav(){
        const menu = document.querySelector('#start-screen .start-menu');
        if (!menu) return;
        const items = menu.querySelectorAll('.menu-btn[data-target]');
        const titleEl = document.getElementById('content-title');
        const bodyEl = document.getElementById('content-body');
        const templates = {
            gameplay: document.getElementById('tpl-gameplay'),
            announce: document.getElementById('tpl-announce'),
            regarding: document.getElementById('tpl-regarding')
        };
        const render = (key) => {
            const tpl = templates[key];
            if (!tpl || !titleEl || !bodyEl) return;
            const h2 = tpl.querySelector('h2');
            const content = tpl.querySelector('.content');
            titleEl.textContent = h2 ? h2.textContent : '';
            bodyEl.innerHTML = content ? content.innerHTML : '';
        };
        // 預設顯示「遊戲玩法」
        render('gameplay');

        items.forEach(btn => {
            const target = btn.getAttribute('data-target');
            btn.addEventListener('click', () => {
                if (target === 'redeem-code') {
                    playClick();
                    const overlay = document.getElementById('redeem-code-overlay');
                    if (overlay) {
                        overlay.classList.remove('hidden');
                        // 清空輸入框和訊息
                        const input = document.getElementById('redeem-code-input');
                        const message = document.getElementById('redeem-code-message');
                        if (input) input.value = '';
                        if (message) {
                            message.textContent = '';
                            message.className = 'redeem-code-message';
                        }
                        // 聚焦到輸入框
                        setTimeout(() => input && input.focus(), 100);
                    }
                } else {
                    playClick2();
                    render(target);
                }
            });
        });

        // 序號兌換系統事件處理
        (function setupRedeemCodeSystem() {
            const overlay = document.getElementById('redeem-code-overlay');
            const input = document.getElementById('redeem-code-input');
            const submitBtn = document.getElementById('redeem-code-submit');
            const closeBtn = document.getElementById('redeem-code-close');
            const messageEl = document.getElementById('redeem-code-message');
            
            if (!overlay || !input || !submitBtn || !closeBtn || !messageEl) {
                console.warn('[main.js] 序號兌換系統元素未找到');
                return;
            }
            
            // 顯示訊息
            function showMessage(text, isSuccess = false) {
                messageEl.textContent = text;
                messageEl.className = 'redeem-code-message ' + (isSuccess ? 'success' : 'error');
            }
            
            // 提交序號
            function submitCode() {
                const code = input.value.trim();
                if (!code) {
                    showMessage('請輸入序號', false);
                    return;
                }
                
                // 檢查 RedeemCodeSystem 是否可用
                if (typeof RedeemCodeSystem === 'undefined' || typeof RedeemCodeSystem.redeemCode !== 'function') {
                    showMessage('序號系統未初始化', false);
                    return;
                }
                
                // 兌換序號
                const result = RedeemCodeSystem.redeemCode(code);
                
                if (result.success) {
                    showMessage(result.message, true);
                    // 清空輸入框
                    input.value = '';
                    // 播放音效
                    try {
                        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                            AudioManager.playSound('money');
                        }
                    } catch (_) {}
                    // 3秒後自動關閉（可選）
                    setTimeout(() => {
                        overlay.classList.add('hidden');
                    }, 3000);
                } else {
                    showMessage(result.message, false);
                }
            }
            
            // 提交按鈕點擊
            submitBtn.addEventListener('click', () => {
                playClick();
                submitCode();
            });
            
            // 輸入框按 Enter 鍵提交
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitCode();
                }
            });
            
            // 關閉按鈕
            closeBtn.addEventListener('click', () => {
                playClick();
                overlay.classList.add('hidden');
            });
            
            // 點擊背景關閉
            overlay.addEventListener('click', (e) => {
                if (e.target && e.target.id === 'redeem-code-overlay') {
                    overlay.classList.add('hidden');
                }
            });
        })();
    })();

    // ESC 返回：備份/選圖/選難度/序號輸入（不更動既有返回按鈕）
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const isVisible = (el) => el && !el.classList.contains('hidden');
        try {
            const backupScreen = document.getElementById('backup-screen');
            const achievementsScreen = document.getElementById('achievements-screen');
            const mapScreen = document.getElementById('map-select-screen');
            const diffScreen = document.getElementById('difficulty-select-screen');
            const redeemCodeOverlay = document.getElementById('redeem-code-overlay');

            // 優先關閉序號輸入界面
            if (isVisible(redeemCodeOverlay)) {
                redeemCodeOverlay.classList.add('hidden');
                e.preventDefault();
                return;
            }

            // 組隊介面：ESC 關閉（避免影響後續介面；並阻止事件繼續傳遞到其他 ESC 邏輯）
            try {
                if (typeof window !== 'undefined' && window.SurvivalOnlineUI && typeof window.SurvivalOnlineUI.handleEscape === 'function') {
                    const handled = window.SurvivalOnlineUI.handleEscape();
                    if (handled) {
                        e.preventDefault();
                        try { e.stopPropagation(); } catch (_) {}
                        try { e.stopImmediatePropagation(); } catch (_) {}
                        return;
                    }
                }
            } catch (_) {}

            if (isVisible(backupScreen)) {
                const backBtn = document.getElementById('backup-back');
                if (backBtn) backBtn.click();
                e.preventDefault();
                return;
            }
            if (isVisible(achievementsScreen)) {
                const backBtn = document.getElementById('achievements-back');
                if (backBtn) backBtn.click();
                e.preventDefault();
                return;
            }
            // 難度視窗覆蓋在地圖視窗上方，須先檢查難度再檢查地圖
            if (isVisible(diffScreen)) {
                const backBtn = document.getElementById('diff-back');
                if (backBtn) backBtn.click();
                e.preventDefault();
                return;
            }
            const desertDiffScreen = document.getElementById('desert-difficulty-select-screen');
            if (isVisible(desertDiffScreen)) {
                const backBtn = document.getElementById('diff-back-desert') || document.getElementById('diff-back');
                if (backBtn) backBtn.click();
                e.preventDefault();
                return;
            }
            if (isVisible(mapScreen)) {
                const backBtn = document.getElementById('map-cancel');
                if (backBtn) backBtn.click();
                e.preventDefault();
                return;
            }
        } catch (_) {}
    });
});
