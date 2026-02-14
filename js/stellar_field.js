// 恆星領域（厄倫蒂兒專屬，常駐場域）：持續特效邏輯與守護領域完全相同，範圍內不造成傷害、僅緩速
// 注意：此檔僅用於技能視覺與場域效果的 DOM 更新與節流；「人物屬性（玩家與 AI）」的疊層顯示嚴禁改動與節流，請勿將此檔的策略套用到人物顯示。
// 職責：
// - 跟隨玩家位置（中心對齊）
// - 使用與守護領域相同的 tickIntervalMs（120ms），每 tick 對範圍內敵人施加緩速（不造成傷害）
// - 雪碧圖使用 star.png，6 行 10 列，每格 512x512
// 依賴：Entity、Game、CONFIG
// 維護備註：
// - 視覺資源鍵：'star'（resource_loader 載入 assets/images/star.png）
// - 半徑：CONFIG.WEAPONS.STELLAR_FIELD.FIELD_RADIUS（150）+ FIELD_RADIUS_PER_LEVEL（20）* (level-1)
// - 緩速：LV1 緩速 5%（speedFactor=0.95），每升 1 級緩速 +5%
class StellarField extends Entity {
    constructor(player, radius, slowFactor) {
        super(player.x, player.y, radius * 2, radius * 2);
        this.player = player;
        this.radius = radius;
        // slowFactor：0~1（1=不減速），LV1=0.95（緩速5%），每級-0.05
        this.slowFactor = (typeof slowFactor === 'number') ? Math.max(0, Math.min(1, slowFactor)) : 0.95;
        this.tickIntervalMs = 120; // 與守護領域相同
        this.tickAccumulator = 0;
        this.weaponType = 'STELLAR_FIELD';
        this.collisionRadius = radius;

        this.visualScale = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS.STELLAR_FIELD && CONFIG.WEAPONS.STELLAR_FIELD.VISUAL_SCALE) || 1.95;

        this._layer = null;
        this.el = null;
        // 雪碧圖 6 行 10 列，每格 512x512
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
        // 僅視覺效果：需要從遠程玩家位置更新（與守護領域相同邏輯，目前單機不觸發）
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

        // 依間隔施加緩速（不造成傷害），與守護領域相同節奏
        this.tickAccumulator += deltaTime;
        let loops = 0;
        const maxLoops = 3;
        while (this.tickAccumulator >= this.tickIntervalMs && loops++ < maxLoops) {
            const targets = (typeof Game !== 'undefined' && typeof Game.getEnemiesNearCircle === 'function')
                ? Game.getEnemiesNearCircle(this.x, this.y, this.collisionRadius)
                : Game.enemies;
            for (const enemy of targets) {
                if (this.isColliding(enemy) && typeof enemy.applySlow === 'function') {
                    enemy.applySlow(200, this.slowFactor);
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
            el.setAttribute('aria-label', 'Stellar Field');
            el.style.position = 'absolute';
            el.style.width = (this.radius * 2 * this.visualScale) + 'px';
            el.style.height = (this.radius * 2 * this.visualScale) + 'px';
            el.style.imageRendering = 'pixelated';
            el.style.transform = 'translate(-50%, -50%)';
            el.style.willChange = 'transform, opacity, width, height, background-position, background-size';
            el.style.mixBlendMode = 'screen';
            el.style.opacity = '1';
            el.style.backgroundColor = 'transparent';
            const imgSrc = (Game.images && Game.images['star']) ? Game.images['star'].src : 'assets/images/star.png';
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
            const scaleX = vm ? vm.scaleX : (canvas.getBoundingClientRect().width / canvas.width);
            const scaleY = vm ? vm.scaleY : (canvas.getBoundingClientRect().height / canvas.height);
            const camX = vm ? vm.camX : ((typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0);
            const camY = vm ? vm.camY : ((typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0);
            const rotatedPortrait = vm ? vm.rotatedPortrait : document.documentElement.classList.contains('mobile-rotation-active');
            let sx, sy;
            if (rotatedPortrait) {
                sx = this.x - camX;
                sy = this.y - camY;
            } else {
                sx = (this.x - camX) * scaleX;
                sy = (this.y - camY) * scaleY;
            }
            const vw = rotatedPortrait ? canvas.width : canvas.width * scaleX;
            const vh = rotatedPortrait ? canvas.height : canvas.height * scaleY;
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
        } catch(_) {}
    }
}

window.StellarField = StellarField;
