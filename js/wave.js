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
        this.enemySpawnRate = CONFIG.WAVES.ENEMY_SPAWN_RATE.INITIAL;
        this.lastMiniBossTime = 0;
        
        // 更新UI
        UI.updateWaveInfo(this.currentWave);
    },
    
    update: function(deltaTime) {
        const currentTime = Date.now();
        
        // 檢查是否需要進入下一波
        const waveElapsedTime = currentTime - this.waveStartTime;
        if (waveElapsedTime >= CONFIG.WAVES.DURATION) {
            this.nextWave();
        }
        
        // 生成敵人
        if (currentTime - this.lastEnemySpawnTime >= this.enemySpawnRate) {
            this.spawnEnemy();
            this.lastEnemySpawnTime = currentTime;
        }
        
        // 檢查是否需要生成小BOSS
        if (currentTime - this.lastMiniBossTime >= CONFIG.WAVES.MINI_BOSS_INTERVAL) {
            this.spawnMiniBoss();
            this.lastMiniBossTime = currentTime;
        }
        
        // 檢查是否需要生成大BOSS
        if (this.currentWave === CONFIG.WAVES.BOSS_WAVE && Game.boss === null) {
            this.spawnBoss();
        }
    },
    
    // 進入下一波
    nextWave: function() {
        this.currentWave++;
        this.waveStartTime = Date.now();
        
        // 增加敵人生成速率
        this.enemySpawnRate = Math.max(
            CONFIG.WAVES.ENEMY_SPAWN_RATE.INITIAL - (this.currentWave - 1) * CONFIG.WAVES.ENEMY_SPAWN_RATE.DECREASE_PER_WAVE,
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

        // 計算本次生成數量隨波次增加
        const base = CONFIG.WAVES.SPAWN_COUNT.INITIAL;
        const inc = CONFIG.WAVES.SPAWN_COUNT.INCREASE_PER_WAVE;
        const max = CONFIG.WAVES.SPAWN_COUNT.MAXIMUM;
        const count = Math.min(Math.floor(base + (this.currentWave - 1) * inc), max);

        for (let i = 0; i < count; i++) {
            if (Game.enemies.length >= CONFIG.OPTIMIZATION.MAX_ENEMIES) break;
            // 隨機選擇敵人類型
            const enemyType = Utils.randomChoice(availableTypes);
            // 在畫布邊緣生成敵人
            const position = Utils.getRandomEdgePosition(Game.canvas);
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
        
        // 在畫布邊緣生成小BOSS
        const position = Utils.getRandomEdgePosition(Game.canvas);
        const miniBoss = new Enemy(position.x, position.y, 'MINI_BOSS');
        
        Game.addEnemy(miniBoss);
        console.log('Mini Boss spawned!');
    },
    
    // 生成大BOSS
    spawnBoss: function() {
        // 在畫布中央生成大BOSS
        const boss = new Enemy(
            CONFIG.CANVAS_WIDTH / 2,
            CONFIG.CANVAS_HEIGHT / 2,
            'BOSS'
        );
        
        Game.addEnemy(boss);
        Game.boss = boss;
        console.log('Boss spawned!');
    }
};
