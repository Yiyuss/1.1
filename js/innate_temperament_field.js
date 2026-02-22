// 先天氣質（融合常駐場域）：恆星領域LV10（緩速50%）+ 守護領域LV10（持續傷害）
// 注意：此檔僅用於技能視覺與場域效果的 DOM 更新與節流；「人物屬性（玩家與 AI）」的疊層顯示嚴禁改動與節流，請勿將此檔的策略套用到人物顯示。
// 效能要求：沿用已完成的領域類優化（viewMetrics 快取、離屏跳過 style 寫入、近鄰查詢 getEnemiesNearCircle、tick 補齊上限保護、背景尺寸事件化）。
// 雪碧圖：star2.png（6 行 10 列，每格 512x512），視覺資源鍵：'star2'（ResourceLoader 載入 assets/images/star2.png）
// 依賴：Entity、Game、DamageSystem、DamageNumbers、CONFIG
class InnateTemperamentField extends Entity {
    constructor(player, radius, damage, slowFactor) {
        super(player.x, player.y, radius * 2, radius * 2);
        this.player = player;
        this.radius = radius;
        this.damage = damage;
        // 允許傷害為0（僅視覺效果時）
        this.tickDamage = Math.max(0, Math.round(this.damage));
        this.tickIntervalMs = 120; // 與守護領域/恆星領域一致
        this.tickAccumulator = 0;
        this.weaponType = 'INNATE_TEMPERAMENT';
        this.collisionRadius = radius;

        // 緩速：恆星領域LV10完全相同（預設 0.5 = 緩速50%）
        this.slowFactor = (typeof slowFactor === 'number') ? Math.max(0, Math.min(1, slowFactor)) : 0.5;
        this.slowDurationMs = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS.INNATE_TEMPERAMENT && typeof CONFIG.WEAPONS.INNATE_TEMPERAMENT.SLOW_DURATION_MS === 'number')
            ? CONFIG.WEAPONS.INNATE_TEMPERAMENT.SLOW_DURATION_MS
            : 200;

        // 視覺倍率（只影響 DOM 圖像尺寸，不影響實際傷害/碰撞半徑）
        this.visualScale = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS.INNATE_TEMPERAMENT && CONFIG.WEAPONS.INNATE_TEMPERAMENT.VISUAL_SCALE) || 1.95;

        this._layer = null;
        this.el = null;
        // 雪碧圖動畫參數（60 張 / 10x6，每格 512x512）
        this.frameWidth = 512;
        this.frameHeight = 512;
        this.sheetCols = 10;
        this.sheetRows = 6;
        this.frameCount = 60;
        this.frameIndex = 0;
        this.animationFps = 30;
        this.animAccumulator = 0;
        this._createOrUpdateDom();
    }

    update(deltaTime) {
        // 僅視覺效果：需要從遠程玩家位置更新（與守護領域/恆星領域相同）
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

        // 跟隨玩家中心
        this.x = this.player.x;
        this.y = this.player.y;

        // 支援升級動態同步
        this.collisionRadius = this.radius;
        this.width = this.radius * 2;
        this.height = this.radius * 2;

        // 依間隔造成持續傷害 + 緩速（補齊延遲）
        this.tickAccumulator += deltaTime;
        let loops = 0;
        const maxLoops = 3;
        while (this.tickAccumulator >= this.tickIntervalMs && loops++ < maxLoops) {
            const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.enabled);
            let isSurvivalMode = false;
            try {
                const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                    ? GameModeManager.getCurrent()
                    : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                        ? ModeManager.getActiveModeId()
                        : null);
                isSurvivalMode = (activeId === 'survival' || activeId === null);
            } catch (_) { }

            // ✅ 多人權威：只送「一次圓形 aoe_tick」給伺服器，避免對每個敵人爆量送包（晚局雪崩根因）
            if (isSurvivalMode && isMultiplayer && !this._isVisualOnly && this.player && this.player === Game.player) {
                try {
                    if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === "function") {
                        window.SurvivalOnlineRuntime.sendToNet({
                            type: 'aoe_tick',
                            weaponType: this.weaponType || 'INNATE_TEMPERAMENT',
                            x: this.x,
                            y: this.y,
                            radius: Math.max(10, Math.floor(this.collisionRadius || this.radius || 120)),
                            damage: Math.max(0, Math.floor(this.tickDamage || 0)),
                            allowCrit: true,
                            critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0),
                            timestamp: Date.now()
                        });
                    }
                } catch (_) { }
            } else {
                // 單機/非生存：維持原本逐怪判定（含緩速+浮字）
                const targets = (typeof Game !== 'undefined' && typeof Game.getEnemiesNearCircle === 'function')
                    ? Game.getEnemiesNearCircle(this.x, this.y, this.collisionRadius)
                    : Game.enemies;
                for (const enemy of targets) {
                    if (!this.isColliding(enemy)) continue;

                    // 緩速（與恆星領域一致）
                    if (enemy && typeof enemy.applySlow === 'function') {
                        enemy.applySlow(this.slowDurationMs, this.slowFactor);
                    }

                    // 持續傷害（與守護領域一致）
                    let finalDamage = this.tickDamage;
                    let isCrit = false;
                    if (typeof DamageSystem !== 'undefined') {
                        const result = DamageSystem.computeHit(this.tickDamage, enemy, { weaponType: this.weaponType, critChanceBonusPct: ((this.player && this.player.critChanceBonusPct) || 0) });
                        finalDamage = result.amount;
                        isCrit = result.isCrit;
                    }

                    if (enemy && typeof enemy.takeDamage === 'function') {
                        enemy.takeDamage(finalDamage);
                    }
                    if (typeof DamageNumbers !== 'undefined') {
                        DamageNumbers.show(finalDamage, enemy.x, enemy.y - (enemy.height || 0) / 2, isCrit, { dirX: (enemy.x - this.x), dirY: (enemy.y - this.y), enemyId: enemy.id });
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
            el.setAttribute('aria-label', 'Innate Temperament Field');
            el.style.position = 'absolute';
            el.style.width = (this.radius * 2 * this.visualScale) + 'px';
            el.style.height = (this.radius * 2 * this.visualScale) + 'px';
            el.style.imageRendering = 'pixelated';
            el.style.transform = 'translate(-50%, -50%)';
            el.style.willChange = 'transform, opacity, width, height, background-position, background-size';
            el.style.mixBlendMode = 'screen';
            el.style.opacity = '1';
            el.style.backgroundColor = 'transparent';
            const imgSrc = (Game.images && Game.images['star2']) ? Game.images['star2'].src : 'assets/images/star2.png';
            el.style.backgroundImage = `url(${imgSrc})`;
            el.style.backgroundRepeat = 'no-repeat';
            this.el = el;
            layer.appendChild(el);
        } else {
            this.el.style.width = (this.radius * 2 * this.visualScale) + 'px';
            this.el.style.height = (this.radius * 2 * this.visualScale) + 'px';
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
            const sx = (this.x - camX) * scaleX;
            const sy = (this.y - camY) * scaleY;
            const vw = canvas.width * scaleX;
            const vh = canvas.height * scaleY;
            const margin = 128;
            if (sx < -margin || sy < -margin || sx > vw + margin || sy > vh + margin) return;
            this.el.style.left = Math.round(sx) + 'px';
            this.el.style.top = Math.round(sy) + 'px';
            const w = (this.radius * 2 * this.visualScale);
            const h = (this.radius * 2 * this.visualScale);
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
        } catch (_) { }
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
        const w = (this.radius * 2 * this.visualScale);
        const h = (this.radius * 2 * this.visualScale);
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
        } catch (_) { }
    }
}

window.InnateTemperamentField = InnateTemperamentField;

