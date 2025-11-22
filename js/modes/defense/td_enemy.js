/**
 * 防禦塔TD敵人系統
 * 
 * 文件說明：
 * - 管理敵人的生成、移動、戰鬥和掉落
 * - 包含TDEnemy類（單個敵人）和TDEnemyManager類（敵人管理器）
 * 
 * 維護指南：
 * 1. 敵人屬性調整：修改TD_CONFIG.ENEMIES中的配置
 *    - hp: 生命值
 *    - speed: 移動速度（像素/秒）
 *    - reward: 擊殺獎勵（消波塊）
 *    - size: 敵人尺寸（像素）
 * 
 * 2. 敵人移動邏輯：在move()方法中
 *    - 使用assignedPath進行路徑跟隨
 *    - 支持減速效果（slowEffect）
 *    - 到達主堡時觸發reachEnd()
 * 
 * 3. 敵人難度調整：在TDEnemyManager.spawnEnemy()中
 *    - 波次難度遞增：每波增加10%血量（最多300%）
 *    - 可調整hpMultiplier計算公式
 * 
 * 4. 敵人特效：在render()和renderSlowEffect()中
 *    - 減速效果：藍色光環和粒子
 *    - 受擊閃爍：hitFlashTime控制
 * 
 * 5. 添加新敵人類型：
 *    - 在TD_CONFIG.ENEMIES中添加配置
 *    - 確保sprite路徑正確
 *    - 可選：添加特殊能力（在update()中實現）
 */

class TDEnemy {
    constructor(type, x, y, path, config) {
        this.type = type;
        this.enemyConfig = config.ENEMIES[type]; // 敵人類型配置
        this.fullConfig = config; // 保存完整的TD_CONFIG以便訪問BASE等配置
        this.x = x;
        this.y = y;
        this.path = path;
        this.pathIndex = 0;
        
        // 基礎屬性
        this.maxHp = this.enemyConfig.hp;
        this.hp = this.maxHp;
        this.speed = this.enemyConfig.speed;
        this.baseSpeed = this.enemyConfig.speed;
        this.size = this.enemyConfig.size;
        this.reward = this.enemyConfig.reward;
        
        // 特殊屬性
        this.isBoss = type.includes('BOSS'); // BOSS類型
        this.assignedPath = null; // 分配的路徑
        
        // 狀態
        this.isAlive = true;
        this.isSlowed = false;
        this.slowEndTime = 0;
        this.slowEffect = 1.0;
        
        // 視覺效果
        this.sprite = null;
        this.animationTime = 0;
        this.hitFlashTime = 0;
        
        // 音效
        this.deathSound = 'enemy_death';
        
        this.loadSprite();
    }
    
    // 載入精靈圖
    loadSprite() {
        // 這裡使用現有的殭屍圖片作為佔位符
        // 實際遊戲中會根據敵人類型載入不同的圖片
        this.sprite = {
            src: this.enemyConfig.sprite,
            width: this.size,
            height: this.size
        };
        
        console.log(`敵人 ${this.type} 精靈載入:`, this.sprite.src);
    }
    
    // 更新敵人狀態
    update(deltaTime, currentTime) {
        if (!this.isAlive) return;
        
        // 更新減速效果
        if (this.isSlowed && currentTime > this.slowEndTime) {
            this.isSlowed = false;
            this.slowEffect = 1.0;
            this.speed = this.baseSpeed;
        }
        
        // 更新動畫
        this.animationTime += deltaTime;
        
        // 更新受擊閃爍
        if (this.hitFlashTime > 0) {
            this.hitFlashTime -= deltaTime;
        }
        
        // 移動（移動邏輯中已包含到達終點檢測）
        this.move(deltaTime);
    }
    
    // 移動邏輯
    /**
     * 敵人移動邏輯
     * 
     * 維護說明：
     * - 沿著分配的固定路徑移動
     * - 支持減速效果（冰凍塔）
     * - 持續檢查與主堡的距離，確保能正確觸發碰撞
     * - 如果路徑走完但未到達主堡，直接朝主堡移動
     * 
     * @param {number} deltaTime - 時間差（毫秒）
     */
    move(deltaTime) {
        // 使用分配的特定路徑，如果有的話
        const activePath = this.assignedPath ? this.assignedPath.path : this.path.path;
        
        // 檢查是否已經到達主堡（在移動過程中持續檢查，確保能正確觸發）
        const baseX = this.fullConfig.BASE.X;
        const baseY = this.fullConfig.BASE.Y;
        const distanceToBase = Math.sqrt(
            Math.pow(this.x - baseX, 2) + Math.pow(this.y - baseY, 2)
        );
        // 如果距離主堡足夠近（小於主堡尺寸的一半），立即觸發到達終點
        if (distanceToBase <= this.fullConfig.BASE.SIZE / 2) {
            this.reachEnd();
            return;
        }
        
        if (this.pathIndex >= activePath.length) {
            // 路徑已走完，但還沒到達主堡，直接朝主堡移動
            const dx = baseX - this.x;
            const dy = baseY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                const moveSpeed = this.speed * this.slowEffect;
                const moveDistance = moveSpeed * (deltaTime / 1000);
                
                if (distance <= moveDistance) {
                    this.x = baseX;
                    this.y = baseY;
                    this.reachEnd();
                } else {
                    this.x += (dx / distance) * moveDistance;
                    this.y += (dy / distance) * moveDistance;
                }
            }
            return;
        }
        
        const cellData = activePath[this.pathIndex];
        const targetCell = this.path.grid[cellData.row][cellData.col];
        if (!targetCell) {
            this.pathIndex++;
            return;
        }
        
        const targetX = targetCell.centerX;
        const targetY = targetCell.centerY;
        
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 5) {
            // 到達當前路徑點，移動到下一個
            this.pathIndex++;
        } else {
            // 向目標移動
            const moveSpeed = this.speed * this.slowEffect;
            const moveDistance = moveSpeed * (deltaTime / 1000);
            
            if (distance <= moveDistance) {
                this.x = targetX;
                this.y = targetY;
                this.pathIndex++;
            } else {
                this.x += (dx / distance) * moveDistance;
                this.y += (dy / distance) * moveDistance;
            }
        }
    }
    
    /**
     * 敵人受到傷害
     * 
     * 維護說明：
     * - 扣除生命值並觸發閃爍效果
     * - 生命值歸零時觸發死亡
     * - 可擴展：添加護甲、傷害減免等機制
     * 
     * @param {number} damage - 傷害值
     * @param {Object} source - 傷害來源（可選）
     * @returns {boolean} 是否死亡
     */
    takeDamage(damage, source = null) {
        if (!this.isAlive) return false;
        
        this.hp = Math.max(0, this.hp - damage);
        this.hitFlashTime = 200; // 200ms 閃爍效果
        
        if (this.hp <= 0) {
            this.die();
            return true; // 死亡
        }
        
        return false; // 未死亡
    }
    
    /**
     * 應用減速效果（冰凍塔）
     * 
     * 維護說明：
     * - effect: 減速係數（0.5 = 50%速度）
     * - duration: 持續時間（毫秒）
     * - 減速期間敵人會顯示藍色光環效果
     * 
     * @param {number} effect - 減速係數（0-1）
     * @param {number} duration - 持續時間（毫秒）
     * @param {number} currentTime - 當前時間戳
     */
    applySlow(effect, duration, currentTime) {
        this.isSlowed = true;
        this.slowEffect = effect;
        this.slowEndTime = currentTime + duration;
        this.speed = this.baseSpeed * effect;
    }
    
    // 到達終點
    reachEnd() {
        this.isAlive = false;
        // 通知遊戲主堡受到傷害
        if (this.onReachEnd) {
            this.onReachEnd(this);
        }
    }
    
    // 死亡
    die() {
        this.isAlive = false;
        
        // 播放死亡音效
        if (this.onDeath) {
            this.onDeath(this);
        }
        
        // 掉落獎勵
        if (this.onReward) {
            this.onReward(this.reward);
        }
        
        // 播放死亡音效
        if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound(TD_CONFIG.SOUNDS.ENEMY_DEATH);
        }
    }
    
    // 渲染敵人
    render(ctx, resources) {
        if (!this.isAlive) return;
        
        // 載入圖片 - 使用正確的資源鍵名
        const spriteKey = this.sprite.src.replace('assets/images/', '').replace('.png', '');
        const image = resources.getImage(spriteKey);
        
        if (!image) {
            // 如果圖片未載入，使用備用渲染
            this.renderFallback(ctx);
            return;
        }
        
        ctx.save();
        
        // 繪製敵人光環效果（根據類型）
        this.renderEnemyAura(ctx);
        
        // 受擊閃爍效果
        if (this.hitFlashTime > 0) {
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = 'white';
        }
        
        // 繪製減速藍色光環效果（在敵人圖像下方）
        if (this.isSlowed) {
            this.renderSlowEffect(ctx);
        }
        
        // 繪製敵人（如果被減速，添加藍色色調）
        if (this.isSlowed) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = 'rgba(100, 150, 255, 0.5)';
            ctx.fillRect(
                this.x - this.size / 2,
                this.y - this.size / 2,
                this.size,
                this.size
            );
            ctx.globalCompositeOperation = 'source-over';
        }
        
        ctx.drawImage(
            image,
            this.x - this.size / 2,
            this.y - this.size / 2,
            this.size,
            this.size
        );
        
        // 繪製血條
        this.renderHealthBar(ctx);
        
        // 繪製特殊狀態指示器
        if (this.isBoss) {
            this.renderBossIndicator(ctx);
        }
        
        ctx.restore();
    }
    
    // 備用渲染（當圖片未載入時）
    renderFallback(ctx) {
        ctx.save();
        
        // 繪製敵人光環效果
        this.renderEnemyAura(ctx);
        
        // 繪製基本形狀
        ctx.fillStyle = this.getEnemyColor();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // 繪製邊框
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 繪製血條
        this.renderHealthBar(ctx);
        
        // 繪製減速效果
        if (this.isSlowed) {
            this.renderSlowEffect(ctx);
        }
        
        // 繪製特殊狀態指示器
        if (this.isBoss) {
            this.renderBossIndicator(ctx);
        }
        
        ctx.restore();
    }
    
    // 根據敵人類型獲取顏色
    getEnemyColor() {
        const colors = {
            'ZOMBIE': '#8B4513',
            'FAST_ZOMBIE': '#FF6347',
            'TANK_ZOMBIE': '#696969',
            'BOSS_ZOMBIE': '#8B0000'
        };
        return colors[this.type] || '#8B4513';
    }
    
    // 渲染血條
    renderHealthBar(ctx) {
        const barWidth = this.size;
        const barHeight = 4;
        const barY = this.y - this.size / 2 - 8;
        
        // 背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);
        
        // 血量
        const healthPercent = this.hp / this.maxHp;
        let healthColor;
        if (healthPercent > 0.6) {
            healthColor = '#00ff00';
        } else if (healthPercent > 0.3) {
            healthColor = '#ffff00';
        } else {
            healthColor = '#ff0000';
        }
        
        ctx.fillStyle = healthColor;
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth * healthPercent, barHeight);
        
        // 邊框
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x - barWidth / 2, barY, barWidth, barHeight);
    }
    
    // 渲染減速效果（藍色持續光環）
    renderSlowEffect(ctx) {
        // 脈動藍色光環效果
        const pulseIntensity = 0.4 + 0.3 * Math.sin(Date.now() * 0.008);
        ctx.fillStyle = `rgba(100, 150, 255, ${pulseIntensity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2 + 8, 0, Math.PI * 2);
        ctx.fill();
        
        // 內層光環
        ctx.strokeStyle = `rgba(173, 216, 230, ${pulseIntensity * 0.8})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2 + 4, 0, Math.PI * 2);
        ctx.stroke();
        
        // 冰晶粒子效果（參考紳士綿羊但不直接使用）
        const particleCount = 6;
        for (let i = 0; i < particleCount; i++) {
            const angle = (Date.now() * 0.002 + (i * Math.PI * 2 / particleCount)) % (Math.PI * 2);
            const radius = this.size / 2 + 12;
            const px = this.x + Math.cos(angle) * radius;
            const py = this.y + Math.sin(angle) * radius;
            
            ctx.fillStyle = `rgba(173, 216, 230, ${0.6 + 0.4 * Math.sin(Date.now() * 0.01 + i)})`;
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // 渲染敵人光環效果
    renderEnemyAura(ctx) {
        if (!this.isBoss) return;
        
        const pulseIntensity = 0.2 + 0.3 * Math.sin(Date.now() * 0.003);
        ctx.strokeStyle = `rgba(255, 0, 0, ${pulseIntensity})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size + 8, 0, Math.PI * 2);
        ctx.stroke();
        
        // 內層光環
        ctx.strokeStyle = `rgba(255, 100, 0, ${pulseIntensity * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size + 12, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // 渲染Boss指示器
    renderBossIndicator(ctx) {
        ctx.fillStyle = '#FF0000';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS', this.x, this.y - this.size / 2 - 15);
    }
    
    // 獲取碰撞半徑
    getCollisionRadius() {
        return this.size / 2;
    }
    
    // 檢查是否與某點碰撞
    isCollidingWith(x, y, radius = 0) {
        const distance = Math.sqrt(
            Math.pow(this.x - x, 2) + Math.pow(this.y - y, 2)
        );
        return distance <= (this.getCollisionRadius() + radius);
    }
}

/**
 * 敵人管理器（TDEnemyManager）
 *
 * 維護說明：
 * - 依據 `TD_CONFIG.WAVES` 生成波次佇列，每個項目定義 `type / count / interval`
 *   ‣ 要調整波次數量或組成，只需修改 `td_config.js` 中的 WAVES 陣列
 * - `spawnEnemy()` 會從 `this.map.paths` 中挑路並套用 `hpMultiplier`（每波 +10%，上限 300%）
 *   ‣ 若要調整難度成長，可修改 `hpMultiplier` 計算式
 * - `enemy.assignedPath` 為單格寬路線；路線來自 `TDMap.generatePath`，若需要特殊地圖邏輯請改該檔
 * - 管理器透過 `onEnemyDeath / onEnemyReachEnd / onGoldReward` 對外回報事件，可在 TDGame 綁定統計或音效
 */
class TDEnemyManager {
    constructor(config, map, gameState) {
        this.config = config;
        this.map = map;
        this.gameState = gameState;
        this.enemies = [];
        this.spawnQueue = [];
        this.lastSpawnTime = 0;
        this._spawnedCountPerPath = [];
        
        // 綁定回調
        this.onEnemyDeath = null;
        this.onEnemyReachEnd = null;
        this.onGoldReward = null;
    }
    
    // 更新所有敵人
    update(deltaTime, currentTime) {
        // 暫停時不生成或更新敵人
        if (this.gameState && this.gameState.isPaused) {
            return;
        }
        
        // 生成新敵人
        this.spawnEnemies(currentTime);
        
        // 更新現有敵人
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(deltaTime, currentTime);
            
            if (!enemy.isAlive) {
                this.enemies.splice(i, 1);
                
                // 檢查波次是否完成
                this.checkWaveCompletion();
            }
        }
    }
    
    // 生成敵人
    spawnEnemies(currentTime) {
        if (!this.gameState.isWaveActive) return;
        // 準備時間內絕對不生成敵人：只在 wavePrepTimer <= 0（準備結束之後）才開始依時間軸生怪
        if (this.gameState.wavePrepTimer > 0) return;
        
        const spawnQueue = this.gameState.waveSpawnQueue;
        // 使用波次生成經過時間（毫秒），不直接依賴真實時間，確保暫停不會「補生」敵人
        const elapsed = this.gameState.waveSpawnElapsed || 0;
        // 根據預先排好的 spawnTime，在 0~10 秒內把整個隊列生完
        for (let i = spawnQueue.length - 1; i >= 0; i--) {
            const spawnData = spawnQueue[i];
            // 依據累積生成時間判斷是否應該生成（允許同一幀多隻，只要時間到了）
            if (!spawnData.spawned && elapsed >= spawnData.spawnTime) {
                this.spawnEnemy(spawnData.type, spawnData.pathIndex);
                spawnData.spawned = true;
                spawnQueue.splice(i, 1);
            }
        }
    }

    /**
     * 開始新的一波時呼叫，重置每條路徑的「已生成數量」，
     * 確保新波次的第一隻怪都從起點開始排隊，而不會延續前一波的偏移量。
     */
    startNewWave() {
        this._spawnedCountPerPath = [];
    }
    
    /**
     * 生成單個敵人
     *
     * 維護說明：
     * - 使用指定的路徑索引，確保敵人平均分配到4條路徑
     * - 血量成長：`hpMultiplier = 1 + waveIndex * 0.1`，上限 3.0
     *   ‣ 若要改變成長幅度或上限，調整此公式即可
     * - 可在此處插入額外屬性（護甲、掉落、特效）
     */
    spawnEnemy(type, pathIndex = null) {
        // 如果沒有指定路徑索引，則隨機選擇（向後兼容）
        if (pathIndex === null || pathIndex === undefined) {
            pathIndex = Math.floor(Math.random() * this.map.paths.length);
        } else {
            // 確保路徑索引在有效範圍內
            pathIndex = Math.max(0, Math.min(pathIndex, this.map.paths.length - 1));
        }
        
        const selectedPath = this.map.paths[pathIndex];
        const spawnPoint = this.map.grid[selectedPath.start.row][selectedPath.start.col];
        
        if (!spawnPoint) {
            console.error('無法找到敵人出生點');
            return;
        }
        
        // 創建敵人，使用選定的路徑（起點位置之後會根據隊伍索引沿路徑往前偏移，避免全部疊在一起）
        const enemy = new TDEnemy(type, spawnPoint.centerX, spawnPoint.centerY, this.map, this.config);
        
        // 應用波次難度遞增：每波增加10%血量（最多300%）
        const waveIndex = this.gameState.wave || 0;
        const hpMultiplier = Math.min(3.0, 1.0 + (waveIndex * 0.1));
        enemy.maxHp = Math.floor(enemy.maxHp * hpMultiplier);
        enemy.hp = enemy.maxHp;
        
        // 為敵人分配特定的路徑
        enemy.assignedPath = selectedPath;
        
        // 根據同一路徑已經生成的敵人數量，沿路徑向前偏移位置，避免全部疊在同一格
        if (!Array.isArray(this._spawnedCountPerPath)) {
            this._spawnedCountPerPath = [];
        }
        const indexOnPath = this._spawnedCountPerPath[pathIndex] || 0;
        this._spawnedCountPerPath[pathIndex] = indexOnPath + 1;
        
        const spacing = this.config.MAP.GRID_SIZE * 0.6; // 每隻之間約 0.6 格距離
        let remainingDist = indexOnPath * spacing;
        const pathCells = selectedPath.path;
        let posX = spawnPoint.centerX;
        let posY = spawnPoint.centerY;
        let pathStepIndex = 0;
        
        while (remainingDist > 0 && pathStepIndex < pathCells.length - 1) {
            const fromCell = pathCells[pathStepIndex];
            const toCell = pathCells[pathStepIndex + 1];
            const from = this.map.grid[fromCell.row][fromCell.col];
            const to = this.map.grid[toCell.row][toCell.col];
            const dx = to.centerX - from.centerX;
            const dy = to.centerY - from.centerY;
            const segLen = Math.sqrt(dx * dx + dy * dy) || 1;
            
            if (remainingDist >= segLen) {
                // 邁過整個格子，往下一個節點走
                remainingDist -= segLen;
                posX = to.centerX;
                posY = to.centerY;
                pathStepIndex++;
            } else {
                // 在當前格子中插值
                const t = remainingDist / segLen;
                posX = from.centerX + dx * t;
                posY = from.centerY + dy * t;
                remainingDist = 0;
            }
        }
        
        enemy.x = posX;
        enemy.y = posY;
        enemy.pathIndex = pathStepIndex;
        
        // 綁定回調
        enemy.onDeath = (enemy) => {
            this.gameState.enemiesKilled++;
            if (this.onEnemyDeath) {
                this.onEnemyDeath(enemy);
            }
            if (this.onGoldReward) {
                this.onGoldReward(enemy.reward);
            }
            
            // 每擊敗1隻敵人固定+5通用金幣（用於購買天賦系統）
            // 參考生存模式的實現方式
            try {
                if (typeof window !== 'undefined' && window.Game && typeof window.Game.addCoins === 'function') {
                    window.Game.addCoins(5);
                    // Game.addCoins 會自動觸發 COINS_CHANGED 事件並更新 UI
                    // 但為了確保即時更新，我們也直接調用 DefenseUI.updateCoins()
                    if (typeof window !== 'undefined' && window.DefenseUI && typeof window.DefenseUI.updateCoins === 'function') {
                        window.DefenseUI.updateCoins();
                    }
                } else if (typeof Game !== 'undefined' && typeof Game.addCoins === 'function') {
                    Game.addCoins(5);
                    if (typeof DefenseUI !== 'undefined' && typeof DefenseUI.updateCoins === 'function') {
                        DefenseUI.updateCoins();
                    }
                }
            } catch (e) {
                console.warn('增加通用金幣失敗:', e);
            }
        };
        
        enemy.onReachEnd = (enemy) => {
            console.log(`敵人到達終點: ${enemy.type}`);
            this.gameState.damageBase(1); // 每個敵人造成1點傷害
            if (this.onEnemyReachEnd) {
                this.onEnemyReachEnd(enemy);
            }
            
            // 播放敵人到達終點音效
            if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
                AudioManager.playSound(TD_CONFIG.SOUNDS.ENEMY_REACH_BASE);
            }
        };
        
        this.enemies.push(enemy);
        console.log(`敵人生成完成，當前敵人數量: ${this.enemies.length}`);
    }
    
    // 檢查波次是否完成
    checkWaveCompletion() {
        if (this.gameState.isWaveActive && 
            this.gameState.waveSpawnQueue.length === 0 && 
            this.enemies.length === 0) {
            this.gameState.completeWave();
        }
    }
    
    // 獲取範圍內的敵人
    getEnemiesInRange(x, y, range) {
        return this.enemies.filter(enemy => {
            const distance = Math.sqrt(
                Math.pow(enemy.x - x, 2) + Math.pow(enemy.y - y, 2)
            );
            return distance <= range;
        });
    }
    
    // 獲取最近的敵人
    getNearestEnemy(x, y, range = Infinity) {
        let nearest = null;
        let nearestDistance = range;
        
        this.enemies.forEach(enemy => {
            const distance = Math.sqrt(
                Math.pow(enemy.x - x, 2) + Math.pow(enemy.y - y, 2)
            );
            
            if (distance < nearestDistance) {
                nearest = enemy;
                nearestDistance = distance;
            }
        });
        
        return nearest;
    }
    
    // 渲染所有敵人
    render(ctx, resources) {
        this.enemies.forEach(enemy => {
            enemy.render(ctx, resources);
        });
    }
    
    // 清除所有敵人
    clear() {
        this.enemies = [];
        this.spawnQueue = [];
        this.lastSpawnTime = 0;
        this._spawnedCountPerPath = [];
    }
    
    // 獲取敵人數量
    getEnemyCount() {
        return this.enemies.length;
    }
}

// 導出類別
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TDEnemy, TDEnemyManager };
} else {
    window.TDEnemy = TDEnemy;
    window.TDEnemyManager = TDEnemyManager;
}
