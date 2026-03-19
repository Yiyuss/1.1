// 重力塌縮技能系統
// 從玩家射出重力球，直線移動由快至慢，觸碰敵人緩速+持續傷害
// 特效雪碧圖：A81start(1x8)、A81loop(1x5)、A81end(1x6)，每張128x128

class GravityCollapseProjectile extends Entity {
    constructor(startX, startY, angle, weaponLevel, player) {
        const cfg = (CONFIG && CONFIG.WEAPONS && CONFIG.WEAPONS.GRAVITY_COLLAPSE) || {};
        const radius = cfg.FIELD_RADIUS || 304;
        const size = radius * 2;
        super(startX, startY, size, size);

        this.startX = startX;
        this.startY = startY;
        this.angle = angle;
        this.weaponLevel = weaponLevel || 1;
        this.player = player;
        this.weaponType = 'GRAVITY_COLLAPSE';

        this.maxRange = cfg.MAX_RANGE || 500;
        this.durationMs = cfg.DURATION || 3000;
        this.radius = radius;
        this.elapsedTime = 0;
        this.traveledDistance = 0;

        // 雪碧圖階段：start(8幀) -> loop(5幀) -> end(6幀)
        this.spriteStartFrames = cfg.SPRITE_START_FRAMES || 8;
        this.spriteLoopFrames = cfg.SPRITE_LOOP_FRAMES || 5;
        this.spriteEndFrames = cfg.SPRITE_END_FRAMES || 6;
        this.spriteFrameSize = cfg.SPRITE_FRAME_SIZE || 128;
        this.frameDuration = 75; // 每幀約75ms（比原50ms慢50%）
        this.frameIndex = 0;
        this.frameAccumulator = 0;

        // 階段：'start' | 'loop' | 'end'
        this.phase = 'start';

        // 速度：start 快 -> loop 超慢 -> end 消失
        this.speedStart = 600;   // start 階段速度
        this.speedLoop = 10;     // loop 階段超慢
        this.speedEnd = 0;       // end 階段不動

        // 計算傷害（與大波球LV10相同邏輯）
        let damage = cfg.DAMAGE || 2;
        if (player && player.weapons) {
            const weapon = player.weapons.find(w => w.type === 'GRAVITY_COLLAPSE');
            if (weapon && typeof weapon._computeFinalDamage === 'function') {
                const levelMul = (typeof DamageSystem !== 'undefined')
                    ? DamageSystem.levelMultiplier(weaponLevel)
                    : (1 + 0.05 * Math.max(0, weaponLevel - 1));
                damage = weapon._computeFinalDamage(levelMul);
            }
        }
        this.damage = damage;
        this.tickIntervalMs = cfg.TICK_INTERVAL_MS || 120;
        this.tickAccumulator = 0;
        this.tickDamage = Math.max(1, Math.round(damage));
        this.slowFactor = cfg.SLOW_FACTOR || 0.5;
        this.slowDurationMs = cfg.SLOW_DURATION_MS || 1000;
        this.slowedEnemies = new Set();
    }

    update(deltaTime) {
        if (this._isVisualOnly) {
            this.elapsedTime += deltaTime;
            this._updatePositionVisual(deltaTime);
            this._updateSpriteFrame(deltaTime);
            if (this.elapsedTime >= this.durationMs) {
                this.markedForDeletion = true;
            }
            return;
        }

        this.elapsedTime += deltaTime;

        // 更新階段
        const startPhaseDuration = this.spriteStartFrames * this.frameDuration;
        const loopPhaseDuration = this.durationMs - startPhaseDuration - (this.spriteEndFrames * this.frameDuration);

        if (this.phase === 'start' && this.elapsedTime >= startPhaseDuration) {
            this.phase = 'loop';
            this.frameIndex = 0;
        }
        if (this.phase === 'loop' && this.elapsedTime >= startPhaseDuration + Math.max(0, loopPhaseDuration)) {
            this.phase = 'end';
            this.frameIndex = 0;
        }
        if (this.phase === 'end' && this.elapsedTime >= this.durationMs) {
            this.markedForDeletion = true;
            return;
        }

        // 更新位置
        let speed = this.speedStart;
        if (this.phase === 'loop') speed = this.speedLoop;
        if (this.phase === 'end') speed = this.speedEnd;

        const moveDist = (speed / 1000) * deltaTime;
        this.x += Math.cos(this.angle) * moveDist;
        this.y += Math.sin(this.angle) * moveDist;
        this.traveledDistance += moveDist;

        // 超過射程或持續時間則銷毀
        if (this.traveledDistance >= this.maxRange || this.elapsedTime >= this.durationMs) {
            this.markedForDeletion = true;
            return;
        }

        this._updateSpriteFrame(deltaTime);

        // 持續傷害與緩速（與 IceFieldEffect 相同邏輯）
        this.tickAccumulator += deltaTime;
        let loops = 0;
        const maxLoops = 3;
        while (this.tickAccumulator >= this.tickIntervalMs && loops++ < maxLoops) {
            const candidates = (typeof Game !== 'undefined' && typeof Game.getEnemiesNearCircle === 'function')
                ? Game.getEnemiesNearCircle(this.x, this.y, this.radius)
                : (Game.enemies || []);
            for (const enemy of candidates) {
                if (this._isInRadius(enemy)) {
                    if (typeof enemy.applySlow === 'function') {
                        const needsSlow = !this.slowedEnemies.has(enemy.id) ||
                            (enemy.isSlowed && Date.now() > enemy.slowEndTime);
                        if (needsSlow) {
                            enemy.applySlow(this.slowDurationMs, this.slowFactor);
                            this.slowedEnemies.add(enemy.id);
                        }
                    }

                    let finalDamage = this.tickDamage;
                    let isCrit = false;
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(
                            this.tickDamage,
                            enemy,
                            {
                                weaponType: this.weaponType,
                                critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0),
                                critMultiplierBonusPct: ((this.player && this.player.awakeningCritDamageBonusPct) || 0)
                            }
                        );
                        finalDamage = result.amount;
                        isCrit = result.isCrit;
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

                    if (!isSurvivalMode || !isMultiplayer) {
                        enemy.takeDamage(finalDamage);
                        if (typeof DamageNumbers !== 'undefined') {
                            DamageNumbers.show(
                                finalDamage,
                                enemy.x,
                                enemy.y - (enemy.height || 0) / 2,
                                isCrit,
                                { dirX: enemy.x - this.x, dirY: enemy.y - this.y, enemyId: enemy.id }
                            );
                        }
                    } else if (isSurvivalMode && isMultiplayer && this.player && this.player === Game.player) {
                        if (typeof window !== 'undefined' && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                            window.SurvivalOnlineRuntime.sendToNet({
                                type: 'aoe_tick',
                                weaponType: this.weaponType,
                                x: enemy.x,
                                y: enemy.y,
                                radius: 1,
                                enemyIds: [enemy.id],
                                damage: finalDamage,
                                allowCrit: true,
                                critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0),
                                critMultiplierBonusPct: ((this.player && this.player.awakeningCritDamageBonusPct) || 0)
                            });
                        }
                    }
                }
            }
            this.tickAccumulator -= this.tickIntervalMs;
        }

        for (const enemyId of this.slowedEnemies) {
            const enemy = Game.enemies.find(e => e && e.id === enemyId);
            if (!enemy || !this._isInRadius(enemy)) {
                this.slowedEnemies.delete(enemyId);
            }
        }
    }

    _isInRadius(enemy) {
        const dx = enemy.x - this.x;
        const dy = enemy.y - this.y;
        return (dx * dx + dy * dy) <= this.radius * this.radius;
    }

    _updatePositionVisual(deltaTime) {
        const startPhaseDuration = this.spriteStartFrames * this.frameDuration;
        const loopPhaseDuration = Math.max(0, this.durationMs - startPhaseDuration - (this.spriteEndFrames * this.frameDuration));

        if (this.phase === 'start' && this.elapsedTime >= startPhaseDuration) {
            this.phase = 'loop';
        }
        if (this.phase === 'loop' && this.elapsedTime >= startPhaseDuration + loopPhaseDuration) {
            this.phase = 'end';
        }

        let speed = this.speedStart;
        if (this.phase === 'loop') speed = this.speedLoop;
        if (this.phase === 'end') speed = this.speedEnd;

        const moveDist = (speed / 1000) * deltaTime;
        this.x += Math.cos(this.angle) * moveDist;
        this.y += Math.sin(this.angle) * moveDist;
    }

    _updateSpriteFrame(deltaTime) {
        this.frameAccumulator += deltaTime;
        if (this.frameAccumulator >= this.frameDuration) {
            this.frameAccumulator -= this.frameDuration;
            if (this.phase === 'start') {
                this.frameIndex = (this.frameIndex + 1) % this.spriteStartFrames;
            } else if (this.phase === 'loop') {
                this.frameIndex = (this.frameIndex + 1) % this.spriteLoopFrames;
            } else if (this.phase === 'end') {
                this.frameIndex = Math.min(this.frameIndex + 1, this.spriteEndFrames - 1);
            }
        }
    }

    draw(ctx) {
        let canvas = null, scaleX = 1, scaleY = 1, camX = 0, camY = 0, vw = 0, vh = 0;
        try {
            const vm = (typeof Game !== 'undefined') ? Game.viewMetrics : null;
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
        const rectInView = (x, y, w, h) => {
            if (!canvas) return true;
            const sx = (x - camX) * scaleX;
            const sy = (y - camY) * scaleY;
            const left = sx - w / 2, right = sx + w / 2, top = sy - h / 2, bottom = sy + h / 2;
            return !(right < -margin || bottom < -margin || left > vw + margin || top > vh + margin);
        };
        const drawSize = this.radius * 2;
        if (!rectInView(this.x, this.y, drawSize, drawSize)) return;

        let imgKey = 'A81start';
        let frameCount = this.spriteStartFrames;
        if (this.phase === 'loop') {
            imgKey = 'A81loop';
            frameCount = this.spriteLoopFrames;
        } else if (this.phase === 'end') {
            imgKey = 'A81end';
            frameCount = this.spriteEndFrames;
        }

        const imgObj = (Game.images && Game.images[imgKey]) ? Game.images[imgKey] : null;
        if (imgObj && imgObj.complete) {
            const frameSize = this.spriteFrameSize;
            const col = Math.min(this.frameIndex, frameCount - 1);
            const sx = col * frameSize;
            const sy = 0;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.drawImage(imgObj, sx, sy, frameSize, frameSize, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
            ctx.restore();
        } else {
            ctx.save();
            ctx.fillStyle = 'rgba(80, 60, 120, 0.7)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    destroy() {
        this.markedForDeletion = true;
        this.slowedEnemies.clear();
    }
}

window.GravityCollapseProjectile = GravityCollapseProjectile;
