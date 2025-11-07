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
    // 開始按鈕
    const startButton = document.getElementById('start-button');
    startButton.addEventListener('click', function() {
        playClick(); // 使用輔助函數替換 AudioManager.playSound('button_click')
        // 在選單/選角階段使用主選單音樂
        if (AudioManager.playMusic) {
            // 確保選單介面不靜音
            AudioManager.isMuted = false;
            try {
                if (typeof AudioScene !== 'undefined' && AudioScene.enterMenu) {
                    AudioScene.enterMenu();
                } else {
                    AudioManager.playMusic('menu_music');
                }
            } catch (_) {}
        }
        // 進入選角介面而非直接開始
        hide(DOMCache.get('start-screen')); // 使用輔助函數替換 classList.add('hidden')
        show(DOMCache.get('character-select-screen')); // 使用輔助函數替換 classList.remove('hidden')
    });

    // 音量設置
    const musicSlider = document.getElementById('music-volume');
    const soundSlider = document.getElementById('sound-volume');
    const musicText = document.getElementById('music-volume-text');
    const soundText = document.getElementById('sound-volume-text');
    const muteToggle = document.getElementById('mute-toggle');
    const muteStatus = document.getElementById('mute-status');

    if (musicSlider && soundSlider) {
        const updateLabels = () => {
            musicText.textContent = Math.round(musicSlider.value * 100) + '%';
            soundText.textContent = Math.round(soundSlider.value * 100) + '%';
        };
        updateLabels();
        musicSlider.addEventListener('input', () => {
            AudioManager.setMusicVolume && AudioManager.setMusicVolume(parseFloat(musicSlider.value));
            updateLabels();
        });
        soundSlider.addEventListener('input', () => {
            AudioManager.setSoundVolume && AudioManager.setSoundVolume(parseFloat(soundSlider.value));
            updateLabels();
        });
    }

    if (muteToggle) {
        muteToggle.addEventListener('click', () => {
            const muted = AudioManager.toggleMute ? AudioManager.toggleMute() : false;
            muteStatus.textContent = muted ? '開' : '關';
        });
    }
    
    // 影片結束事件改由 UI.showGameOverScreen / UI.showVictoryScreen 內管理，避免重複綁定與行為衝突
    
    // 創建預設的視頻文件
    createDefaultVideos();
    
    // 創建預設的圖片資源
    createDefaultImages();
    
    // 初始化音效系統
    AudioManager.init();
    
    // 初始化遊戲（但不開始）
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

// 創建預設圖片資源
function createDefaultImages() {
    // 初始化遊戲圖片對象
    Game.images = {};
    
    // 定義需要加載的圖片
    const imagesToLoad = [
        { name: 'player', src: 'assets/images/player.png' },
        { name: 'player1-2', src: 'assets/images/player1-2.png' },
        { name: 'playerN', src: 'assets/images/playerN.png' },
        { name: 'zombie', src: 'assets/images/zombie.png' },
        { name: 'zombie2', src: 'assets/images/zombie2.png' },
        { name: 'zombie3', src: 'assets/images/zombie3.png' },
        { name: 'skeleton', src: 'assets/images/skeleton.png' },
        { name: 'skeleton2', src: 'assets/images/skeleton2.png' },
        { name: 'skeleton3', src: 'assets/images/skeleton3.png' },
        { name: 'ghost', src: 'assets/images/ghost.png' },
        { name: 'ghost2', src: 'assets/images/ghost2.png' },
        { name: 'ghost3', src: 'assets/images/ghost3.png' },
        { name: 'mini_boss', src: 'assets/images/mini_boss.png' },
        { name: 'boss', src: 'assets/images/boss.png' },
        { name: 'dagger', src: 'assets/images/dagger.png' },
        { name: 'fireball', src: 'assets/images/fireball.png' },
        { name: 'lightning', src: 'assets/images/lightning.png' },
        { name: 'knife', src: 'assets/images/knife.gif' },
        { name: 'knife2', src: 'assets/images/knife2.gif' },
        { name: 'exp_orb', src: 'assets/images/exp_orb.png' },
// 新增：守護領域場域圖片
        { name: 'field', src: 'assets/images/field.gif' },
        { name: 'box', src: 'assets/images/BOX.png' },
        // 唱歌技能特效圖片（GIF 與 PNG 後備）
        { name: 'LA', src: 'assets/images/LA.png' },
        // 障礙物素材
        { name: 'S1', src: 'assets/images/S1.png' },
        { name: 'S2', src: 'assets/images/S2.png' },
        { name: 'S3', src: 'assets/images/S3.png' },
        { name: 'S4', src: 'assets/images/S4.png' },
        { name: 'S5', src: 'assets/images/S5.png' },
        { name: 'S6', src: 'assets/images/S6.png' },
        { name: 'S7', src: 'assets/images/S7.png' },
        { name: 'S8', src: 'assets/images/S8.png' },
        { name: 'S9', src: 'assets/images/S9.png' },
        // 背景素材（多地圖）
        { name: 'background', src: 'assets/images/background.jpg' },
        { name: 'background2', src: 'assets/images/background2.jpg' },
        { name: 'background3', src: 'assets/images/background3.jpg' },
        { name: 'background1-2', src: 'assets/images/background1-2.png' },
        { name: 'background1-3', src: 'assets/images/background1-3.png' }
    ];
    
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
            console.warn(`無法加載圖片: ${img.name}，使用預設圖形`);
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
        if (document.hidden) {
            Game.pause();
            AudioManager.setMuted && AudioManager.setMuted(true);
        } else {
            const gameVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('game-screen') : !document.getElementById('game-screen').classList.contains('hidden'));
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
        Game.pause();
        AudioManager.setMuted && AudioManager.setMuted(true);
    });

    window.addEventListener('focus', () => {
        const gameVisible = !!(typeof UI !== 'undefined' && UI.isScreenVisible ? UI.isScreenVisible('game-screen') : !document.getElementById('game-screen').classList.contains('hidden'));
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

// 選角介面事件與確認流程（回復原行為：單擊僅更新預覽，雙擊/空白鍵進入選圖）
function setupCharacterSelection() {
    const screen = document.getElementById('character-select-screen');
    const cards = screen.querySelectorAll('.char-card.selectable');
    const previewImg = document.getElementById('char-preview-img');
    const previewName = document.getElementById('char-preview-name');
    const previewDesc = document.getElementById('char-preview-desc');
    let picked = null;
    let lastTapTime = 0;

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
            const m = descText.match(/專屬技能：(.+?)(?:，|。|$)/);
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
const iconMap = {
    SING: 'assets/images/A1.png',
    DAGGER: 'assets/images/A2.png',
    SLASH: 'assets/images/A17.png',
    LASER: 'assets/images/A3.png',
    CHAIN_LIGHTNING: 'assets/images/A4.png',
    FIREBALL: 'assets/images/A5.png',
    LIGHTNING: 'assets/images/A6.png',
    ORBIT: 'assets/images/A7.png',
    AURA_FIELD: 'assets/images/A13.png',
    INVINCIBLE: 'assets/images/A14.png',
    ATTR_ATTACK: 'assets/images/A8.png',
    ATTR_CRIT: 'assets/images/A9.png',
    ATTR_ATTACK_POWER: 'assets/images/A12.png'
};
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
        // 單擊：僅更新預覽
        card.addEventListener('click', () => {
            playClick2();
            updatePreview(ch);
        });
        // 雙擊：顯示選圖覆蓋層（不隱藏選角畫面）
        card.addEventListener('dblclick', () => {
            Game.selectedCharacter = ch;
            show(DOMCache.get('map-select-screen'));
        });
        // 觸控雙擊（兩次點擊間隔<=300ms）：雙擊進入選圖，單擊更新預覽
        card.addEventListener('touchend', () => {
            const now = Date.now();
            if (now - lastTapTime <= 300) {
                Game.selectedCharacter = ch;
                show(DOMCache.get('map-select-screen'));
            } else {
                updatePreview(ch);
            }
            lastTapTime = now;
        }, { passive: true });
    });

    // 空白鍵：在選角畫面時，若已有 picked，顯示選圖覆蓋層
    KeyboardRouter.register('character-select', 'Space', (e) => {
        e.preventDefault();
        if (picked) {
            Game.selectedCharacter = picked;
            playClick();
            show(DOMCache.get('map-select-screen'));
        }
    });
    
    // ESC：返回開始畫面（不影響雙擊/空白鍵）
    KeyboardRouter.register('character-select', 'Escape', (e) => {
        e.preventDefault();
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
function setupMapAndDifficultySelection() {
    const mapScreen = document.getElementById('map-select-screen');
    const diffScreen = document.getElementById('difficulty-select-screen');
    const desertDiffScreen = document.getElementById('desert-difficulty-select-screen');
    const mapCards = mapScreen.querySelectorAll('.map-card.selectable');
    // 修正：正確的地圖介紹元素ID為 map-desc（避免更新失效）
    const mapDescEl = document.getElementById('map-desc');
    const mapCancel = document.getElementById('map-cancel');
    const diffCancel = document.getElementById('diff-cancel');
    let selectedMapCfg = null;
    let lastTapTime = 0;
    // 將 selectedDiffId 的宣告提前，避免在 confirmMap 中賦值時落入 TDZ（暫時性死區）導致錯誤
    let selectedDiffId = null;

    // 新增：模式切換（生存 / 挑戰）— 切換右側地圖 grid 與介紹
    const survivalGrid = document.getElementById('grid-survival');
    const challengeGrid = document.getElementById('grid-challenge');
    const stageGrid = document.getElementById('grid-stage');
    const defenseGrid = document.getElementById('grid-defense');
    const mainGrid = document.getElementById('grid-main');
    const modeSurvival = document.getElementById('mode-survival');
    const modeChallenge = document.getElementById('mode-challenge');
    const modeStage = document.getElementById('mode-stage');
    const modeDefense = document.getElementById('mode-defense');
    const modeMain = document.getElementById('mode-main');

    const switchMode = (mode) => {
        // 播放模式切換音效（button_click2）
        playClick2();
        // 切換顯示的 grid，並重置已選地圖
        if (mode === 'challenge') {
            if (survivalGrid) hide(survivalGrid);
            if (challengeGrid) show(challengeGrid);
            if (stageGrid) hide(stageGrid);
            if (defenseGrid) hide(defenseGrid);
            if (mainGrid) hide(mainGrid);
            if (mapDescEl) mapDescEl.textContent = '挑戰模式尚未開放';
            selectedMapCfg = null;
            if (modeSurvival) modeSurvival.classList.remove('primary');
            if (modeChallenge) modeChallenge.classList.add('primary');
            if (modeStage) modeStage.classList.remove('primary');
            if (modeDefense) modeDefense.classList.remove('primary');
            if (modeMain) modeMain.classList.remove('primary');
        } else if (mode === 'stage') {
            if (survivalGrid) hide(survivalGrid);
            if (challengeGrid) hide(challengeGrid);
            if (stageGrid) show(stageGrid);
            if (defenseGrid) hide(defenseGrid);
            if (mainGrid) hide(mainGrid);
            if (mapDescEl) mapDescEl.textContent = '闖關模式尚未開放';
            selectedMapCfg = null;
            if (modeSurvival) modeSurvival.classList.remove('primary');
            if (modeChallenge) modeChallenge.classList.remove('primary');
            if (modeStage) modeStage.classList.add('primary');
            if (modeDefense) modeDefense.classList.remove('primary');
            if (modeMain) modeMain.classList.remove('primary');
        } else if (mode === 'defense') {
            if (survivalGrid) hide(survivalGrid);
            if (challengeGrid) hide(challengeGrid);
            if (stageGrid) hide(stageGrid);
            if (defenseGrid) show(defenseGrid);
            if (mainGrid) hide(mainGrid);
            if (mapDescEl) mapDescEl.textContent = '防禦模式尚未開放';
            selectedMapCfg = null;
            if (modeSurvival) modeSurvival.classList.remove('primary');
            if (modeChallenge) modeChallenge.classList.remove('primary');
            if (modeStage) modeStage.classList.remove('primary');
            if (modeDefense) modeDefense.classList.add('primary');
            if (modeMain) modeMain.classList.remove('primary');
        } else if (mode === 'main') {
            if (survivalGrid) hide(survivalGrid);
            if (challengeGrid) hide(challengeGrid);
            if (stageGrid) hide(stageGrid);
            if (defenseGrid) hide(defenseGrid);
            if (mainGrid) show(mainGrid);
            if (mapDescEl) mapDescEl.textContent = '主線模式尚未開放';
            selectedMapCfg = null;
            if (modeSurvival) modeSurvival.classList.remove('primary');
            if (modeChallenge) modeChallenge.classList.remove('primary');
            if (modeStage) modeStage.classList.remove('primary');
            if (modeDefense) modeDefense.classList.remove('primary');
            if (modeMain) modeMain.classList.add('primary');
        } else {
            if (survivalGrid) show(survivalGrid);
            if (challengeGrid) hide(challengeGrid);
            if (stageGrid) hide(stageGrid);
            if (defenseGrid) hide(defenseGrid);
            if (mainGrid) hide(mainGrid);
            if (mapDescEl) mapDescEl.textContent = '提示：點擊地圖顯示介紹，雙擊或空白鍵確認';
            selectedMapCfg = null;
            if (modeSurvival) modeSurvival.classList.add('primary');
            if (modeChallenge) modeChallenge.classList.remove('primary');
            if (modeStage) modeStage.classList.remove('primary');
            if (modeDefense) modeDefense.classList.remove('primary');
            if (modeMain) modeMain.classList.remove('primary');
        }
    };
    // 綁定模式按鈕
    if (modeSurvival) modeSurvival.addEventListener('click', () => switchMode('survival'));
    if (modeChallenge) modeChallenge.addEventListener('click', () => switchMode('challenge'));
    if (modeStage) modeStage.addEventListener('click', () => switchMode('stage'));
    if (modeDefense) modeDefense.addEventListener('click', () => switchMode('defense'));
    if (modeMain) modeMain.addEventListener('click', () => switchMode('main'));

    const showMapDesc = (cfg, card) => {
        Game.selectedMap = cfg || null;
        playClick2();
        if (mapDescEl) {
            // 選到廁所或草原時更新指定文案；其他地圖維持提示
            if (cfg && (cfg.id === 'city' || cfg.name === '廁所')) {
                mapDescEl.textContent = '光滑平面的廁所，可使用馬桶障礙物躲避敵人。';
            } else if (cfg && (cfg.id === 'forest' || cfg.name === '草原')) {
                mapDescEl.textContent = '綠意盎然的草原，卻出現了許多馬桶。';
            } else if (cfg && (cfg.id === 'desert' || cfg.name === '宇宙' || cfg.name === '宇宙LV.3')) {
                mapDescEl.textContent = '無盡的宇宙星空中，漂浮著許多馬桶。';
            }
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

        // 顯示正確的難度視窗；第三張地圖改為與其他地圖一致，隱藏地圖視窗以避免上下文混淆
        if (selectedMapCfg && selectedMapCfg.id === 'desert' && desertDiffScreen) {
            // 宇宙地圖：僅困難/修羅；預設困難，避免沿用上一輪的 ASURA
            selectedDiffId = 'HARD';
            Game.selectedDifficultyId = 'HARD';
            hide(mapScreen);
            show(desertDiffScreen);
        } else {
            // 其他地圖的難度視窗為獨立層，隱藏地圖畫面
            hide(mapScreen);
            // 其他地圖：維持簡單/困難；預設簡單
            selectedDiffId = 'EASY';
            Game.selectedDifficultyId = 'EASY';
            show(diffScreen);
        }
    };

    mapCards.forEach(card => {
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
        });
    }

    const diffCards = diffScreen.querySelectorAll('.diff-card.selectable');
    const desertDiffCards = desertDiffScreen ? desertDiffScreen.querySelectorAll('.diff-card.selectable') : [];
    const diffBack = document.getElementById('diff-back');
    const diffBackDesert = document.getElementById('diff-back-desert');

    const startGameWithDifficulty = (id, playSound = true) => {
        const useId = id || 'EASY';
        Game.selectedDifficultyId = useId;
        if (playSound) playClick();
        // 開始遊戲：隱藏覆蓋視窗與選角畫面，進入遊戲畫面
        hide(diffScreen);
        if (desertDiffScreen) hide(desertDiffScreen);
        hide(document.getElementById('map-select-screen'));
        hide(DOMCache.get('character-select-screen'));
        Game.startNewGame();
        if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
            const track = (useId === 'ASURA') ? 'shura_music' : 'game_music';
            AudioManager.playMusic(track);
        }
        show(DOMCache.get('game-screen'));
    };

    diffCards.forEach(card => {
        const id = card.getAttribute('data-diff-id') || 'EASY';
        // 單擊：僅選擇並播放次要音效
        card.addEventListener('click', () => {
            selectedDiffId = id;
            Game.selectedDifficultyId = id;
            playClick2();
        });
        // 雙擊：直接確認並開始遊戲
        card.addEventListener('dblclick', () => {
            selectedDiffId = id;
            startGameWithDifficulty(id, false);
        });
        // 觸控雙擊：使用共用輔助
        bindDoubleTap(card, () => {
            selectedDiffId = id;
            startGameWithDifficulty(id, false);
        });
    });

    // Desert 專用難度卡片：支援 HARD / ASURA
    desertDiffCards.forEach(card => {
        const id = card.getAttribute('data-diff-id') || 'HARD';
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
            // 返回地圖：僅在覆蓋層之間切換；確保關閉宇宙難度視窗殘留
            hide(diffScreen);
            if (desertDiffScreen) hide(desertDiffScreen);
            show(mapScreen);
        });
    }
    if (diffBackDesert) {
        diffBackDesert.addEventListener('click', () => {
            hide(desertDiffScreen);
            // 防禦性隱藏一般難度視窗，避免交疊殘留
            hide(diffScreen);
            show(mapScreen);
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
    TalentSystem.init();

    // 註冊天賦畫面的空白鍵處理器到 KeyboardRouter
    KeyboardRouter.register('talent-select', 'Space', (e) => {
        e.preventDefault();
        const confirmDialog = document.getElementById('talent-confirm');
        if (!confirmDialog || confirmDialog.classList.contains('hidden')) return;
        
        const activeCard = document.querySelector('#talent-select-screen .char-card.active');
        if (activeCard) {
            TalentSystem.unlockTalent(activeCard.dataset.talentId);
        }
        TalentSystem.hideTalentConfirm();
    });
    
    // ESC：返回至選角（優先關閉天賦確認彈窗）
    KeyboardRouter.register('talent-select', 'Escape', (e) => {
        e.preventDefault();
        const confirmDialog = document.getElementById('talent-confirm');
        if (confirmDialog && !confirmDialog.classList.contains('hidden')) {
            // 若彈窗開啟，先關閉彈窗，維持既有文案與流程
            TalentSystem.hideTalentConfirm();
            return;
        }
        // 走既有返回按鈕邏輯，避免改動文案/流程
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
    talentScreen: null,
    talentConfirm: null,
    talentConfirmOk: null,
    talentConfirmCancel: null,
    
    // 技能選單相關元素
    skillsMenu: null,
    
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
        this.talentScreen = document.getElementById('talent-screen');
        this.talentConfirm = document.getElementById('talent-confirm');
        this.talentConfirmOk = document.getElementById('talent-confirm-ok');
        this.talentConfirmCancel = document.getElementById('talent-confirm-cancel');
        
        // 技能選單相關元素
        this.skillsMenu = document.getElementById('skills-menu');
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
    if (el) {
        el.classList.remove('hidden');
    }
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
    const backupBtn = document.getElementById('backup-button');
    const backupScreen = document.getElementById('backup-screen');
    const startScreen = document.getElementById('start-screen');
    const backBtn = document.getElementById('backup-back');
    const genBtn = document.getElementById('backup-generate');
    const outputInput = document.getElementById('backup-code-output');
    const copyBtn = document.getElementById('backup-copy');
    const applyBtn = document.getElementById('backup-apply');
    const inputField = document.getElementById('backup-code-input');

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
                if (target === 'settings') {
                    playClick();
                    const overlay = document.getElementById('settings-overlay');
                    overlay && overlay.classList.remove('hidden');
                } else {
                    playClick2();
                    render(target);
                }
            });
        });

        // 關閉音量疊蓋
        const closeBtn = document.getElementById('settings-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const overlay = document.getElementById('settings-overlay');
                overlay && overlay.classList.add('hidden');
            });
        }
        const overlay = document.getElementById('settings-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target && e.target.id === 'settings-overlay') {
                    overlay.classList.add('hidden');
                }
            });
        }
    })();

    // ESC 返回：備份/選圖/選難度（不更動既有返回按鈕）
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const isVisible = (el) => el && !el.classList.contains('hidden');
        try {
            const backupScreen = document.getElementById('backup-screen');
            const achievementsScreen = document.getElementById('achievements-screen');
            const mapScreen = document.getElementById('map-select-screen');
            const diffScreen = document.getElementById('difficulty-select-screen');

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
            if (isVisible(mapScreen)) {
                const backBtn = document.getElementById('map-cancel');
                if (backBtn) backBtn.click();
                e.preventDefault();
                return;
            }
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
        } catch (_) {}
    });
});
