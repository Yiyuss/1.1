// 白白虹專屬大招（按Q）視覺特效：玩家上方顯示 A64.png，漂浮動態，持續 5 秒、最後 1 秒淡出
// 設計：與無敵/唱歌一致，使用 skill-effects-layer（z-index 7，在敵人上方），依賴 Game.viewMetrics、33ms 節流、128 邊距
// 依賴：Game.camera、#viewport、性能優化計畫.md 已完成項目

class BaibaihongExclusiveUltimateEffect extends Entity {
    constructor(player, durationMs, fadeMs) {
        super(player.x, player.y, 2, 2);
        this.player = player;
        this.duration = Math.max(0, durationMs || 15000);
        this.fadeMs = Math.max(0, Math.min(this.duration, fadeMs || 1000));
        this.startTime = Date.now();

        // 固定尺寸 200x102，置於玩家上方
        this.widthPx = 200;
        this.heightPx = 102;
        this.offsetY = -80; // 玩家上方

        this._layer = null;
        this.el = null;
        this._ensureLayer();
        this._createOrUpdateDom();
    }

    _ensureLayer() {
        const viewport = document.getElementById('viewport');
        if (!viewport) return null;
        if (this._layer && this._layer.isConnected) return this._layer;
        let layer = document.getElementById('skill-effects-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'skill-effects-layer';
            layer.style.position = 'absolute';
            layer.style.left = '0';
            layer.style.top = '0';
            layer.style.width = '100%';
            layer.style.height = '100%';
            layer.style.pointerEvents = 'none';
            layer.style.zIndex = '7';
            viewport.appendChild(layer);
        }
        this._layer = layer;
        return layer;
    }

    _createOrUpdateDom() {
        const layer = this._ensureLayer();
        if (!layer) return;
        if (!this.el) {
            const img = document.createElement('img');
            img.setAttribute('aria-hidden', 'true');
            img.alt = '';
            img.src = 'assets/images/A64.png';
            img.style.position = 'absolute';
            img.style.width = this.widthPx + 'px';
            img.style.height = this.heightPx + 'px';
            img.style.transform = 'translate(-50%, -50%)';
            img.style.willChange = 'transform, opacity';
            img.style.opacity = '1';

            const animName = 'baibaihongUltimateFloat';
            if (!document.getElementById('baibaihong-ultimate-style')) {
                const style = document.createElement('style');
                style.id = 'baibaihong-ultimate-style';
                style.textContent = `@keyframes ${animName} { 0%,100%{transform: translate(-50%,-50%) translateY(0);} 50%{transform: translate(-50%,-50%) translateY(-12px);} }`;
                document.head.appendChild(style);
            }
            img.style.animation = `${animName} 2s ease-in-out infinite`;

            layer.appendChild(img);
            this.el = img;
        }
        this._updateDomPosition();
    }

    _updateDomPosition() {
        const el = this.el;
        if (!el || !this._layer) return;
        if (this._lastDomUpdateAt && (Date.now() - this._lastDomUpdateAt) < 33) return;
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
                sy = this.y - camY + this.offsetY;
            } else {
                sx = (this.x - camX) * scaleX;
                sy = (this.y - camY) * scaleY + this.offsetY;
            }
            const vw = rotatedPortrait ? canvas.width : canvas.width * scaleX;
            const vh = rotatedPortrait ? canvas.height : canvas.height * scaleY;
            const margin = 128;
            if (sx < -margin || sy < -margin || sx > vw + margin || sy > vh + margin) return;
            const leftPx = Math.round(sx);
            const topPx = Math.round(sy);
            if (this._lastLeft !== leftPx) {
                el.style.left = leftPx + 'px';
                this._lastLeft = leftPx;
            }
            if (this._lastTop !== topPx) {
                el.style.top = topPx + 'px';
                this._lastTop = topPx;
            }
            this._lastDomUpdateAt = Date.now();
        } catch (_) {}
    }

    update(deltaTime) {
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            if (rt && typeof rt.RemotePlayerManager !== 'undefined' && typeof rt.RemotePlayerManager.get === 'function') {
                const remotePlayer = rt.RemotePlayerManager.get(this._remotePlayerUid);
                if (remotePlayer) {
                    this.player = remotePlayer;
                    this.x = this.player.x;
                    this.y = this.player.y;
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
                    if (this.el) this._updateDomPosition();
                    this._updateOpacity();
                    if (Date.now() - this.startTime >= this.duration) {
                        if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
                        this.el = null;
                        this.markedForDeletion = true;
                    }
                    return;
                }
            } else {
                this.markedForDeletion = true;
                return;
            }
            this.x = this.player.x;
            this.y = this.player.y;
            if (this.el) this._updateDomPosition();
            this._updateOpacity();
            if (Date.now() - this.startTime >= this.duration) {
                if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
                this.el = null;
                this.markedForDeletion = true;
            }
            return;
        }

        this.x = this.player.x;
        this.y = this.player.y;
        if (this.el) this._updateDomPosition();
        this._updateOpacity();
        if (Date.now() - this.startTime >= this.duration) {
            if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
            this.el = null;
            this.destroy();
        }
    }

    _updateOpacity() {
        if (!this.el) return;
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.duration - this.fadeMs) {
            const fadeElapsed = elapsed - (this.duration - this.fadeMs);
            const opacity = Math.max(0, 1 - fadeElapsed / this.fadeMs);
            this.el.style.opacity = String(opacity);
        }
    }

    draw(ctx) {}
}
