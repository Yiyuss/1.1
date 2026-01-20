// 大波球技能系统
// 包含：冰弹投射物（抛物线轨迹）和地面冷冻特效

// 冰弹投射物类（抛物线轨迹，约1秒落地）
class IceBallProjectile extends Entity {
    constructor(startX, startY, targetX, targetY, flightTimeMs, weaponLevel, player, isFrenzyIceBall = false) {
        // 投射物大小
        const size = 32;
        super(startX, startY, size, size);
        
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.flightTimeMs = flightTimeMs || 1000; // 默认1秒
        this.elapsedTime = 0;
        this.weaponLevel = weaponLevel || 1;
        this.player = player;
        this.isFrenzyIceBall = isFrenzyIceBall; // 是否为狂熱大波
        
        // 计算抛物线参数
        const dx = targetX - startX;
        const dy = targetY - startY;
        const distance = Math.hypot(dx, dy);
        const totalTime = flightTimeMs / 1000;
        
        // 抛物线高度（根据距离调整）
        this.maxHeight = Math.max(80, distance * 0.3);
        
        // 存储目标位置和时间，用于精确计算
        this.totalTime = totalTime;
        
        this.weaponType = isFrenzyIceBall ? 'FRENZY_ICE_BALL' : 'BIG_ICE_BALL';
        this.imageKey = 'ICE3';
    }
    
    update(deltaTime) {
        // 僅視覺大冰球：不進行傷害計算
        if (this._isVisualOnly) {
            // 只更新位置，不創建地面特效
            this.elapsedTime += deltaTime;
            const t = this.elapsedTime / 1000;
            
            if (t >= this.totalTime) {
                // 到達目標位置，標記為刪除（不創建地面特效）
                this.x = this.targetX;
                this.y = this.targetY;
                this.markedForDeletion = true;
                return;
            }
            
            // 計算當前位置（拋物線軌跡）
            const progress = t / this.totalTime;
            this.x = this.startX + (this.targetX - this.startX) * progress;
            this.y = this.startY + (this.targetY - this.startY) * progress + this.maxHeight * 4 * progress * (1 - progress);
            return;
        }
        
        this.elapsedTime += deltaTime;
        const t = this.elapsedTime / 1000; // 转换为秒
        
        if (t >= this.totalTime) {
            // 到达目标位置，使用实际落地位置创建地面特效
            // 确保精确落在目标位置
            this.x = this.targetX;
            this.y = this.targetY;
            this.land();
            this.destroy();
            return;
        }
        
        // 计算当前位置（抛物线轨迹）
        // 使用归一化进度 [0, 1]
        const progress = t / this.totalTime;
        
        // 水平位置：线性插值确保精确到达目标
        this.x = this.startX + (this.targetX - this.startX) * progress;
        
        // 垂直位置：抛物线轨迹
        // 使用二次贝塞尔曲线确保在 progress=1 时精确到达 targetY
        // y = startY + (targetY - startY) * progress + maxHeight * 4 * progress * (1 - progress)
        // 当 progress=0 时，y = startY
        // 当 progress=1 时，y = startY + (targetY - startY) + 0 = targetY ✓
        // 当 progress=0.5 时，y = startY + (targetY - startY) * 0.5 + maxHeight = 中点 + maxHeight（最高点）
        this.y = this.startY + (this.targetY - this.startY) * progress + this.maxHeight * 4 * progress * (1 - progress);
    }
    
    land() {
        // 创建地面冷冻特效，使用实际落地位置（this.x, this.y）
        if (typeof Game !== 'undefined' && typeof IceFieldEffect !== 'undefined') {
            let radius;
            let cfg;
            if (this.isFrenzyIceBall) {
                // 狂熱大波：使用固定范围（大波球LV10的156px）
                cfg = (CONFIG && CONFIG.WEAPONS && CONFIG.WEAPONS.FRENZY_ICE_BALL) || {};
                radius = cfg.FIELD_RADIUS || 156;
            } else {
                // 大波球：根据等级计算范围
                cfg = (CONFIG && CONFIG.WEAPONS && CONFIG.WEAPONS.BIG_ICE_BALL) || {};
                const baseRadius = cfg.FIELD_RADIUS_BASE || 78;
                const perLevel = cfg.FIELD_RADIUS_PER_LEVEL || 8.67;
                radius = baseRadius + perLevel * (this.weaponLevel - 1);
            }
            
            // 计算最终伤害（包含天赋加成）
            let damage = cfg.DAMAGE || 2;
            if (this.player && this.player.weapons) {
                const weaponType = this.isFrenzyIceBall ? 'FRENZY_ICE_BALL' : 'BIG_ICE_BALL';
                const weapon = this.player.weapons.find(w => w.type === weaponType);
                if (weapon && typeof weapon._computeFinalDamage === 'function') {
                    const levelMul = (typeof DamageSystem !== 'undefined')
                        ? DamageSystem.levelMultiplier(this.weaponLevel)
                        : (1 + 0.05 * Math.max(0, this.weaponLevel - 1));
                    damage = weapon._computeFinalDamage(levelMul);
                }
            }
            
            // 使用实际落地位置，而不是目标位置
            const field = new IceFieldEffect(
                this.x,
                this.y,
                radius,
                damage,
                cfg.FIELD_DURATION || 3000,
                this.player
            );
            Game.addProjectile(field);
            
            // 播放结冰音效（地面特效出现时）
            if (typeof AudioManager !== 'undefined' && typeof AudioManager.playSound === 'function') {
                AudioManager.playSound('ice2');
            }
        }
    }
    
    draw(ctx) {
        const imgObj = (Game.images && Game.images[this.imageKey]) ? Game.images[this.imageKey] : null;
        if (imgObj) {
            ctx.save();
            ctx.translate(this.x, this.y);
            // 根据飞行时间旋转（可选）
            const rotation = (this.elapsedTime / this.flightTimeMs) * Math.PI * 2;
            ctx.rotate(rotation);
            ctx.drawImage(imgObj, -this.width / 2, -this.height / 2, this.width, this.height);
            ctx.restore();
        } else {
            // 后备：绘制蓝色圆形
            ctx.save();
            ctx.fillStyle = '#4a9eff';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}

// 地面冷冻特效类（持续3秒，蓝色特效，缓速+持续伤害）
class IceFieldEffect extends Entity {
    constructor(x, y, radius, damage, durationMs, player) {
        super(x, y, radius * 2, radius * 2);
        this.radius = radius;
        this.damage = damage;
        this.durationMs = durationMs || 3000;
        this.startTime = Date.now();
        this.player = player;
        this.weaponType = 'BIG_ICE_BALL';
        
        // 伤害间隔（与守护领域相同）
        const cfg = (CONFIG && CONFIG.WEAPONS && CONFIG.WEAPONS.BIG_ICE_BALL) || {};
        this.tickIntervalMs = cfg.TICK_INTERVAL_MS || 120;
        this.tickDamage = Math.max(1, Math.round(this.damage));
        this.tickAccumulator = 0;
        
        // 缓速效果配置
        this.slowFactor = cfg.SLOW_FACTOR || 0.5;
        this.slowDurationMs = cfg.SLOW_DURATION_MS || 1000;
        
        // 碰撞半径
        this.collisionRadius = radius;
        
        // 已缓速的敌人记录（避免重复应用）
        this.slowedEnemies = new Set();
    }
    
    update(deltaTime) {
        // 检查是否过期
        if (Date.now() - this.startTime >= this.durationMs) {
            this.destroy();
            return;
        }
        
        // 僅視覺效果：不進行傷害計算
        if (this._isVisualOnly) {
            // 只更新視覺效果，不進行傷害計算
            return;
        }
        
        // 持续伤害（与守护领域相同的间隔）
        this.tickAccumulator += deltaTime;
        while (this.tickAccumulator >= this.tickIntervalMs) {
            for (const enemy of Game.enemies) {
                if (this.isColliding(enemy)) {
                    // 应用缓速效果（如果还没有应用，或者缓速效果已过期）
                    if (typeof enemy.applySlow === 'function') {
                        const needsSlow = !this.slowedEnemies.has(enemy.id) || 
                                        (enemy.isSlowed && Date.now() > enemy.slowEndTime);
                        if (needsSlow) {
                            enemy.applySlow(this.slowDurationMs, this.slowFactor);
                            this.slowedEnemies.add(enemy.id);
                        }
                    }
                    
                    // 造成持续伤害（可吃到天赋加成）
                    let finalDamage = this.tickDamage;
                    let isCrit = false;
                    let lifestealAmount = 0;
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(
                            this.tickDamage,
                            enemy,
                            {
                                weaponType: this.weaponType,
                                critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0)
                            }
                        );
                        finalDamage = result.amount;
                        isCrit = result.isCrit;
                        lifestealAmount = (typeof result.lifestealAmount === 'number') ? result.lifestealAmount : 0;
                    }
                    
                    // ✅ 權威伺服器模式：持續效果傷害由 game.js 自動發送 aoe_tick 到伺服器
                    // 單機模式：直接造成傷害並顯示傷害數字
                    // 多人模式：不調用 takeDamage（避免雙重傷害），傷害由伺服器 hitEvents 處理
                    const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
                    let isSurvivalMode = false;
                    try {
                        const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                            ? GameModeManager.getCurrent()
                            : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                                ? ModeManager.getActiveModeId()
                                : null);
                        isSurvivalMode = (activeId === 'survival' || activeId === null);
                    } catch (_) {}
                    
                    // 單機模式：直接造成傷害並顯示傷害數字
                    if (!isSurvivalMode || !isMultiplayer) {
                        enemy.takeDamage(finalDamage);
                        if (typeof DamageNumbers !== 'undefined') {
                            DamageNumbers.show(
                                finalDamage,
                                enemy.x,
                                enemy.y - (enemy.height || 0) / 2,
                                isCrit,
                                {
                                    dirX: (enemy.x - this.x),
                                    dirY: (enemy.y - this.y),
                                    enemyId: enemy.id
                                }
                            );
                        }
                    }
                    // 多人模式：傷害由 game.js 自動發送 aoe_tick 到伺服器，伺服器透過 hitEvents 返回傷害數字
                    // 減速效果由伺服器權威處理，客戶端只顯示視覺效果
                }
            }
            this.tickAccumulator -= this.tickIntervalMs;
        }
        
        // 清理已离开区域的敌人记录
        for (const enemyId of this.slowedEnemies) {
            const enemy = Game.enemies.find(e => e && e.id === enemyId);
            if (!enemy || !this.isColliding(enemy)) {
                this.slowedEnemies.delete(enemyId);
            }
        }
    }
    
    draw(ctx) {
        // 绘制蓝色冷冻特效（增强美术效果）
        ctx.save();
        const progress = (Date.now() - this.startTime) / this.durationMs;
        const alpha = 0.7 * (1 - progress * 0.2); // 逐渐淡出，但保持更长时间可见
        const time = Date.now() * 0.001; // 用于动画
        
        // 外圈（蓝色光晕，带脉动效果）
        const pulse = 1 + Math.sin(time * 2) * 0.1;
        ctx.globalAlpha = alpha * 0.5 * pulse;
        const gradient1 = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        gradient1.addColorStop(0, 'rgba(74, 158, 255, 0.3)');
        gradient1.addColorStop(0.5, 'rgba(74, 158, 255, 0.2)');
        gradient1.addColorStop(1, 'rgba(74, 158, 255, 0)');
        ctx.fillStyle = gradient1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2);
        ctx.fill();
        
        // 中圈（更亮的蓝色，带旋转效果）
        ctx.globalAlpha = alpha * 0.8;
        const gradient2 = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 0.8);
        gradient2.addColorStop(0, 'rgba(107, 179, 255, 0.6)');
        gradient2.addColorStop(0.6, 'rgba(107, 179, 255, 0.3)');
        gradient2.addColorStop(1, 'rgba(107, 179, 255, 0)');
        ctx.fillStyle = gradient2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        
        // 内圈（最亮的蓝色核心）
        ctx.globalAlpha = alpha;
        const gradient3 = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 0.5);
        gradient3.addColorStop(0, 'rgba(143, 199, 255, 0.9)');
        gradient3.addColorStop(0.7, 'rgba(143, 199, 255, 0.4)');
        gradient3.addColorStop(1, 'rgba(143, 199, 255, 0)');
        ctx.fillStyle = gradient3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        
        // 冰晶粒子效果（围绕边缘旋转）
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = '#b3d9ff';
        ctx.lineWidth = 3;
        const particleCount = 12;
        for (let i = 0; i < particleCount; i++) {
            const angle = (time * 0.5 + (i / particleCount) * Math.PI * 2) % (Math.PI * 2);
            const px = this.x + Math.cos(angle) * this.radius;
            const py = this.y + Math.sin(angle) * this.radius;
            ctx.beginPath();
            ctx.arc(px, py, 3 + Math.sin(time * 3 + i) * 1, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(179, 217, 255, 0.8)';
            ctx.fill();
        }
        
        // 边缘光晕（多层，带闪烁效果）
        ctx.strokeStyle = `rgba(179, 217, 255, ${alpha * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // 内层边缘
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        
        // 中心亮点（闪烁）
        const centerPulse = 0.7 + Math.sin(time * 4) * 0.3;
        ctx.globalAlpha = alpha * centerPulse;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4 * centerPulse, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
    
    destroy() {
        this.markedForDeletion = true;
        this.slowedEnemies.clear();
    }
}

// 导出到全局
window.IceBallProjectile = IceBallProjectile;
window.IceFieldEffect = IceFieldEffect;

