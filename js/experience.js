// 經驗寶石類
// ✅ 防止重複聲明：如果已經定義，跳過
(function() {
    'use strict';
    if (typeof ExperienceOrb !== 'undefined') {
        return;
    }
    try {
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

        // ✅ 權威伺服器模式：多人進行中時，經驗球只做「顯示/插值」，不做吸附/碰撞/給經驗/廣播事件
        // 經驗共享由伺服器 updateExperienceOrbs 統一結算，再透過 game-state 同步回來。
        try {
            if (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled) {
                // 網路插值（如果 survival_online.js 有提供 _netTargetX/Y）
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
                return;
            }
        } catch (_) {}
        
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
                    // ✅ 隔離：只允許「組隊 survival（enabled）」送多人封包；且權威多人下不再廣播 exp_orb_collected
                    try {
                        const mp = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled === true);
                        // 權威多人：不廣播（由 server state 同步）
                        if (mp) return;
                    } catch (_) {}
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
        // 将类暴露到全局作用域
        if (typeof window !== 'undefined') {
            window.ExperienceOrb = ExperienceOrb;
        } else if (typeof global !== 'undefined') {
            global.ExperienceOrb = ExperienceOrb;
        }
    } catch(e) {
        console.error('[experience.js] ❌ 定义 ExperienceOrb 类时出错:', e);
        console.error('[experience.js] 错误堆栈:', e.stack);
    }
})();
