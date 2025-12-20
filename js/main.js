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
        { name: 'player', src: 'assets/images/player.gif' },
        { name: 'player1-2', src: 'assets/images/player1-2.png' },
        // 新增：第二位角色（灰妲DaDa）相關圖片
        // - player2.png   ：所有模式中玩家進入戰場時的主體形象
        // - player2-2.png ：所有模式 HUD 左上角頭像 + 生存模式升級介面左側底圖
        // - player2-3.png ：選角介面角色卡片/預覽用圖片
        { name: 'player2', src: 'assets/images/player2.png' },
        { name: 'player2-1', src: 'assets/images/player2-1.png' }, // player2向右的圖片
        { name: 'player2-2', src: 'assets/images/player2-2.png' },
        { name: 'player2-3', src: 'assets/images/player2-3.png' },
        // 第三位角色圖片：
        // - player3.gif   ：所有模式中玩家進入戰場時的主體形象
        // - player3-2.png  ：所有模式 HUD 左上角頭像 + 生存模式升級介面左側底圖
        // - player3-3.png  ：選角介面角色卡片/預覽用圖片
        { name: 'player3', src: 'assets/images/player3.gif' },
        { name: 'player3-2', src: 'assets/images/player3-2.png' },
        { name: 'player3-3', src: 'assets/images/player3-3.png' },
        // 第四位角色圖片：
        // - player4.png   ：所有模式中玩家進入戰場時的主體形象（500x627）
        // - player4-2.png ：所有模式 HUD 左上角頭像 + 生存模式升級介面左側底圖
        // - player4-3.png ：選角介面角色卡片/預覽用圖片
        { name: 'player4', src: 'assets/images/player4.png' },
        { name: 'player4-2', src: 'assets/images/player4-2.png' },
        { name: 'player4-3', src: 'assets/images/player4-3.png' },
        // 第五位角色圖片：
        // - player5.png   ：所有模式中玩家進入戰場時的主體形象（500x467）
        // - player5-2.png ：所有模式 HUD 左上角頭像 + 生存模式升級介面左側底圖
        // - player5-3.png ：選角介面角色卡片/預覽用圖片
        { name: 'player5', src: 'assets/images/player5.png' },
        { name: 'player5-2', src: 'assets/images/player5-2.png' },
        { name: 'player5-3', src: 'assets/images/player5-3.png' },
        { name: 'playerN', src: 'assets/images/playerN.png' },
        { name: 'playerN2', src: 'assets/images/playerN2.gif' }, // 第二位角色大絕專用動態圖片
        { name: 'playerN3', src: 'assets/images/playerN3.png' }, // 第四位角色大絕專用圖片（267x300）
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
        // 第4張地圖：花園 - 花精靈系列敵人
        { name: 'elf', src: 'assets/images/Elf.png' },
        { name: 'elf2', src: 'assets/images/Elf2.png' },
        { name: 'elf3', src: 'assets/images/Elf3.png' },
        { name: 'elf_mini_boss', src: 'assets/images/Elf_mini_boss.png' },
        { name: 'elfboss', src: 'assets/images/Elfboss.png' },
        { name: 'dagger', src: 'assets/images/dagger.png' },
        { name: 'fireball', src: 'assets/images/fireball.png' },
        { name: 'lightning', src: 'assets/images/lightning.png' },
        { name: 'chicken', src: 'assets/images/chicken.png' }, // 雞腿庇佑專用圖片
        { name: 'A21', src: 'assets/images/A21.png' }, // 大波球技能圖片
        { name: 'A22', src: 'assets/images/A22.png' }, // 抽象化技能圖片
        { name: 'A23', src: 'assets/images/A23.png' }, // 狂熱大波技能圖片
        { name: 'A24', src: 'assets/images/A24.png' }, // 銀河系征服者成就圖片
        { name: 'A25', src: 'assets/images/A25.png' }, // 幼妲天使技能圖片
        { name: 'A26', src: 'assets/images/A26.png' }, // 星雲征服者成就圖片
        { name: 'A27', src: 'assets/images/A27.png' }, // 引力波技能圖片/成就圖片
        { name: 'A31', src: 'assets/images/A31.png' }, // 旋轉鬆餅技能圖片
        { name: 'A28', src: 'assets/images/A28.png' }, // 鬆餅投擲技能圖片
        { name: 'A29', src: 'assets/images/A29.png' }, // 死線戰士技能圖片
        { name: 'A32', src: 'assets/images/A32.png' }, // 不獸控制技能圖片
        { name: 'A30', src: 'assets/images/A30.png' }, // 死線超人技能圖片/成就圖片
        { name: 'A33', src: 'assets/images/A33.png' }, // 光芒萬丈技能圖片/成就圖片
        { name: 'AI', src: 'assets/images/AI.png' }, // 召喚AI技能圖片/成就圖片
        { name: 'AI2', src: 'assets/images/AI2.png' }, // AI生命體往左圖片
        { name: 'AI3', src: 'assets/images/AI3.png' }, // AI生命體往右圖片
        { name: 'muffin', src: 'assets/images/muffin.png' }, // 旋轉鬆餅視覺效果圖片
        { name: 'muffin2', src: 'assets/images/muffin2.png' }, // 鬆餅投擲視覺效果圖片
        { name: 'die', src: 'assets/images/die.png' }, // 死線戰士傷害特效雪碧圖
        { name: 'ICE3', src: 'assets/images/ICE3.png' }, // 大波球冰彈圖片
        { name: 'knife', src: 'assets/images/knife.gif' },
        { name: 'knife2', src: 'assets/images/knife2.gif' },
        { name: 'Explosion', src: 'assets/images/Explosion.png' }, // 艾比大绝爆炸雪碧图
        { name: 'exp_orb', src: 'assets/images/exp_orb.png' },
// 新增：守護領域場域圖片
        { name: 'field', src: 'assets/images/field.png' },
        { name: 'field2', src: 'assets/images/field2.png' }, // 引力波場域圖片
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
        // 第4張地圖：花園 - 裝飾物素材
        { name: 'S10', src: 'assets/images/S10.png' },
        { name: 'S11', src: 'assets/images/S11.png' },
        { name: 'S12', src: 'assets/images/S12.png' },
        { name: 'S13', src: 'assets/images/S13.png' },
        { name: 'S14', src: 'assets/images/S14.png' },
        { name: 'S15', src: 'assets/images/S15.png' },
        { name: 'S16', src: 'assets/images/S16.png' },
        // 背景素材（多地圖）
        { name: 'background', src: 'assets/images/background.jpg' },
        { name: 'background2', src: 'assets/images/background2.jpg' },
        { name: 'background3', src: 'assets/images/background3.jpg' },
        // 新增：挑戰模式「銀河系」地圖背景
        { name: 'background4', src: 'assets/images/background4.png' },
        { name: 'background1-2', src: 'assets/images/background1-2.png' },
        { name: 'background1-3', src: 'assets/images/background1-3.png' },
        // 第4張地圖：花園背景
        { name: 'background8', src: 'assets/images/background8.png' },
        // 生存模式出口圖片
        { name: 'exit', src: 'assets/images/exit.png' }
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
        if (document.hidden) {
            Game.pause();
            AudioManager.setMuted && AudioManager.setMuted(true);
        } else {
            // 若目前為非生存模式（主線/挑戰），維持暫停並不恢復生存迴圈或BGM
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                // 非生存模式包含：主線、挑戰、闖關、防禦、冒險（這些模式的暫停/菜單由各自 UI 控制）
                const isNonSurvivalMode = (activeId === 'main' || activeId === 'challenge' || activeId === 'stage' || activeId === 'defense' || activeId === 'adventure');
                if (isNonSurvivalMode) {
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
        Game.pause();
        AudioManager.setMuted && AudioManager.setMuted(true);
    });

    window.addEventListener('focus', () => {
        try {
            const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                ? GameModeManager.getCurrent()
                : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                    ? ModeManager.getActiveModeId()
                    : null);
            // 非生存模式包含：主線、挑戰、闖關、防禦、冒險（這些模式的暫停/菜單由各自 UI 控制）
            const isNonSurvivalMode = (activeId === 'main' || activeId === 'challenge' || activeId === 'stage' || activeId === 'defense' || activeId === 'adventure');
            if (isNonSurvivalMode) {
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
            const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                ? GameModeManager.getCurrent()
                : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                    ? ModeManager.getActiveModeId()
                    : null);
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

// 選角介面事件與確認流程（回復原行為：單擊僅更新預覽，雙擊/空白鍵進入選圖）
function setupCharacterSelection() {
    const screen = document.getElementById('character-select-screen');
    const cards = screen.querySelectorAll('.char-card.selectable');
    const previewImg = document.getElementById('char-preview-img');
    const previewName = document.getElementById('char-preview-name');
    const previewDesc = document.getElementById('char-preview-desc');
    let picked = null;
    let lastTapTime = 0;

    // 角色解鎖狀態管理（不透過 SaveCode，僅使用獨立 localStorage 鍵，避免影響引繼碼結構）
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
    CHICKEN_BLESSING: 'assets/images/A19.png',
    YOUNG_DADA_GLORY: 'assets/images/A20.png',
    BIG_ICE_BALL: 'assets/images/A21.png',
    ABSTRACTION: 'assets/images/A22.png',
    FRENZY_ICE_BALL: 'assets/images/A23.png',
    FRENZY_YOUNG_DADA_GLORY: 'assets/images/A25.png',
    ROTATING_MUFFIN: 'assets/images/A31.png',
    MUFFIN_THROW: 'assets/images/A28.png',
    DEATHLINE_WARRIOR: 'assets/images/A29.png',
    UNCONTROLLABLE_BEAST: 'assets/images/A32.png',
    DEATHLINE_SUPERMAN: 'assets/images/A30.png',
    RADIANT_GLORY: 'assets/images/A33.png',
    SUMMON_AI: 'assets/images/AI.png',
    MIND_MAGIC: 'assets/images/A16.png',
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
                    // 執行解鎖
                    const price = ch.unlockCost || 0;
                    if (price > 0) {
                        const currentCoins = Game.coins || 0;
                        if (currentCoins >= price) {
                            Game.coins = Math.max(0, Math.floor(currentCoins - price));
                            try { Game.saveCoins(); } catch (_) {}
                            try { if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) UI.updateCoinsDisplay(Game.coins); } catch (_) {}
                            // 解鎖角色
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
                            const saveUnlockedCharacters = (list) => {
                                try {
                                    const arr = Array.isArray(list) ? list.slice() : [];
                                    if (!arr.includes('margaret')) arr.push('margaret');
                                    localStorage.setItem(CHAR_UNLOCK_KEY, JSON.stringify(arr));
                                } catch (_) {}
                            };
                            const unlockedSet = new Set(loadUnlockedCharacters());
                            if (!unlockedSet.has(charId)) {
                                unlockedSet.add(charId);
                                saveUnlockedCharacters(Array.from(unlockedSet));
                            }
                            // 更新卡片狀態
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
    const adventureGrid = document.getElementById('grid-adventure');
    const modeSurvival = document.getElementById('mode-survival');
    const modeChallenge = document.getElementById('mode-challenge');
    const modeStage = document.getElementById('mode-stage');
    const modeDefense = document.getElementById('mode-defense');
    const modeMain = document.getElementById('mode-main');
    const modeAdventure = document.getElementById('mode-adventure');

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
            if (adventureGrid) hide(adventureGrid);
            // 改為與使用者要求一致的提示文案
            if (mapDescEl) mapDescEl.textContent = '提示：點擊地圖顯示介紹，雙擊或空白鍵確認';
            selectedMapCfg = null;
            if (modeSurvival) modeSurvival.classList.remove('primary');
            if (modeChallenge) modeChallenge.classList.add('primary');
            if (modeStage) modeStage.classList.remove('primary');
            if (modeDefense) modeDefense.classList.remove('primary');
            if (modeMain) modeMain.classList.remove('primary');
            if (modeAdventure) modeAdventure.classList.remove('primary');
        } else if (mode === 'stage') {
            if (survivalGrid) hide(survivalGrid);
            if (challengeGrid) hide(challengeGrid);
            if (stageGrid) show(stageGrid);
            if (defenseGrid) hide(defenseGrid);
            if (mainGrid) hide(mainGrid);
            if (adventureGrid) hide(adventureGrid);
            if (mapDescEl) mapDescEl.textContent = '提示：點擊地圖顯示介紹，雙擊或空白鍵確認';
            selectedMapCfg = null;
            if (modeSurvival) modeSurvival.classList.remove('primary');
            if (modeChallenge) modeChallenge.classList.remove('primary');
            if (modeStage) modeStage.classList.add('primary');
            if (modeDefense) modeDefense.classList.remove('primary');
            if (modeMain) modeMain.classList.remove('primary');
            if (modeAdventure) modeAdventure.classList.remove('primary');
        } else if (mode === 'defense') {
            if (survivalGrid) hide(survivalGrid);
            if (challengeGrid) hide(challengeGrid);
            if (stageGrid) hide(stageGrid);
            if (defenseGrid) show(defenseGrid);
            if (mainGrid) hide(mainGrid);
            if (adventureGrid) hide(adventureGrid);
            if (mapDescEl) mapDescEl.textContent = '提示：點擊地圖顯示介紹，雙擊或空白鍵確認';
            selectedMapCfg = null;
            if (modeSurvival) modeSurvival.classList.remove('primary');
            if (modeChallenge) modeChallenge.classList.remove('primary');
            if (modeStage) modeStage.classList.remove('primary');
            if (modeDefense) modeDefense.classList.add('primary');
            if (modeMain) modeMain.classList.remove('primary');
            if (modeAdventure) modeAdventure.classList.remove('primary');
        } else if (mode === 'main') {
            if (survivalGrid) hide(survivalGrid);
            if (challengeGrid) hide(challengeGrid);
            if (stageGrid) hide(stageGrid);
            if (defenseGrid) hide(defenseGrid);
            if (mainGrid) show(mainGrid);
            if (adventureGrid) hide(adventureGrid);
            if (mapDescEl) mapDescEl.textContent = '提示：點擊地圖顯示介紹，雙擊或空白鍵確認';
            selectedMapCfg = null;
            if (modeSurvival) modeSurvival.classList.remove('primary');
            if (modeChallenge) modeChallenge.classList.remove('primary');
            if (modeStage) modeStage.classList.remove('primary');
            if (modeDefense) modeDefense.classList.remove('primary');
            if (modeMain) modeMain.classList.add('primary');
            if (modeAdventure) modeAdventure.classList.remove('primary');
        } else if (mode === 'adventure') {
            if (survivalGrid) hide(survivalGrid);
            if (challengeGrid) hide(challengeGrid);
            if (stageGrid) hide(stageGrid);
            if (defenseGrid) hide(defenseGrid);
            if (mainGrid) hide(mainGrid);
            if (adventureGrid) show(adventureGrid);
            if (mapDescEl) mapDescEl.textContent = '提示：點擊地圖顯示介紹，雙擊或空白鍵確認';
            selectedMapCfg = null;
            if (modeSurvival) modeSurvival.classList.remove('primary');
            if (modeChallenge) modeChallenge.classList.remove('primary');
            if (modeStage) modeStage.classList.remove('primary');
            if (modeDefense) modeDefense.classList.remove('primary');
            if (modeMain) modeMain.classList.remove('primary');
            if (modeAdventure) modeAdventure.classList.add('primary');
        } else {
            if (survivalGrid) show(survivalGrid);
            if (challengeGrid) hide(challengeGrid);
            if (stageGrid) hide(stageGrid);
            if (defenseGrid) hide(defenseGrid);
            if (mainGrid) hide(mainGrid);
            if (adventureGrid) hide(adventureGrid);
            if (mapDescEl) mapDescEl.textContent = '提示：點擊地圖顯示介紹，雙擊或空白鍵確認';
            selectedMapCfg = null;
            if (modeSurvival) modeSurvival.classList.add('primary');
            if (modeChallenge) modeChallenge.classList.remove('primary');
            if (modeStage) modeStage.classList.remove('primary');
            if (modeDefense) modeDefense.classList.remove('primary');
            if (modeMain) modeMain.classList.remove('primary');
            if (modeAdventure) modeAdventure.classList.remove('primary');
        }
    };
    // 綁定模式按鈕
    if (modeSurvival) modeSurvival.addEventListener('click', () => switchMode('survival'));
    if (modeChallenge) modeChallenge.addEventListener('click', () => switchMode('challenge'));
    if (modeStage) modeStage.addEventListener('click', () => switchMode('stage'));
    if (modeDefense) modeDefense.addEventListener('click', () => switchMode('defense'));
    if (modeMain) modeMain.addEventListener('click', () => switchMode('main'));
    if (modeAdventure) modeAdventure.addEventListener('click', () => switchMode('adventure'));

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
            } else if (cfg && (cfg.id === 'garden' || cfg.name === '花園' || cfg.name === 'LV4.花園')) {
                mapDescEl.textContent = '美麗的花園中，花精靈們守護著這片淨土。';
            } else if (cfg && (cfg.id === 'challenge-1' || (typeof cfg.name === 'string' && cfg.name.includes('銀河系')))) {
                // 銀河系地圖介紹
                mapDescEl.textContent = '未知信號所具現化的能量體「森森鈴蘭」。';
            } else if (cfg && (cfg.id === 'challenge-2' || (typeof cfg.name === 'string' && cfg.name.includes('星雲')))) {
                // 星雲地圖介紹
                mapDescEl.textContent = '星雲深處的神秘存在「洛可洛斯特」，在宇宙中探索著鬆餅。';
            } else if (cfg && (cfg.id === 'challenge-3' || (typeof cfg.name === 'string' && cfg.name.includes('星軌')))) {
                // 星軌地圖介紹
                mapDescEl.textContent = '宇宙星軌守護者「灰妲」，操控著恆星的運行軌跡，非常愛工作。';
            } else if (cfg && (cfg.id === 'challenge-4' || (typeof cfg.name === 'string' && cfg.name.includes('黑洞')))) {
                // 黑洞地圖介紹
                mapDescEl.textContent = '黑洞深處的終極存在「瑪格麗特·諾爾絲」，掌控著宇宙最神秘的力量。';
            } else if (cfg && (cfg.id === 'defense-1' || (typeof cfg.name === 'string' && cfg.name.includes('糖果煉金坊')))) {
                // 防禦模式第一張地圖介紹
                mapDescEl.textContent = '守護魔法糖果煉金坊，抵抗未知信號的入侵！';
            } else if (cfg && (cfg.id === 'adventure-isekai' || (typeof cfg.name === 'string' && cfg.name.includes('異世界')))) {
                // 冒險模式「異世界」介紹
                mapDescEl.textContent = '從主體遊戲前往另一個世界，請手動F2存檔，遊戲不會自動存檔。';
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

        // 若目前顯示的是主線模式 grid，直接啟動主線模式，不進入難度選擇
        const isMainMode = mainGrid && !mainGrid.classList.contains('hidden');
        if (isMainMode) {
            // 關鍵：先顯示過渡層並播放 LOAD.mp4，再隱藏選單屏幕，避免黑屏
            try {
              if (typeof window !== 'undefined' && window.TransitionLayer && typeof window.TransitionLayer.show === 'function') {
                window.TransitionLayer.show();
              }
            } catch(e) {}
            
            // 過渡層已顯示後，再隱藏選單屏幕
            hide(mapScreen);
            hide(diffScreen);
            if (desertDiffScreen) hide(desertDiffScreen);
            hide(DOMCache.get('character-select-screen'));
            
            // 透過 GameModeManager 啟動主線模式（不分難度）；若不可用則回退至 ModeManager
            if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
                window.GameModeManager.start('main', {
                    selectedCharacter: Game.selectedCharacter,
                    selectedMap: Game.selectedMap
                });
            } else if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.start === 'function') {
                window.ModeManager.start('main', {
                    selectedCharacter: Game.selectedCharacter,
                    selectedMap: Game.selectedMap
                });
            } else {
                // 後備：僅顯示遊戲畫面
                show(DOMCache.get('game-screen'));
            }
            return;
        }

        // 若目前顯示的是挑戰模式 grid，直接啟動挑戰模式，不進入難度選擇
        const isChallengeMode = challengeGrid && !challengeGrid.classList.contains('hidden');
        if (isChallengeMode) {
            // 關閉地圖/難度視窗與選角畫面
            hide(mapScreen);
            hide(diffScreen);
            if (desertDiffScreen) hide(desertDiffScreen);
            hide(DOMCache.get('character-select-screen'));
            // 透過 GameModeManager 啟動挑戰模式；若不可用則回退至 ModeManager
            if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
                window.GameModeManager.start('challenge', {
                    selectedCharacter: Game.selectedCharacter,
                    selectedMap: Game.selectedMap
                });
            } else if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.start === 'function') {
                window.ModeManager.start('challenge', {
                    selectedCharacter: Game.selectedCharacter,
                    selectedMap: Game.selectedMap
                });
            } else {
                // 後備：僅顯示遊戲畫面
                show(DOMCache.get('game-screen'));
            }
            return;
        }

        // 若目前顯示的是闖關模式 grid，直接啟動闖關模式，不進入難度選擇
        const isStageMode = stageGrid && !stageGrid.classList.contains('hidden');
        if (isStageMode) {
            hide(mapScreen);
            hide(diffScreen);
            if (desertDiffScreen) hide(desertDiffScreen);
            hide(DOMCache.get('character-select-screen'));
            if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
                window.GameModeManager.start('stage', {
                    selectedCharacter: Game.selectedCharacter,
                    selectedMap: Game.selectedMap
                });
            } else if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.start === 'function') {
                window.ModeManager.start('stage', {
                    selectedCharacter: Game.selectedCharacter,
                    selectedMap: Game.selectedMap
                });
            } else {
                show(DOMCache.get('game-screen'));
            }
            return;
        }

        // 若目前顯示的是防禦模式 grid，或「已選地圖屬於防禦系列」，直接啟動防禦模式，不進入難度選擇
        const isDefenseMode = defenseGrid && !defenseGrid.classList.contains('hidden');
        const isDefenseMap = selectedMapCfg && typeof selectedMapCfg.id === 'string' && selectedMapCfg.id.indexOf('defense') === 0;
        if (isDefenseMode || isDefenseMap) {
            hide(mapScreen);
            hide(diffScreen);
            if (desertDiffScreen) hide(desertDiffScreen);
            hide(DOMCache.get('character-select-screen'));
            let started = false;
            try {
                if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
                    if (typeof window.GameModeManager.has === 'function' && !window.GameModeManager.has('defense')) {
                        throw new Error('defense mode not registered');
                    }
                    window.GameModeManager.start('defense', {
                        selectedCharacter: Game.selectedCharacter,
                        selectedMap: Game.selectedMap
                    });
                    started = true;
                }
            } catch (_) {}
            if (!started) {
                try {
                    if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.start === 'function') {
                        window.ModeManager.start('defense', {
                            selectedCharacter: Game.selectedCharacter,
                            selectedMap: Game.selectedMap
                        });
                        started = true;
                    }
                } catch (_) {}
            }
            if (!started) {
                show(DOMCache.get('game-screen'));
            }
            return;
        }

        // 若目前顯示的是冒險模式 grid，直接啟動冒險模式，不進入難度選擇（獨立存檔）
        const isAdventureMode = adventureGrid && !adventureGrid.classList.contains('hidden');
        if (isAdventureMode) {
            hide(mapScreen);
            hide(diffScreen);
            if (desertDiffScreen) hide(desertDiffScreen);
            hide(DOMCache.get('character-select-screen'));
            try {
                if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
                    window.GameModeManager.start('adventure', {
                        selectedCharacter: Game.selectedCharacter,
                        selectedMap: Game.selectedMap
                    });
                } else if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.start === 'function') {
                    window.ModeManager.start('adventure', {
                        selectedCharacter: Game.selectedCharacter,
                        selectedMap: Game.selectedMap
                    });
                }
            } catch(_) {}
            return;
        }

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
        // 透過新的 GameModeManager 啟動（優先）；若不可用則回退至舊 ModeManager；再不行回退至既有流程
        if (typeof window !== 'undefined' && window.GameModeManager && typeof window.GameModeManager.start === 'function') {
            window.GameModeManager.start('survival', {
                selectedDifficultyId: useId,
                selectedCharacter: Game.selectedCharacter,
                selectedMap: Game.selectedMap
            });
        } else if (typeof window !== 'undefined' && window.ModeManager && typeof window.ModeManager.start === 'function') {
            window.ModeManager.start('survival', {
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
                } else if (useId === 'ASURA') {
                    track = 'shura_music';
                }
                AudioManager.playMusic(track);
            }
            show(DOMCache.get('game-screen'));
        }
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
