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
        // 初始生成間隔，套用難度倍率（預設 EASY）
        const diff = (Game.difficulty || (CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.EASY) || {});
        const baseInit = CONFIG.WAVES.ENEMY_SPAWN_RATE.INITIAL;
        const mult = diff.spawnIntervalMultiplier || 1;
        this.enemySpawnRate = Math.max(baseInit * mult, CONFIG.WAVES.ENEMY_SPAWN_RATE.MINIMUM);
        this.lastMiniBossTime = 0;
        this.lastMiniBossWave = 0; // 追蹤本波是否已生成小BOSS
        
        // 更新UI
        UI.updateWaveInfo(this.currentWave);
        
        // 第一波固定生成一支小BOSS
        this.spawnMiniBoss();
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
        // 移除：時間間隔生成小BOSS，改為每波一次由 nextWave 觸發
        // if (currentTime - this.lastMiniBossTime >= CONFIG.WAVES.MINI_BOSS_INTERVAL) {
        //     this.spawnMiniBoss();
        //     this.lastMiniBossTime = currentTime;
        // }
        // 生成大BOSS
        if (this.currentWave === CONFIG.WAVES.BOSS_WAVE && Game.boss === null) {
            this.spawnBoss();
        }
    },
    
    // 進入下一波
    nextWave: function() {
        this.currentWave++;
        this.waveStartTime = Date.now();
        
        // 增加敵人生成速率（套用難度間隔倍率，預設 EASY）
        const diff = (Game.difficulty || (CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.EASY) || {});
        const mult = diff.spawnIntervalMultiplier || 1;
        this.enemySpawnRate = Math.max(
            (CONFIG.WAVES.ENEMY_SPAWN_RATE.INITIAL - (this.currentWave - 1) * CONFIG.WAVES.ENEMY_SPAWN_RATE.DECREASE_PER_WAVE) * mult,
            CONFIG.WAVES.ENEMY_SPAWN_RATE.MINIMUM
        );
        
        // 更新UI
        UI.updateWaveInfo(this.currentWave);
        
        // 每一波固定生成一個小BOSS（避免重複生成）
        this.spawnMiniBoss();
        
        console.log(`Wave ${this.currentWave} started!`);
    },
    
    // 生成普通敵人
    spawnEnemy: function() {
        // 檢查是否達到最大敵人數量（套用困難加成）
        const effectiveMax = CONFIG.OPTIMIZATION.MAX_ENEMIES + Math.max(0, (Game.maxEnemiesBonus || 0));
        if (Game.enemies.length >= effectiveMax) {
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
        const diff = (Game.difficulty || (CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.EASY) || {});
        const countMult = diff.spawnCountMultiplier || 1;
        const count = Math.max(1, Math.floor(countBase * countMult));

        for (let i = 0; i < count; i++) {
            if (Game.enemies.length >= effectiveMax) break;
            // 隨機選擇敵人類型
            const enemyType = Utils.randomChoice(availableTypes);
            // 在世界邊緣生成敵人（加入內縮與分散避免重疊）
            const worldW = (Game.worldWidth || Game.canvas.width);
            const worldH = (Game.worldHeight || Game.canvas.height);
            const rad = (CONFIG.ENEMIES[enemyType] && CONFIG.ENEMIES[enemyType].COLLISION_RADIUS) ? CONFIG.ENEMIES[enemyType].COLLISION_RADIUS : 16;
            const inner = rad + 12;
            const rawPos = Utils.getRandomEdgePositionInWorld(worldW, worldH);
            let sx = rawPos.x;
            let sy = rawPos.y;
            // 推入世界內側，並沿邊緣分散
            let edge;
            if (sx < 0) edge = 'left';
            else if (sx > worldW) edge = 'right';
            else if (sy < 0) edge = 'top';
            else edge = 'bottom';
            if (edge === 'left') {
                sx = inner; sy = Utils.randomInt(inner, worldH - inner);
            } else if (edge === 'right') {
                sx = worldW - inner; sy = Utils.randomInt(inner, worldH - inner);
            } else if (edge === 'top') {
                sy = inner; sx = Utils.randomInt(inner, worldW - inner);
            } else {
                sy = worldH - inner; sx = Utils.randomInt(inner, worldW - inner);
            }
            // 嘗試避免與現有敵人或障礙物重疊
            let attempts = 0;
            const sep = 4;
            while (attempts++ < 25) {
                let overlap = false;
                for (const e of Game.enemies) {
                    const minDist = rad + (e.collisionRadius || 16) + sep;
                    if (Utils.distance(sx, sy, e.x, e.y) < minDist) { overlap = true; break; }
                }
                if (!overlap) {
                    let blocked = false;
                    for (const o of Game.obstacles) {
                        if (Utils.circleRectCollision(sx, sy, rad, o.x, o.y, o.width, o.height)) { blocked = true; break; }
                    }
                    if (!blocked) break;
                    overlap = true;
                }
                // 重疊或阻擋時，沿邊緣重新選點
                if (edge === 'left') sy = Utils.randomInt(inner, worldH - inner);
                else if (edge === 'right') sy = Utils.randomInt(inner, worldH - inner);
                else if (edge === 'top') sx = Utils.randomInt(inner, worldW - inner);
                else sx = Utils.randomInt(inner, worldW - inner);
            }
            const enemy = new Enemy(sx, sy, enemyType);
            Game.addEnemy(enemy);
        }
    },
    
    // 生成小BOSS
    spawnMiniBoss: function() {
        // 每波僅生成一次
        if (this.lastMiniBossWave === this.currentWave) {
            return;
        }
        this.lastMiniBossWave = this.currentWave;
        this.lastMiniBossTime = Date.now();
        
        // 在世界邊緣生成小BOSS（加入內縮與分散避免重疊）
        const worldW = (Game.worldWidth || Game.canvas.width);
        const worldH = (Game.worldHeight || Game.canvas.height);
        const rad = (CONFIG.ENEMIES['MINI_BOSS'] && CONFIG.ENEMIES['MINI_BOSS'].COLLISION_RADIUS) ? CONFIG.ENEMIES['MINI_BOSS'].COLLISION_RADIUS : 32;
        const inner = rad + 12;
        const rawPos = Utils.getRandomEdgePositionInWorld(worldW, worldH);
        let sx = rawPos.x;
        let sy = rawPos.y;
        let edge;
        if (sx < 0) edge = 'left';
        else if (sx > worldW) edge = 'right';
        else if (sy < 0) edge = 'top';
        else edge = 'bottom';
        if (edge === 'left') {
            sx = inner; sy = Utils.randomInt(inner, worldH - inner);
        } else if (edge === 'right') {
            sx = worldW - inner; sy = Utils.randomInt(inner, worldH - inner);
        } else if (edge === 'top') {
            sy = inner; sx = Utils.randomInt(inner, worldW - inner);
        } else {
            sy = worldH - inner; sx = Utils.randomInt(inner, worldW - inner);
        }
        let attempts = 0;
        const sep = 6;
        while (attempts++ < 25) {
            let overlap = false;
            for (const e of Game.enemies) {
                const minDist = rad + (e.collisionRadius || 16) + sep;
                if (Utils.distance(sx, sy, e.x, e.y) < minDist) { overlap = true; break; }
            }
            if (!overlap) {
                let blocked = false;
                for (const o of Game.obstacles) {
                    if (Utils.circleRectCollision(sx, sy, rad, o.x, o.y, o.width, o.height)) { blocked = true; break; }
                }
                if (!blocked) break;
                overlap = true;
            }
            if (edge === 'left') sy = Utils.randomInt(inner, worldH - inner);
            else if (edge === 'right') sy = Utils.randomInt(inner, worldH - inner);
            else if (edge === 'top') sx = Utils.randomInt(inner, worldW - inner);
            else sx = Utils.randomInt(inner, worldW - inner);
        }
        const miniBoss = new Enemy(sx, sy, 'MINI_BOSS');
        
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
