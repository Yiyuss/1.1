// 死線戰士效果：瞬移至不同敵人進行傷害，總共3次傷害，1.2秒內完成
// 死線超人效果：瞬移至不同敵人進行範圍傷害，總共6次傷害，1.2秒內完成，特效100%大小
class DeathlineWarriorEffect extends Entity {
    constructor(player, damage, detectRadius, totalHits, totalDurationMs, minTeleportDistance, weaponType, aoeRadius, displayScale) {
        super(player.x, player.y, 2, 2);
        this.player = player;
        this.damage = Math.max(0, damage || 0);
        this.detectRadius = detectRadius || 600;
        this.totalHits = totalHits || 3;
        this.totalDurationMs = totalDurationMs || 1200; // 1.2秒
        this.minTeleportDistance = minTeleportDistance || 300; // 優先選擇300以上距離的敵人
        this.weaponType = weaponType || 'DEATHLINE_WARRIOR'; // 武器類型（DEATHLINE_WARRIOR 或 DEATHLINE_SUPERMAN）
        this.aoeRadius = aoeRadius || 0; // 範圍傷害半徑（0表示單體傷害）
        this.displayScale = displayScale || 0.5; // 特效顯示大小（死線戰士50%，死線超人100%）
        
        this.startTime = Date.now();
        this.hitsCompleted = 0;
        this.hitTargets = []; // 記錄已攻擊的敵人ID，避免重複攻擊同一敵人（除非只剩1個）
        this.currentHitIndex = -1; // 從-1開始，因為第一次攻擊會在構造函數中立即執行
        
        // 雪碧圖動畫參數（4行6列，總共22張圖，每張516x528）
        this.spriteSheet = null;
        this.spriteSheetLoaded = false;
        this.spriteRows = 4;
        this.spriteCols = 6;
        this.totalFrames = 22;
        this.frameWidth = 516;
        this.frameHeight = 528;
        this.displayWidth = this.frameWidth * this.displayScale;
        this.displayHeight = this.frameHeight * this.displayScale;
        this.currentFrame = 0;
        this.frameTime = 0;
        // 每幀時間：總時長除以總幀數（22幀）
        this.frameInterval = this.totalDurationMs / this.totalFrames; // 每幀時間
        
        // 當前攻擊位置和目標
        this.currentX = player.x;
        this.currentY = player.y;
        this.currentTarget = null;
        this.hitEffects = []; // 存儲每次攻擊的特效位置
        
        // 載入雪碧圖
        this._loadSpriteSheet();
        
        // 立即執行第一次攻擊
        this._performNextHit();
    }
    
    _loadSpriteSheet() {
        if (this.spriteSheetLoaded) return;
        
        const img = new Image();
        img.onload = () => {
            this.spriteSheet = img;
            this.spriteSheetLoaded = true;
        };
        img.onerror = () => {
            console.warn('[DeathlineWarrior] 雪碧圖載入失敗: die.png');
            this.spriteSheetLoaded = false;
        };
        img.src = 'assets/images/die.png';
    }
    
    _findTargets() {
        const enemies = (Game && Game.enemies) ? Game.enemies : [];
        const validEnemies = enemies.filter(e => 
            e && !e.markedForDeletion && e.health > 0
        );
        
        if (validEnemies.length === 0) return [];
        
        // 計算所有敵人的距離
        const enemiesWithDistance = validEnemies.map(enemy => {
            const dist = Utils.distance(this.player.x, this.player.y, enemy.x, enemy.y);
            return { enemy, distance: dist };
        });
        
        // 過濾出偵測範圍內的敵人
        const inRange = enemiesWithDistance.filter(e => e.distance <= this.detectRadius);
        
        if (inRange.length === 0) return [];
        
        // 如果只剩1個敵人，返回它（允許重複攻擊）
        if (inRange.length === 1) {
            return [inRange[0].enemy];
        }
        
        // 優先選擇300以上距離的敵人（遠的優先）
        const farEnemies = inRange.filter(e => e.distance >= this.minTeleportDistance);
        const nearEnemies = inRange.filter(e => e.distance < this.minTeleportDistance);
        
        // 排除已攻擊過的敵人（優先選擇未攻擊過的）
        const availableFar = farEnemies.filter(e => !this.hitTargets.includes(e.enemy.id));
        const availableNear = nearEnemies.filter(e => !this.hitTargets.includes(e.enemy.id));
        
        // 優先從遠的未攻擊敵人選擇，如果沒有則從近的未攻擊敵人選擇
        let candidates = availableFar.length > 0 ? availableFar : availableNear;
        
        // 如果所有敵人都已被攻擊過，則允許重複攻擊（優先選擇遠的）
        if (candidates.length === 0) {
            candidates = farEnemies.length > 0 ? farEnemies : nearEnemies;
        }
        
        // 按距離排序（遠的在前）
        candidates.sort((a, b) => b.distance - a.distance);
        
        return candidates.map(c => c.enemy);
    }
    
    _performNextHit() {
        if (this.hitsCompleted >= this.totalHits) return;
        
        const targets = this._findTargets();
        
        if (targets.length === 0) {
            // 沒有目標，標記為完成
            this.hitsCompleted = this.totalHits;
            return;
        }
        
        // 選擇目標（優先選擇遠的，且未攻擊過的）
        let target = targets[0];
        
        // 如果有多個目標，隨機選擇一個（但優先選擇未攻擊過的）
        const unHitTargets = targets.filter(t => !this.hitTargets.includes(t.id));
        if (unHitTargets.length > 0) {
            target = unHitTargets[Math.floor(Math.random() * unHitTargets.length)];
        } else {
            // 所有目標都已攻擊過，隨機選擇一個（允許重複攻擊）
            target = targets[Math.floor(Math.random() * targets.length)];
        }
        
        this.currentTarget = target;
        this.currentX = target.x;
        this.currentY = target.y;
        
        // 記錄攻擊目標
        if (!this.hitTargets.includes(target.id)) {
            this.hitTargets.push(target.id);
        }
        
        // 造成傷害（死線超人：範圍傷害；死線戰士：單體傷害）
        if (this.aoeRadius > 0) {
            // 範圍傷害：對目標周圍150範圍內的所有敵人造成傷害
            const enemies = (Game && Game.enemies) ? Game.enemies : [];
            const hitEnemies = enemies.filter(e => {
                if (!e || e.markedForDeletion || e.health <= 0) return false;
                const dist = Utils.distance(target.x, target.y, e.x, e.y);
                return dist <= this.aoeRadius;
            });
            
            for (const enemy of hitEnemies) {
                let finalDamage = this.damage;
                let isCrit = false;
                if (typeof DamageSystem !== 'undefined') {
                    const result = DamageSystem.computeHit(this.damage, enemy, {
                        weaponType: this.weaponType,
                        critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0)
                    });
                    finalDamage = result.amount;
                    isCrit = result.isCrit;
                }
                
                // 組隊模式：隊員的死線戰士攻擊敵人時，同步傷害到隊長端
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
                                weaponType: this.weaponType || "DEATHLINE_WARRIOR",
                                isCrit: isCrit
                            });
                        }
                    }
                } catch (_) {}
                
                enemy.takeDamage(finalDamage);
                if (typeof DamageNumbers !== 'undefined') {
                    DamageNumbers.show(finalDamage, enemy.x, enemy.y - (enemy.height||0)/2, isCrit, { 
                        dirX: 0, 
                        dirY: -1, 
                        enemyId: enemy.id 
                    });
                }
            }
        } else {
            // 單體傷害（死線戰士）
            let finalDamage = this.damage;
            let isCrit = false;
            if (typeof DamageSystem !== 'undefined') {
                const result = DamageSystem.computeHit(this.damage, target, {
                    weaponType: this.weaponType,
                    critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0)
                });
                finalDamage = result.amount;
                isCrit = result.isCrit;
            }
            
            // 組隊模式：隊員的死線戰士攻擊敵人時，同步傷害到隊長端
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
                
                if (isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.role === "guest" && target && target.id) {
                    if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
                        window.SurvivalOnlineRuntime.sendToNet({
                            t: "enemy_damage",
                            enemyId: target.id,
                            damage: finalDamage,
                            weaponType: this.weaponType || "DEATHLINE_WARRIOR",
                            isCrit: isCrit
                        });
                    }
                }
            } catch (_) {}
            
            target.takeDamage(finalDamage);
            if (typeof DamageNumbers !== 'undefined') {
                DamageNumbers.show(finalDamage, target.x, target.y - (target.height||0)/2, isCrit, { 
                    dirX: 0, 
                    dirY: -1, 
                    enemyId: target.id 
                });
            }
        }
        
        // 在造成傷害後創建雪碧圖特效（每次攻擊都創建）
        // 每個特效持續時間設為完整動畫時長，確保能完整播放22幀
        // 計算22幀動畫需要的時間（假設30fps，約733ms，但為了安全設為1000ms）
        const effectDuration = 1000; // 固定1000ms，確保能完整播放22幀動畫
        // 特效偏移：讓玩家居中在特效圓圈中間（向左上偏移）
        // 根據雪碧圖結構，圓圈中心可能在圖片右下部分，需要向左上偏移約30-40像素
        const offsetX = -10; // 向左偏移
        const offsetY = -10; // 向上偏移
        this.hitEffects.push({
            x: target.x + offsetX,
            y: target.y + offsetY,
            startTime: Date.now(),
            frame: 0,
            duration: effectDuration // 每個特效持續時間
        });
        
        // 在造成傷害後播放音效（每次攻擊都播放）
        if (typeof AudioManager !== 'undefined') {
            AudioManager.playSound('knife'); // 使用斬擊音效
        }
        
        // 瞬移玩家位置（視覺效果）
        if (this.player) {
            this.player.x = target.x;
            this.player.y = target.y;
        }
        
        this.hitsCompleted++;
        this.currentHitIndex++;
    }
    
    update(deltaTime) {
        const elapsed = Date.now() - this.startTime;
        
        // 檢查是否需要執行下一次攻擊
        // 確保在總時長內完成所有攻擊
        if (this.hitsCompleted < this.totalHits) {
            const hitInterval = this.totalDurationMs / this.totalHits; // 每次攻擊間隔 (1200/3 = 400ms)
            const expectedHitIndex = Math.floor(elapsed / hitInterval);
            
            // 如果預期的攻擊索引大於當前索引，執行攻擊
            // 第一次攻擊在構造函數中立即執行（currentHitIndex = -1 -> 0），所以這裡從索引1開始
            // 允許稍微超過總時長（最多多等一個間隔時間），確保最後一次攻擊能執行
            const shouldHit = expectedHitIndex > this.currentHitIndex;
            const isNearEnd = elapsed >= this.totalDurationMs && elapsed < this.totalDurationMs + hitInterval;
            if (shouldHit || (isNearEnd && this.hitsCompleted < this.totalHits)) {
                this._performNextHit();
            }
        }
        
        // 更新雪碧圖動畫（每個特效獨立計算幀數）
        // 注意：即使效果標記為刪除，也要繼續更新特效，直到所有特效都過期
        const now = Date.now();
        for (const effect of this.hitEffects) {
            const effectElapsed = now - effect.startTime;
            // 根據經過時間計算當前幀（每幀時間 = 特效持續時間 / 總幀數）
            const effectFrameInterval = (effect.duration || 1000) / this.totalFrames;
            effect.frame = Math.min(
                Math.floor(effectElapsed / effectFrameInterval),
                this.totalFrames - 1
            );
        }
        
        // 移除過期的特效（每個特效持續播放完整動畫）
        this.hitEffects = this.hitEffects.filter(effect => {
            const effectElapsed = now - effect.startTime;
            // 每個特效持續時間為固定1000ms（確保每個特效都能完整顯示）
            return effectElapsed < (effect.duration || 1000);
        });
        
        // 檢查是否完成（但不要立即標記為刪除，讓特效繼續播放）
        if (elapsed >= this.totalDurationMs) {
            // 第三下攻擊在約800ms時發生，特效持續1000ms，所以應該在1800ms時過期
            // 因此我們需要等待至少1800ms才標記為刪除（總時長1200ms + 特效持續時間1000ms）
            const maxEffectEndTime = this.startTime + this.totalDurationMs + 1000; // 總時長 + 特效持續時間
            if (now >= maxEffectEndTime || this.hitEffects.length === 0) {
                this.markedForDeletion = true;
            }
            // 恢復玩家位置到最後一次攻擊位置（或保持當前位置）
        }
    }
    
    draw(ctx) {
        if (!this.spriteSheetLoaded || !this.spriteSheet) return;
        
        ctx.save();
        
        // 繪製所有攻擊特效
        for (const effect of this.hitEffects) {
            const frameIndex = effect.frame;
            const row = Math.floor(frameIndex / this.spriteCols);
            const col = frameIndex % this.spriteCols;
            
            const sx = col * this.frameWidth;
            const sy = row * this.frameHeight;
            
            ctx.drawImage(
                this.spriteSheet,
                sx, sy, this.frameWidth, this.frameHeight,
                effect.x - this.displayWidth / 2,
                effect.y - this.displayHeight / 2,
                this.displayWidth,
                this.displayHeight
            );
        }
        
        ctx.restore();
    }
}

