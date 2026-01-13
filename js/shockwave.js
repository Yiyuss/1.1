// 心靈震波效果（擴散型環狀傷害）
class ShockwaveEffect extends Entity {
    constructor(player, damage, durationMs, maxRadius, ringWidth, palette) {
        super(player.x, player.y, 2, 2);
        this.player = player;
        // 震波中心會跟隨玩家移動（每幀同步）
        this.cx = player.x;
        this.cy = player.y;
        this.damage = damage;
        this.durationMs = durationMs || 1000;
        this.maxRadius = Math.max(10, maxRadius || 220);
        this.ringWidth = Math.max(6, ringWidth || 18);
        this.startTime = Date.now();
        this.weaponType = 'MIND_MAGIC';
        this.hitEnemies = new Set(); // 每名敵人僅受一次傷害
        // 調色盤（可覆蓋顏色，不提供則使用預設紫色系）
        this.palette = (palette && typeof palette === 'object') ? palette : {
            halo: '#cc66ff',
            mid: '#ddaaff',
            core: '#ffffff'
        };
        // 聲效改由武器觸發，避免重複播放
        // （心靈魔法沿用唱歌音效，由 weapon.js 統一播放）
    }

    update(deltaTime) {
        // 僅視覺震波：需要從遠程玩家位置更新
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            if (rt && typeof rt.getRemotePlayers === 'function') {
                const remotePlayers = rt.getRemotePlayers() || [];
                const remotePlayer = remotePlayers.find(p => p.uid === this._remotePlayerUid);
                if (remotePlayer) {
                    // 更新玩家位置
                    this.player.x = remotePlayer.x;
                    this.player.y = remotePlayer.y;
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    // 如果是本地玩家
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                    }
                } else {
                    // 如果找不到對應的玩家，標記為刪除
                    this.markedForDeletion = true;
                    return;
                }
            } else {
                this.markedForDeletion = true;
                return;
            }
        }
        
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.durationMs) {
            this.markedForDeletion = true;
            return;
        }

        // 跟隨玩家：震波中心點每幀同步
        if (this.player) {
            this.cx = this.player.x;
            this.cy = this.player.y;
            // 同步 Entity 位置（保險：避免其他系統依賴 this.x/y）
            this.x = this.cx;
            this.y = this.cy;
        }

        const progress = Math.max(0, Math.min(1, elapsed / this.durationMs));
        this.currentRadius = this.maxRadius * progress;

        // 僅視覺震波：不進行碰撞檢測和傷害計算
        if (this._isVisualOnly) {
            return; // 僅視覺，不進行碰撞檢測和傷害計算
        }

        // 命中判定：距離中心落在當前環寬度範圍內
        const r = this.currentRadius || 0;
        const half = this.ringWidth * 0.5;
        const enemies = (Game && Array.isArray(Game.enemies)) ? Game.enemies : [];
        for (const enemy of enemies) {
            if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
            if (this.hitEnemies.has(enemy.id)) continue;
            const d = Utils.distance(this.cx, this.cy, enemy.x, enemy.y);
            if (d >= (r - half) && d <= (r + half)) {
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
                enemy.takeDamage(finalDamage);
                // 命中後施加暫時緩速：99% 超慢但仍可移動（1.5秒）
                if (enemy && typeof enemy.applySlow === 'function') {
                    try { enemy.applySlow(1500, 0.01); } catch (_) {}
                }
                if (typeof DamageNumbers !== 'undefined') {
                    const dirX = enemy.x - this.cx;
                    const dirY = enemy.y - this.cy;
                    DamageNumbers.show(finalDamage, enemy.x, enemy.y - (enemy.height || 0) / 2, isCrit, { dirX, dirY, enemyId: enemy.id });
                }
                
                // 多人模式：發送enemy_damage（用於同步傷害數字，不影響傷害計算）
                if (isSurvivalMode && isMultiplayer && enemy && enemy.id) {
                    if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
                        window.SurvivalOnlineRuntime.sendToNet({
                            t: "enemy_damage",
                            enemyId: enemy.id,
                            damage: finalDamage,
                            weaponType: this.weaponType || "UNKNOWN",
                            isCrit: isCrit,
                            lifesteal: lifestealAmount
                        });
                    }
                }
                this.hitEnemies.add(enemy.id);
            }
        }
    }

    draw(ctx) {
        const r = this.currentRadius || 0;
        if (r <= 0) return;
        ctx.save();
        // 使用加色混合提升光環亮度
        ctx.globalCompositeOperation = 'lighter';
        // 外層光暈
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = Math.max(8, this.ringWidth);
        ctx.strokeStyle = this.palette.halo || '#cc66ff';
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // 中層
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = Math.max(4, this.ringWidth * 0.6);
        ctx.strokeStyle = this.palette.mid || '#ddaaff';
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // 核心亮線
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = Math.max(2, this.ringWidth * 0.3);
        ctx.strokeStyle = this.palette.core || '#ffffff';
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}
