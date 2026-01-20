// 路口地圖：車輛危險物（每 10 秒生成 3 台，直線穿越場景）
// - 不與障礙/敵人發生物理碰撞（可穿過）
// - 僅在與玩家重疊時造成一次性傷害（吃防禦與無敵）
class CarHazard extends Entity {
    /**
     * @param {Object} opts
     * @param {number} opts.x
     * @param {number} opts.y
     * @param {number} opts.vx  以「每 16.67ms」為基準的速度分量（與 Enemy.speed 同尺度）
     * @param {number} opts.vy
     * @param {number} opts.width
     * @param {number} opts.height
     * @param {string} opts.imageKey Game.images key
     * @param {number} [opts.damage=100]
     * @param {number} opts.despawnPad 額外超出邊界多少就刪除（像素）
     */
    constructor(opts) {
        super(opts.x, opts.y, opts.width, opts.height);
        this.vx = opts.vx;
        this.vy = opts.vy;
        this.imageKey = opts.imageKey;
        this.damage = (typeof opts.damage === 'number') ? opts.damage : 100;
        this.despawnPad = (typeof opts.despawnPad === 'number') ? opts.despawnPad : 200;
        this.hitPlayer = false; // 每台車只打一次
        this.weaponType = 'INTERSECTION_CAR'; // 用於渲染層級控制
    }

    update(deltaTime) {
        const deltaMul = deltaTime / 16.67;
        this.x += this.vx * deltaMul;
        this.y += this.vy * deltaMul;

        // 僅視覺效果：不進行碰撞檢測和傷害計算，但仍需檢查出界刪除
        if (this._isVisualOnly) {
            // 檢查出界後刪除
            const w = (typeof Game !== 'undefined' && Game.worldWidth) ? Game.worldWidth : (CONFIG && CONFIG.CANVAS_WIDTH);
            const h = (typeof Game !== 'undefined' && Game.worldHeight) ? Game.worldHeight : (CONFIG && CONFIG.CANVAS_HEIGHT);
            if (
                this.x < -this.despawnPad ||
                this.y < -this.despawnPad ||
                this.x > (w + this.despawnPad) ||
                this.y > (h + this.despawnPad)
            ) {
                this.markedForDeletion = true;
            }
            return;
        }

        // 玩家碰撞：只觸發一次傷害
        // 組隊模式：檢查所有玩家（本地玩家 + 遠程玩家），確保公平性
        if (!this.hitPlayer) {
            // 收集所有需要檢查的玩家
            const allPlayers = [];
            const localPlayer = (typeof Game !== 'undefined') ? Game.player : null;
            if (localPlayer) allPlayers.push(localPlayer);
            
            // ✅ MMORPG 架構：添加遠程玩家，不依賴室長端
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
                
                // ✅ MMORPG 架構：使用 RemotePlayerManager 獲取遠程玩家（所有端都可以）
                if (isSurvivalMode && typeof Game !== 'undefined' && Game.multiplayer) {
                    try {
                        if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                            const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                            if (typeof rm.getAllPlayers === 'function') {
                                const remotePlayers = rm.getAllPlayers();
                                for (const remotePlayer of remotePlayers) {
                                    if (remotePlayer && !remotePlayer.markedForDeletion && !remotePlayer._isDead) {
                                        allPlayers.push(remotePlayer);
                                    }
                                }
                            }
                        }
                    } catch (_) {}
                }
            } catch (_) {}
            
            // 檢查所有玩家是否與車輛碰撞
            const rectX = this.x - this.width / 2;
            const rectY = this.y - this.height / 2;
            for (const player of allPlayers) {
                if (!player) continue;
                const pr = (player.collisionRadius != null) ? player.collisionRadius : (Math.max(player.width || 48, player.height || 60) / 2);
                if (typeof Utils !== 'undefined' && Utils.circleRectCollision && Utils.circleRectCollision(player.x, player.y, pr, rectX, rectY, this.width, this.height)) {
                    this.hitPlayer = true;
                    try {
                        if (typeof player.takeDamage === 'function') {
                            // 車輛：屬於環境重擊
                            // - 忽略受傷短暫無敵（HIT_FLASH），避免「撞到但不扣血」
                            // - 忽略閃避（抽象化/天賦），避免環境傷害被迴避
                            // - 仍尊重技能無敵（INVINCIBLE）由 Player.takeDamage 內部處理
                            player.takeDamage(this.damage, { ignoreInvulnerability: true, ignoreDodge: true, source: 'intersection_car' });
                        }
                    } catch (_) {}

                    // 命中音效（bo.mp3）- 僅本地玩家觸發音效
                    try {
                        if (player === localPlayer && typeof AudioManager !== 'undefined' && typeof AudioManager.playSound === 'function') {
                            AudioManager.playSound('bo');
                        }
                    } catch (_) {}

                    // 撞擊特效：螢幕白閃 + 爆炸粒子（沿用既有管線）
                    // 注意：螢幕白閃僅本地玩家觸發，爆炸粒子需要同步
                    try {
                        if (typeof Game !== 'undefined') {
                            // 螢幕白閃：僅本地玩家觸發
                            if (player === localPlayer) {
                                Game.screenFlash = { active: true, duration: 140, intensity: 0.28 };
                            }
                            
                            // 爆炸粒子：需要同步
                            if (!Game.explosionParticles) Game.explosionParticles = [];
                            const cx = (player && player.x != null) ? player.x : this.x;
                            const cy = (player && player.y != null) ? player.y : this.y;
                            const count = 18;
                            for (let i = 0; i < count; i++) {
                                const ang = Math.random() * Math.PI * 2;
                                const spd = 2.5 + Math.random() * 5.5;
                            const particle = {
                                x: cx + (Math.random() - 0.5) * 8,
                                y: cy + (Math.random() - 0.5) * 8,
                                vx: Math.cos(ang) * spd,
                                vy: Math.sin(ang) * spd,
                                life: 320 + Math.random() * 220,
                                maxLife: 320 + Math.random() * 220,
                                size: 5 + Math.random() * 4,
                                color: (i % 3 === 0) ? '#ffffff' : '#ff6666',
                                source: 'CAR_HIT'
                            };
                            Game.explosionParticles.push(particle);
                            
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
                                        x: particle.x,
                                        y: particle.y,
                                        vx: particle.vx,
                                        vy: particle.vy,
                                        life: particle.life,
                                        maxLife: particle.maxLife,
                                        size: particle.size,
                                        color: particle.color,
                                        source: particle.source
                                    });
                                }
                            } catch (_) {}
                            }
                        }
                    } catch (_) {}
                    
                    // 只撞到第一個玩家就停止（每台車只打一次）
                    break;
                }
            }
        }

        // 出界後刪除
        const w = (typeof Game !== 'undefined' && Game.worldWidth) ? Game.worldWidth : (CONFIG && CONFIG.CANVAS_WIDTH);
        const h = (typeof Game !== 'undefined' && Game.worldHeight) ? Game.worldHeight : (CONFIG && CONFIG.CANVAS_HEIGHT);
        if (
            this.x < -this.despawnPad ||
            this.y < -this.despawnPad ||
            this.x > (w + this.despawnPad) ||
            this.y > (h + this.despawnPad)
        ) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        if (!ctx) return;
        const img = (typeof Game !== 'undefined' && Game.images) ? Game.images[this.imageKey] : null;
        ctx.save();
        if (img && img.complete) {
            ctx.drawImage(img, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        } else {
            // 後備：灰色矩形
            ctx.fillStyle = '#888';
            ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }
        ctx.restore();
    }
}

// ✅ 讓 ES module（例如 survival_online.js）可以從 globalThis 取得建構子
try {
    if (typeof window !== 'undefined') {
        window.CarHazard = CarHazard;
    }
} catch (_) { }


