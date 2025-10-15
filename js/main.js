// 遊戲主入口
document.addEventListener('DOMContentLoaded', function() {
    // 獲取開始按鈕
    const startButton = document.getElementById('start-button');
    
    // 添加開始按鈕點擊事件
    startButton.addEventListener('click', function() {
        Game.startNewGame();
    });
    
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
    
    // 初始化遊戲（但不開始）
    Game.init();
    
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
    // 這裡可以添加預設圖片的創建邏輯
    // 由於我們使用簡單的幾何圖形繪製，暫時不需要預載圖片
    console.log('使用預設圖形繪製遊戲元素');
}