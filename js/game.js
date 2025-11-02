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
    experienceOrbs: [],
    chests: [],
    obstacles: [],
    decorations: [],
    lastUpdateTime: 0,
    gameTime: 0,
    isPaused: false,
    isGameOver: false,
    boss: null,
    selectedCharacter: null,
    // 世界與鏡頭
    worldWidth: 0,
    worldHeight: 0,
    camera: { x: 0, y: 0 },
    coins: 0,
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
        const deltaTime = currentTime - this.lastUpdateTime;
        this.lastUpdateTime = currentTime;
        
        // 檢測CTRL+M快捷鍵觸發勝利條件
        const ctrlDown = Input.isKeyDown('Control');
        const mDown = Input.isKeyDown('m') || Input.isKeyDown('M');
        
        // Ctrl+M: 觸發勝利條件（用於測試）
        if (ctrlDown && mDown) {
            if (!this.ctrlMKeyPressed) {
                if (!this.isGameOver && !this.isPaused) {
                    this.victory();
                }
                this.ctrlMKeyPressed = true;
            }
        } else {
            this.ctrlMKeyPressed = false;
        }
        
        // 如果遊戲未暫停，更新遊戲狀態（加入防呆，避免單幀錯誤中斷迴圈）
        try {
            if (!this.isPaused && !this.isGameOver) {
                this.update(deltaTime);
            }
        } catch (e) {
            console.error('Game.update 發生錯誤，跳過本幀：', e);
        }
        
        // 繪製遊戲（加入防呆）
        try {
            this.draw();
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
        // 測試功能：按Ctrl+P增加99999金幣
        const ctrlDown = Input.isKeyDown('Control');
        const pDown = Input.isKeyDown('p') || Input.isKeyDown('P');
        if (ctrlDown && pDown) {
            if (!this.ctrlPKeyPressed) {
                this.addCoins(99999);
                console.log('測試功能：Ctrl+P已增加99999金幣');
                this.ctrlPKeyPressed = true;
            }
        } else {
            this.ctrlPKeyPressed = false;
        }
        
        // 更新遊戲時間
        this.gameTime += deltaTime;
        // 正規化時間倍率，避免粒子/效果更新時發生未定義錯誤
        const deltaMul = deltaTime / 16.67;
        
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
            
            // 移除標記為刪除的投射物
            if (projectile.markedForDeletion) {
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
            for (const deco of this.decorations) {
                const img = (this.images || Game.images || {})[deco.imageKey];
                const drawX = deco.x - deco.width / 2;
                const drawY = deco.y - deco.height / 2;
                if (img) {
                    this.ctx.drawImage(img, drawX, drawY, deco.width, deco.height);
                } else {
                    this.ctx.fillStyle = '#666';
                    this.ctx.fillRect(drawX, drawY, deco.width, deco.height);
                }
            }
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
        
        // 繪製投射物（除連鎖閃電，連鎖閃電延後至敵人之上）
        for (const projectile of this.projectiles) {
            if (projectile && projectile.weaponType === 'CHAIN_LIGHTNING') {
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
                // 追蹤綿羊命中粒子更不透明，且稍微放大
                const alpha = isLightning ? Math.min(1, 0.5 + baseAlpha * 0.6) : baseAlpha;
                const drawSize = isLightning ? particle.size * 1.3 : particle.size;
                this.ctx.globalAlpha = alpha;
                this.ctx.fillStyle = particle.color;
                this.ctx.beginPath();
                this.ctx.arc(particle.x, particle.y, drawSize, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            }
        }
        
        // 前景層：連鎖閃電效果（電弧與火花）
        for (const projectile of this.projectiles) {
            if (projectile && projectile.weaponType === 'CHAIN_LIGHTNING') {
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
        if (imgObj) {
            // 平鋪背景圖片，覆蓋目前可視區域（已平移座標）
            const pattern = this.ctx.createPattern(imgObj, 'repeat');
            this.ctx.fillStyle = pattern || '#111';
            this.ctx.fillRect(this.camera.x, this.camera.y, this.canvas.width, this.canvas.height);
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

    // 生成寶箱（免費升級觸發）
    spawnChest: function(x, y) {
        const chest = new Chest(x, y);
        this.chests.push(chest);
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
                if (e && (e.type === 'BOSS' || e.type === 'MINI_BOSS')) {
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
        this.lastUpdateTime = Date.now(); // 重置時間，避免大幅度時間跳躍
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
        UI.showVictoryScreen();
    },
    
    // 重置遊戲
    reset: function() {
        // 重置遊戲狀態
        this.enemies = [];
        this.projectiles = [];
        this.bossProjectiles = [];
        this.explosionParticles = [];
        this.experienceOrbs = [];
        this.chests = [];
        this.obstacles = [];
        this.decorations = [];
        this.gameTime = 0;
        this.isPaused = false;
        this.isGameOver = false;
        this.boss = null;

        // 清除技能視覺覆蓋層與樣式（例如 INVINCIBLE 護盾）
        try {
            const layer = document.getElementById('skill-effects-layer');
            if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
            const styleTag = document.getElementById('invincible-style');
            if (styleTag && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
        } catch (_) {}

        // 世界大小無需重算（保持init設定）。重新置中玩家
        this.player = new Player(this.worldWidth / 2, this.worldHeight / 2);
        // 應用選角屬性（若有）
        if (this.selectedCharacter) {
            const sc = this.selectedCharacter;
            if (sc.speedMultiplier) this.player.speed = CONFIG.PLAYER.SPEED * sc.speedMultiplier;
            if (sc.hpMultiplier) {
                this.player.maxHealth = Math.floor(CONFIG.PLAYER.MAX_HEALTH * sc.hpMultiplier);
                this.player.health = this.player.maxHealth;
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
            if (this.selectedCharacter && this.selectedCharacter.avatarImageKey) {
                key = this.selectedCharacter.avatarImageKey;
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
        // 第二、第三張地圖（forest、desert）不生成裝飾物，僅保留 S1/S2 障礙物。
        // 注意：不更改任何顯示文字與其他地圖行為；維持第一張地圖邏輯。
        if (this.selectedMap && (this.selectedMap.id === 'forest' || this.selectedMap.id === 'desert')) {
            return; // 跳過裝飾生成
        }
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
        // 若技能頁打開，更新顯示
        try {
            if (typeof UI !== 'undefined' && UI.isSkillsMenuOpen && UI.isSkillsMenuOpen()) {
                if (UI.updateCoins) UI.updateCoins(this.coins);
            }
        } catch (_) {}
    }
};
