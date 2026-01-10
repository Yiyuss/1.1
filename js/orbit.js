// 旋球投射物：在玩家周圍以固定半徑旋轉，持續一段時間
class OrbitBall extends Entity {
    constructor(player, initialAngle, radius, damage, size, durationMs, angularSpeedRadPerSec, imageKey = 'lightning') {
        super(player.x + Math.cos(initialAngle) * radius, player.y + Math.sin(initialAngle) * radius, size, size);
        this.player = player;
        this.angle = initialAngle;
        this.radius = radius;
        this.damage = damage;
        
        // 根據武器類型決定傷害模式
        if (imageKey === 'chicken') {
            this.weaponType = 'CHICKEN_BLESSING';
        } else if (imageKey === 'muffin') {
            this.weaponType = 'ROTATING_MUFFIN';
        } else if (imageKey === 'heart') {
            this.weaponType = 'HEART_COMPANION';
        } else if (imageKey === 'pineapple') {
            this.weaponType = 'PINEAPPLE_ORBIT';
        } else {
            this.weaponType = 'ORBIT';
        }
        
        // 雞腿庇佑、綿羊護體、鳳梨環繞、旋轉鬆餅和心意相隨：改為單次碰撞傷害（移除持續傷害，避免BOSS被秒殺）
        if (this.weaponType === 'CHICKEN_BLESSING' || this.weaponType === 'ORBIT' || this.weaponType === 'PINEAPPLE_ORBIT' || this.weaponType === 'ROTATING_MUFFIN' || this.weaponType === 'HEART_COMPANION') {
            // 單次碰撞傷害模式：每個敵人只造成一次傷害，然後有冷卻時間
            this.collisionCooldown = new Map(); // 記錄每個敵人的最後碰撞時間
            this.collisionCooldownMs = 500; // 每個敵人500ms內只能受到一次傷害
            this.singleHitDamage = Math.max(1, Math.round(this.damage));
        } else {
            // 其他武器：保持原來的持續傷害模式（如果有其他使用OrbitBall的武器）
            this.tickDamage = Math.max(1, Math.round(this.damage));
            this.tickIntervalMs = 120; // 每0.12秒一次，類似雷射頻率
            this.tickAccumulator = 0;
        }
        
        this.duration = durationMs;
        this.angularSpeed = angularSpeedRadPerSec; // 弧度/秒
        this.startTime = Date.now();
        // 視覺圖片鍵（預設為 lightning，可傳入其他鍵如 'chicken'）
        this.imageKey = imageKey;
        // 視覺：輕量拖尾緩存（不影響傷害或判定）
        this.trail = [];
        this.trailMax = 12;
    }

    update(deltaTime) {
        // 僅視覺環繞投射物：需要從遠程玩家位置更新
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            if (rt && typeof rt.getRemotePlayers === 'function') {
                const remotePlayers = rt.getRemotePlayers() || [];
                const remotePlayer = remotePlayers.find(p => p.uid === this._remotePlayerUid);
                if (remotePlayer) {
                    // 更新角度
                    this.angle += this.angularSpeed * (deltaTime / 1000);
                    // 跟隨遠程玩家位置旋轉
                    this.x = remotePlayer.x + Math.cos(this.angle) * this.radius;
                    this.y = remotePlayer.y + Math.sin(this.angle) * this.radius;
                    // 視覺：更新拖尾記錄（僅視覺）
                    this.trail.push({ x: this.x, y: this.y, size: this.width });
                    if (this.trail.length > this.trailMax) this.trail.shift();
                    // 檢查持續時間（僅視覺）
                    const elapsed = Date.now() - this.startTime;
                    if (elapsed >= this.duration) {
                        this.markedForDeletion = true;
                    }
                    return; // 僅視覺，不進行碰撞檢測
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    // 如果是本地玩家
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.angle += this.angularSpeed * (deltaTime / 1000);
                        this.x = Game.player.x + Math.cos(this.angle) * this.radius;
                        this.y = Game.player.y + Math.sin(this.angle) * this.radius;
                        // 視覺：更新拖尾記錄
                        this.trail.push({ x: this.x, y: this.y, size: this.width });
                        if (this.trail.length > this.trailMax) this.trail.shift();
                        // 檢查持續時間
                        const elapsed = Date.now() - this.startTime;
                        if (elapsed >= this.duration) {
                            this.markedForDeletion = true;
                        }
                        return;
                    }
                }
            }
            // 如果找不到對應的玩家，標記為刪除
            this.markedForDeletion = true;
            return;
        }
        
        // 更新角度
        this.angle += this.angularSpeed * (deltaTime / 1000);
        // 跟隨玩家位置旋轉
        this.x = this.player.x + Math.cos(this.angle) * this.radius;
        this.y = this.player.y + Math.sin(this.angle) * this.radius;

        // 視覺：更新拖尾記錄
        this.trail.push({ x: this.x, y: this.y, size: this.width });
        if (this.trail.length > this.trailMax) this.trail.shift();

        // 根據武器類型選擇傷害模式
        if (this.weaponType === 'CHICKEN_BLESSING' || this.weaponType === 'ORBIT' || this.weaponType === 'PINEAPPLE_ORBIT' || this.weaponType === 'ROTATING_MUFFIN' || this.weaponType === 'HEART_COMPANION') {
            // 雞腿庇佑、綿羊護體、旋轉鬆餅和心意相隨：單次碰撞傷害模式（避免持續傷害導致BOSS被秒殺）
            const currentTime = Date.now();
            for (const enemy of Game.enemies) {
                if (this.isColliding(enemy)) {
                    const enemyId = enemy.id || enemy;
                    const lastHitTime = this.collisionCooldown.get(enemyId) || 0;
                    
                    // 檢查冷卻時間：每個敵人500ms內只能受到一次傷害
                    if (currentTime - lastHitTime >= this.collisionCooldownMs) {
                        // 造成單次碰撞傷害
                        let finalDamage = this.singleHitDamage;
                        let isCrit = false;
                        if (typeof DamageSystem !== 'undefined') {
                            const result = DamageSystem.computeHit(this.singleHitDamage, enemy, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
                            finalDamage = result.amount;
                            isCrit = result.isCrit;
                        }
                        
                        // MMORPG標準：每個玩家獨立執行邏輯並造成傷害
                        // 隊員端：造成實際傷害並發送enemy_damage給主機
                        // 主機端：本地玩家造成實際傷害，遠程玩家的傷害由enemy_damage處理
                        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer);
                        const isGuest = (isMultiplayer && Game.multiplayer.role === "guest");
                        const isHostRemotePlayer = (isMultiplayer && Game.multiplayer.role === "host" && this.player && this.player._isRemotePlayer);
                        
                        // 隊員端：造成實際傷害並發送enemy_damage
                        if (isGuest) {
                            enemy.takeDamage(finalDamage);
                            if (typeof DamageNumbers !== 'undefined') {
                                DamageNumbers.show(finalDamage, enemy.x, enemy.y - (enemy.height||0)/2, isCrit, { dirX: (enemy.x - this.x), dirY: (enemy.y - this.y), enemyId: enemyId });
                            }
                            // 發送enemy_damage給主機
                            if (enemy && enemy.id) {
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
                        } 
                        // 主機端：本地玩家造成實際傷害，遠程玩家的傷害由enemy_damage處理（不重複計算）
                        else if (!isHostRemotePlayer) {
                            enemy.takeDamage(finalDamage);
                            if (typeof DamageNumbers !== 'undefined') {
                                DamageNumbers.show(finalDamage, enemy.x, enemy.y - (enemy.height||0)/2, isCrit, { dirX: (enemy.x - this.x), dirY: (enemy.y - this.y), enemyId: enemyId });
                            }
                        }
                        // 主機端的遠程玩家武器：不造成傷害（由隊員端的enemy_damage處理）
                        
                        // 記錄碰撞時間
                        this.collisionCooldown.set(enemyId, currentTime);
                    }
                }
            }
            
            // 清理過期的碰撞記錄（避免內存泄漏）
            if (this.collisionCooldown.size > 100) {
                const expiredTime = currentTime - this.collisionCooldownMs * 2;
                for (const [enemyId, time] of this.collisionCooldown.entries()) {
                    if (time < expiredTime) {
                        this.collisionCooldown.delete(enemyId);
                    }
                }
            }
        } else {
            // 其他武器（如ORBIT）：保持原來的持續傷害模式
            this.tickAccumulator += deltaTime;
            while (this.tickAccumulator >= this.tickIntervalMs) {
                for (const enemy of Game.enemies) {
                    if (this.isColliding(enemy)) {
                        let finalDamage = this.tickDamage;
                        let isCrit = false;
                        if (typeof DamageSystem !== 'undefined') {
                            const result = DamageSystem.computeHit(this.tickDamage, enemy, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
                            finalDamage = result.amount;
                            isCrit = result.isCrit;
                        }
                        
                        // 組隊模式：隊員的環繞投射物攻擊敵人時，同步傷害到隊長端
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
                            
                            if (isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.role === "guest" && enemy && enemy.id) {
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
                        
                        enemy.takeDamage(finalDamage);
                        if (typeof DamageNumbers !== 'undefined') {
                            // 顯示層：傳入 enemyId 用於每敵人節流（僅影響顯示密度）
                            DamageNumbers.show(finalDamage, enemy.x, enemy.y - (enemy.height||0)/2, isCrit, { dirX: (enemy.x - this.x), dirY: (enemy.y - this.y), enemyId: enemy.id });
                        }
                    }
                }
                this.tickAccumulator -= this.tickIntervalMs;
            }
        }

        // 到期銷毀
        if (Date.now() - this.startTime >= this.duration) {
            this.destroy();
        }
    }

    draw(ctx) {
        ctx.save();
        const size = Math.max(this.width, this.height);

        // 視覺：拖尾繪製（輕量、僅顯示）
        if (this.trail && this.trail.length) {
            // 處理圖片鍵映射：heart 對應 A34
            let actualImageKey = this.imageKey;
            if (this.imageKey === 'heart') {
                actualImageKey = 'A34';
            } else if (this.imageKey === 'pineapple') {
                actualImageKey = 'A45';
            }
            for (let i = 0; i < this.trail.length; i++) {
                const t = this.trail[i];
                const alpha = 0.08 + (i / this.trail.length) * 0.18;
                ctx.globalAlpha = alpha;
                const trailImg = (Game.images && Game.images[actualImageKey]) ? Game.images[actualImageKey] : null;
                if (trailImg && trailImg.complete && (trailImg.naturalWidth > 0 || trailImg.width > 0)) {
                    const scale = (0.9 - i * 0.02);
                    const s = size * scale;
                    if (this.weaponType === 'PINEAPPLE_ORBIT') {
                        // A45.png（53x100）：保持寬高比，使用高度為基準
                        const iw = trailImg.naturalWidth || trailImg.width || 53;
                        const ih = trailImg.naturalHeight || trailImg.height || 100;
                        const aspect = iw / ih; // 53/100
                        const renderH = s;
                        const renderW = Math.max(1, Math.floor(renderH * aspect));
                        ctx.drawImage(trailImg, t.x - renderW / 2, t.y - renderH / 2, renderW, renderH);
                    } else {
                        ctx.drawImage(trailImg, t.x - s / 2, t.y - s / 2, s, s);
                    }
                } else {
                    ctx.fillStyle = '#fff59d';
                    ctx.beginPath();
                    ctx.arc(t.x, t.y, (t.size / 2) * (0.9 - i * 0.02), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        }

        // 處理圖片鍵映射：heart 對應 A34
        let actualImageKey = this.imageKey;
        if (this.imageKey === 'heart') {
            actualImageKey = 'A34';
        } else if (this.imageKey === 'pineapple') {
            actualImageKey = 'A45';
        }
        const img = (Game.images && Game.images[actualImageKey]) ? Game.images[actualImageKey] : null;
        if (img && img.complete && (img.naturalWidth > 0 || img.width > 0)) {
            if (this.weaponType === 'PINEAPPLE_ORBIT') {
                // A45.png（53x100）：保持寬高比，使用高度為基準
                const iw = img.naturalWidth || img.width || 53;
                const ih = img.naturalHeight || img.height || 100;
                const aspect = iw / ih; // 53/100
                const renderH = size;
                const renderW = Math.max(1, Math.floor(renderH * aspect));
                ctx.drawImage(img, this.x - renderW / 2, this.y - renderH / 2, renderW, renderH);
            } else {
                ctx.drawImage(img, this.x - size / 2, this.y - size / 2, size, size);
            }
        } else {
            // 備用：使用黃色球體（如果圖片未加載完成）
            // 調試：如果 muffin 圖片未加載，輸出調試信息
            if (this.imageKey === 'muffin' && !img) {
                console.warn('[OrbitBall] muffin 圖片未找到於 Game.images，imageKey:', this.imageKey, 'Game.images keys:', Object.keys(Game.images || {}));
            } else if (this.imageKey === 'muffin' && img && !img.complete) {
                console.warn('[OrbitBall] muffin 圖片尚未加載完成');
            }
            ctx.fillStyle = '#ff0';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}
