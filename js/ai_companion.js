// AI生命體（召喚AI技能專用）
// 功能：跟隨玩家，使用LV10連鎖閃電攻擊敵人
// 注意：僅在生存模式使用，不污染其他模式

class AICompanion extends Entity {
    constructor(player, x, y) {
        super(x, y, CONFIG.PLAYER.SIZE, CONFIG.PLAYER.SIZE);
        this.player = player;
        this.targetDistance = 150; // 目標距離
        this.followDistance = 200; // 超出此距離才會跟上
        this.speed = CONFIG.PLAYER.SPEED || 3; // 與玩家初始移動速度相同
        
        // 圖片資源（往左：AI2.png，往右：AI3.png）
        this.imageLeft = null;
        this.imageRight = null;
        this.facingRight = true; // 面向右側
        this._loadImages();
        
        // 連鎖閃電相關（LV10配置）
        this.chainLightningCooldown = 0;
        this.chainLightningCooldownMax = 1500; // 1.5秒冷卻
        this.chainLightningLevel = 10; // 固定LV10
        this.chainLightningMaxChains = 10; // LV10的連鎖次數
        
        // 無血量，不會受傷
        this.health = Infinity;
        this.maxHealth = Infinity;
    }
    
    _loadImages() {
        // 載入AI圖片（往左和往右）
        try {
            if (typeof Game !== 'undefined' && Game.images) {
                if (Game.images['AI2']) {
                    this.imageLeft = Game.images['AI2'];
                }
                if (Game.images['AI3']) {
                    this.imageRight = Game.images['AI3'];
                }
            }
            // 如果Game.images中沒有，嘗試直接載入
            if (!this.imageLeft) {
                const imgLeft = new Image();
                imgLeft.src = 'assets/images/AI2.png';
                imgLeft.onload = () => { this.imageLeft = imgLeft; };
                this.imageLeft = imgLeft;
            }
            if (!this.imageRight) {
                const imgRight = new Image();
                imgRight.src = 'assets/images/AI3.png';
                imgRight.onload = () => { this.imageRight = imgRight; };
                this.imageRight = imgRight;
            }
        } catch(_) {}
    }
    
    // 清理方法（遊戲結束時調用）
    cleanup() {
        try {
            if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.hide === 'function') {
                window.GifOverlay.hide('ai-companion');
            }
        } catch(_) {}
    }
    
    update(deltaTime) {
        if (!this.player || !Game || Game.isGameOver) return;
        
        // 更新連鎖閃電冷卻
        this.chainLightningCooldown += deltaTime;
        if (this.chainLightningCooldown >= this.chainLightningCooldownMax) {
            this._castChainLightning();
            this.chainLightningCooldown = 0;
        }
        
        // 跟隨玩家邏輯
        const dx = this.player.x - this.x;
        const dy = this.player.y - this.y;
        const distance = Math.hypot(dx, dy);
        
        // 更新面向方向（根據移動方向判斷左右）
        if (distance > 0.1) {
            // 如果正在移動，根據移動方向判斷面向
            if (Math.abs(dx) > 0.1) {
                this.facingRight = dx > 0;
            }
        }
        
        // 計算移動速度（考慮deltaTime）
        const moveSpeed = this.speed * (deltaTime / 16.67); // 標準化到60FPS
        
        // 如果距離超過200，則跟上玩家
        if (distance > this.followDistance) {
            const angle = Math.atan2(dy, dx);
            this.x += Math.cos(angle) * moveSpeed;
            this.y += Math.sin(angle) * moveSpeed;
        } else if (distance < this.targetDistance - 10) {
            // 如果距離小於目標距離-10，稍微遠離（避免完全重疊）
            const angle = Math.atan2(dy, dx);
            this.x -= Math.cos(angle) * moveSpeed * 0.3;
            this.y -= Math.sin(angle) * moveSpeed * 0.3;
        } else {
            // 在目標距離附近，保持位置（不移動）
        }
        
        // 邊界限制（使用世界座標）
        const margin = this.width / 2;
        const worldWidth = (Game.worldWidth || CONFIG.CANVAS_WIDTH);
        const worldHeight = (Game.worldHeight || CONFIG.CANVAS_HEIGHT);
        this.x = Math.max(margin, Math.min(worldWidth - margin, this.x));
        this.y = Math.max(margin, Math.min(worldHeight - margin, this.y));
    }
    
    _castChainLightning() {
        // 使用LV10連鎖閃電
        try {
            if (typeof ChainLightningEffect === 'undefined') return;
            
            // 計算傷害（LV10的傷害）
            const baseDamage = (CONFIG.WEAPONS && CONFIG.WEAPONS.CHAIN_LIGHTNING && CONFIG.WEAPONS.CHAIN_LIGHTNING.DAMAGE) ? CONFIG.WEAPONS.CHAIN_LIGHTNING.DAMAGE : 15;
            const levelMul = (typeof DamageSystem !== 'undefined' && DamageSystem.levelMultiplier) 
                ? DamageSystem.levelMultiplier(this.chainLightningLevel) 
                : (1 + 0.05 * Math.max(0, this.chainLightningLevel - 1));
            const damage = baseDamage * levelMul;
            
            // 創建連鎖閃電效果（從AI位置發出）
            const durationMs = (CONFIG.WEAPONS && CONFIG.WEAPONS.CHAIN_LIGHTNING && CONFIG.WEAPONS.CHAIN_LIGHTNING.DURATION) 
                ? CONFIG.WEAPONS.CHAIN_LIGHTNING.DURATION 
                : 1000;
            const chainRadius = (CONFIG.WEAPONS && CONFIG.WEAPONS.CHAIN_LIGHTNING && CONFIG.WEAPONS.CHAIN_LIGHTNING.CHAIN_RADIUS) 
                ? CONFIG.WEAPONS.CHAIN_LIGHTNING.CHAIN_RADIUS 
                : 220;
            
            // 創建連鎖閃電效果，使用AI作為"玩家"（這樣會從AI位置開始連鎖）
            const effect = new ChainLightningEffect(this, damage, durationMs, this.chainLightningMaxChains, chainRadius);
            
            // 添加到遊戲投射物列表
            if (typeof Game !== 'undefined' && Game.addProjectile) {
                Game.addProjectile(effect);
            }
        } catch(e) {
            console.warn('AI連鎖閃電施放失敗:', e);
        }
    }
    
    draw(ctx) {
        // 使用GifOverlay顯示AI（與玩家使用相同的圖層系統）
        if (!this.player || !Game || Game.isGameOver) {
            // 如果遊戲結束，隱藏AI
            try {
                if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.hide === 'function') {
                    window.GifOverlay.hide('ai-companion');
                }
            } catch(_) {}
            return;
        }
        
        try {
            // 選擇對應的圖片（往左或往右）
            const img = this.facingRight ? this.imageRight : this.imageLeft;
            if (!img) {
                // 如果圖片未載入，嘗試載入
                this._loadImages();
                return;
            }
            
            // 獲取圖片源和圖片對象
            let imgSrc = null;
            let imgObj = null;
            if (img && img.src) {
                imgSrc = img.src;
                imgObj = img;
            } else if (typeof Game !== 'undefined' && Game.images) {
                const key = this.facingRight ? 'AI3' : 'AI2';
                imgObj = Game.images[key];
                if (imgObj && imgObj.src) {
                    imgSrc = imgObj.src;
                }
            }
            
            if (!imgSrc) {
                // 後備：使用相對路徑
                imgSrc = this.facingRight ? 'assets/images/AI3.png' : 'assets/images/AI2.png';
            }
            
            // 計算顯示大小（保持原比例148x250，縮放到玩家大小）
            const baseSize = CONFIG.PLAYER.SIZE || 48;
            const visualScale = (CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') 
                ? CONFIG.PLAYER.VISUAL_SCALE 
                : 1.0;
            
            // AI圖片比例：148x250
            const aiImageWidth = 148;
            const aiImageHeight = 250;
            const aiAspectRatio = aiImageWidth / aiImageHeight; // 148/250 ≈ 0.592
            
            // 以高度為基準計算顯示尺寸（保持與玩家相近的高度）
            const renderHeight = Math.max(1, Math.floor(baseSize * visualScale));
            const renderWidth = Math.max(1, Math.floor(renderHeight * aiAspectRatio));
            
            // 計算屏幕座標（考慮相機偏移和震動）
            const camX = (Game.camera ? Game.camera.x : 0);
            const camY = (Game.camera ? Game.camera.y : 0);
            const shakeX = (Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetX || 0) : 0;
            const shakeY = (Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetY || 0) : 0;
            const screenX = this.x - camX - shakeX;
            const screenY = this.y - camY - shakeY;
            
            // 使用GifOverlay顯示AI（與玩家使用相同的圖層，保持原比例）
            if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.showOrUpdate === 'function') {
                window.GifOverlay.showOrUpdate('ai-companion', imgSrc, screenX, screenY, { width: renderWidth, height: renderHeight });
            }
        } catch(e) {
            console.warn('AI顯示失敗:', e);
        }
    }
    
    // AI不會受傷
    takeDamage(amount) {
        return; // 無血量，不會受傷
    }
}

