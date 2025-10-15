// 輸入控制系統
const Input = {
    keys: {},
    
    init: function() {
        // 監聽按鍵按下事件
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
        });
        
        // 監聽按鍵釋放事件
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
    },
    
    // 檢查按鍵是否被按下
    isKeyDown: function(key) {
        return this.keys[key] === true;
    },
    
    // 獲取移動方向
    getMovementDirection: function() {
        const direction = { x: 0, y: 0 };
        
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