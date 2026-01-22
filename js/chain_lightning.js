// 連鎖閃電效果（非一般投射物，屬於持續型效果）
class ChainLightningEffect extends Entity {
    constructor(player, damage, durationMs, maxChains, chainRadius, palette) {
        // ✅ 修復：防止 player 為 null/undefined 導致整個系統崩潰
        if (!player || typeof player.x !== 'number' || typeof player.y !== 'number') {
            super(0, 0, 2, 2);
            this.player = null;
            this.markedForDeletion = true;
            return;
        }
        super(player.x, player.y, 2, 2);
        this.player = player;
        this.damage = damage;
        this.durationMs = durationMs || 1000;
        this.chainRadius = chainRadius || 220;
        this.maxChains = Math.max(0, maxChains || 0); // 次數：1代表主目標後再連1次
        this.startTime = Date.now();
        this.segments = []; // 依序揭示的電弧段
        this.particles = []; // 火花粒子
        this.weaponType = 'CHAIN_LIGHTNING';
        // 調色盤（可覆蓋顏色，不提供則使用預設藍色系）
        this.palette = (palette && typeof palette === 'object') ? palette : {
            halo: '#66ccff',
            mid: '#aaddff',
            core: '#ffffff',
            particle: '#66ccff'
        };
        this.revealedCount = 0;
        this._buildChain();
        // 音效
        try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('zaps'); } catch (_) {}
    }

    _findNearestEnemy(x, y, excludeIds = new Set(), withinRadius = null) {
        let best = null;
        let bestDist = Infinity;
        for (const enemy of (Game.enemies || [])) {
            if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
            if (excludeIds.has(enemy.id)) continue;
            const d = Utils.distance(x, y, enemy.x, enemy.y);
            if (withinRadius != null && d > withinRadius) continue;
            if (d < bestDist) { bestDist = d; best = enemy; }
        }
        return best;
    }

    _buildChain() {
        // ✅ 修復：防止 player 為 null 導致崩潰
        if (!this.player) {
            this.segments = [];
            return;
        }
        // 主目標：以玩家為起點，找最近敵人
        const exclude = new Set();
        const primary = this._findNearestEnemy(this.player.x, this.player.y, exclude, null);
        if (!primary) {
            this.segments = [];
            return;
        }
        exclude.add(primary.id);
        this.segments.push({ fromType: 'player', to: primary, applied: false, revealAt: 0 });
        // 後續連鎖：在半徑內找最近、未被擊中的敵人
        let last = primary;
        for (let i = 0; i < this.maxChains; i++) {
            const next = this._findNearestEnemy(last.x, last.y, exclude, this.chainRadius);
            if (!next) break;
            exclude.add(next.id);
            this.segments.push({ fromType: 'enemy', fromEnemy: last, to: next, applied: false, revealAt: 0 });
            last = next;
        }
        // 將段落均勻分配在持續時間內揭示
        const segCount = this.segments.length;
        const interval = segCount > 0 ? (this.durationMs / segCount) : this.durationMs;
        let t = 0;
        for (const s of this.segments) {
            s.revealAt = t;
            t += interval;
        }
    }

    update(deltaTime) {
        // ✅ 修復：如果 player 為 null，直接標記為刪除
        if (!this.player || this.markedForDeletion) {
            this.markedForDeletion = true;
            return;
        }
        // ✅ 單機同源：僅視覺連鎖閃電需要從遠程玩家位置更新（與單機模式一致）
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            let foundPlayer = false;
            // ✅ 修復：優先使用 RemotePlayerManager 獲取完整的 Player 對象
            if (rt && typeof rt.RemotePlayerManager !== 'undefined' && typeof rt.RemotePlayerManager.get === 'function') {
                const remotePlayerObj = rt.RemotePlayerManager.get(this._remotePlayerUid);
                if (remotePlayerObj) {
                    this.player.x = remotePlayerObj.x;
                    this.player.y = remotePlayerObj.y;
                    this.x = remotePlayerObj.x;
                    this.y = remotePlayerObj.y;
                    foundPlayer = true;
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                        this.x = Game.player.x;
                        this.y = Game.player.y;
                        foundPlayer = true;
                    }
                }
            }
            
            // 如果 RemotePlayerManager 找不到，嘗試使用 getRemotePlayers
            if (!foundPlayer && rt && typeof rt.getRemotePlayers === 'function') {
                const remotePlayers = rt.getRemotePlayers() || [];
                const remotePlayer = remotePlayers.find(p => 
                    (p.uid === this._remotePlayerUid) || 
                    (p._remoteUid === this._remotePlayerUid) ||
                    (p._isRemotePlayer && p._remoteUid === this._remotePlayerUid)
                );
                if (remotePlayer) {
                    // 更新玩家位置
                    this.player.x = remotePlayer.x;
                    this.player.y = remotePlayer.y;
                    this.x = remotePlayer.x;
                    this.y = remotePlayer.y;
                    foundPlayer = true;
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    // 如果是本地玩家
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                        this.x = Game.player.x;
                        this.y = Game.player.y;
                        foundPlayer = true;
                    }
                }
            }
            
            // ⚠️ 修復：如果找不到玩家，不要立即刪除，給一個寬限期（避免瞬間消失）
            if (!foundPlayer) {
                // 初始化寬限期計數器
                if (this._playerNotFoundCount == null) {
                    this._playerNotFoundCount = 0;
                }
                this._playerNotFoundCount += deltaTime;
                // 如果超過 500ms 還找不到玩家，才標記為刪除
                if (this._playerNotFoundCount > 500) {
                    this.markedForDeletion = true;
                    return;
                }
                // 在寬限期內，繼續更新粒子（使用最後已知位置）
                this._updateParticles(deltaTime);
                const elapsed = Date.now() - this.startTime;
                if (elapsed >= this.durationMs) {
                    this.markedForDeletion = true;
                }
                return;
            } else {
                // 找到玩家，重置計數器
                this._playerNotFoundCount = 0;
            }
            
            // ⚠️ 修復：如果 segments 為空（可能是因為創建時沒有敵人），嘗試重新構建連鎖
            // ⚠️ 優化：避免每幀都檢查，只在第一次或每隔一段時間檢查一次（減少性能開銷）
            if (this.segments.length === 0) {
                // 初始化重構計數器
                if (this._rebuildAttemptCount == null) {
                    this._rebuildAttemptCount = 0;
                    this._lastRebuildAttempt = Date.now();
                }
                const now = Date.now();
                // 每隔 100ms 嘗試一次重構（避免每幀都調用 _buildChain，減少性能開銷）
                if (now - this._lastRebuildAttempt >= 100) {
                    this._lastRebuildAttempt = now;
                    this._rebuildAttemptCount++;
                    // 嘗試重新構建連鎖（敵人可能已經同步了）
                    this._buildChain();
                    // 如果還是沒有 segments，繼續等待（不立即刪除）
                    if (this.segments.length === 0) {
                        // 在寬限期內，繼續更新粒子（使用最後已知位置）
                        this._updateParticles(deltaTime);
                        const elapsed = Date.now() - this.startTime;
                        // 如果超過持續時間的一半還沒構建成功，才標記為刪除
                        if (elapsed >= this.durationMs * 0.5) {
                            this.markedForDeletion = true;
                        }
                        return;
                    }
                } else {
                    // 在等待重構期間，繼續更新粒子
                    this._updateParticles(deltaTime);
                    const elapsed = Date.now() - this.startTime;
                    if (elapsed >= this.durationMs * 0.5) {
                        this.markedForDeletion = true;
                    }
                    return;
                }
            }
            
            // 僅視覺模式：只更新粒子，不進行傷害計算
            this._updateParticles(deltaTime);
            const elapsed = Date.now() - this.startTime;
            if (elapsed >= this.durationMs) {
                this.markedForDeletion = true;
            }
            return;
        }
        
        // 生命期管理
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.durationMs) {
            this.markedForDeletion = true;
            return;
        }
        // 更新粒子
        this._updateParticles(deltaTime);
        // 在對應時間點對段落目標施加傷害（只施加一次）
        for (const seg of this.segments) {
            if (seg.applied) continue;
            if (elapsed >= seg.revealAt) {
                const target = seg.to;
                if (target && !target.markedForDeletion && target.health > 0) {
                    let finalDamage = this.damage;
                    let isCrit = false;
                    let lifestealAmount = 0;
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(this.damage, target, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
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
                    
                    // ⚠️ 修復：確保不會傷害玩家（只傷害敵人）
                    // 檢查 target 是否是玩家（避免連鎖閃電傷害到玩家導致紅閃）
                    const isPlayer = (target && typeof target === 'object' && (
                        target.constructor && target.constructor.name === 'Player' ||
                        (typeof Game !== 'undefined' && Game.player && target === Game.player) ||
                        (typeof Player !== 'undefined' && target instanceof Player)
                    ));
                    
                    // 單機模式：直接造成傷害並顯示傷害數字（但只對敵人）
                    if (!isSurvivalMode || !isMultiplayer) {
                        if (!isPlayer && target && !target.markedForDeletion && target.health > 0) {
                            target.takeDamage(finalDamage);
                            if (typeof DamageNumbers !== 'undefined') {
                                const { fx, fy, tx, ty } = this._segmentEndpoints(seg);
                                DamageNumbers.show(finalDamage, target.x, target.y - (target.height||0)/2, isCrit, { dirX: (tx - fx), dirY: (ty - fy), enemyId: target.id });
                            }
                        }
                    }
                    // 多人模式：傷害由 game.js 自動發送 aoe_tick 到伺服器，伺服器透過 hitEvents 返回傷害數字
                    this._spawnSegmentSparks(seg);
                }
                seg.applied = true;
            }
        }
    }

    _updateParticles(deltaTime) {
        const toRemove = [];
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.life -= deltaTime;
            if (p.life <= 0) { toRemove.push(i); continue; }
            p.x += p.vx * (deltaTime / 16.67);
            p.y += p.vy * (deltaTime / 16.67);
        }
        for (let i = toRemove.length - 1; i >= 0; i--) {
            this.particles.splice(toRemove[i], 1);
        }
    }

    _spawnSegmentSparks(seg) {
        const { fx, fy, tx, ty } = this._segmentEndpoints(seg);
        const dx = tx - fx;
        const dy = ty - fy;
        const len = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / (len || 1);
        const dirY = dy / (len || 1);
        const count = 16; // 純視覺增強：適度提高粒子數量
        for (let i = 0; i < count; i++) {
            const t = Math.random();
            const px = fx + dx * t + (Math.random() - 0.5) * 8;
            const py = fy + dy * t + (Math.random() - 0.5) * 8;
            const speed = 1 + Math.random() * 3;
            const angle = Math.random() * Math.PI * 2;
            const life = 200 + Math.random() * 250; // 保持原生命區間（純視覺）
            this.particles.push({
                x: px,
                y: py,
                vx: Math.cos(angle) * speed + dirX * 0.5,
                vy: Math.sin(angle) * speed + dirY * 0.5,
                life,
                maxLife: life, // 新增：用於透明度計算，不影響邏輯
                size: 3 + Math.random() * 2.5, // 純視覺：放大粒子
                color: this.palette.particle || '#66ccff'
            });
        }
    }

    _segmentEndpoints(seg) {
        // 起點：玩家當前位置或上一段的敵人當前位置（跟隨移動）
        // ✅ 修復：防止 player 為 null 導致崩潰
        if (!this.player) return { fx: 0, fy: 0, tx: 0, ty: 0 };
        let fx, fy;
        if (seg.fromType === 'player') {
            fx = this.player.x; fy = this.player.y;
        } else {
            fx = seg.fromEnemy ? seg.fromEnemy.x : this.player.x;
            fy = seg.fromEnemy ? seg.fromEnemy.y : this.player.y;
        }
        const tx = seg.to ? seg.to.x : fx;
        const ty = seg.to ? seg.to.y : fy;
        return { fx, fy, tx, ty };
    }

    draw(ctx) {
        ctx.save();
        // 繪製已揭示段落的電弧（抖動多段）
        const elapsed = Date.now() - this.startTime;
        for (const seg of this.segments) {
            if (elapsed < seg.revealAt) continue;
            const { fx, fy, tx, ty } = this._segmentEndpoints(seg);
            this._drawElectricArc(ctx, fx, fy, tx, ty);
        }
        // 使用加色混合提升火花的亮度與震撼感（僅此效果範圍內）
        ctx.globalCompositeOperation = 'lighter';
        // 繪製粒子（雙層：外層光暈 + 核心）
        for (const p of this.particles) {
            const alpha = Math.max(0.04, Math.min(1, p.life / (p.maxLife || 250)));
            ctx.fillStyle = p.color || (this.palette.particle || '#66ccff');
            // 外層光暈（柔和擴散）
            ctx.globalAlpha = alpha * 0.25;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
            ctx.fill();
            // 核心亮點
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _drawElectricArc(ctx, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(8, Math.floor(dist / 16));
        const jitterAmp = Math.min(10, dist / 12);
        const angle = Math.atan2(dy, dx);
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const points = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const bx = x1 + dx * t;
            const by = y1 + dy * t;
            const jitter = (Math.random() - 0.5) * jitterAmp;
            points.push({ x: bx + nx * jitter, y: by + ny * jitter });
        }
        // 外層光暈（加粗）
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 10;
        ctx.strokeStyle = this.palette.halo || '#66ccff';
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        // 中層（加粗）
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 6;
        ctx.strokeStyle = this.palette.mid || '#aaddff';
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        // 核心亮線（加粗）
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.palette.core || '#ffffff';
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }
}

// 狂熱雷擊效果：同時間分散多支短連鎖電弧
class FrenzyLightningEffect extends Entity {
    constructor(player, damage, durationMs, branchCount, chainsPerBranch, chainRadius, palette) {
        // ✅ 修復：防止 player 為 null/undefined 導致整個系統崩潰
        if (!player || typeof player.x !== 'number' || typeof player.y !== 'number') {
            super(0, 0, 2, 2);
            this.player = null;
            this.markedForDeletion = true;
            return;
        }
        super(player.x, player.y, 2, 2);
        this.player = player;
        this.damage = damage;
        this.durationMs = durationMs || 900;
        this.chainRadius = chainRadius || 240;
        this.branchCount = Math.max(1, branchCount || 2);
        this.chainsPerBranch = Math.max(1, chainsPerBranch || 2); // 每支電弧的段數（含第一段）
        this.startTime = Date.now();
        this.segments = [];
        this.particles = [];
        this.weaponType = 'FRENZY_LIGHTNING';
        // 調色盤（可覆蓋顏色，不提供則使用預設藍色系）
        this.palette = (palette && typeof palette === 'object') ? palette : {
            halo: '#66ccff',
            mid: '#aaddff',
            core: '#ffffff',
            particle: '#66ccff'
        };
        // ✅ 修復：只有在 player 有效時才構建連鎖
        if (this.player && !this.markedForDeletion) {
            this._buildFrenzy();
            try { if (typeof AudioManager !== 'undefined') AudioManager.playSound('zaps'); } catch (_) {}
        }
    }

    _findNearestEnemy(x, y, excludeIds = new Set(), withinRadius = null) {
        let best = null;
        let bestDist = Infinity;
        for (const enemy of (Game.enemies || [])) {
            if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
            if (excludeIds.has(enemy.id)) continue;
            const d = Utils.distance(x, y, enemy.x, enemy.y);
            if (withinRadius != null && d > withinRadius) continue;
            if (d < bestDist) { bestDist = d; best = enemy; }
        }
        return best;
    }

    _buildFrenzy() {
        // ✅ 修復：防止 player 為 null 導致崩潰
        if (!this.player) {
            this.segments = [];
            return;
        }
        const globalExclude = new Set();
        const primaries = [];
        // 選出分支的主目標（盡量不重覆，且需在半徑內，從玩家位置最近開始）
        for (let i = 0; i < this.branchCount; i++) {
            const p = this._findNearestEnemy(this.player.x, this.player.y, globalExclude, this.chainRadius);
            if (!p) break;
            globalExclude.add(p.id);
            primaries.push(p);
        }
        if (primaries.length === 0) return;

        // 依段數將揭示時間切成多個波次（避免完全同時）
        const steps = this.chainsPerBranch;
        const stepInterval = this.durationMs / Math.max(1, steps);

        // 建立每支分支的段落
        for (let b = 0; b < primaries.length; b++) {
            const primary = primaries[b];
            // 第一步：玩家 → 主目標
            this.segments.push({ fromType: 'player', to: primary, applied: false, revealAt: b * 35 /*輕微錯開*/ });
            // 後續短連鎖：主目標 → 下一個目標（在半徑內，避免與其他分支重覆）
            let last = primary;
            let localExclude = new Set(globalExclude);
            for (let s = 1; s < steps; s++) {
                const next = this._findNearestEnemy(last.x, last.y, localExclude, this.chainRadius);
                if (!next) break;
                localExclude.add(next.id);
                // 將該段安排在第 s 波次揭示，並加入少量隨機延遲以分散視覺
                const jitter = Math.random() * 80;
                const revealAt = s * stepInterval + jitter;
                this.segments.push({ fromType: 'enemy', fromEnemy: last, to: next, applied: false, revealAt });
                last = next;
            }
        }
    }

    update(deltaTime) {
        // 僅視覺狂熱雷擊：需要從遠程玩家位置更新
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            let foundPlayer = false;
            // ✅ 修復：優先使用 RemotePlayerManager 獲取完整的 Player 對象
            if (rt && typeof rt.RemotePlayerManager !== 'undefined' && typeof rt.RemotePlayerManager.get === 'function') {
                const remotePlayerObj = rt.RemotePlayerManager.get(this._remotePlayerUid);
                if (remotePlayerObj) {
                    this.player.x = remotePlayerObj.x;
                    this.player.y = remotePlayerObj.y;
                    this.x = remotePlayerObj.x;
                    this.y = remotePlayerObj.y;
                    foundPlayer = true;
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                        this.x = Game.player.x;
                        this.y = Game.player.y;
                        foundPlayer = true;
                    }
                }
            }
            
            // 如果 RemotePlayerManager 找不到，嘗試使用 getRemotePlayers
            if (!foundPlayer && rt && typeof rt.getRemotePlayers === 'function') {
                const remotePlayers = rt.getRemotePlayers() || [];
                const remotePlayer = remotePlayers.find(p => 
                    (p.uid === this._remotePlayerUid) || 
                    (p._remoteUid === this._remotePlayerUid) ||
                    (p._isRemotePlayer && p._remoteUid === this._remotePlayerUid)
                );
                if (remotePlayer) {
                    this.player.x = remotePlayer.x;
                    this.player.y = remotePlayer.y;
                    this.x = remotePlayer.x;
                    this.y = remotePlayer.y;
                    foundPlayer = true;
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                        this.x = Game.player.x;
                        this.y = Game.player.y;
                        foundPlayer = true;
                    }
                }
            }
            
            // ⚠️ 修復：如果找不到玩家，不要立即刪除，給一個寬限期（避免瞬間消失）
            if (!foundPlayer) {
                // 初始化寬限期計數器
                if (this._playerNotFoundCount == null) {
                    this._playerNotFoundCount = 0;
                }
                this._playerNotFoundCount += deltaTime;
                // 如果超過 500ms 還找不到玩家，才標記為刪除
                if (this._playerNotFoundCount > 500) {
                    this.markedForDeletion = true;
                    return;
                }
                // 在寬限期內，繼續更新粒子（使用最後已知位置）
                this._updateParticles(deltaTime);
                const elapsed = Date.now() - this.startTime;
                if (elapsed >= this.durationMs) {
                    this.markedForDeletion = true;
                }
                return;
            } else {
                // 找到玩家，重置計數器
                this._playerNotFoundCount = 0;
            }
            
            // ⚠️ 修復：如果 segments 為空（可能是因為創建時沒有敵人），嘗試重新構建連鎖
            // ⚠️ 優化：避免每幀都檢查，只在第一次或每隔一段時間檢查一次（減少性能開銷）
            if (this.segments.length === 0) {
                // 初始化重構計數器
                if (this._rebuildAttemptCount == null) {
                    this._rebuildAttemptCount = 0;
                    this._lastRebuildAttempt = Date.now();
                }
                const now = Date.now();
                // 每隔 100ms 嘗試一次重構（避免每幀都調用 _buildFrenzy，減少性能開銷）
                if (now - this._lastRebuildAttempt >= 100) {
                    this._lastRebuildAttempt = now;
                    this._rebuildAttemptCount++;
                    // 嘗試重新構建連鎖（敵人可能已經同步了）
                    this._buildFrenzy();
                    // 如果還是沒有 segments，繼續等待（不立即刪除）
                    if (this.segments.length === 0) {
                        // 在寬限期內，繼續更新粒子（使用最後已知位置）
                        this._updateParticles(deltaTime);
                        const elapsed = Date.now() - this.startTime;
                        // 如果超過持續時間的一半還沒構建成功，才標記為刪除
                        if (elapsed >= this.durationMs * 0.5) {
                            this.markedForDeletion = true;
                        }
                        return;
                    }
                } else {
                    // 在等待重構期間，繼續更新粒子
                    this._updateParticles(deltaTime);
                    const elapsed = Date.now() - this.startTime;
                    if (elapsed >= this.durationMs * 0.5) {
                        this.markedForDeletion = true;
                    }
                    return;
                }
            }
            
            // 僅視覺模式：只更新粒子，不進行傷害計算
            this._updateParticles(deltaTime);
            const elapsed = Date.now() - this.startTime;
            if (elapsed >= this.durationMs) {
                this.markedForDeletion = true;
            }
            return;
        }
        
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.durationMs) {
            this.markedForDeletion = true;
            return;
        }
        this._updateParticles(deltaTime);
        for (const seg of this.segments) {
            if (seg.applied) continue;
            if (elapsed >= seg.revealAt) {
                const target = seg.to;
                if (target && !target.markedForDeletion && target.health > 0) {
                    let finalDamage = this.damage;
                    let isCrit = false;
                    let lifestealAmount = 0;
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(this.damage, target, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
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
                    
                    // ⚠️ 修復：確保不會傷害玩家（只傷害敵人）
                    // 檢查 target 是否是玩家（避免連鎖閃電傷害到玩家導致紅閃）
                    const isPlayer = (target && typeof target === 'object' && (
                        target.constructor && target.constructor.name === 'Player' ||
                        (typeof Game !== 'undefined' && Game.player && target === Game.player) ||
                        (typeof Player !== 'undefined' && target instanceof Player)
                    ));
                    
                    // 單機模式：直接造成傷害並顯示傷害數字（但只對敵人）
                    if (!isSurvivalMode || !isMultiplayer) {
                        if (!isPlayer && target && !target.markedForDeletion && target.health > 0) {
                            target.takeDamage(finalDamage);
                            if (typeof DamageNumbers !== 'undefined') {
                                const { fx, fy, tx, ty } = this._segmentEndpoints(seg);
                                DamageNumbers.show(finalDamage, target.x, target.y - (target.height||0)/2, isCrit, { dirX: (tx - fx), dirY: (ty - fy), enemyId: target.id });
                            }
                        }
                    }
                    // 多人模式：傷害由 game.js 自動發送 aoe_tick 到伺服器，伺服器透過 hitEvents 返回傷害數字
                    this._spawnSegmentSparks(seg);
                }
                seg.applied = true;
            }
        }
    }

    _updateParticles(deltaTime) {
        const toRemove = [];
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.life -= deltaTime;
            if (p.life <= 0) { toRemove.push(i); continue; }
            p.x += p.vx * (deltaTime / 16.67);
            p.y += p.vy * (deltaTime / 16.67);
        }
        for (let i = toRemove.length - 1; i >= 0; i--) {
            this.particles.splice(toRemove[i], 1);
        }
    }

    _spawnSegmentSparks(seg) {
        const { fx, fy, tx, ty } = this._segmentEndpoints(seg);
        const dx = tx - fx;
        const dy = ty - fy;
        const len = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / (len || 1);
        const dirY = dy / (len || 1);
        const count = 16;
        for (let i = 0; i < count; i++) {
            const t = Math.random();
            const px = fx + dx * t + (Math.random() - 0.5) * 8;
            const py = fy + dy * t + (Math.random() - 0.5) * 8;
            const speed = 1 + Math.random() * 3;
            const angle = Math.random() * Math.PI * 2;
            const life = 200 + Math.random() * 250;
            this.particles.push({
                x: px,
                y: py,
                vx: Math.cos(angle) * speed + dirX * 0.5,
                vy: Math.sin(angle) * speed + dirY * 0.5,
                life,
                maxLife: life,
                size: 3 + Math.random() * 2.5,
                color: this.palette.particle || '#66ccff'
            });
        }
    }

    _segmentEndpoints(seg) {
        let fx, fy;
        if (seg.fromType === 'player') {
            // ✅ 修復：防止 player 為 null 導致崩潰
            if (!this.player) return { fx: 0, fy: 0, tx: 0, ty: 0 };
            fx = this.player.x; fy = this.player.y;
        } else {
            fx = seg.fromEnemy ? seg.fromEnemy.x : this.player.x;
            fy = seg.fromEnemy ? seg.fromEnemy.y : this.player.y;
        }
        const tx = seg.to ? seg.to.x : fx;
        const ty = seg.to ? seg.to.y : fy;
        return { fx, fy, tx, ty };
    }

    draw(ctx) {
        ctx.save();
        const elapsed = Date.now() - this.startTime;
        for (const seg of this.segments) {
            if (elapsed < seg.revealAt) continue;
            const { fx, fy, tx, ty } = this._segmentEndpoints(seg);
            this._drawElectricArc(ctx, fx, fy, tx, ty);
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.particles) {
            const alpha = Math.max(0.04, Math.min(1, p.life / (p.maxLife || 250)));
            ctx.fillStyle = p.color || '#66ccff';
            ctx.globalAlpha = alpha * 0.25;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _drawElectricArc(ctx, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(8, Math.floor(dist / 16));
        const jitterAmp = Math.min(10, dist / 12);
        const angle = Math.atan2(dy, dx);
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const points = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const bx = x1 + dx * t;
            const by = y1 + dy * t;
            const jitter = (Math.random() - 0.5) * jitterAmp;
            points.push({ x: bx + nx * jitter, y: by + ny * jitter });
        }
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 10;
        ctx.strokeStyle = this.palette.halo || '#66ccff';
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 6;
        ctx.strokeStyle = this.palette.mid || '#aaddff';
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.palette.core || '#ffffff';
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }
}
