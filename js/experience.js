// 經驗寶石類
// ✅ 防止重複聲明：如果已經定義，跳過
if (typeof ExperienceOrb === 'undefined') {
class ExperienceOrb extends Entity {
    constructor(x, y, value) {
        super(x, y, CONFIG.EXPERIENCE.SIZE, CONFIG.EXPERIENCE.SIZE);
        this.value = value || CONFIG.EXPERIENCE.VALUE;
        this.collisionRadius = CONFIG.EXPERIENCE.SIZE / 2;
        this.attractionSpeed = 0;
        this.maxAttractionSpeed = 10;
        this.attractionRange = 100;
        this.attractionAcceleration = 0.2;
    }
    
    update(deltaTime) {
        // ✅ MMORPG 架構：防止重複處理，如果已經被標記為刪除，不再處理
        if (this.markedForDeletion) return;
        
        // ✅ MMORPG 架構：支援多玩家收集（本地玩家 + 遠程玩家），不依賴室長端
        const allPlayers = [];
        if (Game.player) allPlayers.push(Game.player);
        // ✅ MMORPG 架構：使用 RemotePlayerManager 獲取遠程玩家（所有端都可以）
        if (Game.multiplayer) {
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
                
                if (isSurvivalMode && typeof window !== 'undefined' && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.getAllPlayers === 'function') {
                        const remotePlayers = rm.getAllPlayers();
                        for (const remotePlayer of remotePlayers) {
                            if (remotePlayer && !remotePlayer.markedForDeletion) {
                                allPlayers.push(remotePlayer);
                            }
                        }
                    }
                }
            } catch (_) {}
        }
        
        // 找到最近的玩家（用於吸引）
        let nearestPlayer = null;
        let nearestDist = Infinity;
        for (const p of allPlayers) {
            const dist = Utils.distance(this.x, this.y, p.x, p.y);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestPlayer = p;
            }
        }
        
        if (nearestPlayer) {
            const prMul = (nearestPlayer && nearestPlayer.pickupRangeMultiplier) ? nearestPlayer.pickupRangeMultiplier : 1;
            const effectiveRange = this.attractionRange * prMul;
            if (nearestDist < effectiveRange) {
                // 增加吸引速度（按時間縮放）
                const deltaMul = deltaTime / 16.67;
                this.attractionSpeed = Math.min(this.attractionSpeed + this.attractionAcceleration * deltaMul, this.maxAttractionSpeed);
                
                // 計算移動方向
                const angle = Utils.angle(this.x, this.y, nearestPlayer.x, nearestPlayer.y);
                this.x += Math.cos(angle) * this.attractionSpeed * deltaMul;
                this.y += Math.sin(angle) * this.attractionSpeed * deltaMul;
            }
        }
        
        // ✅ MMORPG 架構：在循環外部定義 isMultiplayer，確保在整個收集邏輯中都可訪問
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer);
        
        // 檢查是否被任何玩家收集
        for (const player of allPlayers) {
            if (this.isColliding(player)) {
                // ✅ MMORPG 架構：立即標記為刪除，防止多個玩家同時檢測到碰撞時重複給經驗
                this.markedForDeletion = true;
                // ✅ MMORPG 架構：所有玩家都能共享經驗，不依賴室長端
                if (isMultiplayer) {
                    // 多人模式：給所有玩家經驗（經驗共享）
                    // 只有本地玩家播放音效（避免重複播放）
                    if (player === Game.player && !player._isRemotePlayer) {
                        if (typeof AudioManager !== 'undefined') {
                            // 尊重 EXP 音效開關
                            if (AudioManager.expSoundEnabled !== false) {
                                AudioManager.playSound('collect_exp');
                            }
                        }
                    }
                    // 給本地玩家經驗
                    if (Game.player) {
                        Game.player.gainExperience(this.value);
                    }
                    // 給所有遠程玩家經驗
                    // ✅ MMORPG 架構：使用 RemotePlayerManager 獲取遠程玩家（所有端都可以）
                    try {
                        if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                            const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                            if (typeof rm.getAllPlayers === 'function') {
                                const remotePlayers = rm.getAllPlayers();
                                for (const remotePlayer of remotePlayers) {
                                    if (remotePlayer && !remotePlayer.markedForDeletion) {
                                        remotePlayer.gainExperience(this.value);
                                    }
                                }
                            }
                        }
                    } catch (_) {}
                    // ✅ MMORPG 架構：廣播經驗球被撿取事件，讓所有玩家都知道經驗球已消失
                    if (typeof window !== "undefined" && typeof window.SurvivalOnlineBroadcastEvent === "function") {
                        window.SurvivalOnlineBroadcastEvent("exp_orb_collected", {
                            x: this.x,
                            y: this.y,
                            value: this.value
                        });
                    }
                } else {
                    // 單人模式：只給收集者經驗
                    if (typeof AudioManager !== 'undefined') {
                        // 尊重 EXP 音效開關
                        if (AudioManager.expSoundEnabled !== false) {
                            AudioManager.playSound('collect_exp');
                        }
                    }
                    player.gainExperience(this.value);
                }
                // 銷毀經驗球並返回（只執行一次）
                this.destroy();
                return;
            }
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        // 優先使用圖片繪製（1:1比例）
        if (Game.images && Game.images.exp_orb) {
            const size = Math.max(this.width, this.height);
            ctx.drawImage(Game.images.exp_orb, this.x - size / 2, this.y - size / 2, size, size);
        } else {
            // 備用：使用純色圓形
            ctx.fillStyle = '#0f0';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 閃爍效果（在經驗球數量少於閾值時才顯示）
        const orbCount = (Game.experienceOrbs && Game.experienceOrbs.length) || 0;
        const threshold = (CONFIG.OPTIMIZATION && CONFIG.OPTIMIZATION.ORB_PULSE_DISABLE_THRESHOLD) || 100;
        if (orbCount < threshold) {
            const pulseSize = Math.sin(Date.now() / 200) * 2;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.width / 2 + pulseSize, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}
} // ✅ 結束 if (typeof ExperienceOrb === 'undefined')
