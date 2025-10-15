// 遊戲主引擎
const Game = {
    canvas: null,
    ctx: null,
    player: null,
    enemies: [],
    projectiles: [],
    experienceOrbs: [],
    lastUpdateTime: 0,
    gameTime: 0,
    isPaused: false,
    isGameOver: false,
    boss: null,
    
    init: function() {
        // 獲取畫布和上下文
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 設置畫布大小
        this.canvas.width = CONFIG.CANVAS_WIDTH;
        this.canvas.height = CONFIG.CANVAS_HEIGHT;
        
        // 初始化輸入系統
        Input.init();
        
        // 初始化UI
        UI.init();
        
        // 創建玩家
        this.player = new Player(CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2);
        
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
        
        // 如果遊戲未暫停，更新遊戲狀態
        if (!this.isPaused && !this.isGameOver) {
            this.update(deltaTime);
        }
        
        // 繪製遊戲
        this.draw();
        
        // 繼續循環
        requestAnimationFrame(this.gameLoop.bind(this));
    },
    
    // 更新遊戲狀態
    update: function(deltaTime) {
        // 更新遊戲時間
        this.gameTime += deltaTime;
        
        // 更新玩家
        if (this.player) {
            this.player.update(deltaTime);
        }
        
        // 更新所有武器
        if (this.player && this.player.weapons) {
            for (const weapon of this.player.weapons) {
                weapon.update(deltaTime);
            }
        }
        
        // 更新UI計時器
        UI.updateTimer(this.gameTime);
        
        // 更新波次系統
        WaveSystem.update(deltaTime);
        
        // 更新玩家
        this.player.update(deltaTime);
        
        // 更新玩家武器
        for (const weapon of this.player.weapons) {
            weapon.update(deltaTime);
        }
        
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
        
        // 更新經驗寶石
        for (let i = this.experienceOrbs.length - 1; i >= 0; i--) {
            const orb = this.experienceOrbs[i];
            orb.update(deltaTime);
            
            // 移除標記為刪除的經驗寶石
            if (orb.markedForDeletion) {
                this.experienceOrbs.splice(i, 1);
            }
        }
        
        // 優化：限制實體數量
        this.optimizeEntities();
    },
    
    // 繪製遊戲
    draw: function() {
        // 清空畫布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 繪製背景
        this.drawBackground();
        
        // 繪製網格（可選）
        // this.drawGrid();
        
        // 繪製所有實體
        this.drawEntities();
    },
    
    // 繪製所有實體
    drawEntities: function() {
        // 繪製經驗寶石
        for (const orb of this.experienceOrbs) {
            orb.draw(this.ctx);
        }
        
        // 繪製投射物
        for (const projectile of this.projectiles) {
            projectile.draw(this.ctx);
        }
        
        // 繪製敵人
        for (const enemy of this.enemies) {
            enemy.draw(this.ctx);
        }
        
        // 繪製玩家
        this.player.draw(this.ctx);
    },
    
    // 繪製背景
    drawBackground: function() {
        if (this.images && this.images.background) {
            // 使用背景圖片
            this.ctx.drawImage(this.images.background, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            // 備用：使用純色背景
            this.ctx.fillStyle = '#111';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            // 繪製網格
            this.drawGrid();
        }
    },
    
    // 繪製網格
    drawGrid: function() {
        this.ctx.strokeStyle = '#222';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
        
        // 垂直線
        for (let x = 0; x <= this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        // 水平線
        for (let y = 0; y <= this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    },
    
    // 添加敵人
    addEnemy: function(enemy) {
        this.enemies.push(enemy);
    },
    
    // 添加投射物
    addProjectile: function(projectile) {
        this.projectiles.push(projectile);
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
    
    // 優化實體數量
    optimizeEntities: function() {
        // 如果敵人數量超過限制，移除最遠的敵人
        if (this.enemies.length > CONFIG.OPTIMIZATION.MAX_ENEMIES) {
            // 按照與玩家的距離排序
            this.enemies.sort((a, b) => {
                const distA = Utils.distance(a.x, a.y, this.player.x, this.player.y);
                const distB = Utils.distance(b.x, b.y, this.player.x, this.player.y);
                return distB - distA; // 降序排列，最遠的在前面
            });
            
            // 移除多餘的敵人
            this.enemies.splice(0, this.enemies.length - CONFIG.OPTIMIZATION.MAX_ENEMIES);
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
    pause: function() {
        this.isPaused = true;
    },
    
    // 恢復遊戲
    resume: function() {
        this.isPaused = false;
        this.lastUpdateTime = Date.now(); // 重置時間，避免大幅度時間跳躍
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
        this.experienceOrbs = [];
        this.gameTime = 0;
        this.isPaused = false;
        this.isGameOver = false;
        this.boss = null;
        
        // 創建新玩家
        this.player = new Player(CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2);
        
        // 重置波次系統
        WaveSystem.init();
        
        // 重置UI
        UI.init();
        
        // 重置時間
        this.lastUpdateTime = Date.now();
    },
    
    // 開始新遊戲
    startNewGame: function() {
        // 重置遊戲
        this.reset();
        
        // 顯示遊戲畫面
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
    }
};
