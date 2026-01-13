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
    // MMO 架構：多人模式使用確定性隨機數生成器，單機模式使用普通 Math.random()
    randomInt: function(min, max) {
        if (typeof DeterministicRandom !== "undefined" && DeterministicRandom.getSeed() !== null) {
            // 多人模式：使用確定性隨機數生成器
            return DeterministicRandom.randomInt(min, max);
        } else {
            // 單機模式：使用普通 Math.random()
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
    },
    
    // 隨機浮點數（包含最小值，不包含最大值）
    randomFloat: function(min, max) {
        if (typeof DeterministicRandom !== "undefined" && DeterministicRandom.getSeed() !== null) {
            // 多人模式：使用確定性隨機數生成器
            const r = DeterministicRandom.random();
            return r * (max - min) + min;
        } else {
            // 單機模式：使用普通 Math.random()
            return Math.random() * (max - min) + min;
        }
    },
    
    // 從數組中隨機選擇一個元素
    // MMO 架構：多人模式使用確定性隨機數生成器，單機模式使用普通 Math.random()
    randomChoice: function(array) {
        if (typeof DeterministicRandom !== "undefined" && DeterministicRandom.getSeed() !== null) {
            // 多人模式：使用確定性隨機數生成器
            return DeterministicRandom.randomChoice(array);
        } else {
            // 單機模式：使用普通 Math.random()
            return array[Math.floor(Math.random() * array.length)];
        }
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
    },
    
    // 多邊形：點是否在多邊形內（射線法）
    polygonContainsPoint: function(polygon, px, py) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi + 0.0000001) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    },

    // 多邊形：矩形（中心+寬高）轉四邊形點集
    rectToPolygon: function(cx, cy, w, h) {
        const halfW = w / 2, halfH = h / 2;
        return [
            [cx - halfW, cy - halfH],
            [cx + halfW, cy - halfH],
            [cx + halfW, cy + halfH],
            [cx - halfW, cy + halfH]
        ];
    },

    // 分離軸定理：多邊形-多邊形相交判斷（凸多邊形適用）
    SATPolygonOverlap: function(polyA, polyB) {
        if (!polyA || !polyB || polyA.length < 3 || polyB.length < 3) return false;
        const testAxes = (poly) => {
            const axes = [];
            for (let i = 0; i < poly.length; i++) {
                const x1 = poly[i][0], y1 = poly[i][1];
                const x2 = poly[(i + 1) % poly.length][0], y2 = poly[(i + 1) % poly.length][1];
                const ex = x2 - x1, ey = y2 - y1; // 邊向量
                const ax = -ey, ay = ex; // 法線軸
                // 避免零長度
                if (ax !== 0 || ay !== 0) axes.push([ax, ay]);
            }
            return axes;
        };
        const project = (poly, axis) => {
            let min = Infinity, max = -Infinity;
            for (let i = 0; i < poly.length; i++) {
                const dot = poly[i][0] * axis[0] + poly[i][1] * axis[1];
                if (dot < min) min = dot;
                if (dot > max) max = dot;
            }
            return [min, max];
        };
        const axes = testAxes(polyA).concat(testAxes(polyB));
        for (const axis of axes) {
            const [minA, maxA] = project(polyA, axis);
            const [minB, maxB] = project(polyB, axis);
            if (maxA < minB || maxB < minA) return false; // 在此軸上分離
        }
        return true;
    },

    // 公用：點到線段距離
    pointSegmentDistance: function(px, py, x1, y1, x2, y2) {
        const vx = x2 - x1;
        const vy = y2 - y1;
        const len2 = vx * vx + vy * vy;
        if (len2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * vx + (py - y1) * vy) / len2;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * vx;
        const projY = y1 + t * vy;
        return Math.hypot(px - projX, py - projY);
    },

    // 圓-多邊形碰撞：中心在多邊形內或邊距離小於半徑
    circlePolygonCollision: function(cx, cy, r, polygon) {
        if (!polygon || polygon.length < 3) return false;
        if (this.polygonContainsPoint(polygon, cx, cy)) return true;
        for (let i = 0; i < polygon.length; i++) {
            const x1 = polygon[i][0], y1 = polygon[i][1];
            const x2 = polygon[(i + 1) % polygon.length][0], y2 = polygon[(i + 1) % polygon.length][1];
            const d = this.pointSegmentDistance(cx, cy, x1, y1, x2, y2);
            if (d <= r) return true;
        }
        return false;
    },

    // 多邊形-矩形碰撞（矩形轉多邊形後做SAT）
    polygonRectCollision: function(polygon, rx, ry, rw, rh) {
        const rectPoly = this.rectToPolygon(rx, ry, rw, rh);
        return this.SATPolygonOverlap(polygon, rectPoly);
    },
    // 基於 PNG 透明度的輕量多邊形生成（徑向取樣）
    // 備註：僅用於覆蓋與近似碰撞；避免複雜影像處理與代碼膨脹。
    // 回傳中心相對座標點陣列，並按目標寬高縮放。
    generateAlphaMaskPolygon: function(image, targetW, targetH, samples = 28, alphaThreshold = 40, step = 2) {
        try {
            if (!image || !image.width || !image.height) return null;
            const w = image.width, h = image.height;
            const cx = w / 2, cy = h / 2;
            // 快取（避免重複計算）
            const key = `${image.src}|${targetW}x${targetH}|${samples}|${alphaThreshold}|${step}`;
            this._alphaPolyCache = this._alphaPolyCache || new Map();
            if (this._alphaPolyCache.has(key)) return this._alphaPolyCache.get(key);
            // 讀取像素
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const imgData = ctx.getImageData(0, 0, w, h).data;
            const alphaAt = (x, y) => {
                const ix = Math.floor(x), iy = Math.floor(y);
                if (ix < 0 || iy < 0 || ix >= w || iy >= h) return 0;
                return imgData[(iy * w + ix) * 4 + 3];
            };
            const points = [];
            const maxR = Math.max(w, h) / 2;
            for (let i = 0; i < samples; i++) {
                const theta = (i / samples) * Math.PI * 2;
                const dx = Math.cos(theta), dy = Math.sin(theta);
                let lastOpaqueX = cx, lastOpaqueY = cy, seenOpaque = false;
                for (let r = step; r <= maxR; r += step) {
                    const x = cx + dx * r;
                    const y = cy + dy * r;
                    const a = alphaAt(x, y);
                    if (a >= alphaThreshold) { seenOpaque = true; lastOpaqueX = x; lastOpaqueY = y; }
                    else if (seenOpaque) { break; }
                }
                // 相對中心並按目標寬高縮放
                const sx = targetW / w, sy = targetH / h;
                points.push([ (lastOpaqueX - cx) * sx, (lastOpaqueY - cy) * sy ]);
            }
            // 末端去噪：若樣本<3則放棄
            if (points.length < 3) return null;
            this._alphaPolyCache.set(key, points);
            return points;
        } catch (_) {
            return null;
        }
    },
};
