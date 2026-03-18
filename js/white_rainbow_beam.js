// 白虹光束（合成技能：雷射LV10 + 白夜光束LV10）：玩家為中心瞬時範圍傷害×3
// - 技能圖標：A63.png；特效僅在受擊敵人身上：A62.png 動態雪碧圖（3行5列12幀，128x128）
// - 玩家本身不顯示特效，僅每個受擊怪物身上播放 1 次 A62 動畫（僅第1次命中時建立，不重複3次）
// - 範圍：固定 330px（=白夜光束LV10），每級基礎攻擊+2
// - 傷害與冷卻與白夜光束相同（DAMAGE 15, COOLDOWN 2400），但打3下（間隔0.2秒）
// 依賴：Entity、Game、CONFIG、DamageSystem、DamageNumbers、Utils
(function () {
    const beamCfg = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS.WHITE_RAINBOW_BEAM) ? CONFIG.WEAPONS.WHITE_RAINBOW_BEAM : {};
    const FIELD_RADIUS = (typeof beamCfg.FIELD_RADIUS === 'number') ? beamCfg.FIELD_RADIUS : 330;
    const HIT_COUNT = (typeof beamCfg.HIT_COUNT === 'number') ? beamCfg.HIT_COUNT : 3;
    const HIT_INTERVAL_MS = (typeof beamCfg.HIT_INTERVAL_MS === 'number') ? beamCfg.HIT_INTERVAL_MS : 200;

    class WhiteRainbowBeamEffect extends Entity {
        constructor(player, damage, radius, level, options) {
            super(player.x, player.y, 256, 256);
            this.player = player;
            this.damage = Math.max(0, damage || 15);
            this.radius = Math.max(10, radius || FIELD_RADIUS);
            this.level = Math.max(1, Math.min(10, (level || 1) | 0));
            this.weaponType = 'WHITE_RAINBOW_BEAM';
            this.startTime = Date.now();
            this.durationMs = 500;
            this._isVisualOnly = !!(options && options._isVisualOnly);
            this.frameWidth = 128;
            this.frameHeight = 128;
            this.framesPerRow = 5;
            this.framesPerCol = 3;
            this.totalFrames = 12;
            this.hitEffectDurationMs = 500;
            this.hitFrameDuration = this.hitEffectDurationMs / this.totalFrames;

            this.spriteSheet = (typeof Game !== 'undefined' && Game.images && Game.images['A62']) ? Game.images['A62'] : null;
            this.spriteSheetLoaded = !!(this.spriteSheet && this.spriteSheet.complete && this.spriteSheet.naturalWidth > 0);
            if (!this.spriteSheet && typeof Game !== 'undefined' && Game.images) {
                const img = new Image();
                img.onload = () => {
                    this.spriteSheet = img;
                    this.spriteSheetLoaded = true;
                };
                img.onerror = () => { this.spriteSheetLoaded = false; };
                img.src = 'assets/images/A62.png';
            }

            this.hitEnemies = [];
            this._hitPool = [];

            this._hitCount = HIT_COUNT;
            this._hitIntervalMs = HIT_INTERVAL_MS;
            this._hitsApplied = 0;

            this.x = this.player.x;
            this.y = this.player.y;
            if (!this._isVisualOnly) this._applyDamageHit(true);
        }

        _applyDamageHit(isFirstHit) {
            if (this._isVisualOnly) return;
            this._hitsApplied++;

            const cx = this.player.x;
            const cy = this.player.y;
            const r = this.radius;
            let candidates = [];
            try {
                if (typeof Game !== 'undefined' && typeof Game.getEnemiesNearCircle === 'function') {
                    candidates = Game.getEnemiesNearCircle(cx, cy, r);
                } else {
                    candidates = (Game && Array.isArray(Game.enemies)) ? Game.enemies : [];
                }
            } catch (_) {
                candidates = (Game && Array.isArray(Game.enemies)) ? Game.enemies : [];
            }

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
            const firstEnemy = candidates.find(e => e && !e.markedForDeletion && e.health > 0);
            if (firstEnemy && typeof DamageSystem !== 'undefined') {
                const result = DamageSystem.computeHit(this.damage, firstEnemy, {
                    weaponType: this.weaponType,
                    critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0), critMultiplierBonusPct: ((this.player && this.player.awakeningCritDamageBonusPct) || 0)
                });
                baseDamage = result.amount;
            }

            if (isSurvivalMode && isMultiplayer && this.player && this.player === Game.player) {
                if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                    window.SurvivalOnlineRuntime.sendToNet({
                        type: 'aoe_tick',
                        weaponType: this.weaponType,
                        x: cx,
                        y: cy,
                        radius: r,
                        damage: baseDamage,
                        allowCrit: true,
                        critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0), critMultiplierBonusPct: ((this.player && this.player.awakeningCritDamageBonusPct) || 0),
                        timestamp: Date.now()
                    });
                }
            }

            const r2 = r * r;
            for (const enemy of candidates) {
                if (!enemy || enemy.markedForDeletion || enemy.health <= 0) continue;
                const dx = enemy.x - cx;
                const dy = enemy.y - cy;
                if ((dx * dx + dy * dy) > r2) continue;

                if (!isSurvivalMode || !isMultiplayer) {
                    let finalDamage = this.damage;
                    let isCrit = false;
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(this.damage, enemy, {
                            weaponType: this.weaponType,
                            critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0), critMultiplierBonusPct: ((this.player && this.player.awakeningCritDamageBonusPct) || 0)
                        });
                        finalDamage = result.amount;
                        isCrit = result.isCrit;
                    }
                    if (typeof enemy.takeDamage === 'function') {
                        enemy.takeDamage(finalDamage, { weaponType: this.weaponType });
                    }
                    if (typeof DamageNumbers !== 'undefined' && DamageNumbers.show) {
                        DamageNumbers.show(Math.round(finalDamage), enemy.x, enemy.y - (enemy.height || 0) / 2, isCrit, { enemyId: enemy.id });
                    }
                }
                if (isFirstHit) {
                    this.hitEnemies.push({
                        enemy: enemy,
                        x: enemy.x,
                        y: enemy.y,
                        enemyId: enemy.id || null,
                        startTime: Date.now()
                    });
                }
            }
            if (isFirstHit) this._createHitOverlays();
        }

        _createHitOverlays() {
            const viewport = document.getElementById('viewport');
            if (!viewport) return;
            let layer = document.getElementById('skill-effects-layer');
            if (!layer) {
                layer = document.createElement('div');
                layer.id = 'skill-effects-layer';
                layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:7;';
                viewport.appendChild(layer);
            }
            const hitImg = (Game && Game.images) ? Game.images['A62'] : null;
            if (!hitImg || !hitImg.complete || !(hitImg.naturalWidth > 0)) return;
            const cap = Math.min(50, this.hitEnemies.length);
            const sizePx = 280;
            for (let i = 0; i < cap; i++) {
                const hit = this.hitEnemies[i];
                if (!hit) continue;
                if (hit.domEl && layer.contains(hit.domEl)) continue;
                const el = this._hitPool.length ? this._hitPool.pop() : document.createElement('canvas');
                el.width = sizePx;
                el.height = sizePx;
                el.style.cssText = 'position:absolute;width:' + sizePx + 'px;height:' + sizePx + 'px;transform:translate(-50%,-50%);image-rendering:pixelated;pointer-events:none;';
                el.dataset.logic = 'white-rainbow-beam-hit';
                el.dataset.hitIndex = i;
                layer.appendChild(el);
                hit.domEl = el;
            }
            this._updateHitOverlayPositions();
        }

        _updateHitOverlayPositions() {
            if (!this.hitEnemies.length) return;
            if (this._lastHitDomUpdateAt && (Date.now() - this._lastHitDomUpdateAt) < 33) return;
            const canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
            if (!canvas) return;
            const vm = (typeof Game !== 'undefined') ? Game.viewMetrics : null;
            const scaleX = vm ? vm.scaleX : 1;
            const scaleY = vm ? vm.scaleY : 1;
            const camX = vm ? vm.camX : ((typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0);
            const camY = vm ? vm.camY : ((typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0);
            const vw = canvas.width * scaleX;
            const vh = canvas.height * scaleY;
            const margin = 128;
            const img = (Game && Game.images) ? Game.images['A62'] : null;
            const now = Date.now();
            const frameDuration = this.hitFrameDuration || (500 / 12);
            for (const hit of this.hitEnemies) {
                if (!hit || !hit.domEl) continue;
                try {
                    const ex = hit.x != null ? hit.x : (hit.enemy && !hit.enemy.markedForDeletion ? hit.enemy.x : 0);
                    const ey = hit.y != null ? hit.y : (hit.enemy && !hit.enemy.markedForDeletion ? hit.enemy.y : 0);
                    let sx = (ex - camX) * scaleX;
                    let sy = (ey - camY) * scaleY;
                    if (sx < -margin || sy < -margin || sx > vw + margin || sy > vh + margin) continue;
                    const leftPx = Math.round(sx);
                    const topPx = Math.round(sy);
                    hit.domEl.style.left = leftPx + 'px';
                    hit.domEl.style.top = topPx + 'px';
                    if (hit.domEl.getContext && img && img.complete) {
                        const elapsed = now - (hit.startTime || now);
                        const frameIndex = Math.min(this.totalFrames - 1, Math.floor(elapsed / frameDuration));
                        const col = frameIndex % this.framesPerRow;
                        const row = Math.floor(frameIndex / this.framesPerRow);
                        const ctx = hit.domEl.getContext('2d');
                        if (ctx) {
                            ctx.clearRect(0, 0, hit.domEl.width, hit.domEl.height);
                            ctx.drawImage(img, col * this.frameWidth, row * this.frameHeight, this.frameWidth, this.frameHeight, 0, 0, hit.domEl.width, hit.domEl.height);
                        }
                    }
                } catch (_) { }
            }
            this._lastHitDomUpdateAt = now;
        }

        _destroyHitOverlays() {
            for (const hit of this.hitEnemies) {
                if (hit && hit.domEl && hit.domEl.parentNode) {
                    hit.domEl.parentNode.removeChild(hit.domEl);
                    this._hitPool.push(hit.domEl);
                }
            }
            this.hitEnemies = [];
        }

        update(deltaTime) {
            if (this._isVisualOnly && this._remotePlayerUid) {
                try {
                    const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                    if (rt && typeof rt.RemotePlayerManager !== 'undefined' && typeof rt.RemotePlayerManager.get === 'function') {
                        const remotePlayer = rt.RemotePlayerManager.get(this._remotePlayerUid);
                        if (remotePlayer) {
                            this.player = remotePlayer;
                            this.x = remotePlayer.x;
                            this.y = remotePlayer.y;
                        } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid) && typeof Game !== 'undefined' && Game.player) {
                            this.player = Game.player;
                            this.x = Game.player.x;
                            this.y = Game.player.y;
                        } else {
                            this.markedForDeletion = true;
                            this._destroyHitOverlays();
                            return;
                        }
                    } else {
                        this.markedForDeletion = true;
                        this._destroyHitOverlays();
                        return;
                    }
                    const elapsed = Date.now() - this.startTime;
                    if (elapsed >= this.durationMs) {
                        this.markedForDeletion = true;
                        this._destroyHitOverlays();
                    } else {
                        this._updateHitOverlayPositions();
                    }
                } catch (e) {
                    this.markedForDeletion = true;
                    try { this._destroyHitOverlays(); } catch (_) { }
                }
                return;
            }
            if (this.player) {
                this.x = this.player.x;
                this.y = this.player.y;
            }

            if (!this._isVisualOnly && this._hitsApplied < this._hitCount) {
                const elapsed = Date.now() - this.startTime;
                const nextHitTime = this._hitsApplied * this._hitIntervalMs;
                if (elapsed >= nextHitTime) {
                    this._applyDamageHit(false);
                }
            }

            const elapsed = Date.now() - this.startTime;
            if (elapsed >= this.durationMs) {
                this.markedForDeletion = true;
                this._destroyHitOverlays();
            } else {
                this._updateHitOverlayPositions();
            }
        }

        draw(ctx) {
            // 玩家本身不顯示特效，僅受擊敵人身上有 A62 動態雪碧圖（在 _updateHitOverlayPositions 的 DOM canvas 繪製）
        }
    }

    if (typeof window !== 'undefined') {
        window.WhiteRainbowBeamEffect = WhiteRainbowBeamEffect;
    }
})();
