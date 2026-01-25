// 投射物類
class Projectile extends Entity {
    constructor(x, y, angle, weaponType, damage, speed, size) {
        super(x, y, size, size);
        this.angle = angle;
        this.weaponType = weaponType;
        this.damage = damage;
        this.speed = speed;
        this.size = size; // ✅ 修復：明確設置 size 屬性，確保組隊模式下能正確同步體積
        this.distance = 0;
        this.maxDistance = 1000; // 最大飛行距離
        // ✅ 修復：設置碰撞半徑（用於碰撞檢測和擴散傷害計算）
        this.collisionRadius = size / 2; // 碰撞半徑等於尺寸的一半
        // 追蹤屬性（僅閃電使用）
        this.homing = false;
        this.turnRatePerSec = 0; // 每秒最大轉向弧度（rad/s）
    }
    
    update(deltaTime) {
        // ✅ 權威伺服器模式：多人進行中時
        // - 由伺服器下發的投射物會在建立時就被標記為 _isVisualOnly（survival_online.js）
        // - 不要在這裡對所有 Projectile 一刀切改成 visualOnly，否則會誤傷某些本地特效/技能本體
        //   造成「攻擊不出/技能失效」這種致命問題。

        // 僅視覺投射物：不更新邏輯，只更新位置（用於隊員端顯示隊長和其他隊員的投射物）
        if (this._isVisualOnly) {
            // 網路插值：如果有伺服器目標位置，優先平滑追幀（避免瞬移）
            try {
                if (typeof this._netTargetX === 'number' && typeof this._netTargetY === 'number') {
                    const dx = this._netTargetX - this.x;
                    const dy = this._netTargetY - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 220) {
                        this.x = this._netTargetX;
                        this.y = this._netTargetY;
                    } else if (dist > 0.1) {
                        const lerp = Math.min(0.45, Math.max(0.2, (deltaTime || 16.67) / 80));
                        this.x += dx * lerp;
                        this.y += dy * lerp;
                    }
                }
            } catch (_) { }

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
        
        // ✅ 权威服务器：视觉投射物不计算伤害（伤害由服务器计算）
        if (this._isVisualOnly) {
            // 视觉投射物只检查碰撞用于显示效果，不计算伤害
            return;
        }
        
        // 檢查與敵人的碰撞
        for (const enemy of Game.enemies) {
            if (this.isColliding(enemy)) {
                // ✅ 權威伺服器模式：投射物傷害由伺服器權威處理
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
                
                // 多人模式下，伤害由服务器计算，客户端只显示视觉效果
                // 投射物会被服务器移除，这里只标记为视觉投射物
                // ✅ 修復：在標記為 _isVisualOnly 之前，先播放BO音效（如果是本地玩家的投射物）
                // 參考雷射在組隊模式下的音效實現方式（weapon.js Line 546）：使用 this.player && !this.player._isRemotePlayer
                if (isSurvivalMode && isMultiplayer) {
                    // 與單機模式一致：只有 LIGHTNING、MUFFIN_THROW、HEART_TRANSMISSION、BAGUETTE_THROW 命中敵人才會播放 bo 音效
                    if ((this.weaponType === 'LIGHTNING' || this.weaponType === 'MUFFIN_THROW' || 
                         this.weaponType === 'HEART_TRANSMISSION' || this.weaponType === 'BAGUETTE_THROW') &&
                        this.player && !this.player._isRemotePlayer && typeof AudioManager !== 'undefined') {
                        AudioManager.playSound('bo');
                    }
                    this._isVisualOnly = true;
                    continue;
                }
                
                // 使用 DamageSystem 計算浮動與爆擊；若不可用則維持原邏輯
                let finalDamage = this.damage;
                let isCrit = false;
                let lifestealAmount = 0;
                if (typeof DamageSystem !== 'undefined') {
                    // 維護：加入爆擊加成（基礎10% + 天賦加成），不改畫面文字
                    const result = DamageSystem.computeHit(
                        this.damage,
                        enemy,
                        { weaponType: this.weaponType, critChanceBonusPct: (this.critChanceBonusPct || 0) }
                    );
                    finalDamage = result.amount;
                    isCrit = result.isCrit;
                    lifestealAmount = (typeof result.lifestealAmount === 'number') ? result.lifestealAmount : 0;
                }
                
                // 確定傷害來源的 playerUid（用於同步傷害數字）
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
                
                // 單機模式：直接造成傷害並顯示傷害數字
                if (!isSurvivalMode || !isMultiplayer) {
                    enemy.takeDamage(finalDamage, {
                        weaponType: this.weaponType,
                        playerUid: playerUid,
                        isCrit: isCrit,
                        dirX: dirX,
                        dirY: dirY
                    });
                    if (typeof DamageNumbers !== 'undefined') {
                        DamageNumbers.show(finalDamage, enemy.x, enemy.y - (enemy.height||0)/2, isCrit, { dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), enemyId: enemy.id });
                    }
                }
                // 多人模式：傷害由伺服器權威處理，伺服器透過 hitEvents 返回傷害數字
                
                // 紳士綿羊（FIREBALL）命中未被消滅的敵人時施加暫時減速（使用設定值）
                let slowMs = null;
                let slowFactor = null;
                if (this.weaponType === 'FIREBALL' && enemy.health > 0 && typeof enemy.applySlow === 'function') {
                    const cfg = (CONFIG && CONFIG.WEAPONS && CONFIG.WEAPONS.FIREBALL) || {};
                    slowMs = (typeof cfg.SLOW_DURATION_MS === 'number') ? cfg.SLOW_DURATION_MS : 1000;
                    slowFactor = (typeof cfg.SLOW_FACTOR === 'number') ? cfg.SLOW_FACTOR : 0.5;
                    enemy.applySlow(slowMs, slowFactor);
                }
                
                // ✅ 腫瘤切除：傷害數字改走伺服器 hitEvents（server/game-state.js），不再發送 enemy_damage
                // 減速效果由伺服器權威處理，客戶端只顯示視覺效果

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
                            
                            // 組隊模式：標記為待廣播的粒子
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
                                
                                // ✅ MMORPG 架構：所有玩家都能廣播爆炸粒子，不依賴室長端
                                if (isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer) {
                                    if (!Game._pendingExplosionParticles) Game._pendingExplosionParticles = [];
                                    Game._pendingExplosionParticles.push({
                                        x: p.x,
                                        y: p.y,
                                        vx: p.vx,
                                        vy: p.vy,
                                        life: p.life,
                                        maxLife: p.maxLife,
                                        size: p.size,
                                        color: p.color,
                                        source: p.source || null
                                    });
                                }
                            } catch (_) {}
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
                        // ✅ 流量優化：音效是單機元素，只對本地玩家播放（因為是本地玩家的投射物）
                        // 投射物命中敵人時的 bo 音效，只對本地玩家播放
                        if (typeof Game !== 'undefined' && Game.player && this.player === Game.player && typeof AudioManager !== 'undefined') {
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
        
        // ✅ 根據角度旋轉投射物（讓投射物朝向正確方向）
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle || 0);
        
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
                ctx.drawImage(img, -renderW / 2, -renderH / 2, renderW, renderH);
            } else {
                ctx.drawImage(Game.images[imageName], -size / 2, -size / 2, size, size);
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
            ctx.arc(0, 0, this.width / 2, 0, Math.PI * 2);
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
            ctx.arc(-10, 0, this.width / 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}

// ✅ 讓 ES module（例如 survival_online.js）可以從 globalThis 取得建構子
try {
    if (typeof window !== 'undefined') {
        window.Projectile = Projectile;
    }
} catch (_) { }
