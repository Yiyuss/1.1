// 投射物類
class Projectile extends Entity {
    constructor(x, y, angle, weaponType, damage, speed, size) {
        super(x, y, size, size);
        this.angle = angle;
        this.weaponType = weaponType;
        this.damage = damage;
        this.speed = speed;
        this.distance = 0;
        this.maxDistance = 1000; // 最大飛行距離
        // 追蹤屬性（僅閃電使用）
        this.homing = false;
        this.turnRatePerSec = 0; // 每秒最大轉向弧度（rad/s）
    }
    
    update(deltaTime) {
        // 僅視覺投射物：不更新邏輯，只更新位置（用於隊員端顯示隊長和其他隊員的投射物）
        if (this._isVisualOnly) {
            // 簡單的位置更新（不進行碰撞檢測和傷害計算）
            const deltaMul = deltaTime / 16.67;
            if (this.homing && this.assignedTargetId) {
                // 追蹤型投射物：尋找目標敵人
                const target = Game.enemies.find(e => e && e.id === this.assignedTargetId && !e.markedForDeletion);
                if (target) {
                    const dx = target.x - this.x;
                    const dy = target.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 0) {
                        const targetAngle = Math.atan2(dy, dx);
                        const turnRate = (this.turnRatePerSec || 0) * (deltaTime / 1000);
                        let angleDiff = targetAngle - this.angle;
                        // 正規化角度差到 [-π, π]
                        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                        const turn = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnRate);
                        this.angle += turn;
                    }
                }
            }
            // 移動
            this.x += Math.cos(this.angle) * this.speed * deltaMul;
            this.y += Math.sin(this.angle) * this.speed * deltaMul;
            // 邊界檢查（超出邊界後標記為刪除）
            if (this.x < -100 || this.x > (Game.worldWidth || 1920) + 100 || 
                this.y < -100 || this.y > (Game.worldHeight || 1080) + 100) {
                this.markedForDeletion = true;
            }
            return; // 僅視覺投射物不進行碰撞檢測和傷害計算
        }
        
        // 閃電追蹤：優先追蹤分配的唯一目標，避免全部鎖定同一敵人
        if (this.homing && Game.enemies && Game.enemies.length) {
            let target = null;
            if (this.assignedTargetId) {
                target = Game.enemies.find(e => e.id === this.assignedTargetId) || null;
            }
            // 若分配目標不存在，退回最近敵人
            if (!target) {
                let minDist = Infinity;
                for (const enemy of Game.enemies) {
                    const d = Utils.distance(this.x, this.y, enemy.x, enemy.y);
                    if (d < minDist) { minDist = d; target = enemy; }
                }
            }
            if (target) {
                const desired = Utils.angle(this.x, this.y, target.x, target.y);
                let delta = desired - this.angle;
                // 將角度差規範化到 [-PI, PI]
                if (delta > Math.PI) delta -= Math.PI * 2;
                if (delta < -Math.PI) delta += Math.PI * 2;
                const maxTurn = (this.turnRatePerSec || 0) * (deltaTime / 1000);
                // 限制每幀最大轉向量
                if (delta > maxTurn) delta = maxTurn;
                if (delta < -maxTurn) delta = -maxTurn;
                this.angle += delta;
            }
        }

        // 移動投射物（先檢查障礙物阻擋）
        const deltaMul = deltaTime / 16.67;
        const dx = Math.cos(this.angle) * this.speed * deltaMul;
        const dy = Math.sin(this.angle) * this.speed * deltaMul;
        const candX = this.x + dx;
        const candY = this.y + dy;

        // 與障礙物相交則銷毀投射物
        for (const obs of Game.obstacles || []) {
            if (Utils.circleRectCollision(candX, candY, this.collisionRadius, obs.x, obs.y, obs.width, obs.height)) {
                this.destroy();
                return;
            }
        }

        // 套用位移
        this.x = candX;
        this.y = candY;
        
        // 計算已飛行距離
        this.distance += Math.sqrt(dx * dx + dy * dy);
        
        // 檢查是否超出最大飛行距離
        if (this.distance >= this.maxDistance) {
            this.destroy();
            return;
        }
        
        // 檢查是否超出世界範圍
        if (Utils.isOutOfWorldBounds(this.x, this.y, (Game.worldWidth || Game.canvas.width), (Game.worldHeight || Game.canvas.height))) {
            this.destroy();
            return;
        }
        
        // 檢查與敵人的碰撞
        for (const enemy of Game.enemies) {
            if (this.isColliding(enemy)) {
                // 使用 DamageSystem 計算浮動與爆擊；若不可用則維持原邏輯
                let finalDamage = this.damage;
                let isCrit = false;
                if (typeof DamageSystem !== 'undefined') {
                    // 維護：加入爆擊加成（基礎10% + 天賦加成），不改畫面文字
                    const result = DamageSystem.computeHit(
                        this.damage,
                        enemy,
                        { weaponType: this.weaponType, critChanceBonusPct: (this.critChanceBonusPct || 0) }
                    );
                    finalDamage = result.amount;
                    isCrit = result.isCrit;
                }
                
                // 組隊模式：隊員的投射物攻擊敵人時，同步傷害到隊長端
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
                    
                    // 只有隊員（客戶端）才需要同步傷害到隊長端
                    if (isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.role === "guest" && enemy && enemy.id) {
                        // 發送傷害事件到隊長端（包含玩家UID）
                        if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
                            window.SurvivalOnlineRuntime.sendToNet({
                                t: "enemy_damage",
                                enemyId: enemy.id,
                                damage: finalDamage,
                                weaponType: this.weaponType || "UNKNOWN",
                                isCrit: isCrit,
                                playerUid: (Game.multiplayer && Game.multiplayer.uid) ? Game.multiplayer.uid : null
                            });
                        }
                    }
                } catch (_) {}
                
                // 確定傷害來源的 playerUid（用於隊長端廣播傷害數字）
                let playerUid = null;
                let dirX = Math.cos(this.angle);
                let dirY = Math.sin(this.angle);
                if (this.player) {
                    // 如果是本地玩家的投射物
                    if (this.player === Game.player && Game.multiplayer && Game.multiplayer.uid) {
                        playerUid = Game.multiplayer.uid;
                    }
                    // 如果是遠程玩家的投射物
                    else if (this.player._isRemotePlayer && this.player._remoteUid) {
                        playerUid = this.player._remoteUid;
                    }
                }
                
                // 調用 enemy.takeDamage，傳遞傷害來源信息（用於隊長端廣播傷害數字）
                enemy.takeDamage(finalDamage, {
                    weaponType: this.weaponType,
                    playerUid: playerUid,
                    isCrit: isCrit,
                    dirX: dirX,
                    dirY: dirY
                });
                if (typeof DamageNumbers !== 'undefined') {
                    // 顯示層：傳入 enemyId 用於每敵人節流（僅影響顯示密度）
                    DamageNumbers.show(
                      finalDamage,
                      enemy.x,
                      enemy.y - (enemy.height||0)/2,
                      isCrit,
                      { dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), enemyId: enemy.id }
                    );
                }
                // 紳士綿羊（FIREBALL）命中未被消滅的敵人時施加暫時減速（使用設定值）
                if (this.weaponType === 'FIREBALL' && enemy.health > 0 && typeof enemy.applySlow === 'function') {
                    const cfg = (CONFIG && CONFIG.WEAPONS && CONFIG.WEAPONS.FIREBALL) || {};
                    const slowMs = (typeof cfg.SLOW_DURATION_MS === 'number') ? cfg.SLOW_DURATION_MS : 1000;
                    const slowFactor = (typeof cfg.SLOW_FACTOR === 'number') ? cfg.SLOW_FACTOR : 0.5;
                    enemy.applySlow(slowMs, slowFactor);
                }

                // 紳士綿羊（FIREBALL）命中時觸發小範圍擴散傷害（不爆擊）
                if (this.weaponType === 'FIREBALL' && typeof Game !== 'undefined' && Array.isArray(Game.enemies)) {
                    try {
                        const cfg = (CONFIG && CONFIG.WEAPONS && CONFIG.WEAPONS.FIREBALL) || {};
                        const mul = (typeof cfg.SPLASH_RADIUS_MULTIPLIER === 'number') ? cfg.SPLASH_RADIUS_MULTIPLIER : 2.6;
                        const minR = (typeof cfg.SPLASH_MIN_RADIUS === 'number') ? cfg.SPLASH_MIN_RADIUS : 34;
                        const splashRadius = Math.max(minR, (this.collisionRadius || 12) * mul);
                        for (const e of Game.enemies) {
                            if (!e || e.id === enemy.id) continue;
                            const dist = Utils.distance(enemy.x, enemy.y, e.x, e.y);
                            if (dist <= splashRadius) {
                                const splashBase = (this.damage || 0) * 0.6;
                                const splash = (typeof DamageSystem !== 'undefined')
                                    ? DamageSystem.computeHit(splashBase, e, { weaponType: this.weaponType, allowCrit: false })
                                    : { amount: splashBase, isCrit: false };
                                e.takeDamage(splash.amount);
                                if (typeof e.applySlow === 'function') {
                                    const slowMs = (typeof cfg.SLOW_DURATION_MS === 'number') ? cfg.SLOW_DURATION_MS : 1000;
                                    const slowFactor = (typeof cfg.SLOW_FACTOR === 'number') ? cfg.SLOW_FACTOR : 0.5;
                                    e.applySlow(slowMs, slowFactor);
                                }
                                if (typeof DamageNumbers !== 'undefined') {
                                    const dirX = (e.x - enemy.x) || 1;
                                    const dirY = (e.y - enemy.y) || 0;
                                    const mag = Math.hypot(dirX, dirY) || 1;
                                    DamageNumbers.show(
                                        splash.amount,
                                        e.x,
                                        e.y - (e.height||0)/2,
                                        false,
                                        { dirX: dirX/mag, dirY: dirY/mag, enemyId: e.id }
                                    );
                                }
                            }
                        }
                    } catch (_) {}
                }

                // 維護註解：追蹤綿羊（LIGHTNING）命中時的爆炸特效與音效
                // 依賴與安全性：
                // - 使用 Game.explosionParticles 現有更新/繪製管線，不新增新型別。
                // - 僅添加視覺粒子與播放 bo.mp3，不更動任何傷害/冷卻/數量等數值。
                // - 若 AudioManager 不存在，靜默跳過；若 explosionParticles 未初始化，按既有格式建立。
                if (this.weaponType === 'LIGHTNING' || this.weaponType === 'MUFFIN_THROW' || this.weaponType === 'HEART_TRANSMISSION' || this.weaponType === 'BAGUETTE_THROW') {
                    try {
                        const particleCount = 18; // 更顯眼，性能仍安全
                        for (let i = 0; i < particleCount; i++) {
                            const ang = Math.random() * Math.PI * 2;
                            const speed = 2 + Math.random() * 4;
                            const p = {
                                x: enemy.x,
                                y: enemy.y,
                                vx: Math.cos(ang) * speed,
                                vy: Math.sin(ang) * speed,
                                life: 520 + Math.random() * 280,
                                maxLife: 520 + Math.random() * 280,
                                size: 5 + Math.random() * 3,
                                color: '#ffffff' // 維護：追蹤綿羊/鬆餅投擲/心意傳遞命中爆炸粒子改為白色（純視覺，不影響數值與機制）
                            };
                            // 用於繪製階段提高不透明度與尺寸
                            if (this.weaponType === 'LIGHTNING') {
                                p.source = 'LIGHTNING';
                            } else if (this.weaponType === 'MUFFIN_THROW') {
                                p.source = 'MUFFIN_THROW';
                            } else if (this.weaponType === 'HEART_TRANSMISSION') {
                                p.source = 'HEART_TRANSMISSION';
                            } else if (this.weaponType === 'BAGUETTE_THROW') {
                                p.source = 'BAGUETTE_THROW';
                            }
                            if (!Game.explosionParticles) Game.explosionParticles = [];
                            Game.explosionParticles.push(p);
                        }
                        // 心意傳遞命中時顯示效果圖片（A36.png，310x290比例）
                        if (this.weaponType === 'HEART_TRANSMISSION') {
                            const cfg = (CONFIG && CONFIG.WEAPONS && CONFIG.WEAPONS.HEART_TRANSMISSION) || {};
                            const effectWidth = cfg.EFFECT_IMAGE_WIDTH || 310;
                            const effectHeight = cfg.EFFECT_IMAGE_HEIGHT || 290;
                            const effectDuration = 300; // 效果持續300毫秒
                            if (!Game.heartTransmissionEffects) Game.heartTransmissionEffects = [];
                            Game.heartTransmissionEffects.push({
                                x: enemy.x,
                                y: enemy.y,
                                width: effectWidth,
                                height: effectHeight,
                                life: effectDuration,
                                maxLife: effectDuration
                            });
                        }
                        if (typeof AudioManager !== 'undefined') {
                            AudioManager.playSound('bo');
                        }
                    } catch (_) {}
                }
                this.destroy();
                break;
            }
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        // 優先使用圖片繪製（1:1比例）
        let imageName = null;
        switch(this.weaponType) {
            case 'DAGGER':
                imageName = 'dagger';
                break;
            case 'FIREBALL':
                imageName = 'fireball';
                break;
            case 'LIGHTNING':
                imageName = 'lightning';
                break;
            case 'BAGUETTE_THROW':
                imageName = 'A43';
                break;
            case 'MUFFIN_THROW':
                imageName = 'muffin2';
                break;
            case 'HEART_TRANSMISSION':
                imageName = 'A36';
                break;
        }
        
        if (imageName && Game.images && Game.images[imageName]) {
            const size = Math.max(this.width, this.height);
            if (this.weaponType === 'BAGUETTE_THROW') {
                // 法棍投擲投射物（A43.png，100x74）：保持寬高比，並以「最大邊=size」繪製
                const img = Game.images[imageName];
                const iw = img.naturalWidth || img.width || 100;
                const ih = img.naturalHeight || img.height || 74;
                const aspect = iw / ih;
                const renderW = size;
                const renderH = Math.max(1, Math.floor(size / Math.max(0.01, aspect))); // 以寬為基準縮放高度
                ctx.drawImage(img, this.x - renderW / 2, this.y - renderH / 2, renderW, renderH);
            } else {
                ctx.drawImage(Game.images[imageName], this.x - size / 2, this.y - size / 2, size, size);
            }
        } else {
            // 備用：使用純色圓形
            let color = '#fff';
            if (this.weaponType === 'FIREBALL') color = '#f50';
            if (this.weaponType === 'LIGHTNING') color = '#0ff';
            if (this.weaponType === 'BAGUETTE_THROW') color = '#0ff'; // 與追蹤綿羊相同的備用顏色
            if (this.weaponType === 'MUFFIN_THROW') color = '#0ff'; // 與追蹤綿羊相同的備用顏色
            if (this.weaponType === 'HEART_TRANSMISSION') color = '#0ff'; // 與追蹤綿羊相同的備用顏色
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 繪製尾跡效果（避免蓋在圖片上：LIGHTNING/法棍投擲/紳士綿羊(FIREBALL)/應援棒(DAGGER)/鬆餅投擲(MUFFIN_THROW)/心意傳遞(HEART_TRANSMISSION)不畫尾跡）
        const shouldDrawTail = !(
            this.weaponType === 'LIGHTNING' ||
            this.weaponType === 'BAGUETTE_THROW' ||
            this.weaponType === 'FIREBALL' ||
            this.weaponType === 'DAGGER' ||
            this.weaponType === 'MUFFIN_THROW' ||
            this.weaponType === 'HEART_TRANSMISSION'
        );
        if (shouldDrawTail) {
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(this.x - Math.cos(this.angle) * 10, this.y - Math.sin(this.angle) * 10, this.width / 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}
