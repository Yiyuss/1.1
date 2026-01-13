// 確定性隨機數生成器（用於多人模式確保所有客戶端生成相同的敵人）
// 單機模式：使用普通 Math.random()
// 多人模式：使用種子隨機數生成器，確保所有客戶端生成相同的敵人

const DeterministicRandom = {
    // 種子值（多人模式使用）
    _seed: null,
    _seedValue: null,
    
    // 簡單的線性同餘生成器（LCG）
    // 公式：seed = (seed * a + c) % m
    // 參數選自 Numerical Recipes
    _a: 1664525,
    _c: 1013904223,
    _m: Math.pow(2, 32),
    
    // 初始化種子（多人模式）
    init: function(seed) {
        if (typeof seed === "string" || typeof seed === "number") {
            // 將種子轉換為數字
            let seedNum = 0;
            if (typeof seed === "string") {
                // 字符串種子：計算哈希值
                for (let i = 0; i < seed.length; i++) {
                    seedNum = ((seedNum << 5) - seedNum) + seed.charCodeAt(i);
                    seedNum = seedNum & seedNum; // 轉換為32位整數
                }
            } else {
                seedNum = seed;
            }
            this._seed = Math.abs(seedNum) || 1; // 確保種子為正數
            this._seedValue = this._seed;
            console.log(`[DeterministicRandom] 初始化種子: ${this._seed}`);
        } else {
            // 單機模式：不使用種子
            this._seed = null;
            this._seedValue = null;
        }
    },
    
    // 生成下一個隨機數（0-1之間）
    random: function() {
        if (this._seed === null) {
            // 單機模式：使用普通 Math.random()
            return Math.random();
        } else {
            // 多人模式：使用種子隨機數生成器
            this._seed = (this._seed * this._a + this._c) % this._m;
            return this._seed / this._m;
        }
    },
    
    // 生成指定範圍的隨機整數 [min, max]
    randomInt: function(min, max) {
        if (min === undefined || max === undefined) {
            return Math.floor(this.random() * 1000000);
        }
        return Math.floor(this.random() * (max - min + 1)) + min;
    },
    
    // 從數組中隨機選擇一個元素
    randomChoice: function(array) {
        if (!array || array.length === 0) return null;
        const index = this.randomInt(0, array.length - 1);
        return array[index];
    },
    
    // 重置種子（用於測試或重新開始）
    reset: function() {
        if (this._seedValue !== null) {
            this._seed = this._seedValue;
        }
    },
    
    // 獲取當前種子值（用於調試）
    getSeed: function() {
        return this._seed;
    }
};

