// 遊戲主入口
document.addEventListener('DOMContentLoaded', function() {
    // 開始按鈕
    const startButton = document.getElementById('start-button');
    startButton.addEventListener('click', function() {
        AudioManager.playSound && AudioManager.playSound('button_click');
        Game.startNewGame();
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
    });
    
    const victoryVideo = document.getElementById('victory-video');
    victoryVideo.addEventListener('ended', function() {
        document.getElementById('victory-screen').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
    });
    
    // 創建預設的視頻文件
    createDefaultVideos();
    
    // 創建預設的圖片資源
    createDefaultImages();
    
    // 初始化音效系統
    AudioManager.init();
    
    // 初始化遊戲（但不開始）
    Game.init();

    // 設定視窗縮放（PC與手機皆可）
    setupResponsiveViewport();
    
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
        { name: 'background', src: 'assets/images/background.jpeg' }
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
    };
    window.addEventListener('resize', resizeViewport);
    window.addEventListener('orientationchange', resizeViewport);
    resizeViewport();
}
