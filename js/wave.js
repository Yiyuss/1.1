// 波次系統
const WaveSystem = {
    currentWave: 1,
    waveStartTime: 0,
    lastEnemySpawnTime: 0,
    enemySpawnRate: CONFIG.WAVES.ENEMY_SPAWN_RATE.INITIAL,
    lastMiniBossTime: 0,
    
    init: function() {
        this.currentWave = 1;
        this.waveStartTime = Date.now();
        this.lastEnemySpawnTime = 0;
        // 初始生成間隔，套用難度倍率
        const diff = (Game.difficulty || (CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.NORMAL) || {});
        const baseInit = CONFIG.WAVES.ENEMY_SPAWN_RATE.INITIAL;
        const mult = diff.spawnIntervalMultiplier || 1;
        this.enemySpawnRate = Math.max(baseInit * mult, CONFIG.WAVES.ENEMY_SPAWN_RATE.MINIMUM);
        this.lastMiniBossTime = 0;
        
        // 更新UI
        UI.updateWaveInfo(this.currentWave);
    },
    
    // 更新波次系統：推進波次、生成敵人與Boss
    update: function(deltaTime) {
        const currentTime = Date.now();
        // 進波判定
        const waveElapsedTime = currentTime - this.waveStartTime;
        if (waveElapsedTime >= CONFIG.WAVES.DURATION) {
            this.nextWave();
        }
        // 生成普通敵人
        if (currentTime - this.lastEnemySpawnTime >= this.enemySpawnRate) {
            this.spawnEnemy();
            this.lastEnemySpawnTime = currentTime;
        }
        // 生成小BOSS
        if (currentTime - this.lastMiniBossTime >= CONFIG.WAVES.MINI_BOSS_INTERVAL) {
            this.spawnMiniBoss();
            this.lastMiniBossTime = currentTime;
        }
        // 生成大BOSS
        if (this.currentWave === CONFIG.WAVES.BOSS_WAVE && Game.boss === null) {
            this.spawnBoss();
        }
    },
    
    // 進入下一波
    nextWave: function() {
        this.currentWave++;
        this.waveStartTime = Date.now();
        
        // 增加敵人生成速率（套用難度間隔倍率）
        const diff = (Game.difficulty || (CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.NORMAL) || {});
        const mult = diff.spawnIntervalMultiplier || 1;
        this.enemySpawnRate = Math.max(
            (CONFIG.WAVES.ENEMY_SPAWN_RATE.INITIAL - (this.currentWave - 1) * CONFIG.WAVES.ENEMY_SPAWN_RATE.DECREASE_PER_WAVE) * mult,
            CONFIG.WAVES.ENEMY_SPAWN_RATE.MINIMUM
        );
        
        // 更新UI
        UI.updateWaveInfo(this.currentWave);
        
        console.log(`Wave ${this.currentWave} started!`);
    },
    
    // 生成普通敵人
    spawnEnemy: function() {
        // 檢查是否達到最大敵人數量
        if (Game.enemies.length >= CONFIG.OPTIMIZATION.MAX_ENEMIES) {
            return;
        }

        // 獲取可用的敵人類型
        const availableTypes = CONFIG.WAVES.ENEMY_TYPES
            .filter(entry => entry.WAVE <= this.currentWave)
            .map(entry => entry.TYPE);

        if (availableTypes.length === 0) {
            return;
        }

        // 計算本次生成數量隨波次增加（第5波後顯著提高）並套用難度倍率
        const base = CONFIG.WAVES.SPAWN_COUNT.INITIAL;
        const earlyInc = CONFIG.WAVES.SPAWN_COUNT.INCREASE_PER_WAVE;
        const earlyMax = CONFIG.WAVES.SPAWN_COUNT.MAXIMUM;
        const lateInc = CONFIG.WAVES.SPAWN_COUNT.INCREASE_PER_WAVE_LATE || earlyInc;
        const lateMax = CONFIG.WAVES.SPAWN_COUNT.MAXIMUM_LATE || earlyMax;
        const useLate = this.currentWave >= 5;
        const inc = useLate ? lateInc : earlyInc;
        const max = useLate ? lateMax : earlyMax;
        const countBase = Math.min(Math.floor(base + (this.currentWave - 1) * inc), max);
        const diff = (Game.difficulty || (CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.NORMAL) || {});
        const countMult = diff.spawnCountMultiplier || 1;
        const count = Math.max(1, Math.floor(countBase * countMult));

        for (let i = 0; i < count; i++) {
            if (Game.enemies.length >= CONFIG.OPTIMIZATION.MAX_ENEMIES) break;
            // 隨機選擇敵人類型
            const enemyType = Utils.randomChoice(availableTypes);
            // 在世界邊緣生成敵人
            const position = Utils.getRandomEdgePositionInWorld((Game.worldWidth || Game.canvas.width), (Game.worldHeight || Game.canvas.height));
            const enemy = new Enemy(position.x, position.y, enemyType);
            Game.addEnemy(enemy);
        }
    },
    
    // 生成小BOSS
    spawnMiniBoss: function() {
        // 檢查是否達到最大敵人數量
        if (Game.enemies.length >= CONFIG.OPTIMIZATION.MAX_ENEMIES) {
            return;
        }
        
        // 在世界邊緣生成小BOSS
        const position = Utils.getRandomEdgePositionInWorld((Game.worldWidth || Game.canvas.width), (Game.worldHeight || Game.canvas.height));
        const miniBoss = new Enemy(position.x, position.y, 'MINI_BOSS');
        
        Game.addEnemy(miniBoss);
        console.log('Mini Boss spawned!');
    },
    
    // 生成大BOSS
    spawnBoss: function() {
        // 在世界中央生成大BOSS
        const boss = new Enemy(
            (Game.worldWidth || CONFIG.CANVAS_WIDTH) / 2,
            (Game.worldHeight || CONFIG.CANVAS_HEIGHT) / 2,
            'BOSS'
        );
        
        Game.addEnemy(boss);
        Game.boss = boss;
        console.log('Boss spawned!');
    }
};
