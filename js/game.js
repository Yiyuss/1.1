// 遊戲主引擎
/**
 * Game（遊戲主引擎）
 * 職責：主迴圈、更新與繪製、資源管理、實體管理、遊戲狀態維護。
 * 依賴：Input、UI、WaveSystem、Player、Enemy、Projectile、BossProjectile、Obstacle、Chest、Experience、Utils、CONFIG、Audio。
 * 不變式與注意：
 * - 玩家與武器在每幀會更新兩次（歷史節奏設計）；請勿移除或更改順序。
 * - 相機夾限、世界邊界與格線、背景平鋪等尺寸與邏輯不可更動。
 * - 金幣儲存鍵 `game_coins` 與即時 UI 更新流程不可更動。
 * - 所有人眼可見文字與排版不可改（除非另行要求）。
 * 版本：維持現行遊戲數值與行為；作者：原始專案作者 + 維護。
 */
const Game = {
    canvas: null,
    ctx: null,
    player: null,
    enemies: [],
    projectiles: [],
    bossProjectiles: [],
    explosionParticles: [],
    heartTransmissionEffects: [], // 心意傳遞效果圖片列表
    experienceOrbs: [],
    chests: [],
    pineappleUltimatePickups: [],
    obstacles: [],
    decorations: [],
    lastUpdateTime: 0,
    gameTime: 0,
    isPaused: false,
    isGameOver: false,
    boss: null,
    exit: null, // 生存模式第20波BOSS死亡後生成的出口
    selectedCharacter: null,
    // 世界與鏡頭
    worldWidth: 0,
    worldHeight: 0,
    camera: { x: 0, y: 0 },
    coins: 0,
    // 花園地圖視頻播放相關
    gardenVideoTimer: 0, // 累積時間（毫秒）
    gardenVideoInterval: 30000, // 每30秒播放一次
    gardenVideoPlaying: false, // 是否正在播放視頻
    gardenVideoElement: null, // 視頻元素
    gardenVideoFadeOutTime: 0, // 淡出開始時間
    // 路口地圖：車輛危險物（每10秒生成3台）
    intersectionCarTimer: 0,
    intersectionCarInterval: 10000,
    // 統計數據
    enemiesKilled: 0,
    coinsCollected: 0,
    expCollected: 0,
    
    init: function() {
        // 獲取畫布和上下文
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 設置畫布大小
        this.canvas.width = CONFIG.CANVAS_WIDTH;
        this.canvas.height = CONFIG.CANVAS_HEIGHT;

        // 計算世界大小：3x3畫面
        this.worldWidth = CONFIG.CANVAS_WIDTH * (CONFIG.WORLD?.GRID_X || 3);
        this.worldHeight = CONFIG.CANVAS_HEIGHT * (CONFIG.WORLD?.GRID_Y || 3);
        this.camera = { x: 0, y: 0 };
        
        // 初始化輸入系統
        Input.init();
        
        // 初始化UI
        UI.init();
        
        // 可選：初始化彈幕系統（預設停用，不影響現有行為）
        try {
            if (typeof BulletSystem !== 'undefined' && typeof BulletSystem.init === 'function') {
                BulletSystem.init();
            }
        } catch (e) {
            console.warn('BulletSystem.init 失敗：', e);
        }
        
        // 載入金幣並設定自動存檔
        try { this.loadCoins(); } catch (_) {}
        try {
            window.addEventListener('beforeunload', () => { try { this.saveCoins(); } catch (_) {} });
        } catch (_) {}
        
        // 創建玩家（世界中心）
        this.player = new Player(this.worldWidth / 2, this.worldHeight / 2);
        
        // 應用天賦效果 - 確保在玩家創建後立即應用
        try {
            console.log('玩家創建前血量:', this.player.health, '/', this.player.maxHealth);
            
            if (typeof TalentSystem !== 'undefined' && typeof TalentSystem.applyTalentEffects === 'function') {
                console.log('正在應用天賦效果到玩家身上...');
                TalentSystem.applyTalentEffects(this.player);
            } else if (typeof applyTalentEffects === 'function') {
                console.log('使用全局函數應用天賦效果...');
                applyTalentEffects(this.player);
            } else {
                console.warn('找不到天賦系統或應用函數');
            }
            
            console.log('玩家創建後血量:', this.player.health, '/', this.player.maxHealth);
        } catch (e) {
            console.error('應用天賦效果失敗:', e);
        }
        
        // 初始化波次系統
        WaveSystem.init();
        
        // 開始遊戲循環
        this.lastUpdateTime = Date.now();
        requestAnimationFrame(this.gameLoop.bind(this));
    },
    
    // 遊戲主循環
    gameLoop: function(timestamp) {
        // 計算時間差
        const currentTime = Date.now();
        let deltaTime = currentTime - this.lastUpdateTime;
        
        // 如果遊戲暫停，不更新lastUpdateTime，避免恢復時deltaTime過大（修復ESC暫停BUG）
        if (this.isPaused) {
            // 暫停時不更新lastUpdateTime，保持暫停前的時間點
            // 這樣恢復時deltaTime會很小，不會導致技能冷卻時間異常
            deltaTime = 0; // 暫停時deltaTime設為0
        } else {
            // 限制deltaTime的最大值，避免暫停後恢復時時間跳躍過大（修復ESC暫停BUG）
            // 最大允許100ms（約6幀），超過則視為異常時間跳躍，重置為正常值
            const MAX_DELTA_TIME = 100;
            if (deltaTime > MAX_DELTA_TIME) {
                deltaTime = MAX_DELTA_TIME;
            }
            this.lastUpdateTime = currentTime;
        }
        
        // 管理員測試快捷鍵已統一收斂到 Input（js/input.js），避免在 gameLoop 內重複輪詢造成污染/重入
        
        // 如果遊戲未暫停，更新遊戲狀態（加入防呆，避免單幀錯誤中斷迴圈）
        try {
            if (!this.isPaused && !this.isGameOver) {
                // 非生存模式（例如主線/挑戰）啟動時，暫停生存更新以避免互相污染
                let activeId = null;
                try {
                    activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                } catch(_) {}
                if (activeId === 'main' || activeId === 'challenge' || activeId === 'defense' || activeId === '3d') {
                    // 在主線/挑戰/防禦/3D模式下不執行生存邏輯更新
                } else {
                    this.update(deltaTime);
                }
            }
        } catch (e) {
            console.error('Game.update 發生錯誤，跳過本幀：', e);
        }
        
        // 繪製遊戲（加入防呆）
        try {
            // 檢查當前模式，如果是3D模式則不執行draw
            let activeId = null;
            try {
                activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
            } catch(_) {}
            if (activeId !== '3d') {
                this.draw();
            }
        } catch (e) {
            console.error('Game.draw 發生錯誤，跳過本幀：', e);
        }
        
        // 繼續循環
        requestAnimationFrame(this.gameLoop.bind(this));
    },
    
    // 更新遊戲狀態
    /**
     * 更新邏輯（每幀）
     * - 不變式：玩家與武器更新各執行兩次，順序不可更動。
     * - 依賴：Input（熱鍵）、UI（計時器）、WaveSystem（波次）、Utils（相機夾限）。
     * - 提醒：任何看似重複的更新皆為設計需要，請勿合併或刪除。
     */
    update: function(deltaTime) {
        // 管理員測試快捷鍵已統一收斂到 Input（js/input.js），避免在 update 內重複輪詢造成按住連發
        
        // 更新遊戲時間
        this.gameTime += deltaTime;
        // 正規化時間倍率，避免粒子/效果更新時發生未定義錯誤
        const deltaMul = deltaTime / 16.67;
        
        // 花園地圖：每30秒播放一次視頻
        if (this.selectedMap && this.selectedMap.id === 'garden' && !this.isPaused && !this.isGameOver) {
            this._updateGardenVideo(deltaTime);
        }

        // 路口地圖：每 10 秒生成 3 台車（直線穿越）
        if (this.selectedMap && this.selectedMap.id === 'intersection' && !this.isPaused && !this.isGameOver) {
            this.intersectionCarTimer += deltaTime;
            if (this.intersectionCarTimer >= this.intersectionCarInterval) {
                // 扣回間隔（避免 lag 時累積爆發）
                this.intersectionCarTimer = this.intersectionCarTimer % this.intersectionCarInterval;
                try { this.spawnIntersectionCars(4); } catch (_) {}
            }
        }
        
        // 更新玩家與武器（第一次，保留歷史節奏）
        this._updatePlayer(deltaTime);
        this._updateWeapons(deltaTime);
        
        // 更新UI計時器
        UI.updateTimer(this.gameTime);
        
        // 更新波次系統
        WaveSystem.update(deltaTime);
        
        // 更新玩家（第二次，保留歷史節奏）
        this._updatePlayer(deltaTime);

        // 更新鏡頭位置（跟隨玩家，並夾限在世界邊界）
        this.camera.x = Utils.clamp(this.player.x - this.canvas.width / 2, 0, Math.max(0, this.worldWidth - this.canvas.width));
        this.camera.y = Utils.clamp(this.player.y - this.canvas.height / 2, 0, Math.max(0, this.worldHeight - this.canvas.height));
        
        // 更新武器（第二次，保留歷史節奏）
        this._updateWeapons(deltaTime);
        
        // 更新敵人
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(deltaTime);
            
            // 移除標記為刪除的敵人
            if (enemy.markedForDeletion) {
                this.enemies.splice(i, 1);
                
                // 如果是大BOSS，清除引用
                if (enemy === this.boss) {
                    this.boss = null;
                }
            }
        }
        
        // 更新投射物
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            projectile.update(deltaTime);
            
            // 移除標記為刪除的投射物（對於有 DOM 元素的特效，先調用 destroy 清理）
            if (projectile.markedForDeletion) {
                // 對於 JudgmentEffect 等使用 DOM 的特效，確保清理 DOM 元素
                if (projectile.weaponType === 'JUDGMENT' && typeof projectile.destroy === 'function') {
                    try {
                        projectile.destroy();
                    } catch (_) {}
                }
                this.projectiles.splice(i, 1);
            }
        }
        
        // 更新 BOSS 火彈投射物
        if (this.bossProjectiles) {
            for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
                const bossProjectile = this.bossProjectiles[i];
                bossProjectile.update(deltaTime);
                
                // 移除標記為刪除的 BOSS 投射物
                if (bossProjectile.markedForDeletion) {
                    this.bossProjectiles.splice(i, 1);
                }
            }
        }
        
        // 可選：更新彈幕系統（停用時不執行）
        try {
            if (typeof BulletSystem !== 'undefined' && typeof BulletSystem.update === 'function') {
                BulletSystem.update(deltaTime);
            }
        } catch (e) {
            console.warn('BulletSystem.update 失敗：', e);
        }
        
        // 更新爆炸粒子
        for (let i = this.explosionParticles.length - 1; i >= 0; i--) {
            const particle = this.explosionParticles[i];
            
            particle.x += particle.vx * deltaMul;
            particle.y += particle.vy * deltaMul;
            particle.life -= deltaTime;
            
            if (particle.life <= 0) {
                this.explosionParticles.splice(i, 1);
            }
        }
        
        // 更新螢幕閃光效果
        if (this.screenFlash && this.screenFlash.active) {
            this.screenFlash.duration -= deltaTime;
            if (this.screenFlash.duration <= 0) {
                this.screenFlash.active = false;
                this.screenFlash.intensity = 0;
            } else {
                // 閃光強度隨時間衰減
                const progress = this.screenFlash.duration / 150; // 150ms 是初始持續時間
                this.screenFlash.intensity = 0.3 * progress;
            }
        }
        
        // 更新鏡頭震動效果
        if (this.cameraShake && this.cameraShake.active) {
            this.cameraShake.duration -= deltaTime;
            if (this.cameraShake.duration <= 0) {
                this.cameraShake.active = false;
                this.cameraShake.offsetX = 0;
                this.cameraShake.offsetY = 0;
            } else {
                // 隨機震動偏移
                const intensity = this.cameraShake.intensity * (this.cameraShake.duration / 200); // 200ms 是初始持續時間
                this.cameraShake.offsetX = (Math.random() - 0.5) * intensity;
                this.cameraShake.offsetY = (Math.random() - 0.5) * intensity;
            }
        }
        
        // 更新經驗寶石
        for (let i = this.experienceOrbs.length - 1; i >= 0; i--) {
            const orb = this.experienceOrbs[i];
            orb.update(deltaTime);
            
            // 移除標記為刪除的經驗寶石
            if (orb.markedForDeletion) {
                this.experienceOrbs.splice(i, 1);
            }
        }

        // 更新寶箱
        for (let i = this.chests.length - 1; i >= 0; i--) {
            const chest = this.chests[i];
            chest.update(deltaTime);
            if (chest.markedForDeletion) {
                this.chests.splice(i, 1);
            }
        }

        // 更新鳳梨大絕掉落物（只在生存模式使用，不影響其他模式）
        for (let i = this.pineappleUltimatePickups.length - 1; i >= 0; i--) {
            const p = this.pineappleUltimatePickups[i];
            try { p.update(deltaTime); } catch (_) {}
            if (p.markedForDeletion) {
                this.pineappleUltimatePickups.splice(i, 1);
            }
        }
        
        // 檢查玩家與出口的碰撞（第20波BOSS死亡後）
        if (this.exit && this.player && !this.isGameOver) {
            const exitCenterX = this.exit.x;
            const exitCenterY = this.exit.y;
            const exitHalfWidth = this.exit.width / 2;
            const exitHalfHeight = this.exit.height / 2;
            const playerRadius = this.player.collisionRadius || 16;
            
            // 使用矩形與圓形的碰撞檢測
            const playerX = this.player.x;
            const playerY = this.player.y;
            
            // 計算玩家中心到出口矩形的最短距離
            const closestX = Math.max(exitCenterX - exitHalfWidth, Math.min(playerX, exitCenterX + exitHalfWidth));
            const closestY = Math.max(exitCenterY - exitHalfHeight, Math.min(playerY, exitCenterY + exitHalfHeight));
            const distance = Utils.distance(playerX, playerY, closestX, closestY);
            
            if (distance < playerRadius) {
                // 玩家碰到出口，觸發勝利
                this.victory();
            }
        }
        
        // 優化：限制實體數量
        this.optimizeEntities();
    },
    
    /** 私有：更新玩家（保留雙次更新的歷史節奏；請勿更改） */
    _updatePlayer: function(deltaTime) {
        if (this.player) {
            this.player.update(deltaTime);
        }
    },

    /** 私有：更新武器（保留雙次更新的歷史節奏；請勿更改） */
    _updateWeapons: function(deltaTime) {
        if (this.player && this.player.weapons) {
            for (const weapon of this.player.weapons) {
                weapon.update(deltaTime);
            }
        }
    },

    // 繪製遊戲
    draw: function() {
        // 主線模式由其自身渲染迴圈管理（支援新舊管理器），避免互相覆蓋
        try {
            const activeId = (typeof GameModeManager !== 'undefined' && GameModeManager.getCurrent)
                ? GameModeManager.getCurrent()
                : ((typeof ModeManager !== 'undefined' && ModeManager.getActiveModeId) ? ModeManager.getActiveModeId() : null);
            if (activeId === 'main' || activeId === 'challenge' || activeId === 'defense') {
                return;
            }
        } catch(_) {}
        // 清空畫布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 應用鏡頭震動偏移
        let cameraOffsetX = this.camera.x;
        let cameraOffsetY = this.camera.y;
        
        if (this.cameraShake && this.cameraShake.active) {
            cameraOffsetX += this.cameraShake.offsetX;
            cameraOffsetY += this.cameraShake.offsetY;
        }
        
        // 平移座標系，將世界座標轉為畫面座標
        this.ctx.save();
        this.ctx.translate(-cameraOffsetX, -cameraOffsetY);
        
        // 繪製背景（平鋪）
        this.drawBackground();
        
        // 繪製所有實體（使用世界座標）
        this.drawEntities();
        
        // 可選：繪製彈幕（停用時無輸出）
        try {
            if (typeof BulletSystem !== 'undefined' && typeof BulletSystem.draw === 'function') {
                BulletSystem.draw(this.ctx);
            }
        } catch (e) {
            console.warn('BulletSystem.draw 失敗：', e);
        }
        
        // 邊界提示（可選）：在世界邊界畫微弱遮罩
        this.drawWorldBorders();
        
        // 還原座標系
        this.ctx.restore();

        // 繪製螢幕閃光效果（在最上層）
        if (this.screenFlash && this.screenFlash.active) {
            this.ctx.save();
            this.ctx.globalAlpha = this.screenFlash.intensity;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }
    },
    
    // 繪製所有實體
    drawEntities: function() {
        // 繪製地圖裝飾（非碰撞）
        if (this.decorations && this.decorations.length) {
            // 保存当前图像平滑设置
            const wasSmoothingEnabled = this.ctx.imageSmoothingEnabled;
            // 禁用图像平滑以获得更清晰的像素化效果（避免缩放模糊）
            try { this.ctx.imageSmoothingEnabled = false; } catch(_) {}
            
            for (const deco of this.decorations) {
                const img = (this.images || Game.images || {})[deco.imageKey];
                const drawX = deco.x - deco.width / 2;
                const drawY = deco.y - deco.height / 2;
                if (img && img.complete) {
                    // 获取图片的原始尺寸
                    const imgW = img.naturalWidth || img.width || deco.width;
                    const imgH = img.naturalHeight || img.height || deco.height;
                    // 调试：S15特殊处理，输出尺寸信息
                    if (deco.imageKey === 'S15') {
                        console.log('[S15调试] 图片原始尺寸:', imgW, 'x', imgH, '配置尺寸:', deco.width, 'x', deco.height);
                    }
                    // 使用图片的完整原始尺寸作为源，缩放到配置的目标尺寸绘制
                    // 这样即使图片文件是原始尺寸，也会正确缩放到目标尺寸
                    this.ctx.drawImage(img, 0, 0, imgW, imgH, drawX, drawY, deco.width, deco.height);
                } else {
                    this.ctx.fillStyle = '#666';
                    this.ctx.fillRect(drawX, drawY, deco.width, deco.height);
                }
            }
            
            // 恢复图像平滑设置
            try { this.ctx.imageSmoothingEnabled = wasSmoothingEnabled; } catch(_) {}
        }

        // 繪製障礙物
        if (this.obstacles && this.obstacles.length) {
            for (const obs of this.obstacles) {
                obs.draw(this.ctx);
            }
        }

        // 繪製經驗寶石
        for (const orb of this.experienceOrbs) {
            orb.draw(this.ctx);
        }

        // 繪製寶箱
        for (const chest of this.chests) {
            chest.draw(this.ctx);
        }

        // 繪製鳳梨大絕掉落物（層級與寶箱一致）
        for (const p of this.pineappleUltimatePickups) {
            try { p.draw(this.ctx); } catch (_) {}
        }
        
        // 繪製出口（第20波BOSS死亡後）
        if (this.exit) {
            const exitImg = (this.images || Game.images || {})['exit'];
            const drawX = this.exit.x - this.exit.width / 2;
            const drawY = this.exit.y - this.exit.height / 2;
            if (exitImg && exitImg.complete) {
                this.ctx.drawImage(exitImg, drawX, drawY, this.exit.width, this.exit.height);
            } else {
                // 備用：繪製矩形
                this.ctx.fillStyle = '#00ff00';
                this.ctx.fillRect(drawX, drawY, this.exit.width, this.exit.height);
            }
        }
        
        // 繪製AI生命體（使用GifOverlay，在玩家圖層）
        if (this.player && this.player.aiCompanion) {
            this.player.aiCompanion.draw(this.ctx);
        }
        
        // 繪製投射物（除連鎖閃電/狂熱雷擊/斬擊/裁決/神界裁決/路口車輛與幼妲光輝/幼妲天使聖光/死線戰士/死線超人，延後至敵人之上）
        for (const projectile of this.projectiles) {
            if (
                projectile &&
                (
                    projectile.weaponType === 'CHAIN_LIGHTNING' ||
                    projectile.weaponType === 'FRENZY_LIGHTNING' ||
                    projectile.weaponType === 'SLASH' ||
                    projectile.weaponType === 'YOUNG_DADA_GLORY' ||
                    projectile.weaponType === 'FRENZY_YOUNG_DADA_GLORY' ||
                    projectile.weaponType === 'DEATHLINE_WARRIOR' ||
                    projectile.weaponType === 'DEATHLINE_SUPERMAN' ||
                    projectile.weaponType === 'JUDGMENT' ||
                    projectile.weaponType === 'DIVINE_JUDGMENT' ||
                    projectile.weaponType === 'INTERSECTION_CAR'
                )
            ) {
                // 延後到前景層（敵人之上）再繪製
                continue;
            }
            projectile.draw(this.ctx);
        }
        
        // （移至前景）BOSS 火彈投射物原本在敵人之前繪製，改為敵人之上
        
        // （移至前景）爆炸粒子原本在敵人之前繪製，改為敵人之上
        
        // 繪製敵人
        for (const enemy of this.enemies) {
            enemy.draw(this.ctx);
        }
        
        // 前景層：BOSS 火彈投射物（提高可見度，避免被怪物遮擋）
        if (this.bossProjectiles) {
            for (const bossProjectile of this.bossProjectiles) {
                bossProjectile.draw(this.ctx);
            }
        }
        
        // 前景層：爆炸粒子（例如追蹤綿羊命中效果）
        if (this.explosionParticles) {
            for (const particle of this.explosionParticles) {
                this.ctx.save();
                const baseAlpha = particle.life / particle.maxLife;
                const isLightning = particle && particle.source === 'LIGHTNING';
                const isBaguette = particle && particle.source === 'BAGUETTE_THROW';
                const isHeartTransmission = particle && particle.source === 'HEART_TRANSMISSION';
                // 追蹤綿羊/法棍投擲/心意傳遞命中粒子更不透明，且稍微放大
                const alpha = (isLightning || isBaguette || isHeartTransmission) ? Math.min(1, 0.5 + baseAlpha * 0.6) : baseAlpha;
                const drawSize = (isLightning || isBaguette || isHeartTransmission) ? particle.size * 1.3 : particle.size;
                this.ctx.globalAlpha = alpha;
                this.ctx.fillStyle = particle.color;
                this.ctx.beginPath();
                this.ctx.arc(particle.x, particle.y, drawSize, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            }
        }
        
        // 前景層：心意傳遞效果圖片（A36.png，310x290比例）
        if (this.heartTransmissionEffects) {
            for (let i = this.heartTransmissionEffects.length - 1; i >= 0; i--) {
                const effect = this.heartTransmissionEffects[i];
                effect.life -= 16.67; // 假設60fps，每幀約16.67ms
                if (effect.life <= 0) {
                    this.heartTransmissionEffects.splice(i, 1);
                    continue;
                }
                const alpha = effect.life / effect.maxLife;
                const img = (this.images || Game.images || {})['A36'];
                if (img && img.complete) {
                    this.ctx.save();
                    this.ctx.globalAlpha = alpha;
                    const drawX = effect.x - effect.width / 2;
                    const drawY = effect.y - effect.height / 2;
                    this.ctx.drawImage(img, drawX, drawY, effect.width, effect.height);
                    this.ctx.restore();
                }
            }
        }
        
        // 前景層：連鎖閃電/狂熱雷擊/斬擊效果（電弧與火花/GIF）以及幼妲光輝/幼妲天使聖光特效/死線戰士特效/死線超人特效/裁決/神界裁決特效/路口車輛
        for (const projectile of this.projectiles) {
            if (
                projectile &&
                (
                    projectile.weaponType === 'CHAIN_LIGHTNING' ||
                    projectile.weaponType === 'FRENZY_LIGHTNING' ||
                    projectile.weaponType === 'SLASH' ||
                    projectile.weaponType === 'YOUNG_DADA_GLORY' ||
                    projectile.weaponType === 'FRENZY_YOUNG_DADA_GLORY' ||
                    projectile.weaponType === 'DEATHLINE_WARRIOR' ||
                    projectile.weaponType === 'DEATHLINE_SUPERMAN' ||
                    projectile.weaponType === 'JUDGMENT' ||
                    projectile.weaponType === 'DIVINE_JUDGMENT' ||
                    projectile.weaponType === 'INTERSECTION_CAR'
                )
            ) {
                projectile.draw(this.ctx);
            }
        }
        
        // 繪製玩家
        this.player.draw(this.ctx);
    },
    
    // 繪製背景
    drawBackground: function() {
        // 根據選定地圖的背景鍵選擇對應圖片
        const bgKey = (this.backgroundKey) || (this.selectedMap && this.selectedMap.backgroundKey) || 'background';
        const imgObj = (this.images || Game.images || {})[bgKey];
        if (imgObj && imgObj.complete) {
            // 第4張地圖（花園）：直接使用3840x2160圖片，不使用九宮格
            if (this.selectedMap && this.selectedMap.id === 'garden') {
                // 直接在世界座標(0,0)繪製完整圖片（座標系已平移）
                this.ctx.drawImage(imgObj, 0, 0);
            } else {
                // 其他地圖：平鋪背景圖片，覆蓋目前可視區域（已平移座標）
                const pattern = this.ctx.createPattern(imgObj, 'repeat');
                this.ctx.fillStyle = pattern || '#111';
                // 與既有設計保持一致：使用世界座標 camera.x/camera.y（座標系已平移）
                this.ctx.fillRect(this.camera.x, this.camera.y, this.canvas.width, this.canvas.height);
            }
        } else {
            // 備用：使用純色背景
            this.ctx.fillStyle = '#111';
            this.ctx.fillRect(this.camera.x, this.camera.y, this.canvas.width, this.canvas.height);
            // 可選：繪製網格以輔助定位
            this.drawGrid();
        }
    },
    
    // 繪製網格
    drawGrid: function() {
        this.ctx.strokeStyle = '#222';
        this.ctx.lineWidth = 1;
        const gridSize = 50;
        // 在可視區域繪製網格（已平移座標）
        for (let x = this.camera.x - (this.camera.x % gridSize); x <= this.camera.x + this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.camera.y);
            this.ctx.lineTo(x, this.camera.y + this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = this.camera.y - (this.camera.y % gridSize); y <= this.camera.y + this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.camera.x, y);
            this.ctx.lineTo(this.camera.x + this.canvas.width, y);
            this.ctx.stroke();
        }
    },

    // 世界邊界提示（不循環）：在靠近邊界時畫暗角
    drawWorldBorders: function() {
        const borderColor = CONFIG.WORLD?.BORDER_COLOR || '#000';
        const alpha = CONFIG.WORLD?.BORDER_ALPHA || 0.8;
        this.ctx.save();
        this.ctx.globalAlpha = 0.0;
        // 如需明顯邊界提示，可將 globalAlpha 改成 alpha 並繪製遮罩。
        // 預設不顯示，僅保留接口。
        this.ctx.restore();
    },
    
    // 添加敵人
    addEnemy: function(enemy) {
        this.enemies.push(enemy);
    },
    
    // 添加投射物
    addProjectile: function(projectile) {
        this.projectiles.push(projectile);
    },

    // 添加障礙物
    addObstacle: function(obstacle) {
        this.obstacles.push(obstacle);
    },
    
    // 生成經驗寶石
    spawnExperienceOrb: function(x, y, value) {
        // 檢查是否達到最大經驗寶石數量
        if (this.experienceOrbs.length >= CONFIG.OPTIMIZATION.MAX_EXPERIENCE_ORBS) {
            return;
        }
        
        const orb = new ExperienceOrb(x, y, value);
        this.experienceOrbs.push(orb);
    },

    /**
     * 路口地圖：生成車輛危險物
     * - 每批次生成 count 台（預設 3）
     * - 從隨機邊界直線衝向對側邊界後消失
     * - 生成點需打散（同批次不重疊）
     * - 播放 car 音效一次（不疊加）
     */
    spawnIntersectionCars: function(count = 4) {
        if (!(this.selectedMap && this.selectedMap.id === 'intersection')) return;
        if (typeof CarHazard === 'undefined') return;

        const worldW = this.worldWidth || (CONFIG && CONFIG.CANVAS_WIDTH) || 1920;
        const worldH = this.worldHeight || (CONFIG && CONFIG.CANVAS_HEIGHT) || 1080;

        // 速度：固定為 15（與 Enemy.speed 同尺度）
        const carSpeed = 15;

        const carKeys = ['car','car2','car3','car4','car5','car6','car7','car8','car9'];
        // 大小：先縮減 40%（0.6），再縮 20% → 0.48
        const scale = 0.48;
        const damage = 100;

        // 生成點打散：同批次車子的起點要分開
        // - 只允許左右兩側生成
        // - 同一側的 y 位置要打散（避免重疊）
        const used = []; // { side: 'left'|'right', y }
        const minSepY = 180;

        const pickSpawn = (side, w, h) => {
            let x, y, vx, vy;
            if (side === 'left') {
                x = -w / 2;
                y = Utils.randomInt(0, worldH);
                vx = carSpeed; vy = 0;
            } else {
                x = worldW + w / 2;
                y = Utils.randomInt(0, worldH);
                vx = -carSpeed; vy = 0;
            }
            return { x, y, vx, vy, side };
        };

        // 音效：一批只播一次
        try {
            if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                AudioManager.playSound('car');
            }
        } catch (_) {}

        // 生成側邊：保持完全隨機，但保證左右都有（不會全部同一邊）
        const n = Math.max(1, count);
        const sides = [];
        if (n === 1) {
            sides.push(Utils.randomInt(0, 1) === 0 ? 'left' : 'right');
        } else {
            sides.push('left');
            sides.push('right');
            for (let i = 2; i < n; i++) {
                sides.push(Utils.randomInt(0, 1) === 0 ? 'left' : 'right');
            }
            // Fisher–Yates shuffle
            for (let i = sides.length - 1; i > 0; i--) {
                const j = Utils.randomInt(0, i);
                const tmp = sides[i]; sides[i] = sides[j]; sides[j] = tmp;
            }
        }

        for (let i = 0; i < n; i++) {
            const baseKey = carKeys[Utils.randomInt(0, carKeys.length - 1)];
            const img = (this.images || Game.images || {})[baseKey];
            const srcW = (img && img.naturalWidth) ? img.naturalWidth : 385;
            const srcH = (img && img.naturalHeight) ? img.naturalHeight : 227;
            const w = Math.max(20, Math.floor(srcW * scale));
            const h = Math.max(20, Math.floor(srcH * scale));

            let spawn = null;
            const side = sides[i] || (Utils.randomInt(0, 1) === 0 ? 'left' : 'right');
            for (let tries = 0; tries < 60; tries++) {
                const cand = pickSpawn(side, w, h);
                let ok = true;
                for (const p of used) {
                    if (p.side === cand.side && Math.abs(cand.y - p.y) < minSepY) { ok = false; break; }
                }
                if (ok) { spawn = cand; break; }
            }
            if (!spawn) {
                spawn = pickSpawn(side, w, h);
            }
            used.push({ side: spawn.side, y: spawn.y });

            // 依左右移動方向選圖（以你提供的素材為準）：
            // 注意：你的 car*.png / car*-2.png 是「互為鏡像」，但「哪一張朝右」並不一致
            // （例如 car3.png 朝左、car3-2.png 才朝右），因此需要每種車指定 baseKey 的朝向。
            const baseFacing = {
                // 若你之後更換素材方向，只需要改這張表即可
                // 這三台（car / car2 / car4）依你目前素材實際朝向屬於例外：base 圖朝左
                car: 'left',
                car2: 'left',
                car3: 'left',
                car4: 'left',
                car5: 'left',
                car6: 'left',
                car7: 'left',
                car8: 'left',
                car9: 'left'
            };
            const desiredFacing = (spawn.vx >= 0) ? 'right' : 'left';
            const baseDir = baseFacing[baseKey] || 'right';
            const altKey = (baseKey === 'car') ? 'car-2' : (baseKey + '-2');

            // 若 base 本身就符合方向，用 base；否則用 -2（若 -2 不存在則回退 base）
            let imageKey = baseKey;
            if (baseDir !== desiredFacing) {
                const altImg = (this.images || Game.images || {})[altKey];
                imageKey = altImg ? altKey : baseKey;
            }

            const car = new CarHazard({
                x: spawn.x,
                y: spawn.y,
                vx: spawn.vx,
                vy: spawn.vy,
                width: w,
                height: h,
                imageKey: imageKey,
                damage,
                despawnPad: 400
            });
            this.addProjectile(car);
        }
    },

    // 生成寶箱（免費升級觸發）
    spawnChest: function(x, y) {
        const chest = new Chest(x, y);
        this.chests.push(chest);
    },

    // 鳳梨大絕：生成可拾取的大鳳梨（不吸、需碰觸；特效與寶箱同款光束）
    spawnPineappleUltimatePickup: function(targetX, targetY, opts = {}) {
        try {
            if (typeof PineappleUltimatePickup === 'undefined') return;
            const o = new PineappleUltimatePickup(targetX, targetY, opts);
            this.pineappleUltimatePickups.push(o);
        } catch (_) {}
    },
    
    // 生成出口（第20波BOSS死亡後）
    spawnExit: function() {
        // 在地圖中心生成出口
        const exitX = (this.worldWidth || CONFIG.CANVAS_WIDTH) / 2;
        const exitY = (this.worldHeight || CONFIG.CANVAS_HEIGHT) / 2;
        this.exit = {
            x: exitX,
            y: exitY,
            width: 300,
            height: 242
        };
        console.log('出口已生成在地圖中心');
    },
    
    // 優化實體數量
    optimizeEntities: function() {
        // 如果敵人數量超過限制，移除最遠的敵人
        const baseMax = CONFIG.OPTIMIZATION.MAX_ENEMIES;
        const bonus = (typeof this.maxEnemiesBonus === 'number') ? this.maxEnemiesBonus : 0;
        const effectiveMax = baseMax + Math.max(0, bonus);
        if (this.enemies.length > effectiveMax) {
            // 按照與玩家的距離排序
            this.enemies.sort((a, b) => {
                const distA = Utils.distance(a.x, a.y, this.player.x, this.player.y);
                const distB = Utils.distance(b.x, b.y, this.player.x, this.player.y);
                return distB - distA; // 降序排列，最遠的在前面
            });
            
            // 只移除非小BOSS/大BOSS，保留BOSS類型免受上限影響
            let toRemove = this.enemies.length - effectiveMax;
            for (let i = 0; i < this.enemies.length && toRemove > 0;) {
                const e = this.enemies[i];
                if (e && (e.type === 'BOSS' || e.type === 'ELF_BOSS' || e.type === 'HUMAN_BOSS' || e.type === 'MINI_BOSS' || e.type === 'ELF_MINI_BOSS' || e.type === 'HUMAN_MINI_BOSS')) {
                    i++; // 跳過BOSS類型
                } else {
                    this.enemies.splice(i, 1);
                    toRemove--;
                }
            }
        }
        
        // 如果投射物數量超過限制，移除最早的投射物
        if (this.projectiles.length > CONFIG.OPTIMIZATION.MAX_PROJECTILES) {
            this.projectiles.splice(0, this.projectiles.length - CONFIG.OPTIMIZATION.MAX_PROJECTILES);
        }
        
        // 如果經驗寶石數量超過限制，移除最早的經驗寶石
        if (this.experienceOrbs.length > CONFIG.OPTIMIZATION.MAX_EXPERIENCE_ORBS) {
            this.experienceOrbs.splice(0, this.experienceOrbs.length - CONFIG.OPTIMIZATION.MAX_EXPERIENCE_ORBS);
        }
    },
    
    // 暫停遊戲
    // 可選參數 muteAudio：是否同時靜音（預設true）；
    // 例如升級選單或技能頁暫停時，傳入false保留BGM與音效。
    pause: function(muteAudio = true) {
        this.isPaused = true;
        if (typeof AudioManager !== 'undefined' && AudioManager.setMuted) {
            if (muteAudio) AudioManager.setMuted(true);
        }
    },
    
    // 恢復遊戲
    resume: function() {
        this.isPaused = false;
        // 重置時間，避免大幅度時間跳躍（修復ESC暫停BUG）
        // 這樣恢復時第一次更新的deltaTime會很小，不會導致技能冷卻時間異常
        this.lastUpdateTime = Date.now();
        if (typeof AudioManager !== 'undefined' && AudioManager.setMuted) {
            // 若升級選單仍打開則保持靜音
            const levelMenu = document.getElementById('level-up-menu');
            const shouldUnmute = !levelMenu || levelMenu.classList.contains('hidden');
            if (shouldUnmute) AudioManager.setMuted(false);
        }
    },
    
    // 遊戲結束
    gameOver: function() {
        this.isGameOver = true;
        UI.showGameOverScreen();
    },
    
    // 遊戲勝利
    victory: function() {
        this.isGameOver = true;
        try {
            if (typeof Achievements !== 'undefined' && Achievements.unlock) {
                Achievements.unlock('FIRST_CLEAR');
                // 困難模式首勝：解鎖心靈魔法成就
                const diffId = this.selectedDifficultyId || 'EASY';
                if (diffId === 'HARD') {
                    Achievements.unlock('HARD_CLEAR');
                }
                // 洛可洛斯特通關廁所：解鎖死線超人成就
                const charId = (this.selectedCharacter && this.selectedCharacter.id) ? this.selectedCharacter.id : null;
                const mapId = (this.selectedMap && this.selectedMap.id) ? this.selectedMap.id : null;
                if (charId === 'rokurost' && mapId === 'city') {
                    Achievements.unlock('ROKUROST_CITY_CLEAR');
                }
                // 灰妲通關廁所：解鎖狂熱大波成就
                if (charId === 'dada' && mapId === 'city') {
                    Achievements.unlock('DADA_CITY_CLEAR');
                }
                // 艾比通關廁所：解鎖神界裁決成就
                if (charId === 'rabi' && mapId === 'city') {
                    Achievements.unlock('RABI_CITY_CLEAR');
                }
                // 灰妲通關草原：解鎖幼妲天使成就
                if (charId === 'dada' && mapId === 'forest') {
                    Achievements.unlock('DADA_FOREST_CLEAR');
                }
            }
        } catch(_) {}
        UI.showVictoryScreen();
    },
    
    // 重置遊戲
    reset: function() {
        // 先清理所有投射物的 DOM 元素（避免視覺污染）
        try {
            // 清理守護領域和引力波等使用 DOM 的投射物
            if (Array.isArray(this.projectiles)) {
                for (const p of this.projectiles) {
                    if (p && typeof p.destroy === 'function') {
                        try {
                            p.destroy();
                        } catch(_) {}
                    }
                }
            }
            if (Array.isArray(this.bossProjectiles)) {
                for (const p of this.bossProjectiles) {
                    if (p && typeof p.destroy === 'function') {
                        try {
                            p.destroy();
                        } catch(_) {}
                    }
                }
            }
        } catch (_) {}
        
        // 重置遊戲狀態
        this.enemies = [];
        this.projectiles = [];
        this.bossProjectiles = [];
        this.explosionParticles = [];
        this.heartTransmissionEffects = [];
        this.experienceOrbs = [];
        this.chests = [];
        this.pineappleUltimatePickups = [];
        this.obstacles = [];
        this.decorations = [];
        // 清除AI生命體（如果存在）
        if (this.player && this.player.aiCompanion) {
            try {
                if (this.player.aiCompanion.cleanup) {
                    this.player.aiCompanion.cleanup();
                }
            } catch(_) {}
            this.player.aiCompanion = null;
        }
        this.gameTime = 0;
        this.isPaused = false;
        this.isGameOver = false;
        this.boss = null;
        this.exit = null;
        
        // 重置花園視頻計時器
        this.gardenVideoTimer = 0;
        this.gardenVideoPlaying = false;
        this.gardenVideoFadeOutTime = 0;
        if (this.gardenVideoElement) {
            try {
                this.gardenVideoElement.pause();
                this.gardenVideoElement.currentTime = 0;
                if (this.gardenVideoElement.parentNode) {
                    this.gardenVideoElement.style.display = 'none';
                    this.gardenVideoElement.style.opacity = '0';
                }
            } catch(_) {}
        }

        // 清除技能視覺覆蓋層與樣式（例如 INVINCIBLE 護盾、守護領域、引力波等）
        try {
            // 清理 skill-effects-layer（用於 INVINCIBLE、SING、SLASH 等技能）
            const skillLayer = document.getElementById('skill-effects-layer');
            if (skillLayer && skillLayer.parentNode) {
                // 先清理層內所有子元素
                while (skillLayer.firstChild) {
                    skillLayer.removeChild(skillLayer.firstChild);
                }
                skillLayer.parentNode.removeChild(skillLayer);
            }
            // 清理 aura-effects-layer（用於 AURA_FIELD 守護領域）
            const auraLayer = document.getElementById('aura-effects-layer');
            if (auraLayer && auraLayer.parentNode) {
                // 先清理層內所有子元素
                while (auraLayer.firstChild) {
                    auraLayer.removeChild(auraLayer.firstChild);
                }
                auraLayer.parentNode.removeChild(auraLayer);
            }
            // 清理 gravity-wave-effects-layer（用於 GRAVITY_WAVE 引力波）
            const gravityLayer = document.getElementById('gravity-wave-effects-layer');
            if (gravityLayer && gravityLayer.parentNode) {
                // 先清理層內所有子元素
                while (gravityLayer.firstChild) {
                    gravityLayer.removeChild(gravityLayer.firstChild);
                }
                gravityLayer.parentNode.removeChild(gravityLayer);
            }
            // 清理 INVINCIBLE 樣式標籤
            const styleTag = document.getElementById('invincible-style');
            if (styleTag && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
        } catch (_) {}

        // 清理舊玩家的大招備份狀態（避免武器數據殘留到新遊戲）
        if (this.player) {
            try {
                if (this.player.isUltimateActive && this.player._ultimateBackup) {
                    // 如果舊玩家還在大招狀態，先結束大招以清理狀態
                    if (typeof this.player.deactivateUltimate === 'function') {
                        this.player.deactivateUltimate();
                    }
                }
                // 確保清理所有大招相關狀態
                this.player._ultimateBackup = null;
                this.player.isUltimateActive = false;
            } catch (_) {}
        }

        // 世界大小無需重算（保持init設定）。重新置中玩家
        this.player = new Player(this.worldWidth / 2, this.worldHeight / 2);
        // 應用選角屬性（若有）
        if (this.selectedCharacter) {
            const sc = this.selectedCharacter;
            // 角色移動速度倍率（預設為 1.0）
            if (sc.speedMultiplier) {
                this.player.speed = CONFIG.PLAYER.SPEED * sc.speedMultiplier;
            }
            // 角色血量：以 baseMaxHealth 為基準，乘上倍率再加上固定加成
            const baseMax = CONFIG.PLAYER.MAX_HEALTH;
            const hpMul = sc.hpMultiplier != null ? sc.hpMultiplier : 1.0;
            const hpBonus = sc.hpBonus != null ? sc.hpBonus : 0;
            const charBaseMax = Math.max(1, Math.floor(baseMax * hpMul + hpBonus));
            this.player.baseMaxHealth = charBaseMax;
            this.player.maxHealth = charBaseMax;
            this.player.health = charBaseMax;
            // 是否允許使用大絕（Q）：預設 true，角色可明確關閉
            if (sc.canUseUltimate === false) {
                this.player.canUseUltimate = false;
            } else {
                this.player.canUseUltimate = true;
            }
            // 生存模式玩家主體圖像鍵（若未指定則回退到 'player'）
            this.player.spriteImageKey = sc.spriteImageKey || 'player';
            // 角色初始爆擊率加成（若角色配置中有設定）
            if (typeof sc.critChanceBonusPct === 'number' && sc.critChanceBonusPct > 0) {
                // 初始化玩家爆擊率屬性（如果尚未初始化）
                if (this.player.critChanceBonusPct == null) {
                    this.player.critChanceBonusPct = 0;
                }
                // 應用角色基礎爆擊率加成（此為角色固有屬性，不與天賦/升級疊加，而是作為基礎值）
                // 注意：此值會在 BuffSystem.applyBuffs 中與天賦/升級加成相加
                this.player._characterBaseCritBonusPct = sc.critChanceBonusPct;
            }
            // 角色初始迴避率加成（若角色配置中有設定）
            // 注意：此為角色固有屬性，並不寫入存檔；由玩家 takeDamage 判定時一併計算
            if (typeof sc.dodgeChanceBonusPct === 'number' && sc.dodgeChanceBonusPct > 0) {
                this.player._characterBaseDodgeRate = sc.dodgeChanceBonusPct;
            } else {
                this.player._characterBaseDodgeRate = 0;
            }
        }
        
        // 套用選定難度（若有），供敵人與波次使用
        const diffId = this.selectedDifficultyId || 'EASY';
        this.difficulty = (CONFIG.DIFFICULTY && CONFIG.DIFFICULTY[diffId]) ? CONFIG.DIFFICULTY[diffId] : (CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.EASY) || null;
        // 設定困難模式的敵人上限加成（50~100），簡單為0
        const d = this.difficulty || {};
        const minB = d.maxEnemiesBonusMin || 0;
        const maxB = d.maxEnemiesBonusMax || 0;
        this.maxEnemiesBonus = (maxB > 0) ? Utils.randomInt(minB, maxB) : 0;

        // 根據難度控制彈幕系統開關：僅在修羅（ASURA）開啟
        try {
            if (typeof BulletSystem !== 'undefined' && typeof BulletSystem.setEnabled === 'function') {
                BulletSystem.setEnabled(diffId === 'ASURA');
            }
        } catch (e) {
            console.warn('BulletSystem.setEnabled 失敗：', e);
        }
        
        // 套用選定地圖的背景鍵（若有）
        const mapCfg = this.selectedMap || null;
        this.backgroundKey = (mapCfg && mapCfg.backgroundKey) ? mapCfg.backgroundKey : 'background';
        
        // 重置鏡頭
        this.camera.x = Utils.clamp(this.player.x - this.canvas.width / 2, 0, Math.max(0, this.worldWidth - this.canvas.width));
        this.camera.y = Utils.clamp(this.player.y - this.canvas.height / 2, 0, Math.max(0, this.worldHeight - this.canvas.height));
        
        // 先重置彈幕系統緩存，避免之後初始化波次時掛載的發射器被清空
        try {
            if (typeof BulletSystem !== 'undefined' && typeof BulletSystem.reset === 'function') {
                BulletSystem.reset();
            }
        } catch (e) {
            console.warn('BulletSystem.reset 失敗：', e);
        }

        // 重置波次系統
        WaveSystem.init();
        
        // 重置UI
        UI.init();
        
        // 應用天賦效果 - 確保在玩家創建後應用
        try {
            console.log('重置遊戲後應用天賦效果...');
            if (typeof TalentSystem !== 'undefined' && typeof TalentSystem.applyTalentEffects === 'function') {
                TalentSystem.applyTalentEffects(this.player);
            } else if (typeof applyTalentEffects === 'function') {
                applyTalentEffects(this.player);
            }
        } catch (e) {
            console.error('應用天賦效果失敗:', e);
        }

        // 設定左上角玩家頭像（依選角顯示），預設為 player.png
        const avatarEl = document.getElementById('player-avatar-img');
        if (avatarEl) {
            let key = 'player';
            if (this.selectedCharacter) {
                const sc = this.selectedCharacter;
                // 角色可提供獨立 HUD 頭像鍵；若無則回退到 avatarImageKey
                if (sc.hudImageKey) {
                    key = sc.hudImageKey;
                } else if (sc.avatarImageKey) {
                    key = sc.avatarImageKey;
                }
            }
            const imgObj = (this.images || Game.images || {})[key];
            if (imgObj && imgObj.src) {
                avatarEl.src = imgObj.src;
            } else {
                // 後備路徑
                avatarEl.src = key === 'player' ? 'assets/images/player.png' : 'assets/images/player1-2.png';
            }
            avatarEl.alt = this.selectedCharacter?.name || '玩家';
        }

        // 生成障礙物（3個S1與3個S2）
        this.spawnObstacles();
        // 生成地圖裝飾（各1個S3–S8）
        this.spawnDecorations();
        
        // 重置時間
        this.lastUpdateTime = Date.now();
    },
    
    // 開始新遊戲
    startNewGame: function() {
        // 重置遊戲
        this.reset();
        
        // 載入金幣並更新顯示
        this.loadCoins();
        if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) {
            UI.updateCoinsDisplay(this.coins);
        }
        
        // 顯示遊戲畫面
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
    }
    ,
    // 生成障礙物：3x3世界中隨機位置，不重疊也不卡住玩家
    /**
     * 生成障礙物
     * 依賴：Obstacle、Utils、圖片鍵 'S1','S2'。
     * 不變式：size=150、clearance=95、minPlayerDist=220、counts={S1:3,S2:3}；請勿更改。
     * 設計：避免與玩家過近、避免與既有障礙重疊。
     */
    spawnObstacles: function() {
        const size = 150;
        const half = size / 2;
        const types = ['S1', 'S2'];
        const counts = { S1: 3, S2: 3 };
        const minPlayerDist = 220;

        const tryPlace = (imageKey) => {
            let attempts = 0;
            while (attempts++ < 100) {
                const x = Utils.randomInt(half, this.worldWidth - half);
                const y = Utils.randomInt(half, this.worldHeight - half);
                if (Utils.distance(x, y, this.player.x, this.player.y) < minPlayerDist) continue;
                let overlap = false;
                for (const o of this.obstacles) {
                    const left = o.x - o.width / 2;
                    const right = o.x + o.width / 2;
                    const top = o.y - o.height / 2;
                    const bottom = o.y + o.height / 2;
                    const cx = Utils.clamp(x, left, right);
                    const cy = Utils.clamp(y, top, bottom);
                    const dx = x - cx;
                    const dy = y - cy;
                    const clearance = 95;
                    if ((dx * dx + dy * dy) <= clearance * clearance) { overlap = true; break; }
                }
                if (overlap) continue;
                this.addObstacle(new Obstacle(x, y, imageKey, size));
                break;
            }
        };

        for (const t of types) {
            for (let i = 0; i < counts[t]; i++) {
                tryPlace(t);
            }
        }
    }
    ,
    // 生成地圖裝飾（各1個S3–S8，隨機不重疊）
    /**
     * 生成地圖裝飾（S3–S8各1）
     * 依賴：圖片鍵 'S3'..'S8' 尺寸規格（specs）、Utils。
     * 不變式：specs 尺寸、margin=12、types=['S3','S4','S5','S6','S7','S8']；請勿更改。
     * 設計：避免與障礙與既有裝飾矩形重疊；允許靠近玩家。
     */
    spawnDecorations: function() {
        // 第二、第三、第四、第五張地圖（forest、desert、garden、intersection）不生成裝飾物，僅保留 S1/S2 障礙物。
        // 注意：不更改任何顯示文字與其他地圖行為；維持第一張地圖邏輯。
        // 第四張地圖（garden）的 S10-S16 裝飾物邏輯保留在註釋中，供未來其他地圖使用。
        if (this.selectedMap && (this.selectedMap.id === 'forest' || this.selectedMap.id === 'desert' || this.selectedMap.id === 'garden' || this.selectedMap.id === 'intersection')) {
            return; // 跳過裝飾生成
        }
        
        // 第四張地圖（garden）使用 S10-S16 作為裝飾物（已禁用，保留供未來使用）
        // 注意：以下尺寸為縮小後的目標尺寸（圖片文件可能是原始尺寸，渲染時會縮放到這些尺寸）
        // S10: 原始尺寸縮小50% → 118×98
        // S11: 原始尺寸縮小50% → 116×88
        // S12: 原始尺寸縮小50% → 122×73
        // S13: 原始尺寸縮小30% → 128×91
        // S14: 原始尺寸縮小30% → 133×108
        // S15: 原始尺寸縮小60% → 183×151
        // S16: 原始尺寸縮小60% → 183×151
        // if (this.selectedMap && this.selectedMap.id === 'garden') {
        //     const specs = {
        //         S10: { w: 59, h: 49 },    // 縮小50%（原118×98的50%）
        //         S11: { w: 58, h: 44 },    // 縮小50%（原116×88的50%）
        //         S12: { w: 61, h: 37 },    // 縮小50%（原122×73的50%，四捨五入）
        //         S13: { w: 90, h: 64 },    // 縮小30%（原128×91的30%，128×0.7≈90，91×0.7≈64）
        //         S14: { w: 93, h: 76 },    // 縮小30%（原133×108的30%，133×0.7≈93，108×0.7≈76）
        //         S15: { w: 73, h: 60 },    // 縮小60%（原183×151的60%，183×0.4≈73，151×0.4≈60）
        //         S16: { w: 73, h: 60 }     // 縮小60%（原183×151的60%，183×0.4≈73，151×0.4≈60）
        //     };
        //     const types = ['S10','S11','S12','S13','S14','S15','S16'];
        //     const margin = 12;
        //     const minPlayerDist = 0;
        //     const rectOverlap = (ax, ay, aw, ah, bx, by, bw, bh, m = 0) => {
        //         const halfAw = aw / 2, halfAh = ah / 2, halfBw = bw / 2, halfBh = bh / 2;
        //         return Math.abs(ax - bx) < (halfAw + halfBw + m) && Math.abs(ay - by) < (halfAh + halfBh + m);
        //     };
        //     const tryPlace = (key) => {
        //         const spec = specs[key];
        //         const halfW = spec.w / 2;
        //         const halfH = spec.h / 2;
        //         let attempts = 0;
        //         while (attempts++ < 200) {
        //             const x = Utils.randomInt(halfW, this.worldWidth - halfW);
        //             const y = Utils.randomInt(halfH, this.worldHeight - halfH);
        //             if (minPlayerDist > 0 && Utils.distance(x, y, this.player.x, this.player.y) < minPlayerDist) continue;
        //             let overlap = false;
        //             for (const d of this.decorations) {
        //                 if (rectOverlap(x, y, spec.w, spec.h, d.x, d.y, d.width, d.height, margin)) { overlap = true; break; }
        //             }
        //             if (overlap) continue;
        //             for (const o of this.obstacles) {
        //                 if (rectOverlap(x, y, spec.w, spec.h, o.x, o.y, o.width, o.height, margin)) { overlap = true; break; }
        //             }
        //             if (overlap) continue;
        //             this.decorations.push({ x, y, width: spec.w, height: spec.h, imageKey: key });
        //             break;
        //         }
        //     };
        //     for (const t of types) {
        //         tryPlace(t);
        //     }
        //     return; // 花園地圖裝飾物生成完成，直接返回
        // }
        
        // 第一張地圖（city）使用 S3-S9 作為裝飾物
        const specs = {
            S3: { w: 228, h: 70 },
            S4: { w: 184, h: 80 },
            S5: { w: 102, h: 70 },
            S6: { w: 200, h: 156 },
            S7: { w: 100, h: 78 },
            S8: { w: 130, h: 101 },
            // 新增：S9（67x80），與 S3~S8 相同邏輯作為地圖背景裝飾
            S9: { w: 67, h: 80 }
        };
        const types = ['S3','S4','S5','S6','S7','S8','S9'];
        const margin = 12;
        const minPlayerDist = 0;
        const rectOverlap = (ax, ay, aw, ah, bx, by, bw, bh, m = 0) => {
            const halfAw = aw / 2, halfAh = ah / 2, halfBw = bw / 2, halfBh = bh / 2;
            return Math.abs(ax - bx) < (halfAw + halfBw + m) && Math.abs(ay - by) < (halfAh + halfBh + m);
        };
        const tryPlace = (key) => {
            const spec = specs[key];
            const halfW = spec.w / 2;
            const halfH = spec.h / 2;
            let attempts = 0;
            while (attempts++ < 200) {
                const x = Utils.randomInt(halfW, this.worldWidth - halfW);
                const y = Utils.randomInt(halfH, this.worldHeight - halfH);
                if (minPlayerDist > 0 && Utils.distance(x, y, this.player.x, this.player.y) < minPlayerDist) continue;
                let overlap = false;
                for (const d of this.decorations) {
                    if (rectOverlap(x, y, spec.w, spec.h, d.x, d.y, d.width, d.height, margin)) { overlap = true; break; }
                }
                if (overlap) continue;
                for (const o of this.obstacles) {
                    if (rectOverlap(x, y, spec.w, spec.h, o.x, o.y, o.width, o.height, margin)) { overlap = true; break; }
                }
                if (overlap) continue;
                this.decorations.push({ x, y, width: spec.w, height: spec.h, imageKey: key });
                break;
            }
        };
        for (const t of types) {
            const count = (t === 'S9') ? 3 : 1; // S9 單獨改為 3 個，其餘維持 1 個
            for (let i = 0; i < count; i++) {
                tryPlace(t);
            }
        }
    }
    ,
    // 金幣：載入
    /**
     * 載入金幣
     * 依賴：localStorage 鍵 'game_coins'。
     * 不變式：鍵名與容錯策略不可更動（失敗時保留現值）。
     */
    loadCoins: function() {
        try {
            const key = 'game_coins';
            const stored = localStorage.getItem(key);
            const n = parseInt(stored, 10);
            if (Number.isFinite(n) && n >= 0) {
                this.coins = n;
            } else {
                // 若無紀錄則維持現值（預設0）
                this.coins = this.coins || 0;
            }
        } catch (_) {
            // 讀取失敗時不影響遊戲
            this.coins = this.coins || 0;
        }
        
        // 重置路口車輛計時器
        this.intersectionCarTimer = 0;
    },

    // 金幣：存檔
    /**
     * 存檔金幣
     * 依賴：localStorage 鍵 'game_coins'。
     * 不變式：鍵名、整數化與非負處理不可更動；忽略存檔錯誤。
     */
    saveCoins: function() {
        try {
            const key = 'game_coins';
            localStorage.setItem(key, String(Math.max(0, Math.floor(this.coins || 0))));
        } catch (_) {
            // 忽略存檔錯誤
        }
    },

    // 金幣：增加並即時存檔
    /**
     * 增加金幣並立即存檔
     * 不變式：僅接受非負整數增量；立即呼叫 saveCoins；更新 UI（若提供）。
     * 依賴：UI.updateCoinsDisplay（存在時）。
     */
    addCoins: function(amount) {
        const inc = Math.max(0, Math.floor(amount || 0));
        this.coins = (this.coins || 0) + inc;
        // 更新金幣收集統計
        this.coinsCollected += inc;
        // 立即存檔以符合自動存檔需求
        try { this.saveCoins(); } catch (_) {}
        // 成就：持有金幣達到 100000 時解鎖（當局記錄，勝利返回時彈窗）
        try {
            if (typeof Achievements !== 'undefined' && Achievements.unlock && Achievements.isUnlocked) {
                if (!Achievements.isUnlocked('COIN_100K') && (this.coins || 0) >= 100000) {
                    Achievements.unlock('COIN_100K');
                }
                // 成就：持有金幣達到 200000 時解鎖引力波（當局記錄，勝利/失敗返回時彈窗）
                if (!Achievements.isUnlocked('COIN_200K') && (this.coins || 0) >= 200000) {
                    Achievements.unlock('COIN_200K');
                }
            }
        } catch(_) {}
        // 觸發金幣變更事件
        try {
            if (typeof EventSystem !== 'undefined' && typeof GameEvents !== 'undefined' && EventSystem.trigger) {
                EventSystem.trigger(GameEvents.COINS_CHANGED, { coins: this.coins });
            }
        } catch (_) {}
        // 更新遊戲介面金幣顯示
        try {
            if (typeof UI !== 'undefined' && UI.updateCoinsDisplay) {
                UI.updateCoinsDisplay(this.coins);
            }
        } catch (_) {}
        
    },
    
    // 花園地圖視頻播放邏輯
    _updateGardenVideo: function(deltaTime) {
        if (!this.gardenVideoElement) {
            // 創建視頻元素（如果不存在）
            this._createGardenVideoElement();
        }
        
        if (!this.gardenVideoElement) return;
        
        // 如果正在播放，處理淡出邏輯
        if (this.gardenVideoPlaying) {
            const currentTime = Date.now();
            if (this.gardenVideoFadeOutTime > 0 && currentTime >= this.gardenVideoFadeOutTime) {
                // 開始淡出（500ms淡出）
                const fadeOutDuration = 500;
                const elapsed = currentTime - this.gardenVideoFadeOutTime;
                if (elapsed < fadeOutDuration) {
                    const opacity = 1 - (elapsed / fadeOutDuration);
                    this.gardenVideoElement.style.opacity = String(Math.max(0, opacity));
                } else {
                    // 淡出完成，停止播放
                    try {
                        this.gardenVideoElement.pause();
                        this.gardenVideoElement.currentTime = 0;
                        this.gardenVideoElement.style.display = 'none';
                        this.gardenVideoElement.style.opacity = '0';
                    } catch(_) {}
                    this.gardenVideoPlaying = false;
                    this.gardenVideoFadeOutTime = 0;
                    this.gardenVideoTimer = 0; // 重置計時器
                }
            }
            return;
        }
        
        // 累積時間
        this.gardenVideoTimer += deltaTime;
        
        // 每30秒觸發一次
        if (this.gardenVideoTimer >= this.gardenVideoInterval) {
            this._playGardenVideo();
            this.gardenVideoTimer = 0;
        }
    },
    
    // 創建花園視頻元素
    _createGardenVideoElement: function() {
        try {
            const viewport = document.getElementById('viewport') || document.getElementById('game-screen');
            if (!viewport) return;
            
            // 檢查是否已存在
            let video = document.getElementById('garden-background-video');
            if (!video) {
                video = document.createElement('video');
                video.id = 'garden-background-video';
                video.src = 'assets/videos/background8-2.mp4';
                video.preload = 'auto';
                video.playsinline = true;
                video.loop = false;
                video.muted = false;
                video.style.position = 'absolute';
                video.style.left = '0';
                video.style.top = '0';
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.zIndex = '1000'; // 覆蓋整個遊戲畫面
                video.style.objectFit = 'cover';
                video.style.pointerEvents = 'none';
                video.style.display = 'none';
                video.style.opacity = '0';
                // 使用Screen混合模式去除純黑背景（類似Premiere效果）
                video.style.mixBlendMode = 'screen';
                viewport.appendChild(video);
            }
            this.gardenVideoElement = video;
        } catch(e) {
            console.warn('創建花園視頻元素失敗:', e);
        }
    },
    
    // 播放花園視頻
    _playGardenVideo: function() {
        if (!this.gardenVideoElement) return;
        
        try {
            // 重置視頻
            this.gardenVideoElement.currentTime = 0;
            this.gardenVideoElement.style.display = 'block';
            this.gardenVideoElement.style.opacity = '0';
            
            // 淡入（300ms）
            const fadeInDuration = 300;
            requestAnimationFrame(() => {
                this.gardenVideoElement.style.transition = `opacity ${fadeInDuration}ms ease-in-out`;
                this.gardenVideoElement.style.opacity = '1';
            });
            
            // 播放視頻
            const playPromise = this.gardenVideoElement.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch((error) => {
                    console.warn('播放花園視頻失敗:', error);
                    // 如果播放失敗，重置狀態
                    this.gardenVideoElement.style.display = 'none';
                    this.gardenVideoElement.style.opacity = '0';
                    this.gardenVideoPlaying = false;
                });
            }
            
            this.gardenVideoPlaying = true;
            // 5秒後開始淡出
            this.gardenVideoFadeOutTime = Date.now() + 5000;
        } catch(e) {
            console.warn('播放花園視頻時出錯:', e);
            this.gardenVideoPlaying = false;
        }
    }
};
