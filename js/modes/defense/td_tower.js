/**
 * 防禦塔TD防禦塔系統
 * 
 * 文件說明：
 * - 管理防禦塔的建造、升級、攻擊邏輯
 * - 包含TDTower類（單個防禦塔）、TDProjectile類（彈藥）、TDTowerManager類（防禦塔管理器）
 * 
 * 維護指南：
 * 1. 防禦塔屬性調整：修改TD_CONFIG.TOWERS中的配置
 *    - cost: 建造成本（消波塊）
 *    - buildTime: 建造時間（秒）
 *    - damage: 基礎傷害
 *    - range: 攻擊範圍（像素）
 *    - fireRate: 射擊頻率（毫秒，越小射越快）
 *    - projectileSpeed: 子彈速度（像素/秒）
 *    - projectileType: 子彈類型（'arrow'|'magic'|'ice'）
 *    - upgrades: 升級配置陣列
 * 
 * 2. 添加新防禦塔類型：
 *    - 在TD_CONFIG.TOWERS中添加配置
 *    - 在getShootSoundByType()中添加音效映射
 *    - 在TDProjectile.render()中添加子彈渲染（或使用現有類型）
 *    - 在TDEnhancedUI.initButtons()中添加建造按鈕
 * 
 * 3. 子彈特效調整：
 *    - renderArrow(): 狙擊塔箭矢（金色，帶方向）
 *    - renderMagic(): 元素塔魔法彈（橙色/紫色，粒子效果）
 *    - renderIce(): 冰凍塔冰彈（藍色，冰晶粒子）
 *    - 所有特效都禁止跨污染，獨立實現
 * 
 * 4. 攻擊邏輯調整：
 *    - findTarget(): 目標選擇策略（nearest/strongest/weakest/fastest）
 *    - fire(): 發射子彈，使用預測性追蹤提高命中率
 *    - TDProjectile.update(): 子彈移動和碰撞檢測
 * 
 * 5. 升級系統：
 *    - upgrades陣列定義每級升級效果
 *    - upgrade()方法應用升級屬性
 *    - 升級需要時間（buildTime * 0.5）
 * 
 * 6. 命中率優化：
 *    - 使用預測性追蹤（預測目標未來位置）
 *    - 子彈在200像素內會輕微轉向追蹤
 *    - 增大碰撞半徑（collisionRadius = 8）
 */

class TDTower {
    constructor(type, x, y, config) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.config = config.TOWERS[type];
        
        // 基礎屬性
        this.level = 0;
        this.damage = this.config.damage;
        this.range = this.config.range;
        this.fireRate = this.config.fireRate;
        this.lastFireTime = 0;
        
        // 建造狀態
        this.isBuilding = true;
        this.buildStartTime = Date.now();
        this.buildEndTime = this.buildStartTime + (this.config.buildTime * 1000);
        
        // 目標
        this.target = null;
        this.targetPriority = 'nearest'; // nearest, strongest, weakest, fastest
        
        // 視覺效果
        this.sprite = null;
        this.levelIndicator = 0;
        
        // 音效
        this.shootSound = this.getShootSoundByType(type);
        
        this.loadSprite();
    }
    
    // 根據塔類型獲取對應的射擊音效
    getShootSoundByType(type) {
        const soundMap = {
            'ARROW': TD_CONFIG.SOUNDS.ARROW_SHOOT,
            'MAGIC': TD_CONFIG.SOUNDS.MAGIC_SHOOT,
            'SLOW': TD_CONFIG.SOUNDS.ICE_SHOOT, // 冰凍塔使用ICE音效
            'ICE': TD_CONFIG.SOUNDS.ICE_SHOOT
        };
        return soundMap[type] || 'button_click2';
    }
    
    // 載入精靈圖
    loadSprite() {
        this.sprite = {
            src: this.config.sprite,
            width: 32,
            height: 32
        };
        // 狙擊塔（洛可洛斯特）圖片放大，並維持原圖比例 267x300
        if (this.type === 'ARROW') {
            const targetHeight = 64;
            const aspect = 267 / 300;
            this.sprite.height = targetHeight;
            this.sprite.width = Math.round(targetHeight * aspect);
        }
    }
    
    // 更新防禦塔
    update(currentTime, enemyManager) {
        // 檢查建造狀態
        if (this.isBuilding) {
            if (currentTime >= this.buildEndTime) {
                this.isBuilding = false;
            }
            return; // 建造中不能攻擊
        }
        
        // 尋找目標
        this.findTarget(enemyManager);
        
        // 攻擊
        if (this.target && currentTime >= this.lastFireTime + this.fireRate) {
            this.fire(currentTime);
        }
    }
    
    // 尋找目標
    findTarget(enemyManager) {
        const enemies = enemyManager.getEnemiesInRange(this.x, this.y, this.range);
        
        if (enemies.length === 0) {
            this.target = null;
            return;
        }
        
        switch (this.targetPriority) {
            case 'nearest':
                this.target = enemyManager.getNearestEnemy(this.x, this.y, this.range);
                break;
            case 'strongest':
                this.target = enemies.reduce((strongest, enemy) => 
                    enemy.maxHp > strongest.maxHp ? enemy : strongest
                );
                break;
            case 'weakest':
                this.target = enemies.reduce((weakest, enemy) => 
                    enemy.hp < weakest.hp ? enemy : weakest
                );
                break;
            case 'fastest':
                this.target = enemies.reduce((fastest, enemy) => 
                    enemy.speed > fastest.speed ? enemy : fastest
                );
                break;
            default:
                this.target = enemyManager.getNearestEnemy(this.x, this.y, this.range);
        }
        
        // 檢查目標是否仍在範圍內
        if (this.target) {
            const distance = Math.sqrt(
                Math.pow(this.target.x - this.x, 2) + 
                Math.pow(this.target.y - this.y, 2)
            );
            if (distance > this.range) {
                this.target = null;
            }
        }
    }
    
    /**
     * 防禦塔開火
     * 
     * 維護說明：
     * - 使用預測性追蹤提高命中率
     * - 考慮目標移動速度和減速效果
     * - 創建TDProjectile子彈並添加到管理器
     * - 支持特殊效果（濺射、減速等）
     * 
     * @param {number} currentTime - 當前時間戳
     */
    fire(currentTime) {
        if (!this.target || !this.target.isAlive) return;
        
        // 預測目標位置（考慮目標移動速度，提高命中率）
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const timeToTarget = distance / this.config.projectileSpeed;
        
        // 預測目標未來位置（基於當前速度）
        const predictedX = this.target.x + (this.target.speed * this.target.slowEffect * (dx / distance) * timeToTarget * 0.001);
        const predictedY = this.target.y + (this.target.speed * this.target.slowEffect * (dy / distance) * timeToTarget * 0.001);
        
        // 創建彈藥（使用預測位置）
        const projectile = new TDProjectile(
            this.x,
            this.y,
            predictedX,
            predictedY,
            this.damage,
            this.config.projectileSpeed,
            this.config.projectileType,
            this.config,
            this.target // 傳遞目標以便追蹤
        );
        
        // 特殊效果
        if (this.config.splashRadius) {
            projectile.splashRadius = this.config.splashRadius;
        }
        if (this.config.slowEffect) {
            projectile.slowEffect = this.config.slowEffect;
            projectile.slowDuration = this.config.slowDuration;
        }
        
        // 發射彈藥
        if (this.onFire) {
            this.onFire(projectile);
        }
        
        // 播放射擊音效
        if (this.onPlaySound) {
            this.onPlaySound(this.shootSound);
        } else if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound(this.shootSound);
        }
        
        this.lastFireTime = currentTime;
    }
    
    // 升級
    upgrade() {
        if (this.level >= this.config.upgrades.length) return false;
        
        const upgrade = this.config.upgrades[this.level];
        this.level++;
        
        // 應用升級屬性
        if (upgrade.damage !== undefined) this.damage = upgrade.damage;
        if (upgrade.range !== undefined) this.range = upgrade.range;
        if (upgrade.fireRate !== undefined) this.fireRate = upgrade.fireRate;
        if (upgrade.splashRadius !== undefined) this.config.splashRadius = upgrade.splashRadius;
        if (upgrade.slowEffect !== undefined) this.config.slowEffect = upgrade.slowEffect;
        if (upgrade.slowDuration !== undefined) this.config.slowDuration = upgrade.slowDuration;
        
        // 進入建造狀態（升級需要時間）
        this.isBuilding = true;
        this.buildStartTime = Date.now();
        this.buildEndTime = this.buildStartTime + (this.config.buildTime * 1000 * 0.5); // 升級時間減半
        
        return true;
    }
    
    // 獲取升級成本
    getUpgradeCost() {
        if (this.level >= this.config.upgrades.length) return 0;
        return this.config.upgrades[this.level].cost;
    }
    
    // 獲取出售價格
    getSellPrice() {
        const totalCost = this.config.cost + 
            this.config.upgrades.slice(0, this.level).reduce((sum, upgrade) => sum + upgrade.cost, 0);
        return Math.floor(totalCost * 0.7); // 70% 回收
    }
    
    // 渲染防禦塔
    render(ctx, resources) {
        // 根據 sprite 路徑推導資源鍵（支援 .png/.gif）
        const baseName = this.sprite.src
            .replace('assets/images/', '')
            .replace(/\.(png|gif)$/i, '');
        const image =
            resources.getImage(baseName) ||
            resources.getImage(baseName + '.gif') ||
            resources.getImage(baseName + '.png');
        if (!image) {
            // 後備渲染：使用簡單的矩形表示塔，避免完全不可見
            ctx.save();
            ctx.fillStyle = 'rgba(200, 200, 255, 0.8)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(
                this.x - this.sprite.width / 2,
                this.y - this.sprite.height / 2,
                this.sprite.width,
                this.sprite.height
            );
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            return;
        }
        
        ctx.save();
        
        // 建造中的透明度效果
        if (this.isBuilding) {
            const buildProgress = (Date.now() - this.buildStartTime) / (this.buildEndTime - this.buildStartTime);
            ctx.globalAlpha = 0.3 + (buildProgress * 0.7);
        }
        
        // 繪製防禦塔光環效果
        if (!this.isBuilding && this.level > 0) {
            this.renderTowerAura(ctx);
        }
        
        // 繪製防禦塔
        // 瑪格麗特（SLOW）與森森鈴蘭（MAGIC）本體改由 GIF 透過 TDGifOverlay 顯示，
        // 這裡不再畫靜態塔身，避免與 GIF 疊成兩層。
        if (this.type !== 'SLOW' && this.type !== 'MAGIC') {
            ctx.drawImage(
                image,
                this.x - this.sprite.width / 2,
                this.y - this.sprite.height / 2,
                this.sprite.width,
                this.sprite.height
            );
        }
        
        // 繪製射程範圍（調試用）
        if (this.showRange) {
            this.renderRange(ctx);
        }
        
        // 繪製等級指示器
        if (this.level > 0) {
            this.renderLevelIndicator(ctx);
        }
        
        // 繪製建造進度
        if (this.isBuilding) {
            this.renderBuildProgress(ctx);
        }
        
        ctx.restore();
    }
    
    // 渲染射程範圍
    renderRange(ctx) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // 渲染防禦塔光環效果
    renderTowerAura(ctx) {
        const auraColor = this.getAuraColorByType();
        const pulseIntensity = 0.3 + 0.2 * Math.sin(Date.now() * 0.005);
        
        ctx.strokeStyle = auraColor.replace('rgba', 'rgba').replace(')', `, ${pulseIntensity})`);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.config.size * 0.8, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // 根據塔類型獲取光環顏色
    getAuraColorByType() {
        const colorMap = {
            'ARROW': 'rgba(255, 215, 0)', // 金色
            'MAGIC': 'rgba(147, 0, 211)',  // 紫色
            'SLOW': 'rgba(0, 191, 255)'    // 深天藍
        };
        return colorMap[this.type] || 'rgba(255, 255, 255)';
    }
    
    // 渲染等級指示器
    renderLevelIndicator(ctx) {
        ctx.fillStyle = '#FFD700';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Lv.${this.level}`, this.x, this.y - 20);
    }
    
    // 渲染建造進度
    renderBuildProgress(ctx) {
        const buildProgress = (Date.now() - this.buildStartTime) / (this.buildEndTime - this.buildStartTime);
        const barWidth = 30;
        const barHeight = 4;
        // 建造進度條放在塔（或 GIF 本體）正下方一點，避免被圖片擋住
        const barY = this.y + 40;
        
        // 背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth, barHeight);
        
        // 進度
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(this.x - barWidth / 2, barY, barWidth * buildProgress, barHeight);
        
        // 邊框
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x - barWidth / 2, barY, barWidth, barHeight);
    }
}

/**
 * 彈藥類（TDProjectile）
 * 
 * 維護說明：
 * - 管理子彈的移動、碰撞和特效
 * - 支持預測性追蹤和輕微轉向
 * - 碰撞檢測使用子彈半徑+敵人半徑
 * - 支持濺射傷害和減速效果
 * 
 * 子彈類型：
 * - 'arrow': 狙擊塔箭矢（金色，三角形）
 * - 'magic': 元素塔魔法彈（橙色/紫色，粒子）
 * - 'ice': 冰凍塔冰彈（藍色，冰晶粒子）
 * 
 * 調整參數：
 * - collisionRadius: 碰撞半徑（預設8，可調整提高/降低命中率）
 * - 追蹤距離：200像素內會轉向（可在update()中調整）
 * - 轉向速率：0.15（可在update()中調整）
 */
class TDProjectile {
    constructor(startX, startY, targetX, targetY, damage, speed, type, config, targetEnemy = null) {
        this.x = startX;
        this.y = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.damage = damage;
        this.speed = speed;
        this.type = type;
        this.config = config;
        this.targetEnemy = targetEnemy; // 目標敵人（用於追蹤）
        
        // 計算移動方向
        const dx = targetX - startX;
        const dy = targetY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        this.vx = (dx / distance) * speed;
        this.vy = (dy / distance) * speed;
        
        // 特效
        this.splashRadius = 0;
        this.slowEffect = 0;
        this.slowDuration = 0;
        
        // 狀態
        this.isActive = true;
        this.hasHit = false;
        this.collisionRadius = 8; // 增大碰撞半徑，提高命中率
    }
    
    // 更新彈藥
    update(deltaTime, enemies, currentTime) {
        if (!this.isActive || this.hasHit) return;
        
        // 如果目標敵人存在且存活，進行輕微追蹤（提高命中率）
        if (this.targetEnemy && this.targetEnemy.isAlive) {
            const dx = this.targetEnemy.x - this.x;
            const dy = this.targetEnemy.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 如果距離很近，直接朝目標移動（追蹤模式）
            if (distance < 200) {
                const turnRate = 0.15; // 轉向速率
                const targetAngle = Math.atan2(dy, dx);
                const currentAngle = Math.atan2(this.vy, this.vx);
                let angleDiff = targetAngle - currentAngle;
                
                // 標準化角度差
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                
                // 應用轉向
                const newAngle = currentAngle + angleDiff * turnRate;
                this.vx = Math.cos(newAngle) * this.speed;
                this.vy = Math.sin(newAngle) * this.speed;
            }
        }
        
        // 移動
        this.x += this.vx * (deltaTime / 1000);
        this.y += this.vy * (deltaTime / 1000);
        
        // 檢查是否擊中目標
        const hitEnemy = this.checkHit(enemies);
        if (hitEnemy) {
            this.hit(hitEnemy, enemies, currentTime);
            this.hasHit = true;
            this.isActive = false;
        }
        
        // 檢查是否超出範圍
        if (this.isOutOfBounds()) {
            this.isActive = false;
        }
    }
    
    // 檢查碰撞（使用更大的碰撞半徑提高命中率）
    checkHit(enemies) {
        for (const enemy of enemies) {
            if (!enemy.isAlive) continue;
            
            const distance = Math.sqrt(
                Math.pow(enemy.x - this.x, 2) + 
                Math.pow(enemy.y - this.y, 2)
            );
            
            // 使用子彈碰撞半徑 + 敵人碰撞半徑，提高命中率
            const totalRadius = this.collisionRadius + enemy.getCollisionRadius();
            if (distance <= totalRadius) {
                return enemy;
            }
        }
        return null;
    }
    
    // 擊中效果
    hit(mainTarget, allEnemies, currentTime) {
        // 套用主體天賦的傷害加成與爆擊率（DamageSystem + TalentSystem）
        function computeTalentScaledDamage(baseDamage, enemy) {
            let dmg = baseDamage;
            let critBonusPct = 0;
            try {
                if (typeof TalentSystem !== 'undefined' && TalentSystem.getTalentLevel && TalentSystem.tieredTalents) {
                    // 傷害強化（百分比）
                    // 改為加算：將倍率轉換為加成百分比，以便未來多個來源可以相加
                    const dmgBoostLv = TalentSystem.getTalentLevel('damage_boost') || 0;
                    if (dmgBoostLv > 0 && TalentSystem.tieredTalents.damage_boost) {
                        const eff = TalentSystem.tieredTalents.damage_boost.levels[dmgBoostLv - 1];
                        if (eff && eff.multiplier) {
                            // 將倍率轉換為加成百分比（例如 2.0 → +100%）
                            const damageBoost = eff.multiplier - 1.0;
                            dmg = dmg * (1.0 + damageBoost);
                        }
                    }
                    // 傷害特化（固定值）
                    const dmgSpecLv = TalentSystem.getTalentLevel('damage_specialization') || 0;
                    if (dmgSpecLv > 0 && TalentSystem.tieredTalents.damage_specialization) {
                        const eff = TalentSystem.tieredTalents.damage_specialization.levels[dmgSpecLv - 1];
                        if (eff && eff.flat) {
                            dmg += eff.flat;
                        }
                    }
                    // 爆擊率加成
                    const critLv = TalentSystem.getTalentLevel('crit_enhance') || 0;
                    if (critLv > 0 && TalentSystem.tieredTalents.crit_enhance) {
                        const eff = TalentSystem.tieredTalents.crit_enhance.levels[critLv - 1];
                        if (eff && eff.chancePct) {
                            critBonusPct = eff.chancePct;
                        }
                    }
                }
            } catch (_) {}

            if (typeof DamageSystem !== 'undefined' && DamageSystem.computeHit) {
                const result = DamageSystem.computeHit(dmg, enemy, {
                    weaponType: 'TOWER_ATTACK',
                    critChanceBonusPct: critBonusPct
                });
                return { amount: result.amount, isCrit: result.isCrit };
            }
            return { amount: dmg, isCrit: false };
        }

        // 獲取相機對象（用於傷害數字座標轉換）
        let camera = null;
        try {
            if (typeof window !== 'undefined' && window.debugTDGame) {
                camera = window.debugTDGame.camera;
            }
        } catch (_) {}

        if (this.splashRadius > 0) {
            // 濺射傷害（森森鈴蘭 - MAGIC塔）
            allEnemies.forEach(enemy => {
                if (!enemy.isAlive) return;
                
                const distance = Math.sqrt(
                    Math.pow(enemy.x - this.x, 2) + 
                    Math.pow(enemy.y - this.y, 2)
                );
                
                if (distance <= this.splashRadius) {
                    const damageMultiplier = Math.max(0.3, 1 - (distance / this.splashRadius));
                    const base = this.damage * damageMultiplier;
                    const result = computeTalentScaledDamage(base, enemy);
                    const finalDamage = result.amount;
                    const isCrit = result.isCrit;
                    
                    // 計算攻擊方向（從子彈位置指向敵人）
                    const dirX = enemy.x - this.x;
                    const dirY = enemy.y - this.y;
                    
                    // 對敵人造成傷害（傳遞傷害來源信息）
                    enemy.takeDamage(finalDamage, {
                        weaponType: 'TOWER_ATTACK',
                        dirX,
                        dirY,
                        camera,
                        isCrit,
                        finalDamage: finalDamage  // 傳遞已計算的傷害值
                    });
                    
                    // 減速效果
                    if (this.slowEffect > 0) {
                        enemy.applySlow(this.slowEffect, this.slowDuration, currentTime);
                    }
                }
            });
        } else {
            // 單體傷害（洛可洛斯特 - ARROW塔，或瑪格麗特 - SLOW塔）
            const result = computeTalentScaledDamage(this.damage, mainTarget);
            const finalDamage = result.amount;
            const isCrit = result.isCrit;
            
            // 計算攻擊方向（從子彈位置指向目標）
            const dirX = mainTarget.x - this.x;
            const dirY = mainTarget.y - this.y;
            
            // 對目標造成傷害（傳遞傷害來源信息）
            mainTarget.takeDamage(finalDamage, {
                weaponType: 'TOWER_ATTACK',
                dirX,
                dirY,
                camera,
                isCrit,
                finalDamage: finalDamage  // 傳遞已計算的傷害值
            });
            
            // 減速效果
            if (this.slowEffect > 0) {
                mainTarget.applySlow(this.slowEffect, this.slowDuration, currentTime);
            }
        }
    }
    
    // 檢查是否超出範圍 - 使用正確的世界尺寸
    isOutOfBounds() {
        if (typeof TD_CONFIG !== 'undefined') {
            return this.x < -100 || this.x > TD_CONFIG.MAP.WIDTH + 100 || 
                   this.y < -100 || this.y > TD_CONFIG.MAP.HEIGHT + 100;
        }
        return this.x < -100 || this.x > 3840 + 100 || this.y < -100 || this.y > 2160 + 100;
    }
    
    // 渲染彈藥
    render(ctx, resources) {
        if (!this.isActive || this.hasHit) return;
        
        ctx.save();
        
        // 根據類型繪製不同的彈藥
        switch (this.type) {
            case 'arrow':
                this.renderArrow(ctx);
                break;
            case 'magic':
                this.renderMagic(ctx);
                break;
            case 'ice':
                this.renderIce(ctx);
                break;
            default:
                this.renderDefault(ctx);
        }
        
        ctx.restore();
    }
    
    /**
     * 渲染狙擊塔箭矢（美化版）
     * 
     * 維護說明：
     * - 狙擊塔使用金色箭矢，帶有尾跡效果
     * - 箭矢有方向性，指向目標
     * - 添加光暈和粒子效果提升視覺效果
     */
    renderArrow(ctx) {
        const size = 8;
        const time = Date.now() * 0.015;
        
        // 計算箭矢方向（基於移動方向）
        let angle = 0;
        if (this.vx !== 0 || this.vy !== 0) {
            angle = Math.atan2(this.vy, this.vx);
        }
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        
        // 箭矢主體（金色漸變）
        const gradient = ctx.createLinearGradient(-size, 0, size, 0);
        gradient.addColorStop(0, 'rgba(255, 215, 0, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 223, 0, 1)');
        gradient.addColorStop(1, 'rgba(184, 134, 11, 0.9)');
        ctx.fillStyle = gradient;
        
        // 繪製箭矢形狀（三角形）
        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size * 0.6, -size * 0.4);
        ctx.lineTo(-size * 0.3, 0);
        ctx.lineTo(-size * 0.6, size * 0.4);
        ctx.closePath();
        ctx.fill();
        
        // 箭矢尾跡（動態效果）
        ctx.strokeStyle = `rgba(255, 215, 0, ${0.5 + 0.3 * Math.sin(time)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-size * 0.8, 0);
        ctx.lineTo(-size * 1.5, 0);
        ctx.stroke();
        
        // 光暈效果
        ctx.fillStyle = `rgba(255, 215, 0, ${0.2 + 0.1 * Math.sin(time * 2)})`;
        ctx.beginPath();
        ctx.arc(0, 0, size + 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    /**
     * 渲染元素塔魔法彈（美化版）
     * 
     * 維護說明：
     * - 元素塔使用紫色/橙色魔法球，帶有元素粒子效果
     * - 魔法球有脈動和旋轉效果
     * - 添加多層光暈和能量波紋
     */
    renderMagic(ctx) {
        const size = 12;
        const time = Date.now() * 0.01;
        
        // 主體：橙色/紫色魔法球（漸變）
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, size);
        gradient.addColorStop(0, 'rgba(255, 140, 0, 1)');
        gradient.addColorStop(0.4, 'rgba(255, 69, 0, 0.9)');
        gradient.addColorStop(0.7, 'rgba(147, 0, 211, 0.7)');
        gradient.addColorStop(1, 'rgba(75, 0, 130, 0.3)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
        ctx.fill();
        
        // 外層光暈（脈動效果）
        const pulseSize = size + 4 + 2 * Math.sin(time * 2);
        ctx.fillStyle = `rgba(255, 69, 0, ${0.3 + 0.2 * Math.sin(time)})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, pulseSize, 0, Math.PI * 2);
        ctx.fill();
        
        // 元素粒子效果（8個旋轉的粒子）
        const particleCount = 8;
        for (let i = 0; i < particleCount; i++) {
            const angle = (time * 3 + (i * Math.PI * 2 / particleCount)) % (Math.PI * 2);
            const radius = size + 8;
            const px = this.x + Math.cos(angle) * radius;
            const py = this.y + Math.sin(angle) * radius;
            
            // 粒子顏色在橙色和紫色之間變化
            const colorMix = (Math.sin(time + i) + 1) / 2;
            const r = Math.floor(255 * (1 - colorMix) + 147 * colorMix);
            const g = Math.floor(140 * (1 - colorMix));
            const b = Math.floor(0 * (1 - colorMix) + 211 * colorMix);
            
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.7 + 0.3 * Math.sin(time * 2 + i)})`;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 中心亮點
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // 能量波紋（外層）
        ctx.strokeStyle = `rgba(255, 140, 0, ${0.4 + 0.2 * Math.sin(time * 1.5)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, size + 10, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // 渲染冰彈（參考紳士綿羊特效但不直接使用）
    renderIce(ctx) {
        const size = 14; // 冰彈大小
        const time = Date.now() * 0.01;
        
        // 主體：藍色光球
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, size);
        gradient.addColorStop(0, 'rgba(173, 216, 230, 0.9)');
        gradient.addColorStop(0.5, 'rgba(100, 150, 255, 0.7)');
        gradient.addColorStop(1, 'rgba(70, 130, 180, 0.3)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
        ctx.fill();
        
        // 外層光暈
        ctx.fillStyle = `rgba(173, 216, 230, ${0.3 + 0.2 * Math.sin(time)})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, size + 4, 0, Math.PI * 2);
        ctx.fill();
        
        // 冰晶粒子效果（6個旋轉的粒子）
        const particleCount = 6;
        for (let i = 0; i < particleCount; i++) {
            const angle = (time * 2 + (i * Math.PI * 2 / particleCount)) % (Math.PI * 2);
            const radius = size + 6;
            const px = this.x + Math.cos(angle) * radius;
            const py = this.y + Math.sin(angle) * radius;
            
            ctx.fillStyle = `rgba(255, 255, 255, ${0.8 + 0.2 * Math.sin(time * 2 + i)})`;
            ctx.beginPath();
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 中心亮點
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 默認渲染
    renderDefault(ctx) {
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * 防禦塔管理器（TDTowerManager）
 *
 * 維護說明：
 * - 管理所有塔與子彈的生命週期
 * - 建造成本、射程、升級數值全部來自 `TD_CONFIG.TOWERS`
 *   ‣ 若要新增防禦塔：先在 `TD_CONFIG.TOWERS` 建立新條目，再擴充 UI/建造按鈕
 *   ‣ 若要調整價格或射程，只需改 `TD_CONFIG.TOWERS.<TYPE>`，不必改此檔
 * - `buildTower()` 會檢查地圖可建造格、金錢並負責扣款；若失敗會自動退費
 * - `update()` 會逐塔更新並推進所有飛行彈藥；若要更改射擊節奏，請至 `TDTower.fire` 或 `TDProjectile`
 * - 可透過 `onTowerBuilt`/`onTowerUpgraded`/`onTowerSold` 注入統計或音效
 */
class TDTowerManager {
    constructor(config, map, gameState) {
        this.config = config;
        this.map = map;
        this.gameState = gameState;
        this.towers = [];
        this.projectiles = [];
        
        // 回調
        this.onTowerBuilt = null;
        this.onTowerUpgraded = null;
        this.onTowerSold = null;
        this.onPlaySound = null;
    }
    
    // 更新所有防禦塔
    update(currentTime, enemyManager) {
        // 更新防禦塔
        this.towers.forEach(tower => {
            tower.update(currentTime, enemyManager);
        });
        
        // 更新彈藥
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            projectile.update(16, enemyManager.enemies, currentTime); // 假設16ms幀時間
            
            if (!projectile.isActive) {
                this.projectiles.splice(i, 1);
            }
        }
    }
    
    // 建造防禦塔
    buildTower(type, x, y) {
        try { console.log('建造請求', { type, x, y }); } catch(_) {}
        // 檢查是否可以建造
        if (!this.map.canBuildAt(x, y)) {
            try {
                const cell = this.map.getNearestCell(x, y);
                console.warn('建造失敗：位置不可建造', { x, y, cell });
            } catch(_) {}
            return null;
        }
        
        // 檢查資金
        const cost = this.config.TOWERS[type].cost;
        if (this.gameState.gold < cost) {
            try { console.warn('建造失敗：金幣不足', { gold: this.gameState.gold, cost }); } catch(_) {}
            return null;
        }
        // 在此階段扣除金幣，避免重複扣款
        if (!this.gameState.spendGold(cost)) {
            try { console.warn('建造失敗：扣款未成功'); } catch(_) {}
            return null;
        }
        
        // 創建防禦塔
        const tower = new TDTower(type, x, y, this.config);
        
        // 放置在地圖上
        const cell = this.map.placeTower(x, y, tower);
        if (!cell) {
            this.gameState.addGold(cost); // 退還金幣
            try { console.warn('建造失敗：placeTower 返回空'); } catch(_) {}
            return null;
        }
        
        // 綁定回調
        tower.onFire = (projectile) => {
            this.projectiles.push(projectile);
        };
        
        tower.onPlaySound = (sound) => {
            if (this.onPlaySound) {
                this.onPlaySound(sound);
            }
        };
        
        this.towers.push(tower);
        try { console.log('建造成功', { type, x, y, cost }); } catch(_) {}
        this.gameState.towersBuilt++;
        
        // 播放建造音效
        if (this.onPlaySound) {
            this.onPlaySound(TD_CONFIG.SOUNDS.TOWER_BUILD);
        } else if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound(TD_CONFIG.SOUNDS.TOWER_BUILD);
        }
        
        if (this.onTowerBuilt) {
            this.onTowerBuilt(tower);
        }
        
        return tower;
    }
    
    // 升級防禦塔
    upgradeTower(tower) {
        const cost = tower.getUpgradeCost();
        if (cost === 0) return false; // 已達到最高等級
        
        if (!this.gameState.spendGold(cost)) {
            return false; // 資金不足
        }
        
        const success = tower.upgrade();
        if (!success) {
            this.gameState.addGold(cost); // 退還金幣
            return false;
        }
        
        // 播放升級音效
        if (this.onPlaySound) {
            this.onPlaySound(TD_CONFIG.SOUNDS.TOWER_UPGRADE);
        } else if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound(TD_CONFIG.SOUNDS.TOWER_UPGRADE);
        }
        
        if (this.onTowerUpgraded) {
            this.onTowerUpgraded(tower);
        }
        
        return true;
    }
    
    // 出售防禦塔
    sellTower(tower) {
        const sellPrice = tower.getSellPrice();
        
        // 從地圖上移除
        const removedTower = this.map.removeTower(tower.x, tower.y);
        if (!removedTower) return false;
        
        // 從管理器中移除
        const index = this.towers.indexOf(tower);
        if (index > -1) {
            this.towers.splice(index, 1);
        }
        
        // 返還金幣
        this.gameState.addGold(sellPrice);
        
        // 播放出售音效
        if (this.onPlaySound) {
            this.onPlaySound(TD_CONFIG.SOUNDS.TOWER_SELL);
        } else if (typeof AudioManager !== 'undefined' && AudioManager.playSound) {
            AudioManager.playSound(TD_CONFIG.SOUNDS.TOWER_SELL);
        }
        
        if (this.onTowerSold) {
            this.onTowerSold(tower, sellPrice);
        }
        
        return true;
    }
    
    // 獲取指定位置的防禦塔
    getTowerAt(x, y) {
        const cell = this.map.getNearestCell(x, y);
        return cell && cell.tower ? cell.tower : null;
    }
    
    // 渲染所有防禦塔和彈藥
    render(ctx, resources) {
        // 渲染防禦塔
        this.towers.forEach(tower => {
            tower.render(ctx, resources);
        });
        
        // 渲染彈藥
        this.projectiles.forEach(projectile => {
            projectile.render(ctx, resources);
        });
    }
    
    // 清除所有防禦塔
    clear() {
        this.towers = [];
        this.projectiles = [];
    }
    
    // 獲取防禦塔數量
    getTowerCount() {
        return this.towers.length;
    }
}

// 導出類別
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TDTower, TDTowerManager };
} else {
    window.TDTower = TDTower;
    window.TDTowerManager = TDTowerManager;
}
