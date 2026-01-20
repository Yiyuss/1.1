// 雷射光束：從玩家位置朝最近敵人方向，延伸至世界邊界，持續造成傷害
class LaserBeam extends Entity {
    constructor(player, angle, damage, widthPx, durationMs, tickIntervalMs) {
        // 使用極細的碰撞包圍盒，不依賴圓形碰撞；實際碰撞用線段距離計算
        super(player.x, player.y, 1, 1);
        this.player = player;
        this.angle = angle;
        this.damage = damage;
        this.width = widthPx; // 畫面線寬（像素）
        this.duration = durationMs;
        this.tickIntervalMs = tickIntervalMs;
        this.tickAccumulator = 0;
        this.startTime = Date.now();
        this.weaponType = 'LASER';
        // 預先計算端點
        const pts = this.computeEndpoints();
        this.startX = pts.startX;
        this.startY = pts.startY;
        this.endX = pts.endX;
        this.endY = pts.endY;
        // 視覺用脈動相位（不影響碰撞與傷害）
        this.pulsePhase = 0;
    }

    computeEndpoints() {
        const sx = this.player.x;
        const sy = this.player.y;
        const dx = Math.cos(this.angle);
        const dy = Math.sin(this.angle);
        const worldW = Game.worldWidth || Game.canvas.width;
        const worldH = Game.worldHeight || Game.canvas.height;

        // 邊界t（最近前向邊界）
        const edgeCandidates = [];
        if (dx > 0) {
            edgeCandidates.push((worldW - sx) / dx);
        } else if (dx < 0) {
            edgeCandidates.push((0 - sx) / dx);
        }
        if (dy > 0) {
            edgeCandidates.push((worldH - sy) / dy);
        } else if (dy < 0) {
            edgeCandidates.push((0 - sy) / dy);
        }
        const positiveEdges = edgeCandidates.filter(t => t > 0);
        let closestT = positiveEdges.length ? Math.min(...positiveEdges) : 0;

        // 障礙物阻擋：找出最小正交點t
        for (const obs of Game.obstacles || []) {
            const halfW = obs.width / 2;
            const halfH = obs.height / 2;
            const left = obs.x - halfW;
            const right = obs.x + halfW;
            const top = obs.y - halfH;
            const bottom = obs.y + halfH;
            const tHit = Utils.rayAABBIntersection(sx, sy, dx, dy, left, top, right, bottom);
            if (tHit !== Infinity && tHit > 0 && tHit < closestT) {
                closestT = tHit;
            }
        }

        const ex = sx + dx * closestT;
        const ey = sy + dy * closestT;
        return { startX: sx, startY: sy, endX: ex, endY: ey };
    }

    // 點到線段距離（世界座標），用於碰撞近似
    pointSegmentDistance(px, py, x1, y1, x2, y2) {
        const vx = x2 - x1;
        const vy = y2 - y1;
        const len2 = vx * vx + vy * vy;
        if (len2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * vx + (py - y1) * vy) / len2;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * vx;
        const projY = y1 + t * vy;
        return Math.hypot(px - projX, py - projY);
    }

    update(deltaTime) {
        // 僅視覺雷射：需要從遠程玩家位置更新
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            if (rt && typeof rt.getRemotePlayers === 'function') {
                const remotePlayers = rt.getRemotePlayers() || [];
                // ✅ 修復：getRemotePlayers 返回的對象有 uid 屬性，但 Player 對象使用 _remoteUid
                // 需要同時檢查 uid 和 _remoteUid
                const remotePlayer = remotePlayers.find(p => 
                    (p.uid === this._remotePlayerUid) || 
                    (p._remoteUid === this._remotePlayerUid) ||
                    (p._isRemotePlayer && p._remoteUid === this._remotePlayerUid)
                );
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
                    // ✅ 修復：如果找不到對應的玩家，不要立即刪除，先嘗試使用 RemotePlayerManager
                    try {
                        if (rt && rt.RemotePlayerManager && typeof rt.RemotePlayerManager.get === 'function') {
                            const remotePlayerObj = rt.RemotePlayerManager.get(this._remotePlayerUid);
                            if (remotePlayerObj) {
                                this.player.x = remotePlayerObj.x;
                                this.player.y = remotePlayerObj.y;
                            } else {
                                // 如果還是找不到，標記為刪除
                                this.markedForDeletion = true;
                                return;
                            }
                        } else {
                            // 如果找不到對應的玩家，標記為刪除
                            this.markedForDeletion = true;
                            return;
                        }
                    } catch (_) {
                        this.markedForDeletion = true;
                        return;
                    }
                }
            } else {
                // ✅ 修復：如果 getRemotePlayers 不可用，嘗試使用 RemotePlayerManager
                try {
                    if (rt && rt.RemotePlayerManager && typeof rt.RemotePlayerManager.get === 'function') {
                        const remotePlayerObj = rt.RemotePlayerManager.get(this._remotePlayerUid);
                        if (remotePlayerObj) {
                            this.player.x = remotePlayerObj.x;
                            this.player.y = remotePlayerObj.y;
                        } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                            if (typeof Game !== 'undefined' && Game.player) {
                                this.player = Game.player;
                            }
                        } else {
                            this.markedForDeletion = true;
                            return;
                        }
                    } else {
                        this.markedForDeletion = true;
                        return;
                    }
                } catch (_) {
                    this.markedForDeletion = true;
                    return;
                }
            }
        }
        
        // 追隨玩家位置（方向固定），重新計算端點
        const pts = this.computeEndpoints();
        this.startX = pts.startX;
        this.startY = pts.startY;
        this.endX = pts.endX;
        this.endY = pts.endY;

        // 僅視覺雷射：不進行碰撞檢測和傷害計算
        if (this._isVisualOnly) {
            // 視覺脈動相位推進
            this.pulsePhase += deltaTime;
            // 檢查持續時間
            const elapsed = Date.now() - this.startTime;
            if (elapsed >= this.duration) {
                this.markedForDeletion = true;
            }
            return; // 僅視覺，不進行碰撞檢測和傷害計算
        }

        // 固定時間間隔對穿過的敵人造成傷害（不衰減，使用原傷害）
        this.tickAccumulator += deltaTime;
        // 視覺脈動相位推進
        this.pulsePhase += deltaTime;
        if (this.tickAccumulator >= this.tickIntervalMs) {
            const half = this.width / 2;
            for (const enemy of Game.enemies) {
                const d = this.pointSegmentDistance(enemy.x, enemy.y, this.startX, this.startY, this.endX, this.endY);
                if (d <= half + enemy.collisionRadius) {
                    // 光芒萬丈特殊處理：每個敵人最多只能被3條雷射持續傷害
                    // 一旦某個敵人被3條雷射分配，這3條雷射會持續對該敵人造成傷害，其他7條雷射不會傷害該敵人
                    // 使用全局共享的分配表，確保即使有多個實例，每個敵人也最多只被3條雷射傷害
                    if (this.weaponType === 'RADIANT_GLORY' && this._radiantGloryAssignment && typeof this._radiantGloryMaxHits === 'number' && this.beamUniqueId) {
                        const enemyId = enemy.id || enemy;
                        let assignedBeams = this._radiantGloryAssignment.get(enemyId);
                        
                        // 如果該敵人還沒有被分配雷射，創建一個Set
                        if (!assignedBeams) {
                            assignedBeams = new Set();
                            this._radiantGloryAssignment.set(enemyId, assignedBeams);
                        }
                        
                        // 如果該敵人已經被分配了3條雷射，檢查這條雷射是否在其中
                        if (assignedBeams.size >= this._radiantGloryMaxHits) {
                            // 如果這條雷射不在分配列表中，跳過傷害
                            if (!assignedBeams.has(this.beamUniqueId)) {
                                continue;
                            }
                            // 如果這條雷射在分配列表中，繼續造成傷害（持續傷害）
                        } else {
                            // 如果該敵人還沒有被分配滿3條雷射，將這條雷射加入分配列表
                            // 使用原子操作：先檢查再添加，確保不會超過3條
                            if (assignedBeams.size < this._radiantGloryMaxHits) {
                                assignedBeams.add(this.beamUniqueId);
                            } else {
                                // 如果已經滿了（可能是在檢查和添加之間被其他雷射填滿），跳過傷害
                                continue;
                            }
                        }
                    }
                    
                    let finalDamage = this.damage;
                    let isCrit = false;
                    let lifestealAmount = 0;
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(this.damage, enemy, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
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
                            DamageNumbers.show(finalDamage, enemy.x, enemy.y - (enemy.height||0)/2, isCrit, { dirX: Math.cos(this.angle), dirY: Math.sin(this.angle), enemyId: enemy.id });
                        }
                    }
                    // 多人模式：LaserBeam 沒有 tickDamage 屬性，所以 game.js 不會自動處理
                    // 需要手動發送 aoe_tick 到伺服器（使用線段範圍而非圓形範圍）
                    if (isSurvivalMode && isMultiplayer && !this._isVisualOnly && this.player && this.player === Game.player) {
                        if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
                            // 計算受影響的敵人範圍
                            const half = this.width / 2;
                            const hitEnemies = [];
                            for (const e of Game.enemies) {
                                if (!e || e.markedForDeletion) continue;
                                const d = this.pointSegmentDistance(e.x, e.y, this.startX, this.startY, this.endX, this.endY);
                                if (d <= half + e.collisionRadius) {
                                    hitEnemies.push(e.id);
                                }
                            }
                            if (hitEnemies.length > 0) {
                                window.SurvivalOnlineRuntime.sendToNet({
                                    type: 'aoe_tick',
                                    weaponType: this.weaponType || 'LASER',
                                    x: this.startX,
                                    y: this.startY,
                                    endX: this.endX,
                                    endY: this.endY,
                                    width: this.width,
                                    damage: this.damage,
                                    allowCrit: true,
                                    critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0),
                                    enemyIds: hitEnemies
                                });
                            }
                        }
                    }
                }
            }
            this.tickAccumulator = 0;
        }

        // 到期銷毀
        if (Date.now() - this.startTime >= this.duration) {
            this.destroy();
        }
    }

    draw(ctx) {
        ctx.save();
        // 固定線寬（取消縮放動作感）；改用亮度微閃爍提升震撼
        const t = (this.pulsePhase || 0) / 1000;
        const drawWidth = this.width;
        const flickerAlpha = 0.85 + 0.15 * Math.sin(t * 12);

        // 使用線性漸層作為核心
        const core = ctx.createLinearGradient(this.startX, this.startY, this.endX, this.endY);
        core.addColorStop(0, '#0ff');
        core.addColorStop(0.5, '#fff');
        core.addColorStop(1, '#0ff');
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = core;
        ctx.globalAlpha = flickerAlpha;
        ctx.lineWidth = drawWidth;
        ctx.beginPath();
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(this.endX, this.endY);
        ctx.stroke();

        // 顏色邊緣-雙重散射，營造震撼但無縮放
        const nx = -Math.sin(this.angle);
        const ny = Math.cos(this.angle);
        const edgeOffset = 2.0;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = 'rgba(0,255,255,0.7)';
        ctx.lineWidth = drawWidth * 1.1;
        ctx.beginPath();
        ctx.moveTo(this.startX + nx * edgeOffset, this.startY + ny * edgeOffset);
        ctx.lineTo(this.endX + nx * edgeOffset, this.endY + ny * edgeOffset);
        ctx.stroke();
        ctx.globalAlpha = 0.26;
        ctx.strokeStyle = 'rgba(255,0,255,0.6)';
        ctx.lineWidth = drawWidth * 1.1;
        ctx.beginPath();
        ctx.moveTo(this.startX - nx * edgeOffset, this.startY - ny * edgeOffset);
        ctx.lineTo(this.endX - nx * edgeOffset, this.endY - ny * edgeOffset);
        ctx.stroke();

        // 疊加光暈層（疊加模式）
        ctx.globalCompositeOperation = 'lighter';
        // 內層光暈
        ctx.strokeStyle = '#bff';
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = drawWidth * 1.35;
        ctx.beginPath();
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(this.endX, this.endY);
        ctx.stroke();
        // 外層光暈
        ctx.strokeStyle = '#9ff';
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = drawWidth * 1.9;
        ctx.beginPath();
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(this.endX, this.endY);
        ctx.stroke();

        // 端點閃光（半徑隨脈動）
        const radius = Math.max(6, drawWidth * 0.6);
        const drawGlow = (x, y) => {
            const rg = ctx.createRadialGradient(x, y, 0, x, y, radius);
            rg.addColorStop(0, 'rgba(255,255,255,0.9)');
            rg.addColorStop(0.3, 'rgba(0,255,255,0.6)');
            rg.addColorStop(1, 'rgba(0,255,255,0)');
            ctx.fillStyle = rg;
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        };
        drawGlow(this.startX, this.startY);
        drawGlow(this.endX, this.endY);

        ctx.restore();
    }
}
