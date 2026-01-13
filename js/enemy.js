// 敵人類
class Enemy extends Entity {
    constructor(x, y, type) {
        const enemyConfig = CONFIG.ENEMIES[type];
        super(x, y, enemyConfig.SIZE, enemyConfig.SIZE);
        
        this.type = type;
        this.name = enemyConfig.NAME;
        
        // ============================================================================
        // 血量計算邏輯（依地圖、難度、波次）
        // ============================================================================
        const wave = (typeof WaveSystem !== 'undefined' && WaveSystem.currentWave) ? WaveSystem.currentWave : 1;
        const mapId = (Game.selectedMap && Game.selectedMap.id) ? Game.selectedMap.id : 'city';
        const diffId = (Game.selectedDifficultyId) ? Game.selectedDifficultyId : 'EASY';
        const tuning = (CONFIG.TUNING || {});
        const totalWaves = (CONFIG.WAVES && CONFIG.WAVES.TOTAL_WAVES) ? CONFIG.WAVES.TOTAL_WAVES : 30;
        
        // 基礎血量（從敵人配置中取得）
        this.maxHealth = enemyConfig.HEALTH;
        
        try {
            // 普通小怪：根據地圖與難度配置調整血量
            if (this.type !== 'MINI_BOSS' && this.type !== 'ELF_MINI_BOSS' && this.type !== 'HUMAN_MINI_BOSS' &&
                this.type !== 'BOSS' && this.type !== 'ELF_BOSS' && this.type !== 'HUMAN_BOSS') {
                const enemyHealthConfig = (((tuning.ENEMY_HEALTH || {})[mapId] || {})[diffId]) || null;
                if (enemyHealthConfig) {
                    // 計算基礎血量（原始基礎值 + 地圖加成）
                    const baseHealth = this.maxHealth + (enemyHealthConfig.baseHealth || 0);
                    // 計算第30波目標血量
                    const maxHealthWave30 = enemyHealthConfig.maxHealthWave30 || baseHealth;
                    
                    // 根據波次線性插值：第1波使用基礎血量，第30波達到最大血量
                    if (wave === 1) {
                        this.maxHealth = baseHealth;
                    } else if (wave >= totalWaves) {
                        // 30波後：每波額外+當前血量的30%（無限疊加，避免卡BUG刷金幣）
                        const wave30Health = maxHealthWave30;
                        const wavesBeyond30 = wave - totalWaves;
                        // 計算公式：第30波血量 * (1.3 ^ 超過30波的波數)
                        this.maxHealth = Math.floor(wave30Health * Math.pow(1.3, wavesBeyond30));
                    } else {
                        // 線性插值：從基礎血量到最大血量
                        const progress = (wave - 1) / (totalWaves - 1);
                        this.maxHealth = Math.floor(baseHealth + (maxHealthWave30 - baseHealth) * progress);
                    }
                } else {
                    // 如果沒有配置，使用基礎值（應確保所有地圖/難度組合都有配置）
                    console.warn(`[Enemy] 未找到血量配置: 地圖=${mapId}, 難度=${diffId}, 類型=${this.type}`);
                    this.maxHealth = enemyConfig.HEALTH;
                }
            }
            // 小BOSS：根據地圖與難度配置調整血量
            else if (this.type === 'MINI_BOSS' || this.type === 'ELF_MINI_BOSS' || this.type === 'HUMAN_MINI_BOSS') {
                const miniBossConfig = (((tuning.MINI_BOSS || {})[mapId] || {})[diffId]) || null;
                if (miniBossConfig && miniBossConfig.startWave1 && miniBossConfig.endWave30) {
                    const start = miniBossConfig.startWave1;
                    const end = miniBossConfig.endWave30;
                    
                    // 根據波次計算血量：第1波使用起始值，第30波達到結束值
                    if (wave === 1) {
                        this.maxHealth = start;
                    } else if (wave >= totalWaves) {
                        // 30波後：每波額外+當前血量的30%（無限疊加，避免卡BUG刷金幣）
                        const wave30Health = end;
                        const wavesBeyond30 = wave - totalWaves;
                        // 計算公式：第30波血量 * (1.3 ^ 超過30波的波數)
                        this.maxHealth = Math.floor(wave30Health * Math.pow(1.3, wavesBeyond30));
                    } else {
                        // 指數增長：從起始值到結束值
                        const perWave = Math.pow(end / start, 1 / Math.max(1, (totalWaves - 1)));
                        const steps = Math.max(0, wave - 1);
                        this.maxHealth = Math.floor(start * Math.pow(perWave, steps));
                    }
                } else {
                    // 如果沒有配置，使用基礎值（向後兼容）
                    this.maxHealth = enemyConfig.HEALTH;
                }
            }
            // 大BOSS：根據地圖與難度配置調整血量（僅第20波）
            else if (this.type === 'BOSS' || this.type === 'ELF_BOSS' || this.type === 'HUMAN_BOSS') {
                const bossConfig = (((tuning.BOSS || {})[mapId] || {})[diffId]) || null;
                // 大BOSS僅第20波出現，直接指定目標血量（原為第30波，已縮短為20波）
                const bossWave = (CONFIG.WAVES && CONFIG.WAVES.BOSS_WAVE) ? CONFIG.WAVES.BOSS_WAVE : 20;
                if (bossConfig && (bossConfig.wave20 || bossConfig.wave30) && wave === bossWave) {
                    // 優先使用 wave20，如果沒有則使用 wave30（向後兼容）
                    this.maxHealth = bossConfig.wave20 || bossConfig.wave30;
                } else {
                    // 如果沒有配置，使用基礎值（向後兼容）
                    this.maxHealth = enemyConfig.HEALTH;
                }
            }
        } catch (e) {
            // 保守處理：任何錯誤均不影響既有流程，使用基礎值
            console.warn('[Enemy] 血量計算錯誤，使用基礎值:', e);
            this.maxHealth = enemyConfig.HEALTH;
        }
        
        // ============================================================================
        // 組隊模式血量加成：根據玩家數量增加敵人血量
        // 第1位正常（100%），之後每增加一位+80%（單純加法）
        // 例如：1位=100%, 2位=180%, 3位=260%, 4位=340%, 5位=420%
        // ============================================================================
        try {
            if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.sessionId) {
                // 獲取組隊玩家數量
                let playerCount = 1; // 預設至少1位（自己）
                if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.getMembersState === 'function') {
                    const members = window.SurvivalOnlineRuntime.getMembersState();
                    if (Array.isArray(members)) {
                        playerCount = members.length;
                    }
                }
                
                // 計算血量加成：第1位正常，之後每增加一位+80%
                // 公式：finalHealth = baseHealth * (1 + 0.8 * (playerCount - 1))
                if (playerCount > 1) {
                    const multiplier = 1 + 0.8 * (playerCount - 1);
                    this.maxHealth = Math.floor(this.maxHealth * multiplier);
                }
            }
        } catch (e) {
            // 組隊血量加成計算錯誤時不影響既有流程，使用原血量
            console.warn('[Enemy] 組隊血量加成計算錯誤，使用原血量:', e);
        }
        
        this.health = this.maxHealth;
        this.damage = enemyConfig.DAMAGE;
        this.speed = enemyConfig.SPEED * ((Game.difficulty && Game.difficulty.enemySpeedMultiplier) ? Game.difficulty.enemySpeedMultiplier : 1);
        // 新增：基礎速度與暫時減速狀態
        this.baseSpeed = this.speed;
        this.isSlowed = false;
        this.slowEndTime = 0;
        this.experienceValue = enemyConfig.EXPERIENCE;
        // 第5張地圖（intersection）經驗加成：
        // - 所有怪物 +2
        // - BOSS系列（小BOSS/大BOSS）額外 +20
        try {
            if (mapId === 'intersection') {
                this.experienceValue += 2;
                if (this.type === 'HUMAN_MINI_BOSS' || this.type === 'HUMAN_BOSS') {
                    this.experienceValue += 20;
                }
            }
        } catch (_) {}
        this.collisionRadius = enemyConfig.COLLISION_RADIUS;
        this.lastAttackTime = 0;
        this.attackCooldown = 1000; // 攻擊冷卻時間（毫秒）
        // 受傷紅閃效果
        this.hitFlashTime = 0;
        this.hitFlashDuration = 150; // 毫秒
        
        // 視覺與邏輯尺寸同步：支援非正方形尺寸（一般敵人若提供 WIDTH/HEIGHT 也可用）
        if (enemyConfig && typeof enemyConfig.WIDTH === 'number' && typeof enemyConfig.HEIGHT === 'number') {
            this.width = enemyConfig.WIDTH;
            this.height = enemyConfig.HEIGHT;
        }

        // 視覺與邏輯尺寸同步：MINI_BOSS 與 BOSS 使用非正方形大小（並建立 alpha 碰撞多邊形）
        if (this.type === 'MINI_BOSS' || this.type === 'ELF_MINI_BOSS' || this.type === 'HUMAN_MINI_BOSS') {
            if (this.type === 'ELF_MINI_BOSS') {
                // 花護衛：200x194，按比例縮放
                this.width = 200; this.height = 194;
            } else if (this.type === 'HUMAN_MINI_BOSS') {
                // 混混：169x200，按比例縮放（預設高度 160）
                this.width = 135; this.height = 160;
            } else {
                this.width = 123; this.height = 160;
            }
            const imgName = (this.type === 'ELF_MINI_BOSS') ? 'elf_mini_boss' : ((this.type === 'HUMAN_MINI_BOSS') ? 'human_mini_boss' : 'mini_boss');
            const img = Game && Game.images ? Game.images[imgName] : null;
            if (img && img.complete && img.naturalWidth > 0 && Utils.generateAlphaMaskPolygon) {
                const poly = Utils.generateAlphaMaskPolygon(img, this.width, this.height, 32, 72, 2);
                if (poly && poly.length >= 3) this.setCollisionPolygon(poly);
            }
        }
        if (this.type === 'BOSS' || this.type === 'ELF_BOSS' || this.type === 'HUMAN_BOSS') {
            if (this.type === 'ELF_BOSS') {
                // 花女王：400x382，按比例縮放
                this.width = 400; this.height = 382;
            } else if (this.type === 'HUMAN_BOSS') {
                // 資本家：300x325，按比例縮放（預設高度 300）
                this.width = 277; this.height = 300;
            } else {
                this.width = 212; this.height = 300;
            }
            const imgName = (this.type === 'ELF_BOSS') ? 'elfboss' : ((this.type === 'HUMAN_BOSS') ? 'humanboss' : 'boss');
            const img = Game && Game.images ? Game.images[imgName] : null;
            if (img && img.complete && img.naturalWidth > 0 && Utils.generateAlphaMaskPolygon) {
                const poly = Utils.generateAlphaMaskPolygon(img, this.width, this.height, 36, 80, 2);
                if (poly && poly.length >= 3) this.setCollisionPolygon(poly);
            }
        }
        this.collisionRadius = Math.max(this.width, this.height) / 2;
        // 新增：遠程攻擊相關屬性（小BOSS與大BOSS皆可）
        if (enemyConfig.RANGED_ATTACK) {
            // 僅在困難模式且該敵人類型的遠程屬性啟用時才開啟技能
            // 例外：路口地圖 HUMAN2 的瓶子投擲為常駐技能（不綁定 bossRangedEnabled）
            const alwaysEnableRanged = (mapId === 'intersection' && this.type === 'HUMAN2');
            const enableRanged = alwaysEnableRanged || ((Game.difficulty && Game.difficulty.bossRangedEnabled) && (enemyConfig.RANGED_ATTACK.ENABLED !== false));
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
        
        // 面向：用於左右貼圖（預設朝右）
        // -1 = 朝左, +1 = 朝右
        this.facingX = 1;
        
        // ========================================================================
        // 花護衛背景雪碧圖動畫初始化（在constructor中初始化，避免在draw中重複創建）
        // ========================================================================
        if (this.type === 'ELF_MINI_BOSS') {
            this._spriteAnimation = {
                spriteSheet: null,
                spriteSheetLoaded: false,
                frameWidth: 437,
                frameHeight: 437,
                framesPerRow: 6,
                framesPerCol: 5,
                totalFrames: 30,
                currentFrame: 0,
                frameDuration: 50, // 每幀50毫秒（約20fps）
                animAccumulator: 0,
                spriteSrc: 'assets/images/Elf_mini_boss-2.png',
                imageLoading: false // 防止重複載入
            };
            
            // 立即開始載入雪碧圖（僅一次）
            const img = new Image();
            img.onload = () => {
                if (this._spriteAnimation) {
                    this._spriteAnimation.spriteSheet = img;
                    this._spriteAnimation.spriteSheetLoaded = true;
                }
            };
            img.onerror = () => {
                if (this._spriteAnimation) {
                    console.warn('[Enemy] 花護衛雪碧圖載入失敗:', this._spriteAnimation.spriteSrc);
                    this._spriteAnimation.spriteSheetLoaded = false;
                }
            };
            this._spriteAnimation.imageLoading = true;
            img.src = this._spriteAnimation.spriteSrc;
        }
    }
    
    update(deltaTime) {
        // 更新特效位置
        if (this._judgmentEffects) {
            const canvas = Game.canvas;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const scaleX = rect.width / canvas.width;
                const scaleY = rect.height / canvas.height;
                const camX = Game.camera ? Game.camera.x : 0;
                const camY = Game.camera ? Game.camera.y : 0;
                for (const el of this._judgmentEffects) {
                    if (el && el.parentNode) {
                        const sx = (this.x - camX) * scaleX;
                        const sy = (this.y - camY) * scaleY;
                        el.style.left = sx + 'px';
                        el.style.top = sy + 'px';
                    }
                }
            }
        }
        
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
        
        if (typeof this.hasCollisionPolygon === 'function' && !this.hasCollisionPolygon()) {
            let imageName = null;
            if (this.type === 'MINI_BOSS') imageName = 'mini_boss';
            else if (this.type === 'ELF_MINI_BOSS') imageName = 'elf_mini_boss';
            else if (this.type === 'HUMAN_MINI_BOSS') imageName = 'human_mini_boss';
            else if (this.type === 'BOSS') imageName = 'boss';
            else if (this.type === 'ELF_BOSS') imageName = 'elfboss';
            else if (this.type === 'HUMAN_BOSS') imageName = 'humanboss';
            if (imageName && Game && Game.images && Game.images[imageName]) {
                const img = Game.images[imageName];
                if (img.complete && img.naturalWidth > 0 && Utils.generateAlphaMaskPolygon) {
                    const params = (this.type === 'BOSS' || this.type === 'ELF_BOSS' || this.type === 'HUMAN_BOSS') ? [36, 80, 2] : [32, 72, 2];
                    const poly = Utils.generateAlphaMaskPolygon(img, this.width, this.height, ...params);
                    if (poly && poly.length >= 3) this.setCollisionPolygon(poly);
                }
            }
        }
        
        const deltaMul = deltaTime / 16.67;
        const _prevX_forFacing = this.x;
        // 向玩家移動
        const player = Game.player;
        const angle = Utils.angle(this.x, this.y, player.x, player.y);
        
        // 計算候選位置（分軸移動）
        const candX = this.x + Math.cos(angle) * this.speed * deltaMul;
        const candY = this.y + Math.sin(angle) * this.speed * deltaMul;

        const blockedByObs = (nx, ny) => {
            // 若有多邊形，採用多邊形-矩形碰撞；否則維持既有圓-矩形邏輯
            if (this.hasCollisionPolygon && this.hasCollisionPolygon()) {
                const poly = this.collisionPolygon.map(p => [nx + p[0], ny + p[1]]);
                for (const obs of (Game.obstacles || [])) {
                    if (Utils.polygonRectCollision(poly, obs.x, obs.y, obs.width, obs.height)) return true;
                }
                return false;
            }
            for (const obs of Game.obstacles || []) {
                if (Utils.circleRectCollision(nx, ny, this.collisionRadius, obs.x, obs.y, obs.width, obs.height)) {
                    return true;
                }
            }
            return false;
        };

        // 生存模式統一採用軟互斥模式（允許重疊但會推開，避免硬碰撞造成卡住BUG）
        // 嘗試X軸位移（僅檢查障礙物，不再硬性阻止敵人碰撞）
        if (!blockedByObs(candX, this.y)) {
            this.x = candX;
        }
        // 嘗試Y軸位移（僅檢查障礙物，不再硬性阻止敵人碰撞）
        if (!blockedByObs(this.x, candY)) {
            this.y = candY;
        }

        // 與障礙物分離/滑動：若接觸則沿法線微推開，避免卡住
        const slideStrength = (this.type === 'BOSS' || this.type === 'ELF_BOSS' || this.type === 'HUMAN_BOSS') ? 0.45 : 0.25;
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

        // ========================================================================
        // 敵人互斥系統：軟碰撞，允許重疊但會互相推開（所有地圖統一採用，解決邊界卡住問題）
        // ========================================================================
        // 性能優化：只檢查附近的敵人（使用距離閾值，避免O(n²)全掃描）
        const maxCheckDistance = (this.collisionRadius * 2) + 100; // 只檢查碰撞半徑2倍+100像素內的敵人
        const maxCheckDistanceSq = maxCheckDistance * maxCheckDistance;
        
        // 根據敵人體積調整互斥強度（大體積敵人需要更強的推力）
        // 注意：這些變數會在下面的邊界處理部分再次使用，所以提前定義
        const isGardenLargeEnemyForRepulsion = (Game.selectedMap && Game.selectedMap.id === 'garden') && 
                                   (this.type === 'ELF_MINI_BOSS' || this.type === 'ELF_BOSS');
        const isLargeEnemyForRepulsion = (this.type === 'MINI_BOSS' || this.type === 'ELF_MINI_BOSS' || this.type === 'HUMAN_MINI_BOSS' ||
                             this.type === 'BOSS' || this.type === 'ELF_BOSS' || this.type === 'HUMAN_BOSS');
        
        // 互斥強度：大體積敵人需要更強的推力，避免被小敵人卡住
        let repulsionStrength = 0.15; // 默認互斥強度
        if (isGardenLargeEnemyForRepulsion) {
            repulsionStrength = 0.35; // 花園大體積敵人：更強推力
        } else if (isLargeEnemyForRepulsion) {
            repulsionStrength = 0.25; // 其他大體積敵人：中等推力
        }
        
        // 累積互斥力（向量累加）
        let repulsionX = 0;
        let repulsionY = 0;
        let repulsionCount = 0;
        
        // 只檢查附近的敵人（性能優化）
        for (const otherEnemy of Game.enemies || []) {
            if (otherEnemy === this || otherEnemy.markedForDeletion) continue;
            
            const dx = this.x - otherEnemy.x;
            const dy = this.y - otherEnemy.y;
            const distSq = dx * dx + dy * dy;
            
            // 距離閾值檢查（性能優化）
            if (distSq > maxCheckDistanceSq) continue;
            
            const distance = Math.sqrt(distSq);
            const minDistance = this.collisionRadius + otherEnemy.collisionRadius;
            
            // 如果距離小於最小距離，計算互斥力
            if (distance < minDistance && distance > 0.0001) {
                // 標準化方向向量（從其他敵人指向自己）
                const dirX = dx / distance;
                const dirY = dy / distance;
                
                // 計算重疊深度
                const overlap = minDistance - distance;
                
                // 互斥力與重疊深度成正比，但使用平方根避免過強
                const force = Math.sqrt(overlap) * repulsionStrength * deltaMul;
                
                // 累積互斥力
                repulsionX += dirX * force;
                repulsionY += dirY * force;
                repulsionCount++;
            }
        }
        
        // 應用互斥力（平均化，避免單個敵人造成過大位移）
        if (repulsionCount > 0) {
            // 限制最大互斥力，避免瞬間位移過大
            const maxRepulsion = this.speed * deltaMul * 2.0; // 最大互斥速度不超過移動速度的2倍
            const repulsionMag = Math.sqrt(repulsionX * repulsionX + repulsionY * repulsionY);
            if (repulsionMag > maxRepulsion) {
                const scale = maxRepulsion / repulsionMag;
                repulsionX *= scale;
                repulsionY *= scale;
            }
            
            // 應用互斥位移
            this.x += repulsionX;
            this.y += repulsionY;
        }

        // 限制在世界範圍內（非循環邊界）
        const maxX = (Game.worldWidth || Game.canvas.width) - this.width / 2;
        const maxY = (Game.worldHeight || Game.canvas.height) - this.height / 2;
        const minX = this.width / 2;
        const minY = this.height / 2;
        
        // ========================================================================
        // 針對花園地圖大體積敵人的邊界處理優化
        // ========================================================================
        // 判斷是否為花園地圖的大體積敵人
        const isGardenLargeEnemy = (Game.selectedMap && Game.selectedMap.id === 'garden') && 
                                   (this.type === 'ELF_MINI_BOSS' || this.type === 'ELF_BOSS');
        const isLargeEnemy = (this.type === 'MINI_BOSS' || this.type === 'ELF_MINI_BOSS' || this.type === 'HUMAN_MINI_BOSS' ||
                             this.type === 'BOSS' || this.type === 'ELF_BOSS' || this.type === 'HUMAN_BOSS');
        
        // 根據敵人體積動態調整邊界推入距離
        // 花園地圖的大體積敵人需要更大的推入距離，避免卡在邊界
        let borderPush = 8; // 默認推入距離
        if (isGardenLargeEnemy) {
            // 花護衛（200x194）和花女王（400x382）需要更大的推入距離
            borderPush = Math.max(this.width, this.height) * 0.15; // 使用尺寸的15%作為推入距離
            borderPush = Math.max(borderPush, 30); // 最小30像素
        } else if (isLargeEnemy) {
            // 其他大體積敵人
            borderPush = Math.max(this.width, this.height) * 0.1; // 使用尺寸的10%作為推入距離
            borderPush = Math.max(borderPush, 20); // 最小20像素
        }
        
        // 檢查是否碰到邊界，如果是則稍微向內推
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

        // 改進的邊界防卡機制（針對大體積敵人優化）
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
                
                // 根據敵人體積動態調整邊界檢測範圍
                let borderMargin = 15; // 默認邊界檢測範圍
                if (isGardenLargeEnemy) {
                    borderMargin = Math.max(this.width, this.height) * 0.2; // 使用尺寸的20%作為檢測範圍
                    borderMargin = Math.max(borderMargin, 40); // 最小40像素
                } else if (isLargeEnemy) {
                    borderMargin = Math.max(this.width, this.height) * 0.15; // 使用尺寸的15%作為檢測範圍
                    borderMargin = Math.max(borderMargin, 25); // 最小25像素
                }
                
                const nearBorder = (this.x <= minX + borderMargin || this.x >= maxX - borderMargin || 
                                  this.y <= minY + borderMargin || this.y >= maxY - borderMargin);
                
                // 根據敵人體積調整移動距離判定閾值
                const moveThreshold = isGardenLargeEnemy ? 5.0 : (isLargeEnemy ? 3.0 : 2.0);
                
                if (nearBorder && movedDist < moveThreshold) {
                    this.stuckCounter = (this.stuckCounter || 0) + 1;
                    
                    // 如果連續卡住，採用更強力的脫離機制
                    // 大體積敵人需要更強的推力
                    const stuckThreshold = isGardenLargeEnemy ? 1 : 2; // 花園大體積敵人更快觸發脫離機制
                    if (this.stuckCounter >= stuckThreshold) {
                        const centerX = (Game.worldWidth || Game.canvas.width) / 2;
                        const centerY = (Game.worldHeight || Game.canvas.height) / 2;
                        const angleToCenter = Utils.angle(this.x, this.y, centerX, centerY);
                        
                        // 增強推力，並添加隨機偏移避免多個敵人同時卡住
                        const randomOffset = (Math.random() - 0.5) * Math.PI * 0.3; // ±27度隨機偏移
                        const adjustedAngle = angleToCenter + randomOffset;
                        
                        // 根據敵人體積調整推力強度
                        let nudgeMultiplier = 1.5; // 默認推力倍數
                        if (isGardenLargeEnemy) {
                            nudgeMultiplier = 3.0; // 花園大體積敵人使用3倍推力
                        } else if (isLargeEnemy) {
                            nudgeMultiplier = 2.0; // 其他大體積敵人使用2倍推力
                        }
                        const nudge = (this.baseSpeed || this.speed) * (deltaMul) * nudgeMultiplier;
                        
                        // 使用更大的邊界緩衝區，避免推回邊界
                        const pushBuffer = isGardenLargeEnemy ? borderMargin * 1.5 : borderMargin;
                        this.x = Utils.clamp(this.x + Math.cos(adjustedAngle) * nudge, minX + pushBuffer, maxX - pushBuffer);
                        this.y = Utils.clamp(this.y + Math.sin(adjustedAngle) * nudge, minY + pushBuffer, maxY - pushBuffer);
                        
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

        // 更新面向（只看水平移動；若本幀沒有水平位移則維持上一幀）
        try {
            const dxFacing = this.x - _prevX_forFacing;
            if (dxFacing > 0.05) this.facingX = 1;
            else if (dxFacing < -0.05) this.facingX = -1;
        } catch (_) {}
        
        // 檢查與玩家的碰撞
        // ✅ MMORPG 架構：支援攻擊所有玩家（本地玩家 + 遠程玩家），不依賴室長端
        let targetPlayer = player;
        if (Game.multiplayer && Array.isArray(Game.remotePlayers)) {
            // 找到最近的活著的玩家（本地玩家或遠程玩家）
            let nearestPlayer = player;
            let nearestDist = Infinity;
            if (player && !player._isDead) {
                const dist = Utils.distance(this.x, this.y, player.x, player.y);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestPlayer = player;
                }
            }
            for (const remotePlayer of Game.remotePlayers) {
                if (remotePlayer && !remotePlayer.markedForDeletion && !remotePlayer._isDead) {
                    const dist = Utils.distance(this.x, this.y, remotePlayer.x, remotePlayer.y);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestPlayer = remotePlayer;
                    }
                }
            }
            targetPlayer = nearestPlayer;
        }
        
        if (targetPlayer && this.isColliding(targetPlayer)) {
            this.attackPlayer(deltaTime, targetPlayer);
        }

        // ✅ MMORPG 架構：BOSS 遠程攻擊邏輯，攻擊所有玩家（本地+遠程），不依賴室長端
        if (this.rangedAttack) {
            // 找到最近的活著的玩家作為目標（本地玩家或遠程玩家）
            let targetPlayer = player;
            if (Game.multiplayer && Array.isArray(Game.remotePlayers)) {
                let nearestPlayer = player;
                let nearestDist = Infinity;
                if (player && !player._isDead) {
                    const dist = Utils.distance(this.x, this.y, player.x, player.y);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestPlayer = player;
                    }
                }
                for (const remotePlayer of Game.remotePlayers) {
                    if (remotePlayer && !remotePlayer.markedForDeletion && !remotePlayer._isDead) {
                        const dist = Utils.distance(this.x, this.y, remotePlayer.x, remotePlayer.y);
                        if (dist < nearestDist) {
                            nearestDist = dist;
                            nearestPlayer = remotePlayer;
                        }
                    }
                }
                targetPlayer = nearestPlayer;
            }
            this.updateRangedAttack(deltaTime, targetPlayer);
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
        
        // 更新花護衛的背景雪碧圖動畫幀（在update中更新，draw中只負責繪製）
        // 優化：只在遊戲未暫停時更新動畫，避免升級界面時不必要的計算
        if (this.type === 'ELF_MINI_BOSS' && !this.isDying && this._spriteAnimation) {
            try {
                // 檢查遊戲是否暫停（升級界面顯示時會暫停）
                const isGamePaused = (typeof Game !== 'undefined' && Game.isPaused) || false;
                if (!isGamePaused) {
                    // 更新動畫幀
                    this._spriteAnimation.animAccumulator += deltaTime;
                    while (this._spriteAnimation.animAccumulator >= this._spriteAnimation.frameDuration) {
                        this._spriteAnimation.currentFrame = (this._spriteAnimation.currentFrame + 1) % this._spriteAnimation.totalFrames;
                        this._spriteAnimation.animAccumulator -= this._spriteAnimation.frameDuration;
                    }
                }
            } catch (e) {
                // 忽略錯誤
            }
        }
    }
    
    draw(ctx) {
        // ========================================================================
        // 花護衛與花女王的背景特效（雪碧圖動畫，在Canvas繪製之前顯示，位於敵人圖片後方）
        // ========================================================================
        // 說明：
        // - 背景特效直接在Canvas上繪製，在敵人圖片之前繪製，自然顯示在後方
        // - 不需要將BOSS單獨移到D圖層，現有的圖層順序邏輯不受影響
        // - 花護衛使用雪碧圖動畫（Elf_mini_boss-2.png，5行6列，30幀，每幀437x437）
        // ========================================================================
        
        // 繪製花護衛的背景雪碧圖動畫（在敵人圖片之前繪製，自然顯示在後方）
        // 優化：只在圖片已載入且不在死亡狀態時繪製，避免重複檢查和創建對象
        if (this.type === 'ELF_MINI_BOSS' && !this.isDying && this._spriteAnimation && 
            this._spriteAnimation.spriteSheetLoaded && this._spriteAnimation.spriteSheet) {
            try {
                ctx.save();
                
                // 計算當前幀在雪碧圖中的位置
                const frameIndex = this._spriteAnimation.currentFrame;
                const col = frameIndex % this._spriteAnimation.framesPerRow;
                const row = Math.floor(frameIndex / this._spriteAnimation.framesPerRow);
                const sx = col * this._spriteAnimation.frameWidth;
                const sy = row * this._spriteAnimation.frameHeight;
                
                // 計算繪製尺寸（稍微放大以作為背景特效）
                const drawSize = Math.max(this.width, this.height) * 1.2;
                const drawX = this.x - drawSize / 2;
                const drawY = this.y - drawSize / 2;
                
                // 繪製雪碧圖動畫（在敵人圖片之前，自然顯示在後方）
                ctx.imageSmoothingEnabled = false; // 保持像素風格
                ctx.drawImage(
                    this._spriteAnimation.spriteSheet,
                    sx, sy, this._spriteAnimation.frameWidth, this._spriteAnimation.frameHeight,
                    drawX, drawY, drawSize, drawSize
                );
                
                ctx.restore();
            } catch (e) {
                // 忽略錯誤，避免影響正常繪製
                console.warn('[Enemy] 花護衛背景雪碧圖動畫顯示失敗:', e);
            }
        }
        
        // 花女王的背景GIF特效（保留原有邏輯，可選）
        if (this.type === 'ELF_BOSS' && !this.isDying) {
            try {
                const camX = (Game && Game.camera && Game.camera.x) ? Game.camera.x : 0;
                const camY = (Game && Game.camera && Game.camera.y) ? Game.camera.y : 0;
                const screenX = this.x - camX;
                const screenY = this.y - camY;
                
                // 花女王背景GIF - 可選，暫時不使用
                const gifSrc = null; // 如需使用，請設置實際的GIF路徑
                const gifSize = { width: this.width * 1.2, height: this.height * 1.2 };
                
                // 如果提供了GIF路徑，則顯示背景GIF
                if (gifSrc && typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.showOrUpdate === 'function') {
                    if (!this._gifInstanceId) {
                        this._gifInstanceId = 'boss-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                    }
                    const uniqueId = 'elf-boss-bg-' + this._gifInstanceId;
                    window.GifOverlay.showOrUpdate(uniqueId, gifSrc, screenX, screenY, gifSize, true);
                } else if (gifSrc === null && typeof window !== 'undefined' && window.GifOverlay && this._gifInstanceId) {
                    const uniqueId = 'elf-boss-bg-' + this._gifInstanceId;
                    window.GifOverlay.hide(uniqueId);
                }
            } catch (e) {
                console.warn('[Enemy] 花女王背景GIF顯示失敗:', e);
            }
        }
        
        ctx.save();
        // 死亡淡出時套用透明度
        if (this.isDying) {
            ctx.globalAlpha = this.deathAlpha;
            // 死亡時清理背景特效（雪碧圖動畫會自動停止繪製，GIF需要手動隱藏）
            if (this.type === 'ELF_BOSS' && typeof window !== 'undefined' && window.GifOverlay && this._gifInstanceId) {
                try {
                    const uniqueId = 'elf-boss-bg-' + this._gifInstanceId;
                    window.GifOverlay.hide(uniqueId);
                } catch (_) {}
            }
        }
        
        // 根據敵人類型選擇圖片或顏色
        let imageName;
        let color;
        let drawW, drawH;
        
        switch(this.type) {
            case 'ZOMBIE':
                imageName = 'zombie';
                color = '#0a0';
                break;
            case 'ZOMBIE2':
                imageName = 'zombie2';
                color = '#0a0';
                break;
            case 'ZOMBIE3':
                imageName = 'zombie3';
                color = '#0a0';
                break;
            case 'SKELETON':
                imageName = 'skeleton';
                color = '#aaa';
                break;
            case 'SKELETON2':
                imageName = 'skeleton2';
                color = '#aaa';
                break;
            case 'SKELETON3':
                imageName = 'skeleton3';
                color = '#aaa';
                break;
            case 'GHOST':
                imageName = 'ghost';
                color = '#aaf';
                break;
            case 'GHOST2':
                imageName = 'ghost2';
                color = '#aaf';
                break;
            case 'GHOST3':
                imageName = 'ghost3';
                color = '#aaf';
                break;
            case 'ELF':
                imageName = 'elf';
                color = '#0fa';
                break;
            case 'ELF2':
                imageName = 'elf2';
                color = '#0fa';
                break;
            case 'ELF3':
                imageName = 'elf3';
                color = '#0fa';
                break;
            case 'HUMAN1':
                imageName = 'human';
                color = '#bbb';
                break;
            case 'HUMAN2':
                imageName = 'human2';
                color = '#bbb';
                break;
            case 'HUMAN3':
                imageName = 'human3';
                color = '#bbb';
                break;
            case 'MINI_BOSS':
                imageName = 'mini_boss';
                color = '#f80';
                break;
            case 'ELF_MINI_BOSS':
                imageName = 'elf_mini_boss';
                color = '#f80';
                break;
            case 'HUMAN_MINI_BOSS':
                imageName = 'human_mini_boss';
                color = '#f80';
                break;
            case 'BOSS':
                imageName = 'boss';
                color = '#f00';
                break;
            case 'ELF_BOSS':
                imageName = 'elfboss';
                color = '#f00';
                break;
            case 'HUMAN_BOSS':
                imageName = 'humanboss';
                color = '#f00';
                break;
            default:
                imageName = 'zombie';
                color = '#0a0';
        }

        // 路口地圖：人類系列左右朝向貼圖
        // 原圖皆為往右；往左使用 *-2 版本（human-2 / human2-2 / ...）
        if (this.facingX < 0 && Game.images) {
            let leftKey = null;
            if (this.type === 'HUMAN1') leftKey = 'human-2';
            else if (this.type === 'HUMAN2') leftKey = 'human2-2';
            else if (this.type === 'HUMAN3') leftKey = 'human3-2';
            else if (this.type === 'HUMAN_MINI_BOSS') leftKey = 'human_mini_boss-2';
            else if (this.type === 'HUMAN_BOSS') leftKey = 'humanboss-2';
            if (leftKey && Game.images[leftKey]) {
                imageName = leftKey;
            }
        }

        // 花園地圖：部份敵人左右朝向貼圖
        // 原圖皆為往左；往右使用對應版本：
        // - ELF / ELF2 / ELF3：Elf-2 / Elf2-2 / Elf3-2
        // - ELF_MINI_BOSS：Elf_mini_boss-3
        if (this.facingX > 0 && Game.images) {
            let rightKey = null;
            if (this.type === 'ELF') rightKey = 'elf-2';
            else if (this.type === 'ELF2') rightKey = 'elf2-2';
            else if (this.type === 'ELF3') rightKey = 'elf3-2';
            else if (this.type === 'ELF_MINI_BOSS') rightKey = 'elf_mini_boss-3';
            if (rightKey && Game.images[rightKey]) {
                imageName = rightKey;
            }
        }
        
        const enemyConfig = (CONFIG && CONFIG.ENEMIES) ? CONFIG.ENEMIES[this.type] : null;
        
        // 繪製敵人 - 優先使用圖片
        if (Game.images && Game.images[imageName]) {
            // 迷你頭目與頭目使用邏輯尺寸（非正方形）；一般敵人若提供 width/height 也以該尺寸渲染
            if (this.type === 'MINI_BOSS' || this.type === 'ELF_MINI_BOSS' || this.type === 'HUMAN_MINI_BOSS' ||
                this.type === 'BOSS' || this.type === 'ELF_BOSS' || this.type === 'HUMAN_BOSS' ||
                (enemyConfig && typeof enemyConfig.WIDTH === 'number' && typeof enemyConfig.HEIGHT === 'number')) {
                drawW = this.width; drawH = this.height;
                ctx.drawImage(
                    Game.images[imageName],
                    this.x - drawW / 2,
                    this.y - drawH / 2,
                    drawW,
                    drawH
                );
            } else {
                // 其他敵人維持以實體 size（正方形）繪製
                const size = Math.max(this.width, this.height);
                drawW = size; drawH = size;
                ctx.drawImage(Game.images[imageName], this.x - size / 2, this.y - size / 2, size, size);
            }
        } else {
            // 備用：使用純色圓形
            drawW = Math.max(this.width, this.height);
            drawH = Math.max(this.width, this.height);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(this.width, this.height) / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 私有：建立並快取貼圖顏色遮罩（使用PNG alpha裁切）
        // 避免代碼膨脹：僅在需要覆蓋時初次生成，並依 image+尺寸 快取於實例
        const ensureTint = (imgName, w, h) => {
            const key = `${imgName}|${w}x${h}`;
            if (this._tintKey === key && this._tintRed && this._tintBlue) return;
            const img = Game.images && Game.images[imgName];
            if (!img || !img.complete || !(img.naturalWidth > 0)) { this._tintKey = null; this._tintRed = null; this._tintBlue = null; return; }
            const make = (color) => {
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                const cctx = c.getContext('2d');
                cctx.clearRect(0, 0, w, h);
                cctx.drawImage(img, 0, 0, w, h);
                cctx.globalCompositeOperation = 'source-in';
                cctx.fillStyle = color;
                cctx.fillRect(0, 0, w, h);
                cctx.globalCompositeOperation = 'source-over';
                return c;
            };
            this._tintKey = key;
            this._tintRed = make('#ff0000');
            this._tintBlue = make('#3399ff');
        };
        
        // 減速藍色覆蓋（持續顯示於減速期間），沿PNG透明度裁切；若無圖或尚未載入則回退原邏輯
        // 注意：藍閃優先於紅閃，若同時有緩速和受傷，只顯示藍閃
        if (this.isSlowed) {
            const alpha = 0.3;
            ensureTint(imageName, drawW, drawH);
            if (this._tintBlue) {
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.drawImage(this._tintBlue, this.x - drawW / 2, this.y - drawH / 2, drawW, drawH);
                ctx.restore();
            } else {
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#3399ff';
                ctx.beginPath();
                let poly = null;
                if (typeof this.hasCollisionPolygon === 'function' && this.hasCollisionPolygon() && typeof this.getWorldPolygon === 'function') {
                    poly = this.getWorldPolygon();
                }
                if (poly && Array.isArray(poly) && poly.length >= 3) {
                    ctx.moveTo(poly[0][0], poly[0][1]);
                    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
                    ctx.closePath();
                } else {
                    // 回退以圓形遮罩，避免矩形誤覆蓋到透明背景
                    ctx.arc(this.x, this.y, Math.max(this.width, this.height) / 2, 0, Math.PI * 2);
                }
                ctx.fill();
                ctx.strokeStyle = '#66ccff';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
            }
        }
        
        // 受傷紅色覆蓋閃爍（死亡期間停用），沿PNG透明度裁切；若無圖或尚未載入則回退原邏輯
        // 注意：若同時有緩速效果，則不顯示紅閃（藍閃優先）
        if (!this.isDying && this.hitFlashTime > 0 && !this.isSlowed) {
            const alpha = 0.35;
            ensureTint(imageName, drawW, drawH);
            if (this._tintRed) {
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.drawImage(this._tintRed, this.x - drawW / 2, this.y - drawH / 2, drawW, drawH);
                ctx.restore();
            } else {
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                let poly = null;
                if (typeof this.hasCollisionPolygon === 'function' && this.hasCollisionPolygon() && typeof this.getWorldPolygon === 'function') {
                    poly = this.getWorldPolygon();
                }
                if (poly && Array.isArray(poly) && poly.length >= 3) {
                    ctx.moveTo(poly[0][0], poly[0][1]);
                    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
                    ctx.closePath();
                } else {
                    // 回退以圓形遮罩，避免矩形誤覆蓋到透明背景
                    ctx.arc(this.x, this.y, Math.max(this.width, this.height) / 2, 0, Math.PI * 2);
                }
                ctx.fill();
                ctx.restore();
            }
        }
        
        // 繪製血條（死亡期間隱藏）
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
    attackPlayer(deltaTime, targetPlayer) {
        // M4：支援攻擊遠程玩家
        const player = targetPlayer || Game.player;
        if (!player) return;
        
        const currentTime = Date.now();
        
        // 檢查攻擊冷卻
        if (currentTime - this.lastAttackTime >= this.attackCooldown) {
            // 技能無敵時完全免疫近戰傷害（不觸發扣血）
            try {
                if (player && player.invulnerabilitySource === 'INVINCIBLE') {
                    this.lastAttackTime = currentTime; // 視為一次攻擊嘗試，維持冷卻節奏
                    return;
                }
            } catch (_) {}
            player.takeDamage(this.damage);
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
        // 路口 HUMAN2：拋物線投擲瓶子（無音效）
        if (this.type === 'HUMAN2' && typeof BottleProjectile !== 'undefined') {
            try {
                const cfgDagger = (CONFIG && CONFIG.WEAPONS && CONFIG.WEAPONS.DAGGER) || {};
                const baseSize = (typeof cfgDagger.PROJECTILE_SIZE === 'number') ? cfgDagger.PROJECTILE_SIZE : 20;
                const bottleH = Math.max(14, Math.round(baseSize)); // 約應援棒 LV1
                const bottleW = Math.max(10, Math.round(bottleH * (54 / 150))); // bottle.png 54x150
                const p = new BottleProjectile(
                    this.x,
                    this.y,
                    target.x,
                    target.y,
                    this.rangedAttack.PROJECTILE_SPEED,
                    this.rangedAttack.PROJECTILE_DAMAGE,
                    bottleW,
                    bottleH
                );
                if (!Game.bossProjectiles) Game.bossProjectiles = [];
                Game.bossProjectiles.push(p);
            } catch (_) {}
            return;
        }

        // 計算發射角度
        const angle = Utils.angle(this.x, this.y, target.x, target.y);
        
        // 創建 BOSS 火彈投射物（大Boss+50%，小Boss+35%）
        const projectile = new BossProjectile(
            this.x, 
            this.y, 
            angle,
            this.rangedAttack.PROJECTILE_SPEED,
            this.rangedAttack.PROJECTILE_DAMAGE,
            ((this.type === 'BOSS' || this.type === 'ELF_BOSS' || this.type === 'HUMAN_BOSS')
                ? this.rangedAttack.PROJECTILE_SIZE * 1.5 
                : ((this.type === 'MINI_BOSS' || this.type === 'ELF_MINI_BOSS' || this.type === 'HUMAN_MINI_BOSS')
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
    takeDamage(amount, options = {}) {
        // 死亡淡出期間不再受傷，避免重複死亡觸發
        if (this.isDying) return;
        
        this.health -= amount;
        // 啟動紅閃
        this.hitFlashTime = this.hitFlashDuration;
        
        // 如果受到 JUDGMENT 傷害，創建 knife2.gif 特效
        if (options && options.weaponType === 'JUDGMENT') {
            this._createJudgmentHitEffect();
        }
        
        // ✅ MMORPG 架構：所有玩家都能廣播傷害數字事件，不依賴室長端
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
            
            if (isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer) {
                // 確定傷害來源（本地玩家或遠程玩家）
                let playerUid = null;
                let isCrit = false;
                let dirX = 0;
                let dirY = -1;
                
                // 從 options 中獲取信息（如果有的話）
                if (options && typeof options === 'object') {
                    if (options.playerUid && typeof options.playerUid === 'string') {
                        playerUid = options.playerUid;
                    }
                    if (options.isCrit === true) {
                        isCrit = true;
                    }
                    if (typeof options.dirX === 'number') dirX = options.dirX;
                    if (typeof options.dirY === 'number') dirY = options.dirY;
                }
                
                // 如果沒有指定 playerUid，可能是本地玩家造成的傷害
                if (!playerUid && Game.multiplayer && Game.multiplayer.uid) {
                    playerUid = Game.multiplayer.uid;
                }
                
                // 廣播傷害數字事件給所有隊員
                if (playerUid && typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                    window.SurvivalOnlineBroadcastEvent("damage_number", {
                        enemyId: this.id || null,
                        enemyX: this.x || 0,
                        enemyY: this.y || 0,
                        enemyHeight: this.height || 0,
                        damage: amount,
                        isCrit: isCrit,
                        playerUid: playerUid,
                        dirX: dirX,
                        dirY: dirY
                    });
                }
            }
        } catch (_) {}
        
        if (this.health <= 0) {
            this.health = 0;
            this.die();
        }
    }
    
    // 創建裁決技能的特效
    _createJudgmentHitEffect() {
        const viewport = document.getElementById('viewport');
        if (!viewport) return;
        let layer = document.getElementById('skill-effects-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'skill-effects-layer';
            layer.style.position = 'absolute';
            layer.style.left = '0';
            layer.style.top = '0';
            layer.style.width = '100%';
            layer.style.height = '100%';
            layer.style.pointerEvents = 'none';
            layer.style.zIndex = '7';
            viewport.appendChild(layer);
        }
        
        const hitImg = (Game && Game.images) ? Game.images['knife2'] : null;
        if (!hitImg) return;
        
        const el = document.createElement('img');
        el.src = hitImg.src + (hitImg.src.includes('?') ? '&' : '?') + 'cb=' + Date.now();
        el.style.position = 'absolute';
        el.style.width = '48px';
        el.style.height = '62px';
        el.style.transform = 'translate(-50%, -50%)';
        el.style.imageRendering = 'pixelated';
        el.style.pointerEvents = 'none';
        el.addEventListener('load', () => { el.style.visibility = 'visible'; }, { once: true });
        el.style.visibility = 'hidden';
        layer.appendChild(el);
        
        if (!this._judgmentEffects) this._judgmentEffects = [];
        this._judgmentEffects.push(el);
        
        // 更新位置
        const canvas = Game.canvas;
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width / canvas.width;
            const scaleY = rect.height / canvas.height;
            const camX = Game.camera ? Game.camera.x : 0;
            const camY = Game.camera ? Game.camera.y : 0;
            const sx = (this.x - camX) * scaleX;
            const sy = (this.y - camY) * scaleY;
            el.style.left = sx + 'px';
            el.style.top = sy + 'px';
        }
        
        // 480ms 後刪除（縮短時間，避免延續到死亡後）
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
            if (this._judgmentEffects) {
                const idx = this._judgmentEffects.indexOf(el);
                if (idx >= 0) this._judgmentEffects.splice(idx, 1);
            }
        }, 480);
    }
    
    // 清理所有 JUDGMENT 特效
    _clearJudgmentEffects() {
        if (this._judgmentEffects) {
            for (const el of this._judgmentEffects) {
                if (el && el.parentNode) el.parentNode.removeChild(el);
            }
            this._judgmentEffects = [];
        }
    }
    
    // 死亡
    die() {
        // 防重入：已在死亡流程中則不再觸發一次
        if (this.isDying) return;
        // 即刻停用受傷紅閃（避免淡出期間殘留紅色特效）
        this.hitFlashTime = 0;
        
        // 清理背景GIF（花護衛與花女王）
        if ((this.type === 'ELF_MINI_BOSS' || this.type === 'ELF_BOSS') && typeof window !== 'undefined' && window.GifOverlay) {
            try {
                const gifId = (this.type === 'ELF_MINI_BOSS') ? 'elf-mini-boss-bg' : 'elf-boss-bg';
                const uniqueId = gifId + '-' + (this._gifInstanceId || '');
                if (this._gifInstanceId) {
                    window.GifOverlay.hide(uniqueId);
                }
            } catch (_) {}
        }
        
        // 生成經驗寶石與獎勵等（維持事件順序與文字/數值不變）
        Game.spawnExperienceOrb(this.x, this.y, this.experienceValue);
        if (this.type === 'MINI_BOSS' || this.type === 'ELF_MINI_BOSS' || this.type === 'HUMAN_MINI_BOSS' ||
            this.type === 'BOSS' || this.type === 'ELF_BOSS' || this.type === 'HUMAN_BOSS') {
            Game.spawnChest(this.x, this.y);
        }
        if (typeof Game !== 'undefined' && typeof Game.addCoins === 'function') {
            let coinGain = 2;
            if (this.type === 'MINI_BOSS' || this.type === 'ELF_MINI_BOSS' || this.type === 'HUMAN_MINI_BOSS') coinGain = 50;
            else if (this.type === 'BOSS' || this.type === 'ELF_BOSS' || this.type === 'HUMAN_BOSS') coinGain = 500;
            Game.addCoins(coinGain);
        }
        if (this.type === 'BOSS' || this.type === 'ELF_BOSS' || this.type === 'HUMAN_BOSS') {
            // 第20波BOSS死亡時，生成出口而不是立即獲勝
            const currentWave = (typeof WaveSystem !== 'undefined' && WaveSystem.currentWave) ? WaveSystem.currentWave : 0;
            const bossWave = (typeof CONFIG !== 'undefined' && CONFIG.WAVES && CONFIG.WAVES.BOSS_WAVE) ? CONFIG.WAVES.BOSS_WAVE : 20;
            if (currentWave === bossWave) {
                // 在地圖中心生成出口
                Game.spawnExit();
            } else {
                // 非第20波（向後兼容），立即獲勝
                // ✅ MMORPG 架構：所有玩家都能廣播勝利事件，不依賴室長端
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
                    
                    if (isSurvivalMode && Game.multiplayer) {
                        if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                            window.SurvivalOnlineBroadcastEvent("game_victory", {
                                reason: "boss_killed"
                            });
                        }
                    }
                } catch (_) {}
                Game.victory();
            }
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
        // speedFactor：0~1（0=完全定住，1=不減速）
        // 注意：不可用 `speedFactor || 0.5`，因為 0 會被當成 falsy，導致無法做到 100% 緩速
        const raw = (typeof speedFactor === 'number') ? speedFactor : 0.5;
        const factor = Math.max(0, Math.min(1, raw));
        this.isSlowed = true;
        this.slowEndTime = Date.now() + (durationMs || 1000);
        this.speed = this.baseSpeed * factor;
    }
}
