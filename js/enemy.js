// 敵人類
class Enemy extends Entity {
    constructor(x, y, type) {
        const enemyConfig = CONFIG.ENEMIES[type];
        super(x, y, enemyConfig.SIZE, enemyConfig.SIZE);
        
        this.type = type;
        this.name = enemyConfig.NAME;
        // 基礎血量，後續依波次倍率提升
        this.maxHealth = enemyConfig.HEALTH;
        // 依照目前波次提高血量（每波乘以倍率），第5波後稍微提高倍率
        const wave = (typeof WaveSystem !== 'undefined' && WaveSystem.currentWave) ? WaveSystem.currentWave : 1;
        const earlyMult = CONFIG.WAVES.HEALTH_MULTIPLIER_PER_WAVE || 1;
        const lateMult = CONFIG.WAVES.HEALTH_MULTIPLIER_PER_WAVE_LATE || earlyMult;
        const earlyWaves = Math.min(Math.max(0, wave - 1), 4); // 前4波使用earlyMult
        const lateWaves = Math.max(0, wave - 5);
        const growthMult = (Game.difficulty && Game.difficulty.enemyHealthGrowthRateMultiplier) ? Game.difficulty.enemyHealthGrowthRateMultiplier : 1;
        const hpMult = Math.pow(earlyMult, earlyWaves * growthMult) * Math.pow(lateMult, lateWaves * growthMult);
        const diffHp = (Game.difficulty && Game.difficulty.enemyHealthMultiplier) ? Game.difficulty.enemyHealthMultiplier : 1;
        this.maxHealth = Math.floor(this.maxHealth * hpMult * diffHp);
        this.health = this.maxHealth;
        this.damage = enemyConfig.DAMAGE;
        this.speed = enemyConfig.SPEED * ((Game.difficulty && Game.difficulty.enemySpeedMultiplier) ? Game.difficulty.enemySpeedMultiplier : 1);
        // 新增：基礎速度與暫時減速狀態
        this.baseSpeed = this.speed;
        this.isSlowed = false;
        this.slowEndTime = 0;
        this.experienceValue = enemyConfig.EXPERIENCE;
        this.collisionRadius = enemyConfig.COLLISION_RADIUS;
        this.lastAttackTime = 0;
        this.attackCooldown = 1000; // 攻擊冷卻時間（毫秒）
        // 受傷紅閃效果
        this.hitFlashTime = 0;
        this.hitFlashDuration = 150; // 毫秒
        
        // 新增：遠程攻擊相關屬性（小BOSS與大BOSS皆可）
        if (enemyConfig.RANGED_ATTACK) {
            // 僅在困難模式且該敵人類型的遠程屬性啟用時才開啟技能
            const enableRanged = (Game.difficulty && Game.difficulty.bossRangedEnabled) && (enemyConfig.RANGED_ATTACK.ENABLED !== false);
            if (enableRanged) {
                this.rangedAttack = enemyConfig.RANGED_ATTACK;
                this.lastRangedAttackTime = 0;
            }
        }
        // 死亡特效狀態（0.3 秒後退 + 淡出）
        this.isDying = false;
        this.deathElapsed = 0;
        this.deathDuration = 300; // ms
        this.deathAlpha = 1;
        this.deathVelX = 0;
        this.deathVelY = 0;
    }
    
    update(deltaTime) {
        // 若進入死亡特效，僅處理後退與淡出，完成後再刪除
        if (this.isDying) {
            const deltaMul = deltaTime / 16.67;
            this.deathElapsed = Math.min(this.deathDuration, this.deathElapsed + deltaTime);
            this.x += this.deathVelX * deltaMul;
            this.y += this.deathVelY * deltaMul;
            this.deathAlpha = Math.max(0, 1 - (this.deathElapsed / this.deathDuration));
            if (this.deathElapsed >= this.deathDuration) {
                this.destroy();
            }
            return; // 停止其他行為（不再攻擊/移動）
        }
        
        const deltaMul = deltaTime / 16.67;
        // 向玩家移動
        const player = Game.player;
        const angle = Utils.angle(this.x, this.y, player.x, player.y);
        
        // 計算候選位置（分軸移動）
        const candX = this.x + Math.cos(angle) * this.speed * deltaMul;
        const candY = this.y + Math.sin(angle) * this.speed * deltaMul;

        const blockedByObs = (nx, ny) => {
            for (const obs of Game.obstacles || []) {
                if (Utils.circleRectCollision(nx, ny, this.collisionRadius, obs.x, obs.y, obs.width, obs.height)) {
                    return true;
                }
            }
            return false;
        };

        const blockedByEnemies = (nx, ny) => {
            for (const otherEnemy of Game.enemies || []) {
                if (otherEnemy === this) continue;
                const dx = nx - otherEnemy.x;
                const dy = ny - otherEnemy.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDistance = this.collisionRadius + otherEnemy.collisionRadius;
                if (distance < minDistance) {
                    return true;
                }
            }
            return false;
        };

        // 嘗試X軸位移
        if (!blockedByObs(candX, this.y) && !blockedByEnemies(candX, this.y)) {
            this.x = candX;
        }
        // 嘗試Y軸位移
        if (!blockedByObs(this.x, candY) && !blockedByEnemies(this.x, candY)) {
            this.y = candY;
        }

        // 與障礙物分離/滑動：若接觸則沿法線微推開，避免卡住
        const slideStrength = (this.type === 'BOSS') ? 0.45 : 0.25;
        for (const obs of Game.obstacles || []) {
            const halfW = obs.width / 2;
            const halfH = obs.height / 2;
            const left = obs.x - halfW;
            const right = obs.x + halfW;
            const top = obs.y - halfH;
            const bottom = obs.y + halfH;
            const closestX = Utils.clamp(this.x, left, right);
            const closestY = Utils.clamp(this.y, top, bottom);
            let dx = this.x - closestX;
            let dy = this.y - closestY;
            const dist2 = dx * dx + dy * dy;
            const r = this.collisionRadius;
            if (dist2 < r * r) {
                const dist = Math.max(0.0001, Math.sqrt(dist2));
                dx /= dist; dy /= dist; // 法線方向（若在邊界上則為邊界法線）
                const push = (r - dist) * slideStrength;
                this.x += dx * push;
                this.y += dy * push;
            }
        }

        // 限制在世界範圍內（非循環邊界）
        const maxX = (Game.worldWidth || Game.canvas.width) - this.width / 2;
        const maxY = (Game.worldHeight || Game.canvas.height) - this.height / 2;
        const minX = this.width / 2;
        const minY = this.height / 2;
        
        // 檢查是否碰到邊界，如果是則稍微向內推
        const borderPush = 8; // 增加向內推的距離
        if (this.x <= minX) {
            this.x = minX + borderPush;
        } else if (this.x >= maxX) {
            this.x = maxX - borderPush;
        }
        
        if (this.y <= minY) {
            this.y = minY + borderPush;
        } else if (this.y >= maxY) {
            this.y = maxY - borderPush;
        }
        
        // 最終確保在範圍內
        this.x = Utils.clamp(this.x, minX, maxX);
        this.y = Utils.clamp(this.y, minY, maxY);

        // 改進的邊界防卡機制
        if (!this.isSlowed) {
            const now = Date.now();
            if (this.lastMoveCheckTime === undefined) {
                this.lastMoveCheckTime = now;
                this.lastMoveX = this.x;
                this.lastMoveY = this.y;
                this.stuckCounter = 0;
            } else if (now - this.lastMoveCheckTime >= 300) { // 縮短檢查間隔
                const dxMove = this.x - this.lastMoveX;
                const dyMove = this.y - this.lastMoveY;
                const movedDist = Math.sqrt(dxMove * dxMove + dyMove * dyMove);
                const borderMargin = 15; // 增加邊界檢測範圍
                const nearBorder = (this.x <= minX + borderMargin || this.x >= maxX - borderMargin || 
                                  this.y <= minY + borderMargin || this.y >= maxY - borderMargin);
                
                if (nearBorder && movedDist < 2.0) { // 放寬移動距離判定
                    this.stuckCounter = (this.stuckCounter || 0) + 1;
                    
                    // 如果連續卡住，採用更強力的脫離機制
                    if (this.stuckCounter >= 2) {
                        const centerX = (Game.worldWidth || Game.canvas.width) / 2;
                        const centerY = (Game.worldHeight || Game.canvas.height) / 2;
                        const angleToCenter = Utils.angle(this.x, this.y, centerX, centerY);
                        
                        // 增強推力，並添加隨機偏移避免多個敵人同時卡住
                        const randomOffset = (Math.random() - 0.5) * Math.PI * 0.3; // ±27度隨機偏移
                        const adjustedAngle = angleToCenter + randomOffset;
                        const nudge = (this.baseSpeed || this.speed) * (deltaMul) * 1.5; // 增強推力
                        
                        this.x = Utils.clamp(this.x + Math.cos(adjustedAngle) * nudge, minX + borderMargin, maxX - borderMargin);
                        this.y = Utils.clamp(this.y + Math.sin(adjustedAngle) * nudge, minY + borderMargin, maxY - borderMargin);
                        
                        // 重置卡住計數器
                        this.stuckCounter = 0;
                    }
                } else {
                    // 如果移動正常，重置卡住計數器
                    this.stuckCounter = 0;
                }
                
                this.lastMoveCheckTime = now;
                this.lastMoveX = this.x;
                this.lastMoveY = this.y;
            }
        }
        
        // 檢查與玩家的碰撞
        if (this.isColliding(player)) {
            this.attackPlayer(deltaTime);
        }

        // 新增：BOSS 遠程攻擊邏輯
        if (this.rangedAttack) {
            this.updateRangedAttack(deltaTime, player);
        }

        // 更新受傷紅閃計時
        if (this.hitFlashTime > 0) {
            this.hitFlashTime = Math.max(0, this.hitFlashTime - deltaTime);
        }
        // 檢查暫時減速是否結束，恢復速度
        if (this.isSlowed && Date.now() > this.slowEndTime) {
            this.isSlowed = false;
            this.speed = this.baseSpeed;
        }
    }
    
    draw(ctx) {
        ctx.save();
        // 死亡淡出時套用透明度
        if (this.isDying) {
            ctx.globalAlpha = this.deathAlpha;
        }
        
        // 根據敵人類型選擇圖片或顏色
        let imageName;
        let color;
        
        switch(this.type) {
            case 'ZOMBIE':
                imageName = 'zombie';
                color = '#0a0';
                break;
            case 'SKELETON':
                imageName = 'skeleton';
                color = '#aaa';
                break;
            case 'GHOST':
                imageName = 'ghost';
                color = '#aaf';
                break;
            case 'MINI_BOSS':
                imageName = 'mini_boss';
                color = '#f80';
                break;
            case 'BOSS':
                imageName = 'boss';
                color = '#f00';
                break;
            default:
                imageName = 'zombie';
                color = '#0a0';
        }
        
        // 繪製敵人 - 優先使用圖片
        if (Game.images && Game.images[imageName]) {
            // 確保圖片以1:1比例繪製
            const size = Math.max(this.width, this.height);
            ctx.drawImage(Game.images[imageName], this.x - size / 2, this.y - size / 2, size, size);
        } else {
            // 備用：使用純色圓形
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // 減速藍色覆蓋（持續顯示於減速期間）
        if (this.isSlowed) {
            const alpha = 0.3;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#3399ff';
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(this.width, this.height) / 2 + 2, 0, Math.PI * 2);
            ctx.fill();
            // 視覺優化：為減速覆蓋添加細環，提升辨識
            ctx.strokeStyle = '#66ccff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(this.width, this.height) / 2 + 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // 受傷紅色覆蓋閃爍（死亡期間停用）
        if (!this.isDying && this.hitFlashTime > 0) {
            const alpha = 0.35;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(this.width, this.height) / 2 + 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        
        // 繪製血條（視覺夾限已回退；死亡期間仍隱藏）
        const healthBarWidth = this.width;
        const healthBarHeight = 5;
        const healthPercentage = this.maxHealth > 0 ? (this.health / this.maxHealth) : 0;
        
        if (!this.isDying) {
            ctx.fillStyle = '#333';
            ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.height / 2 - 10, healthBarWidth, healthBarHeight);
            
            ctx.fillStyle = '#f00';
            ctx.fillRect(this.x - healthBarWidth / 2, this.y - this.height / 2 - 10, healthBarWidth * healthPercentage, healthBarHeight);
        }
        
        ctx.restore();
    }
    
    // 攻擊玩家
    attackPlayer(deltaTime) {
        const currentTime = Date.now();
        
        // 檢查攻擊冷卻
        if (currentTime - this.lastAttackTime >= this.attackCooldown) {
            Game.player.takeDamage(this.damage);
            this.lastAttackTime = currentTime;
        }
    }
    
    // 新增：BOSS 遠程攻擊更新邏輯
    updateRangedAttack(deltaTime, player) {
        const currentTime = Date.now();
        
        // 計算與玩家的距離
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 檢查是否在攻擊範圍內且冷卻時間已過
        if (distance <= this.rangedAttack.RANGE && 
            currentTime - this.lastRangedAttackTime >= this.rangedAttack.COOLDOWN) {
            
            // 發射火彈
            this.fireProjectile(player);
            this.lastRangedAttackTime = currentTime;
        }
    }
    
    // 新增：發射火彈投射物
    fireProjectile(target) {
        // 計算發射角度
        const angle = Utils.angle(this.x, this.y, target.x, target.y);
        
        // 創建 BOSS 火彈投射物（大Boss+50%，小Boss+35%）
        const projectile = new BossProjectile(
            this.x, 
            this.y, 
            angle,
            this.rangedAttack.PROJECTILE_SPEED,
            this.rangedAttack.PROJECTILE_DAMAGE,
            (this.type === 'BOSS' 
                ? this.rangedAttack.PROJECTILE_SIZE * 1.5 
                : (this.type === 'MINI_BOSS' 
                    ? this.rangedAttack.PROJECTILE_SIZE * 1.35 
                    : this.rangedAttack.PROJECTILE_SIZE)),
            this.rangedAttack.HOMING,
            this.rangedAttack.TURN_RATE
        );
        
        // 添加到遊戲的投射物陣列
        if (!Game.bossProjectiles) {
            Game.bossProjectiles = [];
        }
        Game.bossProjectiles.push(projectile);
    }
    
    // 受到傷害
    takeDamage(amount) {
        // 死亡淡出期間不再受傷，避免重複死亡觸發
        if (this.isDying) return;
        this.health -= amount;
        // 啟動紅閃
        this.hitFlashTime = this.hitFlashDuration;
        
        if (this.health <= 0) {
            this.health = 0;
            this.die();
        }
    }
    
    // 死亡
    die() {
        // 防重入：已在死亡流程中則不再觸發一次
        if (this.isDying) return;
        // 即刻停用受傷紅閃（避免淡出期間殘留紅色特效）
        this.hitFlashTime = 0;
        // 生成經驗寶石與獎勵等（維持事件順序與文字/數值不變）
        Game.spawnExperienceOrb(this.x, this.y, this.experienceValue);
        if (this.type === 'MINI_BOSS' || this.type === 'BOSS') {
            Game.spawnChest(this.x, this.y);
        }
        if (typeof Game !== 'undefined' && typeof Game.addCoins === 'function') {
            let coinGain = 1;
            if (this.type === 'MINI_BOSS') coinGain = 5;
            else if (this.type === 'BOSS') coinGain = 15;
            Game.addCoins(coinGain);
        }
        if (this.type === 'BOSS') {
            Game.victory();
        }
        
        // 啟動後退+淡出動畫，延後刪除 0.3 秒
        const angleToPlayer = Utils.angle(this.x, this.y, Game.player.x, Game.player.y);
        const pushDist = 20;
        const frames = this.deathDuration / 16.67;
        const pushSpeed = pushDist / frames;
        this.deathVelX = -Math.cos(angleToPlayer) * pushSpeed;
        this.deathVelY = -Math.sin(angleToPlayer) * pushSpeed;
        this.isDying = true;
        this.deathElapsed = 0;
        this.collisionRadius = 0;
        
        if (typeof AudioManager !== 'undefined') {
            AudioManager.playSound('enemy_death');
        }
        
        // 不立即 destroy，交由 update() 在 0.3 秒後刪除
    }
    
    // 新增：套用暫時減速效果（藍色並降速）
    applySlow(durationMs, speedFactor) {
        const factor = Math.max(0, speedFactor || 0.5);
        this.isSlowed = true;
        this.slowEndTime = Date.now() + (durationMs || 1000);
        this.speed = this.baseSpeed * factor;
    }
}
