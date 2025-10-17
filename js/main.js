// 遊戲主入口
document.addEventListener('DOMContentLoaded', function() {
    // 開始按鈕
    const startButton = document.getElementById('start-button');
    startButton.addEventListener('click', function() {
        AudioManager.playSound && AudioManager.playSound('button_click');
        // 以使用者點擊作為手勢觸發，開始播放遊戲BGM
        if (AudioManager.playMusic) {
            AudioManager.playMusic('game_music');
        }
        // 進入選角介面而非直接開始
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('character-select-screen').classList.remove('hidden');
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
    
    // 添加視頻結束事件處理
    const gameOverVideo = document.getElementById('game-over-video');
    gameOverVideo.addEventListener('ended', function() {
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
        // 影片結束後恢復音樂與音效
        if (AudioManager.setMuted) AudioManager.setMuted(false);
        if (AudioManager.playMusic) AudioManager.playMusic('menu_music');
    });
    
    const victoryVideo = document.getElementById('victory-video');
    victoryVideo.addEventListener('ended', function() {
        document.getElementById('victory-screen').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
        // 影片結束後恢復音樂與音效
        if (AudioManager.setMuted) AudioManager.setMuted(false);
        if (AudioManager.playMusic) AudioManager.playMusic('menu_music');
    });
    
    // 創建預設的視頻文件
    createDefaultVideos();
    
    // 創建預設的圖片資源
    createDefaultImages();
    
    // 初始化音效系統
    AudioManager.init();
    
    // 初始化遊戲（但不開始）
    Game.init();

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

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            Game.pause();
            AudioManager.setMuted && AudioManager.setMuted(true);
        } else {
            if (!Game.isGameOver && !isAnyMenuOpen()) {
                Game.resume();
                AudioManager.setMuted && AudioManager.setMuted(false);
            }
        }
    });

    window.addEventListener('blur', () => {
        Game.pause();
        AudioManager.setMuted && AudioManager.setMuted(true);
    });

    window.addEventListener('focus', () => {
        if (!Game.isGameOver && !isAnyMenuOpen()) {
            Game.resume();
            AudioManager.setMuted && AudioManager.setMuted(false);
        }
    });
}

// ESC 技能頁面切換
function setupSkillsMenuToggle() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
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
    if (!screen) return;
    const cards = screen.querySelectorAll('.char-card.selectable');
    const confirmBox = document.getElementById('char-confirm');
    const nameEl = document.getElementById('char-confirm-name');
    const descEl = document.getElementById('char-confirm-desc');
    const okBtn = document.getElementById('char-confirm-ok');
    const cancelBtn = document.getElementById('char-confirm-cancel');
    const previewBox = document.getElementById('char-preview');
    const previewImg = document.getElementById('char-preview-img');
    const previewName = document.getElementById('char-preview-name');
    const previewDesc = document.getElementById('char-preview-desc');
    let picked = null;
    let lastTapTime = 0;

    const showPreview = (ch) => {
        if (!ch) return;
        // 預覽使用自定義介紹圖 player1-2.png
        previewImg.src = (Game.images && Game.images['player1-2']) ? Game.images['player1-2'].src : 'assets/images/player1-2.png';
        previewName.textContent = ch.name || '角色';
        previewDesc.textContent = ch.description || '角色介紹（範例文字）';
        // 選角預覽音效
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound('button_click2');
        }
        picked = ch;
    };

    const openConfirm = () => {
        if (!picked) return;
        nameEl.textContent = picked.name;
        descEl.textContent = `${picked.description}\nHP倍率：x${picked.hpMultiplier}，速度倍率：x${picked.speedMultiplier}`;
        confirmBox.classList.remove('hidden');
    };

    cards.forEach(card => {
        const id = card.getAttribute('data-char-id');
        const ch = (CONFIG.CHARACTERS || []).find(c => c.id === id);
        // 單擊：僅更新預覽
        card.addEventListener('click', () => {
            showPreview(ch);
        });
        // 雙擊：開啟確認
        card.addEventListener('dblclick', () => {
            showPreview(ch);
            openConfirm();
        });
        // 觸控雙擊（兩次點擊間隔<=300ms）
        card.addEventListener('touchend', () => {
            const now = Date.now();
            if (now - lastTapTime <= 300) {
                showPreview(ch);
                openConfirm();
            }
            lastTapTime = now;
        }, { passive: true });
    });

    okBtn.addEventListener('click', () => {
        confirmBox.classList.add('hidden');
        // 套用選角，進入地圖選擇而非直接開始
        Game.selectedCharacter = picked;
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound('button_click');
        }
        // 切換到地圖選擇畫面
        document.getElementById('character-select-screen').classList.add('hidden');
        document.getElementById('map-select-screen').classList.remove('hidden');
    });

    cancelBtn.addEventListener('click', () => {
        confirmBox.classList.add('hidden');
        picked = null;
    });

    // 空白鍵：在選角頁面時開啟確認
    document.addEventListener('keydown', (e) => {
        const selectVisible = !document.getElementById('character-select-screen').classList.contains('hidden');
        if (!selectVisible) return;
        if (e.code === 'Space') {
            e.preventDefault();
            openConfirm();
        }
    });
}

// 地圖與難度選擇事件
function setupMapAndDifficultySelection() {
    const mapScreen = document.getElementById('map-select-screen');
    const diffScreen = document.getElementById('difficulty-select-screen');
    if (!mapScreen || !diffScreen) return;

    const mapCards = mapScreen.querySelectorAll('.map-card.selectable');
    const mapCancel = document.getElementById('map-cancel');

    mapCards.forEach(card => {
        card.addEventListener('click', () => {
            const id = card.getAttribute('data-map-id');
            const cfg = (CONFIG.MAPS || []).find(m => m.id === id);
            Game.selectedMap = cfg || null;
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound && AudioManager.playSound('button_click');
            }
            mapScreen.classList.add('hidden');
            diffScreen.classList.remove('hidden');
        });
    });

    if (mapCancel) {
        mapCancel.addEventListener('click', () => {
            mapScreen.classList.add('hidden');
            document.getElementById('character-select-screen').classList.remove('hidden');
        });
    }

    const diffCards = diffScreen.querySelectorAll('.diff-card.selectable');
    const diffBack = document.getElementById('diff-back');

    diffCards.forEach(card => {
        card.addEventListener('click', () => {
            const id = card.getAttribute('data-diff-id') || 'NORMAL';
            Game.selectedDifficultyId = id;
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound && AudioManager.playSound('button_click');
            }
            diffScreen.classList.add('hidden');
            Game.startNewGame();
            document.getElementById('game-screen').classList.remove('hidden');
        });
    });

    if (diffBack) {
        diffBack.addEventListener('click', () => {
            diffScreen.classList.add('hidden');
            mapScreen.classList.remove('hidden');
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
