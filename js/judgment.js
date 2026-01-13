// 裁決效果：在敵人上方生成劍下落，造成範圍傷害
class JudgmentEffect extends Entity {
    constructor(player, damage, swordCount, detectRadius, aoeRadius, swordImageWidth, swordImageHeight, fallDurationMs, fadeOutDurationMs) {
        super(player.x, player.y, 2, 2);
        this.player = player;
        this.damage = Math.max(0, damage || 0);
        this.swordCount = Math.max(1, swordCount || 1);
        this.detectRadius = Math.max(1, detectRadius || 400);
        this.aoeRadius = Math.max(1, aoeRadius || 100);
        this.swordImageWidth = swordImageWidth || 550;
        this.swordImageHeight = swordImageHeight || 1320;
        this.fallDurationMs = fallDurationMs || 500;
        this.fadeOutDurationMs = fadeOutDurationMs || 300;
        this.weaponType = 'JUDGMENT';
        this.startTime = Date.now();
        // 為這次攻擊生成唯一 ID，用於去重
        this.attackId = Date.now() + '_' + Math.random();
        
        // 劍的列表：每把劍有目標敵人、起始位置、當前位置、狀態等
        this.swords = [];
        this._initializeSwords();
        
        // 不再需要 DOM 層和特效管理，敵人自己負責創建特效
    }
    
    _initializeSwords() {
        // 獲取範圍內的敵人
        const enemies = (Game && Game.enemies) ? Game.enemies.filter(e => 
            e && !e.markedForDeletion && e.health > 0
        ) : [];
        
        if (enemies.length === 0) {
            // 沒有敵人，標記為完成
            this.markedForDeletion = true;
            return;
        }
        
        // 計算每個敵人到玩家的距離
        const enemyDistances = enemies.map(e => ({
            enemy: e,
            distance: Utils.distance(this.player.x, this.player.y, e.x, e.y)
        })).filter(item => item.distance <= this.detectRadius)
          .sort((a, b) => a.distance - b.distance);
        
        // 優先分配給不同敵人，若敵人少於劍數則重複分配
        const assignedEnemies = [];
        for (let i = 0; i < this.swordCount; i++) {
            const targetIndex = i % enemyDistances.length;
            const target = enemyDistances[targetIndex];
            if (target) {
                const enemy = target.enemy;
                // 在敵人上方生成劍（高度約200像素）
                const startY = enemy.y - 200;
                const sword = {
                    targetEnemy: enemy,
                    startX: enemy.x,
                    startY: startY,
                    currentX: enemy.x,
                    currentY: startY,
                    targetX: enemy.x,
                    targetY: enemy.y,
                    state: 'falling', // 'falling' | 'hit' | 'fading'
                    hitTime: null,
                    appliedDamage: false
                };
                this.swords.push(sword);
                assignedEnemies.push(enemy);
            }
        }
    }
    
    _applyDamage(sword) {
        if (sword.appliedDamage) return;
        sword.appliedDamage = true;
        
        const enemies = (Game && Game.enemies) ? Game.enemies : [];
        const hitEnemies = [];
        
        // 記錄已經處理過的敵人，避免重複處理（同一把劍可能在同一幀被多次處理）
        const processedEnemies = new Set();
        
        for (const enemy of enemies) {
            if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
            // 如果已經處理過這個敵人，跳過
            if (processedEnemies.has(enemy)) continue;
            
            const dist = Utils.distance(sword.targetX, sword.targetY, enemy.x, enemy.y);
            if (dist <= this.aoeRadius) {
                processedEnemies.add(enemy);
                
                let finalDamage = this.damage;
                let isCrit = false;
                let lifestealAmount = 0;
                if (typeof DamageSystem !== 'undefined') {
                    const result = DamageSystem.computeHit(this.damage, enemy, {
                        weaponType: this.weaponType,
                        critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0)
                    });
                    finalDamage = result.amount;
                    isCrit = result.isCrit;
                    lifestealAmount = (typeof result.lifestealAmount === 'number') ? result.lifestealAmount : 0;
                }
                
                // ✅ MMO 架構：每個玩家都獨立造成傷害，通用單機和MMO
                // 單機模式：直接造成傷害
                // 多人模式：每個玩家都造成傷害，並發送enemy_damage（用於同步傷害數字）
                const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer);
                let isSurvivalMode = false;
                try {
                    const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                    isSurvivalMode = (activeId === 'survival' || activeId === null);
                } catch (_) {}
                
                // 造成傷害（單機和多人模式都執行）
                enemy.takeDamage(finalDamage, { weaponType: this.weaponType, attackId: this.attackId });
                if (typeof DamageNumbers !== 'undefined') {
                    const dirX = (enemy.x - sword.targetX) || 1;
                    const dirY = (enemy.y - sword.targetY) || 0;
                    const mag = Math.hypot(dirX, dirY) || 1;
                    DamageNumbers.show(
                        finalDamage,
                        enemy.x,
                        enemy.y - (enemy.height || 0) / 2,
                        isCrit,
                        { dirX: dirX / mag, dirY: dirY / mag, enemyId: enemy.id }
                    );
                }
                
                // 多人模式：發送enemy_damage（用於同步傷害數字，不影響傷害計算）
                if (isSurvivalMode && isMultiplayer && enemy && enemy.id) {
                    if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
                        window.SurvivalOnlineRuntime.sendToNet({
                            t: "enemy_damage",
                            enemyId: enemy.id,
                            damage: finalDamage,
                            weaponType: this.weaponType || "JUDGMENT",
                            isCrit: isCrit,
                            lifesteal: lifestealAmount
                        });
                    }
                }
                // 不再記錄敵人，敵人自己負責創建特效
            }
        }
        
        // 播放音效
        if (typeof AudioManager !== 'undefined') {
            AudioManager.playSound('knife');
        }
        
        // 注意：不再在此處創建特效，敵人自己負責創建（在 takeDamage 中）
    }
    
    update(deltaTime) {
        const currentTime = Date.now();
        const elapsed = currentTime - this.startTime;
        
        // 更新每把劍的狀態
        let allFinished = true;
        for (const sword of this.swords) {
            if (sword.state === 'falling') {
                // 更新目標位置（敵人可能移動）
                if (sword.targetEnemy && !sword.targetEnemy.markedForDeletion && sword.targetEnemy.health > 0) {
                    sword.targetX = sword.targetEnemy.x;
                    sword.targetY = sword.targetEnemy.y;
                }
                
                // 計算下落進度（0到1）
                const fallProgress = Math.min(1, elapsed / this.fallDurationMs);
                
                // 線性插值計算當前位置
                sword.currentX = sword.startX + (sword.targetX - sword.startX) * fallProgress;
                sword.currentY = sword.startY + (sword.targetY - sword.startY) * fallProgress;
                
                // 如果到達目標位置，切換到命中狀態（只處理一次）
                if (fallProgress >= 1 && !sword.appliedDamage) {
                    sword.state = 'hit';
                    sword.hitTime = currentTime;
                    this._applyDamage(sword);
                } else if (fallProgress < 1) {
                    allFinished = false;
                }
            } else if (sword.state === 'hit') {
                // 命中後短暫停留，然後淡出
                const hitElapsed = currentTime - sword.hitTime;
                if (hitElapsed >= 100) { // 停留100ms後開始淡出
                    sword.state = 'fading';
                } else {
                    allFinished = false;
                }
            } else if (sword.state === 'fading') {
                // 淡出中
                const hitElapsed = currentTime - sword.hitTime;
                const fadeProgress = Math.min(1, (hitElapsed - 100) / this.fadeOutDurationMs);
                if (fadeProgress < 1) {
                    allFinished = false;
                }
            }
        }
        
        // 如果所有劍都完成，標記為刪除
        if (allFinished && this.swords.length > 0) {
            this.markedForDeletion = true;
        }
    }
    
    draw(ctx) {
        const currentTime = Date.now();
        const elapsed = currentTime - this.startTime;
        
        // 繪製每把劍
        for (const sword of this.swords) {
            if (sword.state === 'fading' && sword.hitTime) {
                const hitElapsed = currentTime - sword.hitTime;
                const fadeProgress = Math.min(1, (hitElapsed - 100) / this.fadeOutDurationMs);
                if (fadeProgress >= 1) continue; // 完全淡出後不繪製
            }
            
            const img = (Game && Game.images) ? Game.images['A39'] : null;
            if (!img || !img.complete) continue;
            
            ctx.save();
            
            // 計算透明度
            let alpha = 1.0;
            if (sword.state === 'fading' && sword.hitTime) {
                const hitElapsed = currentTime - sword.hitTime;
                const fadeProgress = Math.min(1, (hitElapsed - 100) / this.fadeOutDurationMs);
                alpha = 1.0 - fadeProgress;
            }
            ctx.globalAlpha = alpha;
            
            // 繪製劍（垂直向下）
            // 根據圖片比例計算繪製尺寸（保持550x1320比例）
            const aspectRatio = this.swordImageWidth / this.swordImageHeight; // 550/1320 ≈ 0.417
            const drawHeight = 80; // 繪製高度80像素
            const drawWidth = drawHeight * aspectRatio; // 約33像素寬
            
            ctx.drawImage(
                img,
                sword.currentX - drawWidth / 2,
                sword.currentY - drawHeight / 2,
                drawWidth,
                drawHeight
            );
            
            ctx.restore();
        }
    }
    
    destroy() {
        this.markedForDeletion = true;
    }
}

