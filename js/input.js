// 輸入控制系統
const Input = {
    keys: {},
    mousePosition: { x: 0, y: 0 },
    mouseTarget: null,
    isMouseMoving: false,
    
    init: function() {
        // 監聽按鍵按下事件
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            console.log('按鍵按下:', e.key); // 調試信息
            
            // 處理特殊按鍵組合
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault(); // 防止瀏覽器默認行為
                if (typeof Game !== 'undefined') {
                    Game.coins = 0;
                    Game.saveCoins();
                    if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) {
                        UI.updateCoinsDisplay(Game.coins);
                    }
                    console.log('已清除所有金幣');
                }
            }
        });
        
        // 監聽按鍵釋放事件
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
            console.log('按鍵釋放:', e.key); // 調試信息
        });
        
        // 監聽滑鼠點擊事件
        Game.canvas.addEventListener('click', (e) => {
            const rect = Game.canvas.getBoundingClientRect();
            const scaleX = Game.canvas.width / rect.width;
            const scaleY = Game.canvas.height / rect.height;
            // 轉為世界座標（加上鏡頭偏移）
            this.mousePosition.x = (e.clientX - rect.left) * scaleX + (Game.camera?.x || 0);
            this.mousePosition.y = (e.clientY - rect.top) * scaleY + (Game.camera?.y || 0);
            // 將目標點夾限在可到達範圍內，避免卡在邊界
            const halfW = Game.player ? Game.player.width / 2 : 0;
            const halfH = Game.player ? Game.player.height / 2 : 0;
            const worldW = Game.worldWidth || Game.canvas.width;
            const worldH = Game.worldHeight || Game.canvas.height;
            const margin = CONFIG.PLAYER?.BORDER_MARGIN || 0;
            const clampedX = Utils.clamp(this.mousePosition.x, halfW + margin, Math.max(halfW + margin, worldW - halfW - margin));
            const clampedY = Utils.clamp(this.mousePosition.y, halfH + margin, Math.max(halfH + margin, worldH - halfH - margin));
            this.mouseTarget = { x: clampedX, y: clampedY };
            this.isMouseMoving = true;
            console.log('滑鼠點擊目標(已夾限):', this.mouseTarget);
        });
        
        // 監聽滑鼠移動事件以更新位置
        Game.canvas.addEventListener('mousemove', (e) => {
            const rect = Game.canvas.getBoundingClientRect();
            const scaleX = Game.canvas.width / rect.width;
            const scaleY = Game.canvas.height / rect.height;
            // 轉為世界座標（加上鏡頭偏移）
            this.mousePosition.x = (e.clientX - rect.left) * scaleX + (Game.camera?.x || 0);
            this.mousePosition.y = (e.clientY - rect.top) * scaleY + (Game.camera?.y || 0);
        });
        
        console.log('輸入系統已初始化');
    },
    
    // 檢查按鍵是否被按下
    isKeyDown: function(key) {
        return this.keys[key] === true;
    },
    
    // 獲取移動方向
    getMovementDirection: function() {
        const direction = { x: 0, y: 0 };
        
        // 處理滑鼠移動
        if (this.isMouseMoving && this.mouseTarget) {
            // 計算玩家到目標點的向量
            const dx = this.mouseTarget.x - Game.player.x;
            const dy = this.mouseTarget.y - Game.player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 如果距離很小，表示已經到達目標點
            if (distance < 5) {
                this.isMouseMoving = false;
                this.mouseTarget = null;
            } else {
                // 標準化方向向量
                direction.x = dx / distance;
                direction.y = dy / distance;
                return direction;
            }
        }
        
        // 上下左右或WASD控制
        if (this.isKeyDown('ArrowUp') || this.isKeyDown('w') || this.isKeyDown('W')) {
            direction.y = -1;
        }
        if (this.isKeyDown('ArrowDown') || this.isKeyDown('s') || this.isKeyDown('S')) {
            direction.y = 1;
        }
        if (this.isKeyDown('ArrowLeft') || this.isKeyDown('a') || this.isKeyDown('A')) {
            direction.x = -1;
        }
        if (this.isKeyDown('ArrowRight') || this.isKeyDown('d') || this.isKeyDown('D')) {
            direction.x = 1;
        }
        
        // 對角線移動時進行標準化，使速度保持一致
        if (direction.x !== 0 && direction.y !== 0) {
            const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
            direction.x /= length;
            direction.y /= length;
        }
        
        return direction;
    }
};
