// 工具函數
const Utils = {
    // 計算兩點之間的距離
    distance: function(x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    },
    
    // 檢測兩個圓形是否碰撞
    circleCollision: function(x1, y1, r1, x2, y2, r2) {
        return this.distance(x1, y1, x2, y2) < r1 + r2;
    },
    
    // 獲取兩點之間的角度（弧度）
    angle: function(x1, y1, x2, y2) {
        return Math.atan2(y2 - y1, x2 - x1);
    },
    
    // 將弧度轉換為角度
    radToDeg: function(rad) {
        return rad * 180 / Math.PI;
    },
    
    // 將角度轉換為弧度
    degToRad: function(deg) {
        return deg * Math.PI / 180;
    },
    
    // 格式化時間（毫秒轉為 MM:SS 格式）
    formatTime: function(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    },
    
    // 隨機整數（包含最小值和最大值）
    randomInt: function(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    
    // 隨機浮點數（包含最小值，不包含最大值）
    randomFloat: function(min, max) {
        return Math.random() * (max - min) + min;
    },
    
    // 從數組中隨機選擇一個元素
    randomChoice: function(array) {
        return array[Math.floor(Math.random() * array.length)];
    },
    
    // 洗牌數組
    shuffleArray: function(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    },
    
    // 限制值在指定範圍內
    clamp: function(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },
    
    // 生成隨機ID
    generateId: function() {
        return '_' + Math.random().toString(36).substr(2, 9);
    },
    
    // 獲取遊戲畫布邊緣的隨機位置（用於敵人生成）
    getRandomEdgePosition: function(canvas, padding = 50) {
        const edge = Math.floor(Math.random() * 4); // 0: 上, 1: 右, 2: 下, 3: 左
        let x, y;
        
        switch(edge) {
            case 0: // 上邊
                x = Utils.randomInt(0, canvas.width);
                y = -padding;
                break;
            case 1: // 右邊
                x = canvas.width + padding;
                y = Utils.randomInt(0, canvas.height);
                break;
            case 2: // 下邊
                x = Utils.randomInt(0, canvas.width);
                y = canvas.height + padding;
                break;
            case 3: // 左邊
                x = -padding;
                y = Utils.randomInt(0, canvas.height);
                break;
        }
        
        return { x, y };
    },
    
    // 檢查對象是否在畫布範圍外
    isOutOfBounds: function(x, y, canvas, margin = 100) {
        return x < -margin || x > canvas.width + margin || y < -margin || y > canvas.height + margin;
    },

    // 世界範圍外檢查（基於世界寬高）
    isOutOfWorldBounds: function(x, y, worldWidth, worldHeight, margin = 100) {
        return x < -margin || x > worldWidth + margin || y < -margin || y > worldHeight + margin;
    },

    // 在指定寬高的矩形邊緣生成隨機位置（世界邊緣）
    getRandomEdgePositionInWorld: function(worldWidth, worldHeight, padding = 50) {
        const edge = Math.floor(Math.random() * 4); // 0: 上, 1: 右, 2: 下, 3: 左
        let x, y;
        switch(edge) {
            case 0: // 上邊
                x = Utils.randomInt(0, worldWidth);
                y = -padding;
                break;
            case 1: // 右邊
                x = worldWidth + padding;
                y = Utils.randomInt(0, worldHeight);
                break;
            case 2: // 下邊
                x = Utils.randomInt(0, worldWidth);
                y = worldHeight + padding;
                break;
            case 3: // 左邊
                x = -padding;
                y = Utils.randomInt(0, worldHeight);
                break;
        }
        return { x, y };
    },

    // 圓形與AABB（以中心與寬高）碰撞檢測
    circleRectCollision: function(cx, cy, r, rx, ry, rw, rh) {
        const halfW = rw / 2;
        const halfH = rh / 2;
        const left = rx - halfW;
        const right = rx + halfW;
        const top = ry - halfH;
        const bottom = ry + halfH;
        // 取矩形內最接近圓心的點
        const closestX = Utils.clamp(cx, left, right);
        const closestY = Utils.clamp(cy, top, bottom);
        const dx = cx - closestX;
        const dy = cy - closestY;
        return (dx * dx + dy * dy) <= r * r;
    },

    // 射線與AABB相交（傳回最小正t，如無交集回Infinity）
    rayAABBIntersection: function(sx, sy, dx, dy, left, top, right, bottom) {
        // 以slab方法計算
        let tmin = -Infinity;
        let tmax = Infinity;

        // X軸
        if (dx === 0) {
            if (sx < left || sx > right) return Infinity;
        } else {
            const tx1 = (left - sx) / dx;
            const tx2 = (right - sx) / dx;
            const txmin = Math.min(tx1, tx2);
            const txmax = Math.max(tx1, tx2);
            tmin = Math.max(tmin, txmin);
            tmax = Math.min(tmax, txmax);
        }

        // Y軸
        if (dy === 0) {
            if (sy < top || sy > bottom) return Infinity;
        } else {
            const ty1 = (top - sy) / dy;
            const ty2 = (bottom - sy) / dy;
            const tymin = Math.min(ty1, ty2);
            const tymax = Math.max(ty1, ty2);
            tmin = Math.max(tmin, tymin);
            tmax = Math.min(tmax, tymax);
        }

        if (tmax < tmin) return Infinity; // 無交集
        const tHit = tmin >= 0 ? tmin : (tmax >= 0 ? 0 : Infinity);
        return tHit >= 0 ? tHit : Infinity;
    }
};
