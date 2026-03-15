// 熙歌專屬大招場域：與守護領域 LV10 持續傷害邏輯完全相同，僅特效圖換成 A70.png
// 依賴：Entity、Game、DamageSystem、DamageNumbers、CONFIG、Utils
// 維護備註：邏輯與 aura_field.js 完全一致，僅雪碧圖參數不同（A70.png，2行4列共7張，每張64x64）
class CygnusUltimateField extends Entity {
    constructor(player, radius, damage) {
        super(player.x, player.y, radius * 2, radius * 2);
        this.player = player;
        this.radius = radius;
        this.damage = damage;
        this.tickDamage = Math.max(0, Math.round(this.damage));
        this.tickIntervalMs = 120; // 與守護領域相同
        this.tickAccumulator = 0;
        this.weaponType = 'CYGNUS_ULTIMATE_FIELD';
        this.collisionRadius = radius;

        this.visualScale = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS.CYGNUS_ULTIMATE_FIELD && CONFIG.WEAPONS.CYGNUS_ULTIMATE_FIELD.VISUAL_SCALE) || 1.95;
        // 熙歌玩家比例 290x242（與 player9 相同）
        this.aspectW = 290;
        this.aspectH = 242;

        this._layer = null;
        this.el = null;
        // A70.png 雪碧圖：2行4列共7張，每張64x64
        this.frameWidth = 64;
        this.frameHeight = 64;
        this.sheetCols = 4;
        this.sheetRows = 2;
        this.frameCount = 7;
        this.frameIndex = 0;
        this.animationFps = 30;
        this.animAccumulator = 0;
        this._createOrUpdateDom();
    }

    update(deltaTime) {
        // 僅視覺效果：需要從遠程玩家位置更新（與守護領域相同邏輯）
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            if (rt && typeof rt.RemotePlayerManager !== 'undefined' && typeof rt.RemotePlayerManager.get === 'function') {
                const remotePlayer = rt.RemotePlayerManager.get(this._remotePlayerUid);
                if (remotePlayer) {
                    this.player = remotePlayer;
                    this.x = remotePlayer.x;
                    this.y = remotePlayer.y;
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                        this.x = Game.player.x;
                        this.y = Game.player.y;
                    }
                } else {
                    if (!this._playerNotFoundCount) this._playerNotFoundCount = 0;
                    this._playerNotFoundCount += deltaTime;
                    if (this._playerNotFoundCount > 500) {
                        this.markedForDeletion = true;
                        return;
                    }
                    this.x = this.player ? this.player.x : this.x;
                    this.y = this.player ? this.player.y : this.y;
                    this._updateDomPosition();
                    this._updateAnimation(deltaTime);
                    return;
                }
            } else {
                this.markedForDeletion = true;
                return;
            }
            this.x = this.player.x;
            this.y = this.player.y;
            this._updateDomPosition();
            this._updateAnimation(deltaTime);
            return;
        }

        if (this._isVisualOnly) {
            this.x = this.player.x;
            this.y = this.player.y;
            this._updateDomPosition();
            this._updateAnimation(deltaTime);
            return;
        }

        this.x = this.player.x;
        this.y = this.player.y;
        this.collisionRadius = this.radius;
        this.width = this.radius * 2;
        this.height = this.radius * 2;

        // 持續傷害（與守護領域完全相同）
        this.tickAccumulator += deltaTime;
        let loops = 0;
        const maxLoops = 3;
        while (this.tickAccumulator >= this.tickIntervalMs && loops++ < maxLoops) {
            const targets = (typeof Game !== 'undefined' && typeof Game.getEnemiesNearCircle === 'function')
                ? Game.getEnemiesNearCircle(this.x, this.y, this.collisionRadius)
                : Game.enemies;
            for (const enemy of targets) {
                if (this.isColliding(enemy)) {
                    let finalDamage = this.tickDamage;
                    let isCrit = false;
                    let lifestealAmount = 0;
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(this.tickDamage, enemy, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
                        finalDamage = result.amount;
                        isCrit = result.isCrit;
                        lifestealAmount = (typeof result.lifestealAmount === 'number') ? result.lifestealAmount : 0;
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
                            DamageNumbers.show(finalDamage, enemy.x, enemy.y - (enemy.height||0)/2, isCrit, { dirX: (enemy.x - this.x), dirY: (enemy.y - this.y), enemyId: enemy.id });
                        }
                    } else if (isSurvivalMode && isMultiplayer && !this._isVisualOnly && this.player && this.player === Game.player) {
                        if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
                            window.SurvivalOnlineRuntime.sendToNet({
                                type: 'aoe_tick',
                                weaponType: this.weaponType || 'CYGNUS_ULTIMATE_FIELD',
                                x: enemy.x,
                                y: enemy.y,
                                radius: 1,
                                enemyIds: [enemy.id],
                                damage: finalDamage,
                                allowCrit: true,
                                critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0)
                            });
                        }
                    }
                }
            }
            this.tickAccumulator -= this.tickIntervalMs;
        }

        this._updateDomPosition();
        this._updateAnimation(deltaTime);
    }

    draw(ctx) {
        return;
    }

    _ensureLayer() {
        const viewport = document.getElementById('viewport');
        if (!viewport) return null;
        if (this._layer && this._layer.isConnected) return this._layer;
        let layer = document.getElementById('aura-effects-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'aura-effects-layer';
            layer.style.position = 'absolute';
            layer.style.left = '0';
            layer.style.top = '0';
            layer.style.width = '100%';
            layer.style.height = '100%';
            layer.style.pointerEvents = 'none';
            layer.style.zIndex = '4';
            layer.style.mixBlendMode = 'screen';
            viewport.appendChild(layer);
        }
        this._layer = layer;
        return layer;
    }

    _createOrUpdateDom() {
        const layer = this._ensureLayer();
        if (!layer) return;
        if (!this.el) {
            const el = document.createElement('div');
            el.setAttribute('role', 'img');
            el.setAttribute('aria-label', 'Cygnus Ultimate Field');
            el.style.position = 'absolute';
            const baseSize = this.radius * 2 * this.visualScale;
            const dispW = baseSize;
            const dispH = baseSize * (this.aspectH / this.aspectW);
            el.style.width = dispW + 'px';
            el.style.height = dispH + 'px';
            el.style.imageRendering = 'pixelated';
            el.style.transform = 'translate(-50%, -50%)';
            el.style.willChange = 'transform, opacity, width, height, background-position, background-size';
            el.style.mixBlendMode = 'normal'; // 熙歌：不使用濾色混合，雪碧圖原汁原味顯示（守護領域仍用 screen）
            el.style.opacity = '1';
            el.style.backgroundColor = 'transparent';
            const imgSrc = (Game.images && Game.images['cygnus-field']) ? Game.images['cygnus-field'].src : 'assets/images/A70.png';
            el.style.backgroundImage = `url(${imgSrc})`;
            el.style.backgroundRepeat = 'no-repeat';
            this.el = el;
            layer.appendChild(el);
        } else {
            const baseSize = this.radius * 2 * this.visualScale;
            this.el.style.width = baseSize + 'px';
            this.el.style.height = (baseSize * (this.aspectH / this.aspectW)) + 'px';
        }
        this._updateDomPosition();
    }

    _updateDomPosition() {
        if (!this.el || !this._layer) return;
        try {
            const vm = (typeof Game !== 'undefined') ? Game.viewMetrics : null;
            const canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
            if (!canvas) return;
            const scaleX = vm ? vm.scaleX : 1;
            const scaleY = vm ? vm.scaleY : 1;
            const camX = vm ? vm.camX : ((typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0);
            const camY = vm ? vm.camY : ((typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0);
            let sx = (this.x - camX) * scaleX;
            let sy = (this.y - camY) * scaleY;
            const vw = canvas.width * scaleX;
            const vh = canvas.height * scaleY;
            const margin = 128;
            if (sx < -margin || sy < -margin || sx > vw + margin || sy > vh + margin) return;
            this.el.style.left = Math.round(sx) + 'px';
            this.el.style.top = Math.round(sy) + 'px';
            const baseSize = this.radius * 2 * this.visualScale;
            const w = baseSize;
            const h = baseSize * (this.aspectH / this.aspectW);
            const whKey = `${Math.round(w)}x${Math.round(h)}`;
            if (this._lastWhKey !== whKey) {
                this.el.style.width = w + 'px';
                this.el.style.height = h + 'px';
                this._lastWhKey = whKey;
            }
            const scaleBgX = w / this.frameWidth;
            const scaleBgY = h / this.frameHeight;
            const bgW = this.sheetCols * this.frameWidth * scaleBgX;
            const bgH = this.sheetRows * this.frameHeight * scaleBgY;
            const key = `${Math.round(bgW)}x${Math.round(bgH)}`;
            if (this._lastBgKey !== key) {
                this.el.style.backgroundSize = `${bgW}px ${bgH}px`;
                this._lastBgKey = key;
            }
        } catch(_) {}
    }

    _updateAnimation(deltaTime) {
        if (!this.el) return;
        if (this._lastAnimUpdateAt && (Date.now() - this._lastAnimUpdateAt) < 33) return;
        const frameDuration = 1000 / this.animationFps;
        this.animAccumulator += deltaTime || 0;
        while (this.animAccumulator >= frameDuration) {
            this.frameIndex = (this.frameIndex + 1) % this.frameCount;
            this.animAccumulator -= frameDuration;
        }
        const col = this.frameIndex % this.sheetCols;
        const row = Math.floor(this.frameIndex / this.sheetCols);
        const baseSize = this.radius * 2 * this.visualScale;
        const w = baseSize;
        const h = baseSize * (this.aspectH / this.aspectW);
        const offsetX = -col * w;
        const offsetY = -row * h;
        this.el.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
        this._lastAnimUpdateAt = Date.now();
    }

    destroy() {
        this.markedForDeletion = true;
        try {
            if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
            this.el = null;
        } catch(_) {}
    }
}

window.CygnusUltimateField = CygnusUltimateField;
