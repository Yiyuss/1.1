// 防禦塔TD主遊戲邏輯
// 整合所有系統，管理遊戲流程

class TDGame {
    constructor(canvas, ctx, resources, audioManager) {
        try {
            this.canvas = canvas;
            this.ctx = ctx;
            this.resources = resources;
            this.audioManager = audioManager;
            
            // 檢查TD_CONFIG是否可用
            if (typeof TD_CONFIG === 'undefined') {
                throw new Error('TD_CONFIG未定義 - 確保td_config.js已加載');
            }
            
            // 遊戲配置
            this.config = TD_CONFIG;
            
            // 檢查TDGameState是否可用
            if (typeof TDGameState === 'undefined') {
                throw new Error('TDGameState未定義 - 確保td_config.js中的類別已加載');
            }
            
            // 遊戲狀態
            this.gameState = new TDGameState();
            
            // 檢查TDMap是否可用
            if (typeof TDMap === 'undefined') {
                throw new Error('TDMap未定義 - 確保td_map.js已加載');
            }
            
            // 遊戲系統
            this.map = new TDMap(this.config);
            
            // 檢查TDPlayer是否可用
            if (typeof TDPlayer === 'undefined') {
                throw new Error('TDPlayer未定義 - 確保td_player.js已加載');
            }
            
            // 將玩家初始位置設在主堡附近，讓玩家能看到核心區域
            this.player = new TDPlayer(this.config.BASE.X, this.config.BASE.Y - 200, this.config);
            
            // 檢查TDEnemyManager是否可用
            if (typeof TDEnemyManager === 'undefined') {
                throw new Error('TDEnemyManager未定義 - 確保td_enemy.js已加載');
            }
            
            this.enemyManager = new TDEnemyManager(this.config, this.map, this.gameState);
            
            // 檢查TDTowerManager是否可用
            if (typeof TDTowerManager === 'undefined') {
                throw new Error('TDTowerManager未定義 - 確保td_tower.js已加載');
            }
            
            this.towerManager = new TDTowerManager(this.config, this.map, this.gameState);
            
            // 相機系統（用於3x3世界）
            
            // 將相機對準主堡，但稍微偏移以顯示更多遊戲區域
            // 主堡在(1920, 1080)，我們希望主堡出現在畫面中央偏左位置
            // 這樣右側可以顯示更多敵人來襲的路徑
            this.camera = {
                x: this.config.BASE.X - canvas.width * 0.4,  // 稍微偏左，顯示右側路徑
                y: this.config.BASE.Y - canvas.height / 2,
                targetX: this.config.BASE.X - canvas.width * 0.4,
                targetY: this.config.BASE.Y - canvas.height / 2
            };
            
            // 更新相機綁定
            this.updateCamera = this.updateCamera.bind(this);
            
            // 遊戲時間
            this.currentTime = Date.now();
            this.lastTime = this.currentTime;
            this.gameTime = 0;
            
            // 遊戲狀態
            this.isPaused = false;
            this.isGameOver = false;
            this.isGameWon = false;
            this._inputHandlersBound = false;
            this._boundKeyDown = null;
            this._boundKeyUp = null;
            
            // 輸入處理
            this.mousePos = { x: 0, y: 0 };
            this.keys = {};
            this.clickTarget = null;
            
            // UI狀態
            this.showTowerMenu = false;
            this.selectedTowerType = null;
            this.buildMode = false;
            
            // 主堡選中狀態
            this.selectedBase = false;
            
            // 自動化技能系統
            this.baseAutoSkills = {
                chainLightning: {
                    enabled: false,
                    lastCastTime: 0,
                    cooldown: 5000, // 5秒
                    damage: 300,
                    range: 500, // 範圍500
                    maxChains: 5
                },
                heal: {
                    enabled: false,
                    lastHealTime: 0,
                    interval: 5000, // 5秒
                    healAmount: 2
                }
            };
            
            // 主堡圖片位置（用於選中虛線和連鎖閃電起點）
            this.baseImageX = 0;
            this.baseImageY = 0;
            this.baseImageWidth = 0;
            this.baseImageHeight = 0;
            this.baseImageCenterX = 0;
            this.baseImageCenterY = 0;
            
            // 連鎖閃電視覺效果列表
            this.chainLightningEffects = [];
            
            // 從localStorage讀取自動化技能解鎖狀態
            this.loadBaseAutoSkills();
            
        } catch (error) {
            console.error('TDGame構造函數失敗:', error);
            console.error('錯誤堆疊:', error.stack);
            throw error; // 重新拋出錯誤以便上層捕獲
        }
    }
    
    // 更新相機
    updateCamera(deltaTime) {
        // 平滑相機移動
        const lerpFactor = 0.1;
        this.camera.x += (this.camera.targetX - this.camera.x) * lerpFactor;
        this.camera.y += (this.camera.targetY - this.camera.y) * lerpFactor;
        
        // 限制相機邊界
        this.camera.x = Math.max(0, Math.min(this.config.MAP.WIDTH - this.canvas.width, this.camera.x));
        this.camera.y = Math.max(0, Math.min(this.config.MAP.HEIGHT - this.canvas.height, this.camera.y));
    }
    
    // 初始化遊戲
    init() {
        // 綁定玩家音效回調
        this.player.onPlaySound = (sound) => {
            this.playSound(sound);
        };
        
        // 綁定防禦塔管理器回調
        // 建造 / 升級 / 出售的實際音效由 TDTowerManager 透過 TD_CONFIG.SOUNDS.* 控制，這裡不再額外播放 level_up
        this.towerManager.onTowerBuilt = null;
        this.towerManager.onTowerUpgraded = null;
        this.towerManager.onTowerSold = null;

        // 讓所有防禦塔射擊時也能播放各自的射擊音效（包含瑪格麗特的 ICE 聲音）
        this.towerManager.onPlaySound = (soundName) => {
            this.playSound(soundName);
        };
        
        // 綁定敵人管理器回調
        this.enemyManager.onEnemyDeath = (enemy) => {
            this.playSound('enemy_death');
        };
        
        // 敵人撞到主堡的音效由 TDEnemyManager 內部使用 TD_CONFIG.SOUNDS.ENEMY_REACH_BASE 控制
        // 這裡不再額外播放 'bo'，避免殘留舊音效或重複播放
        this.enemyManager.onEnemyReachEnd = null;
        
        this.enemyManager.onGoldReward = (gold) => {
            this.gameState.addEnemyGold(gold);
        };
        
        // 播放背景音樂
        this.playMusic('game_music');

        // 綁定鍵盤輸入
        this.setupInputHandlers();
    }
    
    // 開始遊戲
    start() {
        console.log('TD遊戲開始...');
        try {
            // 初始化遊戲
            this.init();
            
            // 設置遊戲狀態為運行中
            this.isPaused = false;
            this.isGameOver = false;
            this.isGameWon = false;
            
            // 重置遊戲時間
            this.gameTime = 0;
            this.currentTime = Date.now();
            this.lastTime = this.currentTime;
            
            // 初始化第一波（延遲開始，讓玩家有準備時間）
            setTimeout(() => {
                if (!this.isGameOver && !this.isGameWon) {
                    this.startNextWave();
                }
            }, 3000); // 3秒後開始第一波
            
            console.log('TD遊戲開始成功！');
        } catch (error) {
            console.error('TD遊戲開始失敗:', error);
            throw error;
        }
    }
    
    // 綁定回調函數
    bindCallbacks() {
        // 在這裡綁定各種回調函數
    }
    
    // 更新遊戲
    update() {
        // 先更新時間基準，確保暫停期間不會累積巨大的 deltaTime
        this.currentTime = Date.now();
        const deltaTime = this.currentTime - this.lastTime;
        this.lastTime = this.currentTime;
        // 將暫停狀態同步到遊戲狀態，供其他系統（如敵人管理器）參考
        this.gameState.isPaused = this.isPaused;
        
        // 暫停 / 結算時不推進遊戲邏輯與計時
        if (this.isPaused || this.isGameOver || this.isGameWon) {
            return;
        }
        
        this.gameTime += deltaTime;
        
        // 更新相機
        this.updateCamera(deltaTime);
        
        // 更新遊戲邏輯
        this.updateWave(deltaTime);
        
        // 更新玩家
        this.player.update(deltaTime, this.currentTime, this.enemyManager, this.towerManager, this.gameState);
        
        // 更新相機目標位置（跟隨玩家）
        this.camera.targetX = this.player.x - this.canvas.width / 2;
        this.camera.targetY = this.player.y - this.canvas.height / 2;
        
        // 更新敵人
        this.enemyManager.update(deltaTime, this.currentTime);
        
        // 更新防禦塔
        this.towerManager.update(this.currentTime, this.enemyManager);
        
        // 更新主堡自動化技能
        this.updateBaseAutoSkills(deltaTime);
        
        // 更新連鎖閃電視覺效果
        this.updateChainLightningEffects(deltaTime);
        
        // 檢查遊戲結束條件
        this.checkGameEnd();
        
        // 更新UI
        this.updateUI();
    }
    
    // 更新波次
    updateWave(deltaTime) {
        // 若當前波次未激活：代表位於兩波之間的空檔
        // 符合 TD 標準流程：清完一波 → 自動進入下一波「準備時間」
        if (!this.gameState.isWaveActive) {
            if (!this.isGameOver && !this.isGameWon && this.gameState.wave < this.config.GAME.MAX_WAVES) {
                // 自動開始下一波（先進入 60 秒準備，準備結束後才生怪）
                this.startNextWave();
            }
            return;
        }

        // 波次準備時間
        if (this.gameState.wavePrepTimer > 0) {
            this.gameState.wavePrepTimer -= deltaTime / 1000;
            if (this.gameState.wavePrepTimer <= 0) {
                // 開始生成敵人，記錄波次開始時間與生成時間累計
                this.gameState.waveStartTime = this.currentTime;
                this.gameState.lastSpawnTime = this.currentTime;
                this.enemyManager.lastSpawnTime = this.currentTime;
                this.gameState.waveSpawnElapsed = 0;
            }
        }
        
        // 若已經開始生成敵人（準備時間結束），累計生成時間（毫秒）
        if (this.gameState.wavePrepTimer <= 0) {
            this.gameState.waveSpawnElapsed += deltaTime;
        }
    }
    
    // 開始下一波（自動或手動）
    startNextWave() {
        if (this.gameState.isWaveActive) return;
        
        const nextWave = this.gameState.wave;
        if (nextWave >= this.config.GAME.MAX_WAVES) return;
        
        // 啟動下一波，讓 TDGameState 依照 10 秒邏輯產生本波的 waveSpawnQueue，
        // 並重置敵人排隊偏移，確保新一波的怪物都從起點開始排隊。
        this.gameState.startWave(nextWave);
        if (this.enemyManager && typeof this.enemyManager.startNewWave === 'function') {
            this.enemyManager.startNewWave();
        }
        
        this.playSound(TD_CONFIG.SOUNDS.WAVE_START);
    }
    
    // 手動開始波次（由玩家觸發）
    startWave() {
        if (this.gameState.isWaveActive) return false;
        // 統一走 startNextWave：先進入 60 秒準備時間，時間到才開始生怪
        this.startNextWave();
        return true;
    }
    
    skipPreparationPhase() {
        if (!this.gameState.isWaveActive) return false;
        if (this.gameState.wavePrepTimer <= 0) return false;
        this.gameState.wavePrepTimer = 0;
        this.gameState.waveStartTime = this.currentTime; // 立即開始生成敵人
        this.gameState.lastSpawnTime = this.currentTime;
        this.enemyManager.lastSpawnTime = this.currentTime;
        this.gameState.waveSpawnElapsed = 0; // 重設生成時間軸
        return true;
    }
    
    // 檢查遊戲結束
    checkGameEnd() {
        if (this.gameState.isGameOver) {
            this.isGameOver = true;
            this.onGameOver();
        } else if (this.gameState.isGameWon) {
            this.isGameWon = true;
            this.onGameWin();
        }
    }
    
    // 遊戲失敗
    onGameOver() {
        try {
            if (window.TDDefenseSettlement && typeof window.TDDefenseSettlement.show === 'function') {
                window.TDDefenseSettlement.show('failure', this.buildSettlementStats('failure'));
            }
        } catch (err) {
            console.warn('防禦模式失敗結算顯示失敗:', err);
        }
    }
    
    // 遊戲勝利
    onGameWin() {
        try {
            if (window.TDDefenseSettlement && typeof window.TDDefenseSettlement.show === 'function') {
                window.TDDefenseSettlement.show('victory', this.buildSettlementStats('victory'));
            }
        } catch (err) {
            console.warn('防禦模式勝利結算顯示失敗:', err);
        }
    }
    
    buildSettlementStats(resultType) {
        return {
            result: resultType,
            timeSec: Math.max(0, Math.floor(this.gameTime / 1000)),
            wave: this.gameState.wave + 1,
            maxWave: this.config.GAME.MAX_WAVES,
            gold: this.gameState.gold,
            totalGoldEarned: this.gameState.totalGoldEarned,
            totalGoldSpent: this.gameState.totalGoldSpent,
            enemyGoldEarned: this.gameState.enemyGoldEarned,
            enemiesKilled: this.gameState.enemiesKilled,
            towersBuilt: this.gameState.towersBuilt,
            baseHealth: this.gameState.baseHealth,
            maxBaseHealth: this.gameState.maxBaseHealth
        };
    }
    
    // 處理滑鼠點擊 - 修復座標轉換問題
    handleClick(x, y) {
        if (this.isPaused || this.isGameOver || this.isGameWon) return;
        
        // 將畫面座標轉換為世界座標（考慮相機偏移）
        const worldX = x + this.camera.x;
        const worldY = y + this.camera.y;
        
        // 如果在建造模式
        if (this.buildMode && this.selectedTowerType) {
            this.tryBuildTower(worldX, worldY);
            return;
        }
        
        // 檢查是否點擊了防禦塔（用於升級或出售）
        const tower = this.towerManager.getTowerAt(worldX, worldY);
        if (tower) {
            this.playSound('button_click2');
            this.selectTower(tower);
            return;
        }
        
        // 檢查是否點擊了主堡
        const baseDistance = Math.sqrt(
            Math.pow(worldX - this.config.BASE.X, 2) + 
            Math.pow(worldY - this.config.BASE.Y, 2)
        );
        if (baseDistance <= this.config.BASE.SIZE / 2) {
            // 點擊主堡顯示信息
            this.playSound('button_click2');
            this.selectedTower = null;
            this.selectedBase = !this.selectedBase; // 切換主堡選中狀態
            // 通知 DOM UI 更新主堡資訊面板
            if (typeof window.TDDefenseDomUI !== 'undefined' && typeof window.TDDefenseDomUI.update === 'function') {
                try {
                    window.TDDefenseDomUI.update(this);
                } catch (_) {}
            }
            return;
        }
        
        // 點擊空白處：關閉主堡選中狀態
        if (this.selectedBase) {
            this.selectedBase = false;
            if (typeof window.TDDefenseDomUI !== 'undefined' && typeof window.TDDefenseDomUI.update === 'function') {
                try {
                    window.TDDefenseDomUI.update(this);
                } catch (_) {}
            }
        }
        
        // 點擊空白處：關閉所有信息面板
        this.selectedTower = null;
        if (this.selectedBase) {
            this.selectedBase = false;
            if (typeof window.TDDefenseDomUI !== 'undefined' && typeof window.TDDefenseDomUI.update === 'function') {
                try {
                    window.TDDefenseDomUI.update(this);
                } catch (_) {}
            }
        }
        
        // 移動玩家到世界座標
        this.player.moveTo(worldX, worldY);
    }
    
    // 處理右鍵點擊：取消蓋塔
    handleRightClick() {
        if (this.buildMode && this.selectedTowerType) {
            // 取消建造模式
            this.exitBuildMode();
            // 取消玩家的建造目標
            if (this.player) {
                this.player.cancelBuilding();
                this.player.stopMoving();
            }
        }
    }
    
    // 嘗試建造防禦塔 - 完全重寫建造流程
    tryBuildTower(x, y) {
        if (!this.selectedTowerType) return;
        
        const towerConfig = this.config.TOWERS[this.selectedTowerType];
        if (!towerConfig) return;
        
        // 檢查資金（不預先扣款）
        if (this.gameState.gold < towerConfig.cost) {
            this.playSound('bo');
            return;
        }

        // 檢查位置是否可建造（不在路徑上，且在可建造區域）
        const cell = this.map.getNearestCell(x, y);
        if (!cell || cell.isPath || !cell.isBuildable) {
            this.playSound('bo'); // 位置不可用
            return;
        }
        
        // 檢查是否已有塔在該位置
        if (this.towerManager.getTowerAt(x, y)) {
            this.playSound('bo'); // 位置已被佔用
            return;
        }
        
        // 設定建造目標，玩家會移動到位置並開始建造
        this.player.setBuildTarget({
            towerType: this.selectedTowerType,
            x: cell.centerX,
            y: cell.centerY,
            buildTime: towerConfig.buildTime,
            cost: towerConfig.cost,
            gameState: this.gameState,
            towerManager: this.towerManager
        });
        
        // 退出建造模式
        this.buildMode = false;
        this.selectedTowerType = null;
    }
    
    // 選擇防禦塔（點擊顯示信息）
    selectTower(tower) {
        this.selectedTower = tower;
        // 退出建造模式（如果正在建造）
        if (this.buildMode) {
            this.exitBuildMode();
        }
        // 通知 DOM UI 更新防禦塔資訊
        if (typeof window.TDDefenseDomUI !== 'undefined' && typeof window.TDDefenseDomUI.update === 'function') {
            try {
                window.TDDefenseDomUI.update(this);
            } catch (_) {}
        }
    }
    
    // 進入建造模式
    enterBuildMode(towerType) {
        this.buildMode = true;
        this.selectedTowerType = towerType;
    }
    
    // 退出建造模式
    exitBuildMode() {
        this.buildMode = false;
        this.selectedTowerType = null;
    }
    
    // 暫停/繼續遊戲
    togglePause() {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.pauseMusic();
        } else {
            this.resumeMusic();
        }
    }
    
    // 重置遊戲
    reset() {
        this.gameState.reset();
        this.enemyManager.clear();
        this.towerManager.clear();
        this.player.stopMoving();
        this.player.x = this.config.BASE.X;
        this.player.y = this.config.BASE.Y;
        
        // 重置相機到主堡位置
        this.camera.x = this.config.BASE.X - this.canvas.width / 2;
        this.camera.y = this.config.BASE.Y - this.canvas.height / 2;
        this.camera.targetX = this.camera.x;
        this.camera.targetY = this.camera.y;
        
        this.isPaused = false;
        this.isGameOver = false;
        this.isGameWon = false;
        this.gameTime = 0;
        
        this.exitBuildMode();
    }
    
    // 渲染遊戲
    render() {
        if (this.config.DEBUG) {
            console.log('TDGame.render() 被調用 - 開始渲染遊戲');
            console.log('畫布尺寸:', this.canvas.width, 'x', this.canvas.height);
            console.log('相機位置:', this.camera.x, this.camera.y);
        }
        
        // 清空畫布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 保存當前狀態
        this.ctx.save();
        
        // 應用相機變換（使用整數像素，避免文字與圖像因半像素而糊掉）
        const camX = Math.round(this.camera.x);
        const camY = Math.round(this.camera.y);
        this.ctx.translate(-camX, -camY);
        
        // 繪製背景圖片（位於最下層）- 使用九宮格方式拼成4K，保持畫質
        const bgImg = this.resources && typeof this.resources.getImage === 'function'
            ? (this.resources.getImage(this.backgroundKey || '')
               || this.resources.getImage('defense_bg4')
               || this.resources.getImage('background4'))
            : null;
        if (bgImg) {
            // 使用九宮格方式拼成4K（3x3），每格1280x720，總共3840x2160
            // 這樣可以保持原始畫質，不會因為拉伸而模糊
            const zoneWidth = this.config.MAP.ZONES.width;   // 1280
            const zoneHeight = this.config.MAP.ZONES.height; // 720
            const zonesCols = this.config.MAP.ZONES.cols;    // 3
            const zonesRows = this.config.MAP.ZONES.rows;    // 3
            
            // 繪製九宮格背景
            for (let row = 0; row < zonesRows; row++) {
                for (let col = 0; col < zonesCols; col++) {
                    const x = col * zoneWidth;
                    const y = row * zoneHeight;
                    // 使用原始尺寸繪製，不拉伸
                    this.ctx.drawImage(bgImg, x, y, zoneWidth, zoneHeight);
                }
            }
        }
        // 背景邏輯：不再繪製顏色或網格，讓美術背景透出
        this.renderBackground();
        
        // 繪製地圖
        this.map.render(this.ctx, false, false); // 不顯示網格

        // 繪製主堡圖片（Nexus.png），大小約為原本的 1.5 倍，並維持 1502x1212 比例
        try {
            const baseCell = this.map.getNearestCell(this.config.BASE.X, this.config.BASE.Y);
            if (baseCell && this.resources && typeof this.resources.getImage === 'function') {
                const baseImg = this.resources.getImage('BOX') || this.resources.getImage('Nexus') || this.resources.getImage('Nexus.png');
                if (baseImg) {
                    const baseSize = this.config.BASE.SIZE;
                    const targetHeight = baseSize * 1.5;
                    const aspect = 1502 / 1212; // 依照原圖比例
                    const targetWidth = targetHeight * aspect;
                    // 視覺微調：圖片本身略偏右下，這裡整體再往左移一些
                    const offsetX = -30;
                    const offsetY = -8;
                    const baseX = baseCell.centerX - targetWidth / 2 + offsetX;
                    const baseY = baseCell.centerY - targetHeight / 2 + offsetY;
                    // 保存主堡圖片實際位置，用於選中虛線和連鎖閃電起點
                    this.baseImageX = baseX;
                    this.baseImageY = baseY;
                    this.baseImageWidth = targetWidth;
                    this.baseImageHeight = targetHeight;
                    this.baseImageCenterX = baseX + targetWidth / 2;
                    this.baseImageCenterY = baseY + targetHeight / 2;
                    this.ctx.drawImage(baseImg, baseX, baseY, targetWidth, targetHeight);
                }
            }
        } catch (_) {}
        
        // 繪製防禦塔
        if (this.config.DEBUG) { console.log('開始繪製防禦塔...'); }
        this.towerManager.render(this.ctx, this.resources);
        
        // 繪製敵人
        if (this.config.DEBUG) { console.log('開始繪製敵人...'); }
        this.enemyManager.render(this.ctx, this.resources);
        
        // 繪製選中防禦塔的虛線標記（讓玩家清楚知道目前選中了哪座塔）
        if (this.selectedTower) {
            const t = this.selectedTower;
            this.ctx.save();
            this.ctx.setLineDash([6, 4]);
            this.ctx.lineWidth = 2;
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';

            const gridSize = this.config.MAP && this.config.MAP.GRID_SIZE ? this.config.MAP.GRID_SIZE : 80;
            let radius;
            if (t.type === 'SLOW' || t.type === 'MAGIC') {
                // GIF 塔（瑪格麗特 / 森森鈴蘭）：依照實際 GIF 視覺大小放大一點，圈住整個動圖底部
                radius = gridSize * 0.45; // 約一格稍大一點，對應高度 ~64px 的 GIF
            } else {
                const baseRadius =
                    (t.sprite && t.sprite.width)
                        ? (t.sprite.width / 2 + 6)
                        : (gridSize * 0.35);
                radius = Math.max(18, baseRadius);
            }

            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
        }
        
        // 繪製選中主堡的虛線標記（以圖片實際位置為準）
        if (this.selectedBase && this.baseImageCenterX !== undefined && this.baseImageCenterY !== undefined) {
            this.ctx.save();
            this.ctx.setLineDash([6, 4]);
            this.ctx.lineWidth = 2;
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            
            // 以主堡圖片中心為圓心，使用圖片對角線的一半作為半徑
            const radius = Math.sqrt(
                Math.pow(this.baseImageWidth / 2, 2) + 
                Math.pow(this.baseImageHeight / 2, 2)
            ) + 10; // 稍微放大一點，讓虛線圈住整個圖片
            
            this.ctx.beginPath();
            this.ctx.arc(this.baseImageCenterX, this.baseImageCenterY, radius, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
        }
        
        // 繪製玩家（非GIF在Canvas上繪製，GIF由TDGifOverlay在最後統一處理）
        if (this.config.DEBUG) { console.log('開始繪製玩家...'); }
        this.player.render(this.ctx, this.resources);
        
        // 繪製連鎖閃電視覺效果（與生存模式相同）
        for (const effect of this.chainLightningEffects) {
            if (effect && typeof effect.draw === 'function') {
                effect.draw(this.ctx);
            }
        }
        
        // 在世界座標繪製主堡血量條
        this.renderBaseHealthIndicator();
        
        // 恢復狀態
        this.ctx.restore();

        // 使用 TDGifOverlay 顯示冰凍塔（瑪格麗特）與元素塔（森森鈴蘭）的 GIF 動畫作為「塔本體」
        // 說明：
        // - ICE.gif / element.gif 本身已包含本體+特效，因此不再額外疊加第二層特效
        // - 顯示尺寸使用先前你滿意的縮放大小（高度約 64px），但保持原始長寬比例
        try {
            if (typeof window !== 'undefined' &&
                window.TDGifOverlay &&
                this.towerManager &&
                Array.isArray(this.towerManager.towers)) {

                // 先清除上一幀殘留的防禦模式 GIF，避免售出/移除塔後圖片卡在畫面上
                try {
                    if (typeof window.TDGifOverlay.clearAll === 'function') {
                        window.TDGifOverlay.clearAll();
                    }
                } catch (_) {}

                // 以原始比例為基準，套用你之前滿意的顯示高度（約 64px）
                let iceImg = null;
                let elementImg = null;
                let srcWidthIce = 242;
                let srcHeightIce = 320;
                let srcWidthElement = 242;
                let srcHeightElement = 320;
                if (this.resources && typeof this.resources.getImage === 'function') {
                    iceImg = this.resources.getImage('ICE') || this.resources.getImage('ICE.gif');
                    if (iceImg && iceImg.width && iceImg.height) {
                        srcWidthIce = iceImg.width;
                        srcHeightIce = iceImg.height;
                    }
                    elementImg = this.resources.getImage('element') || this.resources.getImage('element.gif');
                    if (elementImg && elementImg.width && elementImg.height) {
                        srcWidthElement = elementImg.width;
                        srcHeightElement = elementImg.height;
                    }
                }
                const iceSrc = iceImg ? iceImg.src : 'assets/images/ICE.gif';
                const elementSrc = elementImg ? elementImg.src : 'assets/images/element.gif';

                // 目標高度沿用先前設定的 64 像素，寬度依比例自動計算
                const targetHeight = 64;
                const aspectIce = srcWidthIce / srcHeightIce;
                const aspectElement = srcWidthElement / srcHeightElement;
                const targetWidthIce = Math.floor(targetHeight * aspectIce);
                const targetWidthElement = Math.floor(targetHeight * aspectElement);

                this.towerManager.towers.forEach((tower, idx) => {
                    const screenX = tower.x - this.camera.x;
                    const screenY = tower.y - this.camera.y;
                    if (tower.type === 'SLOW') {
                        window.TDGifOverlay.showOrUpdate(
                            'slow-tower-' + idx,
                            iceSrc,
                            screenX,
                            screenY,
                            { width: targetWidthIce, height: targetHeight }
                        );
                    } else if (tower.type === 'MAGIC') {
                        window.TDGifOverlay.showOrUpdate(
                            'magic-tower-' + idx,
                            elementSrc,
                            screenX,
                            screenY,
                            { width: targetWidthElement, height: targetHeight }
                        );
                    }
                });
                
                // 最後統一處理玩家GIF、player4、player5和player2（在clearAll之後，確保玩家圖顯示在最上層）
                const playerIsGif = this.player.sprite && this.player.sprite.src && /\.gif$/i.test(this.player.sprite.src);
                const sc = (typeof Game !== 'undefined') ? Game.selectedCharacter : null;
                const isPlayer4 = sc && (sc.id === 'rokurost' || sc.spriteImageKey === 'player4');
                const isPlayer5 = sc && (sc.id === 'rabi' || sc.spriteImageKey === 'player5');
                const isPlayer2 = sc && (sc.id === 'dada' || sc.spriteImageKey === 'player2');
                
                if ((playerIsGif || isPlayer4 || isPlayer5 || isPlayer2) && typeof window.TDGifOverlay && typeof window.TDGifOverlay.showOrUpdate === 'function') {
                    const screenX = this.player.x - this.camera.x;
                    const screenY = this.player.y - this.camera.y;
                    
                    // player2需要根據方向動態切換圖片（參考生存模式）
                    let playerSrc = this.player.sprite.src;
                    let player2ImgObj = null;
                    if (isPlayer2) {
                        const player2Key = this.player.facingRight ? 'player2-1' : 'player2';
                        player2ImgObj = (Game.images && Game.images[player2Key]) ? Game.images[player2Key] : null;
                        if (player2ImgObj && player2ImgObj.src) {
                            playerSrc = player2ImgObj.src;
                        } else {
                            playerSrc = this.player.facingRight ? 'assets/images/player2-1.png' : 'assets/images/player2.png';
                        }
                    }
                    
                    if (isPlayer2) {
                        // player2.png / player2-1.png 保持原比例（290x242），使用模式原有的尺寸計算
                        const imgObj = player2ImgObj || ((Game.images && Game.images['player2']) ? Game.images['player2'] : null);
                        if (imgObj && imgObj.complete) {
                            const imgWidth = imgObj.naturalWidth || imgObj.width || 290;
                            const imgHeight = imgObj.naturalHeight || imgObj.height || 242;
                            const aspectRatio = imgWidth / imgHeight; // 290/242 ≈ 1.198
                            // 使用模式原有的尺寸計算方式，保持原比例
                            const renderHeight = this.player.size;
                            const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                            window.TDGifOverlay.showOrUpdate('td-player', playerSrc, screenX, screenY, { width: renderWidth, height: renderHeight });
                        } else {
                            window.TDGifOverlay.showOrUpdate('td-player', playerSrc, screenX, screenY, this.player.size);
                        }
                    } else if (isPlayer4) {
                        // player4.png 需要保持 500:627 的寬高比，並放大顯示以與其他角色接近
                        const imgObj = (Game.images && Game.images['player4']) ? Game.images['player4'] : null;
                        if (imgObj && imgObj.complete) {
                            const imgWidth = imgObj.naturalWidth || imgObj.width || 500;
                            const imgHeight = imgObj.naturalHeight || imgObj.height || 627;
                            const aspectRatio = imgWidth / imgHeight; // 500/627 ≈ 0.798
                            // 防禦模式中放大 1.3 倍以與其他角色接近
                            const renderHeight = Math.max(1, Math.floor(this.player.size * 1.3));
                            const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                            window.TDGifOverlay.showOrUpdate('td-player', playerSrc, screenX, screenY, { width: renderWidth, height: renderHeight });
                        } else {
                            window.TDGifOverlay.showOrUpdate('td-player', playerSrc, screenX, screenY, this.player.size);
                        }
                    } else if (isPlayer5) {
                        // player5.png 需要保持 500:467 的寬高比，並放大顯示以與其他角色接近
                        const imgObj = (Game.images && Game.images['player5']) ? Game.images['player5'] : null;
                        if (imgObj && imgObj.complete) {
                            const imgWidth = imgObj.naturalWidth || imgObj.width || 500;
                            const imgHeight = imgObj.naturalHeight || imgObj.height || 467;
                            const aspectRatio = imgWidth / imgHeight; // 500/467 ≈ 1.071
                            // 防禦模式中放大 1.3 倍以與其他角色接近
                            const renderHeight = Math.max(1, Math.floor(this.player.size * 1.3));
                            const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                            window.TDGifOverlay.showOrUpdate('td-player', playerSrc, screenX, screenY, { width: renderWidth, height: renderHeight });
                        } else {
                            window.TDGifOverlay.showOrUpdate('td-player', playerSrc, screenX, screenY, this.player.size);
                        }
                    } else if (sc && (sc.id === 'lilylinglan' || sc.spriteImageKey === 'player3')) {
                        // player3.gif 保持原比例（1:1），使用模式原有的尺寸計算
                        const imgObj = (Game.images && Game.images['player3']) ? Game.images['player3'] : null;
                        if (imgObj && imgObj.complete) {
                            const imgWidth = imgObj.naturalWidth || imgObj.width || 320;
                            const imgHeight = imgObj.naturalHeight || imgObj.height || 320;
                            const aspectRatio = imgWidth / imgHeight; // 320/320 = 1.0
                            // 使用模式原有的尺寸計算方式，保持原比例
                            const renderHeight = this.player.size;
                            const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                            window.TDGifOverlay.showOrUpdate('td-player', playerSrc, screenX, screenY, { width: renderWidth, height: renderHeight });
                        } else {
                            window.TDGifOverlay.showOrUpdate('td-player', playerSrc, screenX, screenY, this.player.size);
                        }
                    } else if ((!sc || sc.id === 'margaret' || sc.spriteImageKey === 'player') || /player\.gif$/i.test(playerSrc)) {
                        // player.gif 保持原比例（1:1），使用模式原有的尺寸計算
                        const imgObj = (Game.images && Game.images['player']) ? Game.images['player'] : null;
                        if (imgObj && imgObj.complete) {
                            const imgWidth = imgObj.naturalWidth || imgObj.width || 320;
                            const imgHeight = imgObj.naturalHeight || imgObj.height || 320;
                            const aspectRatio = imgWidth / imgHeight; // 320/320 = 1.0
                            // 使用模式原有的尺寸計算方式，保持原比例
                            const renderHeight = this.player.size;
                            const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                            window.TDGifOverlay.showOrUpdate('td-player', playerSrc, screenX, screenY, { width: renderWidth, height: renderHeight });
                        } else {
                            window.TDGifOverlay.showOrUpdate('td-player', playerSrc, screenX, screenY, this.player.size);
                        }
                    } else {
                        window.TDGifOverlay.showOrUpdate('td-player', playerSrc, screenX, screenY, this.player.size);
                    }
                }
            }
        } catch (_) {}
        
        // 只在調試模式下顯示調試信息
        if (this.config.DEBUG || false) {
            // 在屏幕坐標系中繪製調試信息
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
            this.ctx.font = '12px Arial';
            this.ctx.fillText('TD遊戲渲染中...', 10, 20);
            this.ctx.fillText(`相機: (${Math.round(this.camera.x)}, ${Math.round(this.camera.y)})`, 10, 35);
            this.ctx.fillText(`波次: ${this.gameState.wave}`, 10, 50);
            this.ctx.fillText(`敵人數量: ${this.enemyManager.enemies.length}`, 10, 65);
        }
        
        // 建造預覽由增強UI負責渲染，避免雙重顯示
        // 遊戲狀態資訊由TDEnhancedUI的renderMainPanel負責渲染，避免重複
        
        // 繪製暫停覆蓋層
        if (this.isPaused) {
            this.renderPauseOverlay();
        }
        
        // 結算畫面由 TDDefenseSettlement 接手
    }
    
    // 渲染背景
    renderBackground() {
        // 背景邏輯目前交由上層背景圖片處理，此處不再繪製任何內容
    }
    
    // 渲染建造預覽
    renderBuildPreview() {
        const mouseCell = this.map.getNearestCell(this.mousePos.x, this.mousePos.y);
        if (!mouseCell) return;
        
        const canBuild = this.map.canBuildAt(this.mousePos.x, this.mousePos.y);
        
        // 將世界坐標轉換為屏幕坐標
        const screenX = mouseCell.x - this.camera.x;
        const screenY = mouseCell.y - this.camera.y;
        const screenCenterX = mouseCell.centerX - this.camera.x;
        const screenCenterY = mouseCell.centerY - this.camera.y;
        
        this.ctx.save();
        this.ctx.strokeStyle = canBuild ? '#00FF00' : '#FF0000';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(
            screenX,
            screenY,
            this.config.MAP.GRID_SIZE,
            this.config.MAP.GRID_SIZE
        );
        this.ctx.setLineDash([]);
        
        // 繪製射程範圍
        const towerConfig = this.config.TOWERS[this.selectedTowerType];
        if (towerConfig) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.beginPath();
            this.ctx.arc(screenCenterX, screenCenterY, towerConfig.range, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        
        this.ctx.restore();
    }
    
    // 渲染遊戲狀態（已移至TDEnhancedUI.renderMainPanel，此方法已廢棄但保留用於兼容）
    // renderGameState() 方法已移除，避免與TDEnhancedUI重複渲染
    
    renderBaseHealthIndicator() {
        const baseCell = this.map.getNearestCell(this.config.BASE.X, this.config.BASE.Y);
        if (!baseCell) return;
        const percent = this.gameState.maxBaseHealth > 0
            ? Math.max(0, Math.min(1, this.gameState.baseHealth / this.gameState.maxBaseHealth))
            : 0;
        const barWidth = this.config.BASE.SIZE;
        const barHeight = 12;
        const x = baseCell.centerX - barWidth / 2;
        const y = baseCell.centerY + this.config.BASE.SIZE / 2 + 10;
        
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        this.ctx.fillRect(x - 2, y - 2, barWidth + 4, barHeight + 4);
        
        const fillColor = percent > 0.6 ? '#64D47A' : percent > 0.3 ? '#FFC04D' : '#FF5C5C';
        this.ctx.fillStyle = fillColor;
        this.ctx.fillRect(x, y, barWidth * percent, barHeight);
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, barWidth, barHeight);
        
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = '12px "Microsoft JhengHei", Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${this.gameState.baseHealth}/${this.gameState.maxBaseHealth}`, baseCell.centerX, y + barHeight + 14);
        this.ctx.restore();
    }
    
    // 渲染暫停覆蓋層
    renderPauseOverlay() {
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('遊戲暫停', this.canvas.width / 2, this.canvas.height / 2);
        
        this.ctx.font = '24px Arial';
        this.ctx.fillText('按 ESC 繼續遊戲', this.canvas.width / 2, this.canvas.height / 2 + 50);
        
        this.ctx.restore();
    }
    
    // 更新UI
    updateUI() {
        // Canvas UI（如有）由 TDEnhancedUI 負責
        if (this.ui && typeof this.ui.update === 'function') {
            try {
                this.ui.update(this.mousePos.x, this.mousePos.y);
            } catch (_) {}
        }
        // DOM UI（頂部 HUD、建塔面板、防禦塔資訊）
        if (typeof window.TDDefenseDomUI !== 'undefined' && typeof window.TDDefenseDomUI.update === 'function') {
            try {
                window.TDDefenseDomUI.update(this);
            } catch (_) {}
        }
    }
    
    // 音效處理
    playSound(soundName) {
        if (this.audioManager && this.audioManager.playSound) {
            try {
                this.audioManager.playSound(soundName);
            } catch (e) {
                console.warn('無法播放音效:', soundName);
            }
        } else if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            try {
                AudioManager.playSound(soundName);
            } catch (e) {
                console.warn('無法播放音效:', soundName);
            }
        }
    }
    
    playMusic(musicName) {
        if (this.audioManager && this.audioManager.playMusic) {
            try {
                this.audioManager.playMusic(musicName, { loop: true });
            } catch (e) {
                console.warn('無法播放音樂:', musicName);
            }
        }
    }
    
    pauseMusic() {
        if (this.audioManager && this.audioManager.pauseMusic) {
            try {
                this.audioManager.pauseMusic();
            } catch (e) {
                console.warn('無法暫停音樂');
            }
        }
    }
    
    resumeMusic() {
        if (this.audioManager && this.audioManager.resumeMusic) {
            try {
                this.audioManager.resumeMusic();
            } catch (e) {
                console.warn('無法恢復音樂');
            }
        }
    }
    
    setupInputHandlers() {
        if (this._inputHandlersBound || typeof window === 'undefined') return;
        this._boundKeyDown = (event) => this.handleKeyDown(event);
        this._boundKeyUp = (event) => this.handleKeyUp(event);
        window.addEventListener('keydown', this._boundKeyDown, true);
        window.addEventListener('keyup', this._boundKeyUp, true);
        if (typeof document !== 'undefined') {
            document.addEventListener('keydown', this._boundKeyDown, true);
            document.addEventListener('keyup', this._boundKeyUp, true);
        }
        this._inputHandlersBound = true;
    }

    removeInputHandlers() {
        if (!this._inputHandlersBound || typeof window === 'undefined') return;
        window.removeEventListener('keydown', this._boundKeyDown, true);
        window.removeEventListener('keyup', this._boundKeyUp, true);
        if (typeof document !== 'undefined') {
            document.removeEventListener('keydown', this._boundKeyDown, true);
            document.removeEventListener('keyup', this._boundKeyUp, true);
        }
        this._boundKeyDown = null;
        this._boundKeyUp = null;
        this._inputHandlersBound = false;
    }
    
    /**
     * 處理鍵盤按下事件
     * 
     * 維護說明：
     * - 此方法處理所有鍵盤輸入，包括WASD和方向鍵移動
     * - 事件來源：TDGame.setupInputHandlers() 在 window 和 document 上綁定
     * - 移動鍵會調用 TDPlayer.handleMovementInput() 更新玩家移動狀態
     * - 特殊按鍵：Ctrl+M 觸發強制勝利（測試用）
     * 
     * 重要：keyRaw 變數必須在 movementMap 檢查之後定義，避免未定義錯誤
     * 
     * 依賴：
     * - TDPlayer.handleMovementInput() - 更新玩家鍵盤輸入狀態
     * - Input.keys (input.js) - 作為備用鍵盤狀態來源
     */
    handleKeyDown(event) {
        const rawEvent = (event && typeof event === 'object') ? event : null;
        const keyLower = rawEvent && rawEvent.key ? rawEvent.key.toLowerCase() : '';
        const codeLower = rawEvent && rawEvent.code ? rawEvent.code.toLowerCase() : '';
        const fallback = (event && typeof event === 'string') ? event.toLowerCase() : '';

        if (rawEvent && rawEvent.ctrlKey && (keyLower === 'm' || codeLower === 'keym' || fallback === 'm')) {
            if (typeof rawEvent.preventDefault === 'function') {
                rawEvent.preventDefault();
            }
            this.forceVictory();
            return;
        }

        const movementMap = {
            w: 'up',
            keyw: 'up',
            arrowup: 'up',
            s: 'down',
            keys: 'down',
            arrowdown: 'down',
            a: 'left',
            keya: 'left',
            arrowleft: 'left',
            d: 'right',
            keyd: 'right',
            arrowright: 'right'
        };
        const direction = movementMap[keyLower] || movementMap[codeLower] || movementMap[fallback];
        if (direction) {
            if (rawEvent && typeof rawEvent.preventDefault === 'function') {
                rawEvent.preventDefault();
            }
            if (this.player && typeof this.player.handleMovementInput === 'function') {
                this.player.handleMovementInput(direction, true);
            }
            return;
        }
        const keyRaw = rawEvent ? (rawEvent.key || rawEvent.code) : fallback;
        switch (keyRaw) {
            case ' ':
            case 'Spacebar':
            case 'Space':
                if (!this.gameState.isWaveActive && !this.isGameOver && !this.isGameWon) {
                    this.startWave();
                } else if (this.gameState.isWaveActive && this.gameState.wavePrepTimer > 0) {
                    this.skipPreparationPhase();
                }
                break;
            case 'Escape':
                // ESC 由 DefenseUI 處理
                break;
            case 'r':
            case 'R':
                if (this.isGameOver || this.isGameWon) {
                    this.reset();
                }
                break;
            case 'z':
            case 'Z':
                if (this.selectedTower) {
                    if (rawEvent && typeof rawEvent.preventDefault === 'function') {
                        rawEvent.preventDefault();
                    }
                    this.upgradeTower(this.selectedTower);
                }
                break;
            case 'x':
            case 'X':
                if (this.selectedTower) {
                    if (rawEvent && typeof rawEvent.preventDefault === 'function') {
                        rawEvent.preventDefault();
                    }
                    this.sellTower(this.selectedTower);
                }
                break;
            case '1':
                this.enterBuildMode('ARROW');
                break;
            case '2':
                this.enterBuildMode('MAGIC');
                break;
            case '3':
                this.enterBuildMode('SLOW');
                break;
            default:
                break;
        }
    }
    
    // 處理鍵盤釋放
    handleKeyUp(event) {
        const rawEvent = (event && typeof event === 'object') ? event : null;
        const keyLower = rawEvent && rawEvent.key ? rawEvent.key.toLowerCase() : '';
        const codeLower = rawEvent && rawEvent.code ? rawEvent.code.toLowerCase() : '';
        const fallback = (event && typeof event === 'string') ? event.toLowerCase() : '';
        const movementMap = {
            w: 'up',
            keyw: 'up',
            arrowup: 'up',
            s: 'down',
            keys: 'down',
            arrowdown: 'down',
            a: 'left',
            keya: 'left',
            arrowleft: 'left',
            d: 'right',
            keyd: 'right',
            arrowright: 'right'
        };
        const direction = movementMap[keyLower] || movementMap[codeLower] || movementMap[fallback];
        if (direction) {
            if (rawEvent && typeof rawEvent.preventDefault === 'function') {
                rawEvent.preventDefault();
            }
            if (this.player && typeof this.player.handleMovementInput === 'function') {
                this.player.handleMovementInput(direction, false);
            }
        }
    }
    
    cleanup() {
        this.removeInputHandlers();
        if (this.enemyManager && typeof this.enemyManager.clear === 'function') {
            this.enemyManager.clear();
        }
    }
  
  forceVictory() {
    if (this.isGameWon) return;
    this.enemyManager.clear();
    this.gameState.wave = this.config.GAME.MAX_WAVES - 1;
    this.gameState.isWaveActive = false;
    this.gameState.isGameWon = true;
    this.checkGameEnd();
  }
  
  
  // 升級防禦塔
  upgradeTower(tower) {
    if (tower && this.towerManager) {
      this.towerManager.upgradeTower(tower);
    }
  }
  
  // 出售防禦塔
  sellTower(tower) {
    if (tower && this.towerManager) {
      const ok = this.towerManager.sellTower(tower);
      if (ok && this.selectedTower === tower) {
        this.selectedTower = null;
      }
    }
  }
    
    // 處理滑鼠移動
    handleMouseMove(x, y) {
        // 將屏幕坐標轉換為世界坐標
        this.mousePos.x = x + this.camera.x;
        this.mousePos.y = y + this.camera.y;
    }
    
    // 更新主堡自動化技能
    updateBaseAutoSkills(deltaTime) {
        const currentTime = this.currentTime;
        
        // 檢查技能是否解鎖
        const isSkillUnlocked = this._isBaseAutoSkillUnlocked();
        
        // 連鎖閃電技能
        if (isSkillUnlocked && this.baseAutoSkills.chainLightning.enabled) {
            const skill = this.baseAutoSkills.chainLightning;
            // 檢查冷卻時間
            if (currentTime - skill.lastCastTime >= skill.cooldown) {
                // 檢查範圍內是否有敵人
                const baseX = this.baseImageCenterX || this.config.BASE.X;
                const baseY = this.baseImageCenterY || this.config.BASE.Y;
                const enemies = this.enemyManager.enemies || [];
                let hasEnemyInRange = false;
                for (const enemy of enemies) {
                    if (!enemy || !enemy.isAlive || enemy.hp <= 0) continue;
                    const dist = Math.sqrt(
                        Math.pow(enemy.x - baseX, 2) + 
                        Math.pow(enemy.y - baseY, 2)
                    );
                    if (dist <= skill.range) {
                        hasEnemyInRange = true;
                        break;
                    }
                }
                // 只有範圍內有敵人才施放
                if (hasEnemyInRange) {
                    this.castChainLightning();
                    skill.lastCastTime = currentTime;
                }
            }
        }
      
      // 回復技能
      if (isSkillUnlocked && this.baseAutoSkills.heal.enabled) {
        const skill = this.baseAutoSkills.heal;
        if (currentTime - skill.lastHealTime >= skill.interval) {
          this.gameState.repairBase(skill.healAmount);
          skill.lastHealTime = currentTime;
        }
      }
    }
    
    // 施放連鎖閃電
    castChainLightning() {
        const skill = this.baseAutoSkills.chainLightning;
        // 使用主堡圖片中心作為起點
        const baseX = this.baseImageCenterX || this.config.BASE.X;
        const baseY = this.baseImageCenterY || this.config.BASE.Y;
        
        // 尋找最近的敵人（不限制範圍，與生存模式一致）
        const enemies = this.enemyManager.enemies || [];
        if (enemies.length === 0) return;
        
        // 計算最終傷害（應用天賦系統）
        let finalDamage = skill.damage;
        try {
            if (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel) {
                // 傷害強化（百分比加成）
                const damageBoostLevel = TalentSystem.getTalentLevel('damage_boost') || 0;
                if (damageBoostLevel > 0 && TalentSystem.tieredTalents && TalentSystem.tieredTalents.damage_boost) {
                    const effect = TalentSystem.tieredTalents.damage_boost.levels[damageBoostLevel - 1];
                    if (effect && effect.multiplier) {
                        finalDamage *= effect.multiplier;
                    }
                }
                
                // 傷害特化（固定加成）
                const damageSpecLevel = TalentSystem.getTalentLevel('damage_specialization') || 0;
                if (damageSpecLevel > 0 && TalentSystem.tieredTalents && TalentSystem.tieredTalents.damage_specialization) {
                    const effect = TalentSystem.tieredTalents.damage_specialization.levels[damageSpecLevel - 1];
                    if (effect && effect.flat) {
                        finalDamage += effect.flat;
                    }
                }
            }
        } catch (error) {
            console.warn('應用天賦系統傷害加成時出錯:', error);
        }
        
        // 創建連鎖閃電視覺效果（使用與生存模式相同的ChainLightningEffect）
        if (typeof ChainLightningEffect !== 'undefined') {
            // 創建一個虛擬的"玩家"對象，位置在主堡圖片中心
            const basePlayer = {
                x: baseX,
                y: baseY
            };
            
            // 為每個敵人生成唯一ID（如果沒有id屬性）
            const enemyIdMap = new WeakMap();
            let idCounter = 0;
            for (const enemy of enemies) {
                if (!enemyIdMap.has(enemy)) {
                    enemyIdMap.set(enemy, `td_enemy_${idCounter++}`);
                }
            }
            
            // 先創建效果對象（但不讓它自動構建鏈，因為需要先覆蓋方法）
            // 創建一個臨時效果來獲取結構，然後手動構建
            const effect = Object.create(ChainLightningEffect.prototype);
            effect.player = basePlayer;
            effect.damage = finalDamage; // 使用應用天賦後的傷害
            effect.durationMs = 1000; // 持續時間1秒
            effect.maxChains = skill.maxChains;
            effect.chainRadius = skill.range; // 使用range作為chainRadius（連鎖半徑）
            effect.startTime = Date.now();
            effect.segments = [];
            effect.particles = [];
            effect.weaponType = 'CHAIN_LIGHTNING';
            effect.palette = {
                halo: '#66ccff',
                mid: '#aaddff',
                core: '#ffffff',
                particle: '#66ccff'
            };
            effect.revealedCount = 0;
            effect.markedForDeletion = false;
            effect.x = baseX;
            effect.y = baseY;
            effect.width = 2;
            effect.height = 2;
            
            // 覆蓋_findNearestEnemy方法，使用防禦模式的敵人列表
            effect._findNearestEnemy = (x, y, excludeIds = new Set(), withinRadius = null) => {
                let best = null;
                let bestDist = Infinity;
                for (const enemy of enemies) {
                    if (!enemy || !enemy.isAlive || enemy.hp <= 0) continue;
                    // 使用WeakMap獲取唯一ID
                    const enemyId = enemyIdMap.get(enemy) || enemy;
                    if (excludeIds.has(enemyId)) continue;
                    const d = Math.sqrt(Math.pow(enemy.x - x, 2) + Math.pow(enemy.y - y, 2));
                    // 如果指定了範圍，必須在範圍內
                    if (withinRadius != null && d > withinRadius) continue;
                    if (d < bestDist) { 
                        bestDist = d; 
                        best = enemy; 
                    }
                }
                return best;
            };
            
            // 覆蓋_buildChain方法，與生存模式邏輯完全一致
            effect._buildChain = () => {
                const exclude = new Set();
                // 第一個目標：不限制範圍（withinRadius = null），找最近的敵人（與生存模式一致）
                const primary = effect._findNearestEnemy(basePlayer.x, basePlayer.y, exclude, null);
                if (!primary) {
                    effect.segments = [];
                    return;
                }
                // 檢查第一個目標是否在範圍內（如果不在範圍內，不構建鏈）
                const primaryDist = Math.sqrt(
                    Math.pow(primary.x - basePlayer.x, 2) + 
                    Math.pow(primary.y - basePlayer.y, 2)
                );
                if (primaryDist > skill.range) {
                    effect.segments = [];
                    return;
                }
                exclude.add(enemyIdMap.get(primary) || primary);
                effect.segments.push({ fromType: 'player', to: primary, applied: false, revealAt: 0 });
                
                // 後續連鎖：從當前敵人位置找最近的敵人，限制在chainRadius內（與生存模式完全一致）
                let last = primary;
                for (let i = 0; i < skill.maxChains; i++) {
                    // 從當前敵人位置找最近的敵人，限制在chainRadius內（與生存模式一致）
                    const next = effect._findNearestEnemy(last.x, last.y, exclude, effect.chainRadius);
                    if (!next) break;
                    exclude.add(enemyIdMap.get(next) || next);
                    effect.segments.push({ fromType: 'enemy', fromEnemy: last, to: next, applied: false, revealAt: 0 });
                    last = next;
                }
                
                // 將段落均勻分配在持續時間內揭示
                const segCount = effect.segments.length;
                const interval = segCount > 0 ? (effect.durationMs / segCount) : effect.durationMs;
                let t = 0;
                for (const s of effect.segments) {
                    s.revealAt = t;
                    t += interval;
                }
            };
            
            // 添加_updateParticles方法（從ChainLightningEffect複製）
            effect._updateParticles = (deltaTime) => {
                const toRemove = [];
                for (let i = 0; i < effect.particles.length; i++) {
                    const p = effect.particles[i];
                    p.life -= deltaTime;
                    if (p.life <= 0) { toRemove.push(i); continue; }
                    p.x += p.vx * (deltaTime / 16.67);
                    p.y += p.vy * (deltaTime / 16.67);
                }
                for (let i = toRemove.length - 1; i >= 0; i--) {
                    effect.particles.splice(toRemove[i], 1);
                }
            };
            
            // 添加_spawnSegmentSparks方法（從ChainLightningEffect複製）
            effect._spawnSegmentSparks = (seg) => {
                const { fx, fy, tx, ty } = effect._segmentEndpoints(seg);
                const dx = tx - fx;
                const dy = ty - fy;
                const len = Math.sqrt(dx * dx + dy * dy);
                const dirX = dx / (len || 1);
                const dirY = dy / (len || 1);
                const count = 16;
                for (let i = 0; i < count; i++) {
                    const t = Math.random();
                    const px = fx + dx * t + (Math.random() - 0.5) * 8;
                    const py = fy + dy * t + (Math.random() - 0.5) * 8;
                    const speed = 1 + Math.random() * 3;
                    const angle = Math.random() * Math.PI * 2;
                    const life = 200 + Math.random() * 250;
                    effect.particles.push({
                        x: px,
                        y: py,
                        vx: Math.cos(angle) * speed + dirX * 0.5,
                        vy: Math.sin(angle) * speed + dirY * 0.5,
                        life,
                        maxLife: life,
                        size: 3 + Math.random() * 2.5,
                        color: effect.palette.particle || '#66ccff'
                    });
                }
            };
            
            // 添加_segmentEndpoints方法
            effect._segmentEndpoints = (seg) => {
                let fx, fy;
                if (seg.fromType === 'player') {
                    fx = basePlayer.x; fy = basePlayer.y;
                } else {
                    fx = seg.fromEnemy ? seg.fromEnemy.x : basePlayer.x;
                    fy = seg.fromEnemy ? seg.fromEnemy.y : basePlayer.y;
                }
                const tx = seg.to ? seg.to.x : fx;
                const ty = seg.to ? seg.to.y : fy;
                return { fx, fy, tx, ty };
            };
            
            // 添加_drawElectricArc方法（從ChainLightningEffect複製）
            effect._drawElectricArc = (ctx, x1, y1, x2, y2) => {
                const dx = x2 - x1;
                const dy = y2 - y1;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const steps = Math.max(8, Math.floor(dist / 16));
                const jitterAmp = Math.min(10, dist / 12);
                const angle = Math.atan2(dy, dx);
                const nx = -Math.sin(angle);
                const ny = Math.cos(angle);
                const points = [];
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const bx = x1 + dx * t;
                    const by = y1 + dy * t;
                    const jitter = (Math.random() - 0.5) * jitterAmp;
                    points.push({ x: bx + nx * jitter, y: by + ny * jitter });
                }
                // 外層光暈
                ctx.globalAlpha = 0.35;
                ctx.lineWidth = 10;
                ctx.strokeStyle = effect.palette.halo || '#66ccff';
                ctx.beginPath();
                for (let i = 0; i < points.length; i++) {
                    const p = points[i];
                    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
                // 中層
                ctx.globalAlpha = 0.7;
                ctx.lineWidth = 6;
                ctx.strokeStyle = effect.palette.mid || '#aaddff';
                ctx.beginPath();
                for (let i = 0; i < points.length; i++) {
                    const p = points[i];
                    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
                // 核心亮線
                ctx.globalAlpha = 1.0;
                ctx.lineWidth = 3;
                ctx.strokeStyle = effect.palette.core || '#ffffff';
                ctx.beginPath();
                for (let i = 0; i < points.length; i++) {
                    const p = points[i];
                    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            };
            
            // 添加draw方法（從ChainLightningEffect複製）
            effect.draw = (ctx) => {
                ctx.save();
                const elapsed = Date.now() - effect.startTime;
                for (const seg of effect.segments) {
                    if (elapsed < seg.revealAt) continue;
                    const { fx, fy, tx, ty } = effect._segmentEndpoints(seg);
                    effect._drawElectricArc(ctx, fx, fy, tx, ty);
                }
                ctx.globalCompositeOperation = 'lighter';
                for (const p of effect.particles) {
                    const alpha = Math.max(0.04, Math.min(1, p.life / (p.maxLife || 250)));
                    ctx.fillStyle = p.color || (effect.palette.particle || '#66ccff');
                    ctx.globalAlpha = alpha * 0.25;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = alpha;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            };
            
            // 重新構建鏈（使用覆蓋後的_buildChain方法）
            effect._buildChain();
            
            // 如果沒有找到任何目標，不添加效果
            if (effect.segments.length === 0) {
                return;
            }
            
            // 覆蓋update方法，在造成傷害時使用防禦模式的傷害系統
            effect.update = (deltaTime) => {
                const elapsed = Date.now() - effect.startTime;
                if (elapsed >= effect.durationMs) {
                    effect.markedForDeletion = true;
                    return;
                }
                effect._updateParticles(deltaTime);
                
                for (const seg of effect.segments) {
                    if (seg.applied) continue;
                    if (elapsed >= seg.revealAt) {
                        const target = seg.to;
                        if (target && target.isAlive && target.hp > 0) {
                            // 對目標造成傷害（防禦模式，使用應用天賦後的傷害）
                            if (target.takeDamage) {
                                target.takeDamage(finalDamage);
                            } else if (target.hp !== undefined) {
                                target.hp = Math.max(0, target.hp - finalDamage);
                                if (target.hp <= 0 && target.isAlive) {
                                    target.isAlive = false;
                                    if (this.enemyManager.onEnemyDeath) {
                                        this.enemyManager.onEnemyDeath(target);
                                    }
                                }
                            }
                            effect._spawnSegmentSparks(seg);
                        }
                        seg.applied = true;
                    }
                }
            };
            
            this.chainLightningEffects.push(effect);
        }
        
        // 播放音效
        this.playSound('zaps');
    }
    
    // 更新連鎖閃電視覺效果
    updateChainLightningEffects(deltaTime) {
        for (let i = this.chainLightningEffects.length - 1; i >= 0; i--) {
            const effect = this.chainLightningEffects[i];
            if (effect && typeof effect.update === 'function') {
                effect.update(deltaTime);
            }
            if (effect && effect.markedForDeletion) {
                this.chainLightningEffects.splice(i, 1);
            }
        }
    }
    
    // 檢查自動化技能是否解鎖
    _isBaseAutoSkillUnlocked() {
        try {
            if (typeof Achievements !== 'undefined' && Achievements.isUnlocked) {
                return Achievements.isUnlocked('DEFENSE_LV1_CLEAR');
            }
        } catch (_) {}
        return false;
    }
    
    // 從localStorage載入自動化技能解鎖狀態
    loadBaseAutoSkills() {
        try {
            const raw = localStorage.getItem('defense_auto_skills');
            const data = raw ? JSON.parse(raw) : {};
            // 檢查成就是否解鎖（DEFENSE_LV1_CLEAR）
            const isUnlocked = this._isBaseAutoSkillUnlocked();
            if (isUnlocked) {
                // 如果成就已解鎖，從localStorage讀取啟用狀態
                // 如果localStorage中沒有值，預設為false（灰色狀態）
                if (typeof data.chainLightning === 'boolean') {
                    this.baseAutoSkills.chainLightning.enabled = data.chainLightning;
                } else {
                    this.baseAutoSkills.chainLightning.enabled = false; // 預設不啟用
                }
                if (typeof data.heal === 'boolean') {
                    this.baseAutoSkills.heal.enabled = data.heal;
                } else {
                    this.baseAutoSkills.heal.enabled = false; // 預設不啟用
                }
            } else {
                // 如果成就未解鎖，強制設為false
                this.baseAutoSkills.chainLightning.enabled = false;
                this.baseAutoSkills.heal.enabled = false;
            }
        } catch (_) {
            // 發生錯誤時，確保技能狀態為false
            this.baseAutoSkills.chainLightning.enabled = false;
            this.baseAutoSkills.heal.enabled = false;
        }
    }
    
    // 保存自動化技能狀態到localStorage
    saveBaseAutoSkills() {
        try {
            const data = {
                chainLightning: this.baseAutoSkills.chainLightning.enabled,
                heal: this.baseAutoSkills.heal.enabled
            };
            localStorage.setItem('defense_auto_skills', JSON.stringify(data));
        } catch (_) {}
    }
    
    // 獲取遊戲狀態
    getGameState() {
        return {
            gold: this.gameState.gold,
            wave: this.gameState.wave + 1,
            maxWaves: this.config.GAME.MAX_WAVES,
            baseHealth: this.gameState.baseHealth,
            maxBaseHealth: this.gameState.maxBaseHealth,
            enemiesKilled: this.gameState.enemiesKilled,
            towersBuilt: this.gameState.towersBuilt,
            score: this.gameState.score,
            isWaveActive: this.gameState.isWaveActive,
            waveTimer: this.gameState.waveTimer,
            wavePrepTimer: this.gameState.wavePrepTimer,
            isPaused: this.isPaused,
            isGameOver: this.isGameOver,
            isGameWon: this.isGameWon,
            buildMode: this.buildMode,
            selectedTowerType: this.selectedTowerType
        };
    }
}

// 導出類別
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TDGame;
} else {
    window.TDGame = TDGame;
}
