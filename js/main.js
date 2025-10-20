// 遊戲主入口
document.addEventListener('DOMContentLoaded', function() {
    // 開始按鈕
    const startButton = document.getElementById('start-button');
    startButton.addEventListener('click', function() {
        playClick(); // 使用輔助函數替換 AudioManager.playSound('button_click')
        // 在選單/選角階段使用主選單音樂
        if (AudioManager.playMusic) {
            // 確保選單介面不靜音
            AudioManager.isMuted = false;
            AudioManager.playMusic('menu_music');
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

    // 自動暫停與音效抑制（分頁切換/失焦）
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
        { name: 'skeleton', src: 'assets/images/skeleton.png' },
        { name: 'ghost', src: 'assets/images/ghost.png' },
        { name: 'mini_boss', src: 'assets/images/mini_boss.png' },
        { name: 'boss', src: 'assets/images/boss.png' },
        { name: 'dagger', src: 'assets/images/dagger.png' },
        { name: 'fireball', src: 'assets/images/fireball.png' },
        { name: 'lightning', src: 'assets/images/lightning.png' },
        { name: 'exp_orb', src: 'assets/images/exp_orb.png' },
        { name: 'box', src: 'assets/images/BOX.png' },
        // 唱歌技能特效圖片（四張）
        { name: 'LA', src: 'assets/images/LA.png' },
        { name: 'LA2', src: 'assets/images/LA2.png' },
        { name: 'LA3', src: 'assets/images/LA3.png' },
        { name: 'LA4', src: 'assets/images/LA4.png' },
        // 障礙物素材
        { name: 'S1', src: 'assets/images/S1.png' },
        { name: 'S2', src: 'assets/images/S2.png' },
        { name: 'S3', src: 'assets/images/S3.png' },
        { name: 'S4', src: 'assets/images/S4.png' },
        { name: 'S5', src: 'assets/images/S5.png' },
        { name: 'S6', src: 'assets/images/S6.png' },
        { name: 'S7', src: 'assets/images/S7.png' },
        { name: 'S8', src: 'assets/images/S8.png' },
        // 背景素材（多地圖）
        { name: 'background', src: 'assets/images/background.jpg' },
        { name: 'background2', src: 'assets/images/background2.jpg' },
        { name: 'background3', src: 'assets/images/background3.jpg' }
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
    const isAnyMenuOpen = () => {
        const levelEl = document.getElementById('level-up-menu');
        const skillsEl = document.getElementById('skills-menu');
        const levelOpen = levelEl && !levelEl.classList.contains('hidden');
        const skillsOpen = skillsEl && !skillsEl.classList.contains('hidden');
        return !!(levelOpen || skillsOpen);
    };

    const isMenuVisible = () => {
        const startVisible = !document.getElementById('start-screen').classList.contains('hidden');
        const charVisible = !document.getElementById('character-select-screen').classList.contains('hidden');
        const mapVisible = !document.getElementById('map-select-screen').classList.contains('hidden');
        const diffVisible = !document.getElementById('difficulty-select-screen').classList.contains('hidden');
        const talentVisible = Array.from(document.querySelectorAll('#talent-select-screen')).some(el => !el.classList.contains('hidden'));
        return startVisible || charVisible || mapVisible || diffVisible || talentVisible;
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            Game.pause();
            AudioManager.setMuted && AudioManager.setMuted(true);
        } else {
            const gameVisible = !document.getElementById('game-screen').classList.contains('hidden');
            if (gameVisible && !Game.isGameOver && !isAnyMenuOpen()) {
                Game.resume();
                AudioManager.setMuted && AudioManager.setMuted(false);
            } else if (isMenuVisible()) {
                // 解除靜音並恢復選單音樂（不觸發遊戲音樂）
                AudioManager.isMuted = false;
                if (AudioManager.playMusic) AudioManager.playMusic('menu_music');
            }
        }
    });

    window.addEventListener('blur', () => {
        Game.pause();
        AudioManager.setMuted && AudioManager.setMuted(true);
    });

    window.addEventListener('focus', () => {
        const gameVisible = !document.getElementById('game-screen').classList.contains('hidden');
        if (gameVisible && !Game.isGameOver && !isAnyMenuOpen()) {
            Game.resume();
            AudioManager.setMuted && AudioManager.setMuted(false);
        } else if (isMenuVisible()) {
            // 解除靜音並恢復選單音樂（不觸發遊戲音樂）
            AudioManager.isMuted = false;
            if (AudioManager.playMusic) AudioManager.playMusic('menu_music');
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

// 選角介面事件與確認流程
function setupCharacterSelection() {
    const screen = document.getElementById('character-select-screen');
    const cards = screen.querySelectorAll('.char-card.selectable');
    const confirmBox = document.getElementById('character-confirm');
    const okBtn = document.getElementById('character-confirm-ok');
    const cancelBtn = document.getElementById('character-confirm-cancel');
    let picked = null;
    let lastTapTime = 0;

    const showPreview = (ch) => {
        picked = ch;
        if (confirmBox) {
            show(confirmBox); // 使用輔助函數替換 confirmBox.classList.remove('hidden')
        }
    };

    cards.forEach(card => {
        const id = card.getAttribute('data-char-id');
        const ch = (CONFIG.CHARACTERS || []).find(c => c.id === id);
        // 單擊：僅更新預覽
        card.addEventListener('click', () => {
            playClick2(); // 添加選角音效
            showPreview(ch);
        });
        // 雙擊：直接跳到選地圖視窗，取消確認視窗
        card.addEventListener('dblclick', () => {
            showPreview(ch);
            Game.selectedCharacter = ch;
            hide(confirmBox); // 使用輔助函數替換 classList.add('hidden')
            playClick(); // 使用輔助函數替換 AudioManager.playSound('button_click')
            show(DOMCache.get('map-select-screen')); // 使用輔助函數替換 mapEl.classList.remove('hidden')
        });
        // 觸控雙擊（兩次點擊間隔<=300ms）
        card.addEventListener('touchend', () => {
            const now = Date.now();
            if (now - lastTapTime <= 300) {
                showPreview(ch);
                Game.selectedCharacter = ch;
                hide(confirmBox); // 使用輔助函數替換 classList.add('hidden')
                playClick(); // 使用輔助函數替換 AudioManager.playSound('button_click')
                show(DOMCache.get('map-select-screen')); // 使用輔助函數替換 mapEl.classList.remove('hidden')
            }
            lastTapTime = now;
        }, { passive: true });
    });

    okBtn?.addEventListener('click', () => {
        hide(confirmBox); // 使用輔助函數替換 classList.add('hidden')
        // 套用選角，改為彈出的方式顯示地圖選擇（保持選角介面不隱藏）
        Game.selectedCharacter = picked;
        playClick(); // 使用輔助函數替換 AudioManager.playSound('button_click')
        show(DOMCache.get('map-select-screen')); // 使用輔助函數替換 mapEl.classList.remove('hidden')
    });

    cancelBtn?.addEventListener('click', () => {
        hide(confirmBox); // 使用輔助函數替換 classList.add('hidden')
        picked = null;
    });

    // 註冊空白鍵處理器到 KeyboardRouter
    KeyboardRouter.register('character-select', 'Space', (e) => {
        e.preventDefault();
        if (picked) {
            Game.selectedCharacter = picked;
            hide(confirmBox); // 使用輔助函數替換 classList.add('hidden')
            playClick(); // 使用輔助函數替換 AudioManager.playSound('button_click')
            show(DOMCache.get('map-select-screen')); // 使用輔助函數替換 mapEl.classList.remove('hidden')
        }
    });
}

// 地圖與難度選擇事件
function setupMapAndDifficultySelection() {
    const mapScreen = document.getElementById('map-select-screen');
    const diffScreen = document.getElementById('difficulty-select-screen');
    const mapCards = mapScreen.querySelectorAll('.map-card.selectable');
    const mapDescEl = document.getElementById('map-description');
    const mapCancel = document.getElementById('map-cancel');
    const diffCancel = document.getElementById('diff-cancel');
    let selectedMapCfg = null;
    let lastTapTime = 0;

    const showMapDesc = (cfg, card) => {
        Game.selectedMap = cfg || null;
        playClick2(); // 使用輔助函數替換 AudioManager.playSound('button_click2')
        if (mapDescEl) {
            mapDescEl.textContent = '光滑平面的廁所，可利用馬桶障礙物躲避敵人';
        }
    };
    const confirmMap = () => {
        if (!selectedMapCfg) return;
        switchScreen(mapScreen, diffScreen); // 使用輔助函數替換 classList.add/remove('hidden')
    };

    mapCards.forEach(card => {
        const id = card.getAttribute('data-map-id');
        const cfg = (CONFIG.MAPS || []).find(m => m.id === id);
        const disabled = card.classList.contains('disabled');

        card.addEventListener('click', () => {
            if (disabled) {
                playClick(); // 使用輔助函數替換 AudioManager.playSound('button_click')
                return;
            }
            selectedMapCfg = cfg;
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

    // 註冊空白鍵處理器到 KeyboardRouter
    KeyboardRouter.register('map-select', 'Space', (e) => {
        e.preventDefault();
        confirmMap();
    });

    if (mapCancel) {
        mapCancel.addEventListener('click', () => {
            hide(mapScreen); // 使用輔助函數替換 classList.add('hidden')
            // 保持選角介面可見，無需切換
        });
    }

    const diffCards = diffScreen.querySelectorAll('.diff-card.selectable');
    const diffBack = document.getElementById('diff-back');

    diffCards.forEach(card => {
        card.addEventListener('click', () => {
            const id = card.getAttribute('data-diff-id') || 'EASY';
            Game.selectedDifficultyId = id;
            playClick(); // 使用輔助函數替換 AudioManager.playSound('button_click')
            hide(diffScreen); // 使用輔助函數替換 classList.add('hidden')
            // 新增：開始遊戲時隱藏選角與選圖介面，切換到遊戲畫面
            hide(DOMCache.get('character-select-screen')); // 使用輔助函數替換 classList.add('hidden')
            hide(DOMCache.get('map-select-screen')); // 使用輔助函數替換 classList.add('hidden')
            Game.startNewGame();
            // 切換遊戲BGM
            if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                AudioManager.playMusic('game_music');
            }
            show(DOMCache.get('game-screen')); // 使用輔助函數替換 classList.remove('hidden')
        });
    });

    if (diffBack) {
        diffBack.addEventListener('click', () => {
            switchScreen(diffScreen, mapScreen); // 使用輔助函數替換 classList.add/remove('hidden')
        });
    }
}

// 等比縮放遊戲視窗，避免變形
function setupResponsiveViewport() {
    const resizeViewport = () => {
        const viewport = document.getElementById('viewport');
        if (!viewport) return;
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
    
    /**
     * 註冊按鍵處理器
     * @param {string} context - 上下文名稱（如 'character-select', 'talent-screen'）
     * @param {string} key - 按鍵代碼（如 'Space', 'Escape'）
     * @param {Function} handler - 處理函數
     */
    register(context, key, handler) {
        const contextKey = `${context}:${key}`;
        this.handlers.set(contextKey, handler);
    },
    
    /**
     * 獲取當前上下文
     * @returns {string} 當前畫面的上下文名稱
     */
    getCurrentContext() {
        // 檢查各個畫面的可見性，返回對應的上下文
        if (!document.getElementById('character-select-screen').classList.contains('hidden')) {
            return 'character-select';
        }
        if (!document.getElementById('map-select-screen').classList.contains('hidden')) {
            return 'map-select';
        }
        if (!document.getElementById('talent-select-screen').classList.contains('hidden')) {
            return 'talent-select';
        }
        if (!document.getElementById('game-screen').classList.contains('hidden')) {
            return 'game';
        }
        return 'default';
    },
    
    /**
     * 處理按鍵事件
     * @param {KeyboardEvent} event - 鍵盤事件
     */
    handle(event) {
        const context = this.getCurrentContext();
        const contextKey = `${context}:${event.code}`;
        const handler = this.handlers.get(contextKey);
        
        if (handler) {
            handler(event);
        }
    }
};

// 初始化 DOM 緩存
document.addEventListener('DOMContentLoaded', function() {
    // 初始化 DOM 緩存
    DOMCache.init();
    
    // 綁定中央鍵盤事件處理器
    document.addEventListener('keydown', (e) => {
        KeyboardRouter.handle(e);
    });
});
