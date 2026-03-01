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
     * @param {string} [opts.weaponType='INTERSECTION_CAR'] 用於渲染與邏輯區分（如 FBI）
     * @param {boolean} [opts.noShake=false] 為 true 時不觸發相機震動（FBI 技能）
     * @param {number} [opts.particleScale=1] 粒子數量倍率（FBI 簡化 5 倍則為 0.2）
     * @param {string} [opts.hitSoundKey='bo'] 命中時播放的音效鍵（撞擊統一使用 bo；FBI 車亦用 bo，並依 weaponType 做次數平衡）
     */
    constructor(opts) {
        super(opts.x, opts.y, opts.width, opts.height);
        this.vx = opts.vx;
        this.vy = opts.vy;
        this.imageKey = opts.imageKey;
        this.damage = (typeof opts.damage === 'number') ? opts.damage : 100;
        this.despawnPad = (typeof opts.despawnPad === 'number') ? opts.despawnPad : 200;
        this.hitPlayer = false; // 每台車只打一次
        this.weaponType = (opts.weaponType && typeof opts.weaponType === 'string') ? opts.weaponType : 'INTERSECTION_CAR';
        this.noShake = opts.noShake === true;
        this.particleScale = (typeof opts.particleScale === 'number' && opts.particleScale > 0) ? opts.particleScale : 1;
        this.hitSoundKey = (opts.hitSoundKey && typeof opts.hitSoundKey === 'string') ? opts.hitSoundKey : 'bo';
        if (this.weaponType === 'FBI') {
            this._gifOverlayId = 'fbi-car-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
        }
    }

    update(deltaTime) {
        const deltaMul = deltaTime / 16.67;
        // 組隊時車輛位置只由 updateCarHazardsFromServer 同步，不在此處用速度累加，避免拖影／連成一條
        if (!this._isVisualOnly) {
            this.x += this.vx * deltaMul;
            this.y += this.vy * deltaMul;
        }

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

        // ✅ 元素分類：
        // - **多人元素（伺服器權威）**：碰撞扣血/死亡判定（避免雙重扣血、避免不同端結果不一致）
        // - **單機元素（本地）**：本檔案的碰撞扣血邏輯（僅單機/非權威多人可用）
        const isServerAuthoritative = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
        // FBI 技能車：對「怪」造成傷害，不撞玩家
        if (this.weaponType === 'FBI') {
            if (!isServerAuthoritative && typeof Game !== 'undefined' && Array.isArray(Game.enemies)) {
                if (!this.hitEnemyIds) this.hitEnemyIds = new Set();
                const rectX = this.x - this.width / 2;
                const rectY = this.y - this.height / 2;
                for (const enemy of Game.enemies) {
                    if (!enemy || enemy.isDead || enemy.markedForDeletion) continue;
                    if (this.hitEnemyIds.has(enemy.id)) continue;
                    const cr = (enemy.collisionRadius != null) ? enemy.collisionRadius : 16;
                    if (typeof Utils !== 'undefined' && Utils.circleRectCollision && Utils.circleRectCollision(enemy.x, enemy.y, cr, rectX, rectY, this.width, this.height)) {
                        this.hitEnemyIds.add(enemy.id);
                        try {
                            if (typeof enemy.takeDamage === 'function') {
                                enemy.takeDamage(this.damage, { weaponType: 'FBI' });
                            }
                        } catch (_) {}
                        try {
                            if (typeof DamageNumbers !== 'undefined' && DamageNumbers.show) {
                                DamageNumbers.show(Math.round(this.damage), enemy.x, enemy.y - (enemy.height || 0) / 2, false, { enemyId: enemy.id });
                            }
                        } catch (_) {}
                        try {
                            if (typeof Game !== 'undefined') {
                                if (!Game.explosionParticles) Game.explosionParticles = [];
                                const cx = enemy.x;
                                const cy = enemy.y;
                                const count = Math.max(1, Math.floor(18 * (this.particleScale || 1)));
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
                                }
                            }
                        } catch (_) {}
                    }
                }
            }
        } else if (!isServerAuthoritative && !this.hitPlayer) {
            // 路口地圖車輛：對玩家造成傷害（只觸發一次）
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

                    // 命中音效：路口車使用 bo；FBI 車撞擊無聲
                    try {
                        if (player === localPlayer && typeof AudioManager !== 'undefined' && typeof AudioManager.playSound === 'function' && this.weaponType !== 'FBI') {
                            AudioManager.playSound(this.hitSoundKey || 'bo');
                        }
                    } catch (_) {}

                    // 撞擊特效：螢幕白閃 + 爆炸粒子 + 相機震動（沿用既有管線）
                    // 注意：螢幕白閃和相機震動僅本地玩家觸發，爆炸粒子需要同步
                    try {
                        if (typeof Game !== 'undefined') {
                            // 螢幕白閃：僅本地玩家觸發
                            if (player === localPlayer) {
                                Game.screenFlash = { active: true, duration: 140, intensity: 0.28 };
                                // ✅ 修复：添加相机震动（与BOSS投射物一致）；FBI 技能不震動
                                if (!this.noShake) {
                                    if (!Game.cameraShake) {
                                        Game.cameraShake = { active: false, intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };
                                    }
                                    Game.cameraShake.active = true;
                                    Game.cameraShake.intensity = 8; // 与BOSS投射物一致
                                    Game.cameraShake.duration = 200; // 200毫秒
                                }
                            }
                            
                            // 爆炸粒子：需要同步；FBI 簡化 5 倍（particleScale 0.2）
                            if (!Game.explosionParticles) Game.explosionParticles = [];
                            const cx = (player && player.x != null) ? player.x : this.x;
                            const cy = (player && player.y != null) ? player.y : this.y;
                            const count = Math.max(1, Math.floor(18 * (this.particleScale || 1)));
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
        let vm = null, canvas = null, scaleX = 1, scaleY = 1, camX = 0, camY = 0, vw = 0, vh = 0;
        try {
            vm = (typeof Game !== 'undefined') ? Game.viewMetrics : null;
            canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                scaleX = vm ? vm.scaleX : (rect.width / canvas.width);
                scaleY = vm ? vm.scaleY : (rect.height / canvas.height);
                camX = vm ? vm.camX : ((typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0);
                camY = vm ? vm.camY : ((typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0);
                vw = canvas.width * scaleX;
                vh = canvas.height * scaleY;
            }
        } catch (_) {}
        const margin = 128;
        if (canvas) {
            let sx = (this.x - camX) * scaleX;
            let sy = (this.y - camY) * scaleY;
            const left = sx - this.width / 2, right = sx + this.width / 2, top = sy - this.height / 2, bottom = sy + this.height / 2;
            if (right < -margin || bottom < -margin || left > vw + margin || top > vh + margin) {
                const overlayId = (this.weaponType === 'FBI' && (this.id != null ? 'fbi-car-' + String(this.id) : this._gifOverlayId));
                if (overlayId && typeof GifOverlay !== 'undefined' && GifOverlay.hide) {
                    GifOverlay.hide(overlayId);
                }
                return;
            }
        }
        // FBI 車：只用 GifOverlay 顯示 GIF 動畫（絕不用 Canvas，否則會變靜態圖或拖一整排）
        if (this.weaponType === 'FBI') {
            const screenX = this.x - camX;
            const screenY = this.y - camY;
            // 一車一 overlay：組隊用 server id，單機用 constructor 的 _gifOverlayId
            const overlayId = this.id != null ? ('fbi-car-' + String(this.id)) : this._gifOverlayId;
            // 一律用 GIF 的 URL：優先 Game.images，否則用直接路徑，確保是 .gif 動態檔
            let gifSrc = '';
            const img = (typeof Game !== 'undefined' && Game.images) ? Game.images[this.imageKey] : null;
            if (img && (img.src || img.currentSrc)) {
                gifSrc = img.src || img.currentSrc;
            }
            if (!gifSrc && this.imageKey === 'FBI2') {
                gifSrc = 'assets/images/FBI2.gif';
            }
            if (!gifSrc) {
                gifSrc = 'assets/images/FBI.gif';
            }
            if (overlayId && typeof GifOverlay !== 'undefined' && GifOverlay.showOrUpdate) {
                GifOverlay.showOrUpdate(overlayId, gifSrc, screenX, screenY, { width: this.width, height: this.height }, false);
            }
            ctx.save();
            ctx.restore();
            return;
        }
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

    destroy() {
        const overlayId = (this.weaponType === 'FBI' && (this.id != null ? 'fbi-car-' + String(this.id) : this._gifOverlayId));
        if (overlayId && typeof GifOverlay !== 'undefined' && GifOverlay.hide) {
            GifOverlay.hide(overlayId);
        }
    }
}

// ✅ 讓 ES module（例如 survival_online.js）可以從 globalThis 取得建構子
try {
    if (typeof window !== 'undefined') {
        window.CarHazard = CarHazard;
    }
} catch (_) { }


