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
        
        // MMO 架構：每個玩家都廣播波次開始事件，不依賴隊長端
        try {
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
            } catch (_) {}
            
            if (isSurvivalMode && typeof Game !== "undefined" && Game.multiplayer) {
                // ✅ 真正的MMORPG：每個玩家都廣播波次開始事件，包含時間戳，確保所有客戶端使用相同的時間基準
                if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                    const timestamp = Date.now(); // 使用當前時間作為時間戳
                    console.log(`[WaveSystem] 廣播波次開始: wave=${this.currentWave}, timestamp=${timestamp}`);
                    window.SurvivalOnlineBroadcastEvent("wave_start", { 
                        wave: this.currentWave,
                        timestamp: timestamp // ✅ 包含時間戳，讓所有客戶端使用相同的時間基準
                    });
                }
            }
        } catch (_) {}
        
        // 第一波固定生成一支小BOSS
        this.spawnMiniBoss();
    },
    
    // ✅ 真正的MMORPG：更新波次系統：推進波次、生成敵人與Boss
    // 使用同步的時間基準，確保所有客戶端在同一時間生成相同的敵人
    update: function(deltaTime) {
        // ✅ 真正的MMORPG：使用同步的波次開始時間，而不是本地時間
        // 這樣可以確保所有客戶端在同一時間生成相同的敵人
        const currentTime = Date.now();
        // 進波判定：使用同步的波次開始時間
        const waveElapsedTime = currentTime - this.waveStartTime;
        if (waveElapsedTime >= CONFIG.WAVES.DURATION) {
            this.nextWave();
        }
        // ✅ 真正的MMORPG：生成普通敵人 - 使用同步的時間基準
        // 確保所有客戶端在同一時間生成相同的敵人
        if (currentTime - this.lastEnemySpawnTime >= this.enemySpawnRate) {
            this.spawnEnemy();
            this.lastEnemySpawnTime = currentTime;
        }
        // 移除：時間間隔生成小BOSS，改為每波一次由 nextWave 觸發
        // if (currentTime - this.lastMiniBossTime >= CONFIG.WAVES.MINI_BOSS_INTERVAL) {
        //     this.spawnMiniBoss();
        //     this.lastMiniBossTime = currentTime;
        // }
        // 生成大BOSS（僅在第20波且尚未生成出口時生成）
        if (this.currentWave === CONFIG.WAVES.BOSS_WAVE && Game.boss === null && Game.exit === null) {
            this.spawnBoss();
        }
    },
    
    // ✅ 真正的MMORPG：進入下一波
    // 注意：waveStartTime 應該從 wave_start 事件同步，而不是使用本地時間
    nextWave: function() {
        this.currentWave++;
        // ✅ 真正的MMORPG：waveStartTime 應該從 wave_start 事件同步
        // 這裡設置本地時間作為後備，但實際應該從事件同步
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
        
        // MMO 架構：每個玩家都廣播波次開始事件，不依賴隊長端
        try {
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
            } catch (_) {}
            
            if (isSurvivalMode && typeof Game !== "undefined" && Game.multiplayer) {
                // ✅ 真正的MMORPG：每個玩家都廣播波次開始事件，包含時間戳，確保所有客戶端使用相同的時間基準
                if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                    const timestamp = Date.now(); // 使用當前時間作為時間戳
                    console.log(`[WaveSystem] 廣播波次開始: wave=${this.currentWave}, timestamp=${timestamp}`);
                    window.SurvivalOnlineBroadcastEvent("wave_start", { 
                        wave: this.currentWave,
                        timestamp: timestamp // ✅ 包含時間戳，讓所有客戶端使用相同的時間基準
                    });
                }
            }
        } catch (_) {}
        
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

        // 計算本次生成數量隨波次增加並套用難度倍率
        // 調整：取消「第5波後的額外生成加成」，讓所有地圖行為與花園一致（永遠使用前期加成）
        const base = CONFIG.WAVES.SPAWN_COUNT.INITIAL;
        const earlyInc = CONFIG.WAVES.SPAWN_COUNT.INCREASE_PER_WAVE;
        const earlyMax = CONFIG.WAVES.SPAWN_COUNT.MAXIMUM;
        const inc = earlyInc;
        const max = earlyMax;
        const countBase = Math.min(Math.floor(base + (this.currentWave - 1) * inc), max);
        const diff = (Game.difficulty || (CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.EASY) || {});
        const countMult = diff.spawnCountMultiplier || 1;
        const count = Math.max(1, Math.floor(countBase * countMult));

        for (let i = 0; i < count; i++) {
            if (Game.enemies.length >= effectiveMax) break;
            // 隨機選擇敵人類型
            let enemyType = Utils.randomChoice(availableTypes);
            // 第二張地圖（forest）將普通敵人替換為 *_2 變體（基礎數值相同但初始HP+10/ATK+5）
            if (Game.selectedMap && Game.selectedMap.id === 'forest') {
                if (enemyType === 'ZOMBIE') enemyType = 'ZOMBIE2';
                else if (enemyType === 'SKELETON') enemyType = 'SKELETON2';
                else if (enemyType === 'GHOST') enemyType = 'GHOST2';
            }
            // 第三張地圖（desert）將普通敵人替換為 *_3 變體（相對 *_2 再提升）
            else if (Game.selectedMap && Game.selectedMap.id === 'desert') {
                if (enemyType === 'ZOMBIE') enemyType = 'ZOMBIE3';
                else if (enemyType === 'SKELETON') enemyType = 'SKELETON3';
                else if (enemyType === 'GHOST') enemyType = 'GHOST3';
            }
            // 第四張地圖（garden）將普通敵人替換為花精靈系列（基礎值與第3張地圖相同）
            else if (Game.selectedMap && Game.selectedMap.id === 'garden') {
                if (enemyType === 'ZOMBIE') enemyType = 'ELF';
                else if (enemyType === 'SKELETON') enemyType = 'ELF2';
                else if (enemyType === 'GHOST') enemyType = 'ELF3';
            }
            // 第五張地圖（intersection）將普通敵人替換為人類系列
            else if (Game.selectedMap && Game.selectedMap.id === 'intersection') {
                if (enemyType === 'ZOMBIE') enemyType = 'HUMAN1';
                else if (enemyType === 'SKELETON') enemyType = 'HUMAN2';
                else if (enemyType === 'GHOST') enemyType = 'HUMAN3';
            }
            // 在世界邊緣生成敵人（加入內縮與分散避免重疊）
            const worldW = (Game.worldWidth || Game.canvas.width);
            const worldH = (Game.worldHeight || Game.canvas.height);
            const rad = (CONFIG.ENEMIES[enemyType] && CONFIG.ENEMIES[enemyType].COLLISION_RADIUS) ? CONFIG.ENEMIES[enemyType].COLLISION_RADIUS : 16;
            
            // 針對花園地圖大體積敵人增加內縮距離，避免一開始就卡在邊界
            let inner = rad + 12; // 默認內縮距離
            const isGardenLargeEnemy = (Game.selectedMap && Game.selectedMap.id === 'garden') && 
                                      (enemyType === 'ELF_MINI_BOSS' || enemyType === 'ELF_BOSS');
            if (isGardenLargeEnemy) {
                // 花園大體積敵人需要更大的內縮距離
                // 使用敵人實際尺寸的一半作為內縮距離，確保不會卡在邊界
                const enemyConfig = CONFIG.ENEMIES[enemyType];
                if (enemyConfig) {
                    let enemyWidth = enemyConfig.SIZE || rad * 2;
                    let enemyHeight = enemyConfig.SIZE || rad * 2;
                    // 如果是花護衛或花女王，使用實際的width和height
                    if (enemyType === 'ELF_MINI_BOSS') {
                        enemyWidth = 200; enemyHeight = 194;
                    } else if (enemyType === 'ELF_BOSS') {
                        enemyWidth = 400; enemyHeight = 382;
                    }
                    inner = Math.max(enemyWidth, enemyHeight) / 2 + 30; // 使用最大尺寸的一半 + 30像素緩衝
                }
            }
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
        // 第二、第三、第四張地圖（forest、desert、garden）：每波生成 2 隻小BOSS；其餘維持 1 隻。
        const count = (Game.selectedMap && (Game.selectedMap.id === 'forest' || Game.selectedMap.id === 'desert' || Game.selectedMap.id === 'garden' || Game.selectedMap.id === 'intersection')) ? 2 : 1;
        for (let idx = 0; idx < count; idx++) {
            // 在世界邊緣生成小BOSS（加入內縮與分散避免重疊）
            const worldW = (Game.worldWidth || Game.canvas.width);
            const worldH = (Game.worldHeight || Game.canvas.height);
            
            // 根據地圖選擇小BOSS類型（在計算內縮距離之前確定）
            let miniBossType = 'MINI_BOSS';
            if (Game.selectedMap && Game.selectedMap.id === 'garden') miniBossType = 'ELF_MINI_BOSS';
            else if (Game.selectedMap && Game.selectedMap.id === 'intersection') miniBossType = 'HUMAN_MINI_BOSS';
            const rad = (CONFIG.ENEMIES[miniBossType] && CONFIG.ENEMIES[miniBossType].COLLISION_RADIUS) ? CONFIG.ENEMIES[miniBossType].COLLISION_RADIUS : 32;
            
            // 針對花園地圖花護衛增加內縮距離，避免一開始就卡在邊界
            let inner = rad + 12; // 默認內縮距離
            if (Game.selectedMap && Game.selectedMap.id === 'garden' && miniBossType === 'ELF_MINI_BOSS') {
                // 花護衛（200x194）需要更大的內縮距離
                inner = 100 + 30; // 使用200的一半 + 30像素緩衝
            } else if (Game.selectedMap && Game.selectedMap.id === 'intersection' && miniBossType === 'HUMAN_MINI_BOSS') {
                // 混混：依實際尺寸內縮，避免邊界卡住
                inner = 80 + 30; // 使用160的一半 + 30像素緩衝
            }
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
            // 根據地圖選擇小BOSS類型（已在上面確定）
            const miniBoss = new Enemy(sx, sy, miniBossType);
            Game.addEnemy(miniBoss);
            console.log('Mini Boss spawned!');

            // 修羅難度：為每隻小Boss掛載彈幕發射器（僅在彈幕系統啟用時）
            try {
                if (typeof BulletSystem !== 'undefined' && BulletSystem.enabled && typeof BulletSystem.createEmitter === 'function') {
                    BulletSystem.createEmitter({
                        x: miniBoss.x,
                        y: miniBoss.y,
                        rateMs: 600,
                        lifeMs: 90000,
                        patternFn: (e, sys) => {
                            // 追隨小Boss；死亡則停止
                            const anchor = miniBoss;
                            if (!anchor || (anchor.health !== undefined && anchor.health <= 0)) { sys.stopEmitter(e); return; }
                            e.x = anchor.x; e.y = anchor.y;

                            const count = 12;
                            const speed = 3.2;
                            const life = 3200;
                            const baseColor = '#ffdd77';
                            const phase = e._phase || 0;
                            for (let i = 0; i < count; i++) {
                                const ang = phase + (i / count) * Math.PI * 2;
                                const vx = Math.cos(ang) * speed;
                                const vy = Math.sin(ang) * speed;
                                sys.addBullet(e.x, e.y, vx, vy, life, 14, baseColor);
                            }
                            e._phase = phase + 0.22;
                        }
                    });
                }
            } catch (_) {
                // 任何錯誤不影響既有流程
            }
        }
    },
    
    // 生成大BOSS
    spawnBoss: function() {
        // 根據地圖選擇大BOSS類型
        let bossType = 'BOSS';
        if (Game.selectedMap && Game.selectedMap.id === 'garden') bossType = 'ELF_BOSS';
        else if (Game.selectedMap && Game.selectedMap.id === 'intersection') bossType = 'HUMAN_BOSS';
        // 在世界中央生成大BOSS
        const boss = new Enemy(
            (Game.worldWidth || CONFIG.CANVAS_WIDTH) / 2,
            (Game.worldHeight || CONFIG.CANVAS_HEIGHT) / 2,
            bossType
        );
        
        Game.addEnemy(boss);
        Game.boss = boss;
        console.log('Boss spawned!');
        
        // 立即切換到BOSS音樂（在遊戲內直接觸發，不需要切換分頁）
        try {
            if (typeof AudioScene !== 'undefined' && AudioScene.enterBoss) {
                AudioScene.enterBoss();
                console.log('[WaveSystem] BOSS出現，AudioScene 進入 boss 場景');
            } else if (typeof AudioManager !== 'undefined' && AudioManager.playMusic) {
                // 後備方案：直接播放 BOSS 音樂
                AudioManager.playMusic('boss_music');
                console.log('[WaveSystem] BOSS出現，直接切換到 boss_music');
            }
        } catch (e) {
            console.warn('[WaveSystem] 切換BOSS音樂失敗:', e);
        }

        // 示例彈幕：Boss 出現後啟動環狀旋轉彈幕（僅在 BulletSystem 啟用時生效）
        try {
            if (typeof BulletSystem !== 'undefined' && BulletSystem.enabled && typeof BulletSystem.createEmitter === 'function') {
                BulletSystem.createEmitter({
                    x: boss.x,
                    y: boss.y,
                    rateMs: 450,       // 每 450ms 觸發一次
                    lifeMs: 120000,    // 彈幕持續 120 秒（可依需要調整）
                    patternFn: (e, sys) => {
                        // 跟隨 Boss 位置；Boss 死亡時停止發射器
                        const anchor = (Game && Game.boss) ? Game.boss : null;
                        if (!anchor || (anchor.health !== undefined && anchor.health <= 0)) { sys.stopEmitter(e); return; }
                        e.x = anchor.x; e.y = anchor.y;

                        const count = 18;       // 每次環狀生成的子彈數
                        const speed = 3.5;      // 子彈速度
                        const life = 3500;      // 子彈存活時間
                        const baseColor = '#ffcc66';
                        const phase = e._phase || 0; // 旋轉相位，保存在發射器狀態中

                        for (let i = 0; i < count; i++) {
                            const ang = phase + (i / count) * Math.PI * 2;
                            const vx = Math.cos(ang) * speed;
                            const vy = Math.sin(ang) * speed;
                            sys.addBullet(e.x, e.y, vx, vy, life, 16, baseColor);
                        }

                        // 相位推進，產生旋轉效果
                        e._phase = phase + 0.25;
                    }
                });
            }
        } catch (_) {
            // 任何錯誤都不影響既有 Boss 流程
        }
    }
};
