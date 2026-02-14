// 星隕效果：厄倫蒂兒專屬技能
// 包含兩個部分：
// 1. StarfallMoon: 永久懸浮在玩家頭頂的月亮（被動視覺）
// 2. StarfallEffect: 週期性落下的星隕攻擊（主動傷害，邏輯同裁決）

// 1. 懸浮月亮 (A54.png)
class StarfallMoon extends Entity {
    constructor(player) {
        super(player.x, player.y, 1, 1);
        this.player = player;
        this.weaponType = 'STARFALL_MOON';
        this.imageKey = 'A54';
        this.isPersistentEffect = true; // 標記為常駐特效

        // 月亮參數
        this.hoverHeight = 120; // 懸浮高度
        this.scale = 1.5; // 玩家大小的倍率 (1.5倍)
        
        // 為了多人同步，記錄 remotePlayerUid
        if (player._isRemotePlayer && player.uid) {
            this._remotePlayerUid = player.uid;
        }
    }

    update(deltaTime) {
        // 如果玩家不存在或已標記刪除，月亮也消失
        if (!this.player || this.player.markedForDeletion) {
            this.markedForDeletion = true;
            return;
        }

        // 對於遠程玩家，嘗試從 SurvivalOnlineRuntime 更新位置
        if (this.player._isRemotePlayer && this._remotePlayerUid) {
             const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
             if (rt && typeof rt.getRemotePlayers === 'function') {
                 const remotePlayers = rt.getRemotePlayers() || [];
                 const remotePlayer = remotePlayers.find(p => p.uid === this._remotePlayerUid);
                 if (remotePlayer) {
                     this.player = remotePlayer; // 更新引用
                 }
             }
        }

        // 跟隨玩家位置，並增加細微浮動效果
        this.x = this.player.x;
        // 使用正弦波產生上下浮動效果：週期約 2 秒，幅度 +/- 5px
        const floatOffset = Math.sin(Date.now() / 300) * 5; 
        this.y = this.player.y + floatOffset;
    }

    draw(ctx) {
        if (!this.player) return;
        
        const img = (Game && Game.images) ? Game.images[this.imageKey] : null;
        if (!img || !img.complete) return;

        // 計算尺寸：基於玩家視覺尺寸 * 1.5
        // 使用 CONFIG.PLAYER.SIZE (32) * VISUAL_SCALE (1.25) = 40px 為基準
        const playerBaseSize = (typeof CONFIG !== 'undefined' && CONFIG.PLAYER) ? (CONFIG.PLAYER.SIZE * CONFIG.PLAYER.VISUAL_SCALE) : 40;
        const drawWidth = playerBaseSize * this.scale; // 約 60px
        const drawHeight = drawWidth * (img.height / img.width);

        ctx.save();
        ctx.drawImage(
            img,
            this.x - drawWidth / 2,
            this.y - this.hoverHeight - drawHeight / 2,
            drawWidth,
            drawHeight
        );
        ctx.restore();
    }
}

// 2. 星隕攻擊 (A51.png) - 邏輯與 JudgmentEffect 完全相同
class StarfallEffect extends Entity {
    constructor(player, damage, swordCount, detectRadius, aoeRadius, swordImageWidth, swordImageHeight, fallDurationMs, fadeOutDurationMs) {
        super(player.x, player.y, 2, 2);
        this.player = player;
        this.damage = Math.max(0, damage || 0);
        this.swordCount = Math.max(1, swordCount || 1);
        this.detectRadius = Math.max(1, detectRadius || 400);
        this.aoeRadius = Math.max(1, aoeRadius || 100);
        
        // 使用 CONFIG.STARFALL 的默認值
        this.swordImageWidth = swordImageWidth || 100; 
        this.swordImageHeight = swordImageHeight || 98;
        this.fallDurationMs = fallDurationMs || 250;
        this.fadeOutDurationMs = fadeOutDurationMs || 300;
        
        this.weaponType = 'STARFALL';
        this.startTime = Date.now();
        this.attackId = Date.now() + '_' + Math.random();
        
        this.swords = [];
        this._initializeSwords();
    }
    
    _initializeSwords() {
        const enemies = (Game && Game.enemies) ? Game.enemies.filter(e => 
            e && !e.markedForDeletion && e.health > 0
        ) : [];
        
        if (enemies.length === 0) {
            this.markedForDeletion = true;
            return;
        }
        
        const enemyDistances = enemies.map(e => ({
            enemy: e,
            distance: Utils.distance(this.player.x, this.player.y, e.x, e.y)
        })).filter(item => item.distance <= this.detectRadius)
          .sort((a, b) => a.distance - b.distance);
        
        const assignedEnemies = [];
        for (let i = 0; i < this.swordCount; i++) {
            const targetIndex = i % enemyDistances.length;
            const target = enemyDistances[targetIndex];
            if (target) {
                const enemy = target.enemy;
                const startY = enemy.y - 200; // 從上方200px落下
                const sword = {
                    targetEnemy: enemy,
                    startX: enemy.x,
                    startY: startY,
                    currentX: enemy.x,
                    currentY: startY,
                    targetX: enemy.x,
                    targetY: enemy.y,
                    state: 'falling',
                    hitTime: null,
                    appliedDamage: false
                };
                this.swords.push(sword);
                assignedEnemies.push(enemy);
            }
        }
    }
    
    _applyDamage(sword) {
        if (this._isVisualOnly) return;
        if (sword.appliedDamage) return;
        sword.appliedDamage = true;
        
        const enemies = (Game && Game.enemies) ? Game.enemies : [];
        const processedEnemies = new Set();
        
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
        
        let baseDamage = this.damage;
        if (typeof DamageSystem !== 'undefined' && enemies.length > 0) {
            const firstEnemy = enemies.find(e => !e.markedForDeletion && e.health > 0);
            if (firstEnemy) {
                const result = DamageSystem.computeHit(this.damage, firstEnemy, {
                    weaponType: this.weaponType,
                    critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0)
                });
                baseDamage = result.amount;
            }
        }
        
        // 組隊模式：發送 aoe_tick（附帶目標ID避免位置抖動）
        if (isSurvivalMode && isMultiplayer && !this._isVisualOnly && this.player && this.player === Game.player) {
            if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
                const enemyIds = [];
                for (const e of enemies) {
                    if (!e || e.markedForDeletion || e.health <= 0) continue;
                    const d = Utils.distance(sword.targetX, sword.targetY, e.x, e.y);
                    if (d <= this.aoeRadius) enemyIds.push(e.id);
                }
                window.SurvivalOnlineRuntime.sendToNet({
                    type: 'aoe_tick',
                    weaponType: this.weaponType,
                    x: sword.targetX,
                    y: sword.targetY,
                    radius: this.aoeRadius,
                    enemyIds: enemyIds.length ? enemyIds : undefined,
                    damage: baseDamage,
                    allowCrit: true,
                    critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0),
                    timestamp: Date.now()
                });
            }
        }
        
        for (const enemy of enemies) {
            if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
            if (processedEnemies.has(enemy)) continue;
            
            const dist = Utils.distance(sword.targetX, sword.targetY, enemy.x, enemy.y);
            if (dist <= this.aoeRadius) {
                processedEnemies.add(enemy);
                
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
                
                if (!isSurvivalMode || !isMultiplayer) {
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
                }
            }
        }
        
        // 播放音效 (ICE.mp3)
        if (this.player && !this.player._isRemotePlayer && typeof AudioManager !== 'undefined') {
            AudioManager.playSound('ICE');
        }
    }
    
    update(deltaTime) {
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            if (rt && typeof rt.getRemotePlayers === 'function') {
                const remotePlayers = rt.getRemotePlayers() || [];
                const remotePlayer = remotePlayers.find(p => p.uid === this._remotePlayerUid);
                if (remotePlayer) {
                    this.player.x = remotePlayer.x;
                    this.player.y = remotePlayer.y;
                    this.x = remotePlayer.x;
                    this.y = remotePlayer.y;
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                        this.x = Game.player.x;
                        this.y = Game.player.y;
                    }
                } else {
                    this.markedForDeletion = true;
                    return;
                }
            } else {
                this.markedForDeletion = true;
                return;
            }
        }
        
        const currentTime = Date.now();
        const elapsed = currentTime - this.startTime;
        
        if (this._isVisualOnly) {
            for (const sword of this.swords) {
                if (sword.state === 'falling') {
                    if (sword.targetEnemy && !sword.targetEnemy.markedForDeletion && sword.targetEnemy.health > 0) {
                        sword.targetX = sword.targetEnemy.x;
                        sword.targetY = sword.targetEnemy.y;
                    }
                    const fallProgress = Math.min(1, elapsed / this.fallDurationMs);
                    sword.currentX = sword.startX + (sword.targetX - sword.startX) * fallProgress;
                    sword.currentY = sword.startY + (sword.targetY - sword.startY) * fallProgress;
                    
                    if (fallProgress >= 1 && !sword.appliedDamage) {
                        sword.state = 'hit';
                        sword.hitTime = currentTime;
                        sword.appliedDamage = true;
                    }
                } else if (sword.state === 'hit') {
                    const hitElapsed = currentTime - sword.hitTime;
                    if (hitElapsed >= 100) {
                        sword.state = 'fading';
                    }
                }
            }
            
            const allFinished = this.swords.every(sword => 
                sword.state === 'fading' && sword.hitTime && 
                (currentTime - sword.hitTime - 100) >= this.fadeOutDurationMs
            );
            if (allFinished && this.swords.length > 0) {
                this.markedForDeletion = true;
            }
            return;
        }
        
        let allFinished = true;
        for (const sword of this.swords) {
            if (sword.state === 'falling') {
                if (sword.targetEnemy && !sword.targetEnemy.markedForDeletion && sword.targetEnemy.health > 0) {
                    sword.targetX = sword.targetEnemy.x;
                    sword.targetY = sword.targetEnemy.y;
                }
                const fallProgress = Math.min(1, elapsed / this.fallDurationMs);
                sword.currentX = sword.startX + (sword.targetX - sword.startX) * fallProgress;
                sword.currentY = sword.startY + (sword.targetY - sword.startY) * fallProgress;
                
                if (fallProgress >= 1 && !sword.appliedDamage) {
                    sword.state = 'hit';
                    sword.hitTime = currentTime;
                    this._applyDamage(sword);
                } else if (fallProgress < 1) {
                    allFinished = false;
                }
            } else if (sword.state === 'hit') {
                const hitElapsed = currentTime - sword.hitTime;
                if (hitElapsed >= 100) {
                    sword.state = 'fading';
                } else {
                    allFinished = false;
                }
            } else if (sword.state === 'fading') {
                const hitElapsed = currentTime - sword.hitTime;
                const fadeProgress = Math.min(1, (hitElapsed - 100) / this.fadeOutDurationMs);
                if (fadeProgress < 1) {
                    allFinished = false;
                }
            }
        }
        
        if (allFinished && this.swords.length > 0) {
            this.markedForDeletion = true;
        }
    }
    
    draw(ctx) {
        const currentTime = Date.now();
        
        for (const sword of this.swords) {
            if (sword.state === 'fading' && sword.hitTime) {
                const hitElapsed = currentTime - sword.hitTime;
                const fadeProgress = Math.min(1, (hitElapsed - 100) / this.fadeOutDurationMs);
                if (fadeProgress >= 1) continue;
            }
            
            // 使用 A51.png
            const img = (Game && Game.images) ? Game.images['A51'] : null;
            if (!img || !img.complete) continue;
            
            ctx.save();
            
            let alpha = 1.0;
            if (sword.state === 'fading' && sword.hitTime) {
                const hitElapsed = currentTime - sword.hitTime;
                const fadeProgress = Math.min(1, (hitElapsed - 100) / this.fadeOutDurationMs);
                alpha = 1.0 - fadeProgress;
            }
            ctx.globalAlpha = alpha;
            
            // 繪製星隕
            const drawWidth = this.swordImageWidth;
            const drawHeight = this.swordImageHeight;
            
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
