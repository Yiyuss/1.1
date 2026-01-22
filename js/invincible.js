// INVINCIBLE 技能視覺覆蓋效果（DOM 層特效）
// 設計：在玩家身上顯示金色護盾光圈，持續指定毫秒，隨玩家移動
// 依賴：Game.camera、#viewport、Canvas 尺寸換算。效能輕量，僅 DOM 追蹤位置。

class InvincibleEffect extends Entity {
    constructor(player, durationMs) {
        super(player.x, player.y, 2, 2);
        this.player = player;
        this.duration = Math.max(0, durationMs || 1000);
        this.startTime = Date.now();
        this.weaponType = 'INVINCIBLE';

        // 視覺尺寸（相對玩家碰撞半徑放大）
        const base = Math.max(30, (player.collisionRadius || 26) * 4);
        this.size = Math.min(520, Math.max(120, base));
        this.offsetY = 0; // 置中於玩家

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
            const ring = document.createElement('div');
            ring.setAttribute('aria-hidden', 'true');
            ring.style.position = 'absolute';
            ring.style.width = this.size + 'px';
            ring.style.height = this.size + 'px';
            ring.style.transform = 'translate(-50%, -50%)';
            ring.style.borderRadius = '50%';
            // 金色護盾樣式（柔光 + 內外陰影）
            ring.style.boxShadow = '0 0 8px rgba(255,215,0,0.9), 0 0 22px rgba(255,215,0,0.65)';
            ring.style.border = '3px solid rgba(255,215,0,0.95)';
            ring.style.background = 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,215,0,0.25) 45%, rgba(255,215,0,0.05) 70%, rgba(255,215,0,0.0) 100%)';
            ring.style.opacity = '0.95';
            ring.style.willChange = 'transform, opacity';

            // 輕微脈動動畫（CSS 動畫輕量）
            const animName = 'invinciblePulse';
            if (!document.getElementById('invincible-style')) {
                const style = document.createElement('style');
                style.id = 'invincible-style';
                style.textContent = `@keyframes ${animName} { 0%{transform: translate(-50%,-50%) scale(1);} 50%{transform: translate(-50%,-50%) scale(1.05);} 100%{transform: translate(-50%,-50%) scale(1);} }`;
                document.head.appendChild(style);
            }
            ring.style.animation = `${animName} 1.2s ease-in-out infinite`;

            layer.appendChild(ring);
            this.el = ring;
        }
        this._updateDomPosition();
    }

    _updateDomPosition() {
        const el = this.el; if (!el || !this._layer) return;
        try {
            const canvas = (typeof Game !== 'undefined' && Game.canvas) ? Game.canvas : document.getElementById('game-canvas');
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width / canvas.width;
            const scaleY = rect.height / canvas.height;
            const camX = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.x : 0;
            const camY = (typeof Game !== 'undefined' && Game.camera) ? Game.camera.y : 0;
            const rotatedPortrait = document.documentElement.classList.contains('mobile-rotation-active');

            let sx, sy;
            if (rotatedPortrait) {
                sx = this.player.x - camX;
                sy = this.player.y - camY + this.offsetY;
            } else {
                sx = (this.player.x - camX) * scaleX;
                sy = (this.player.y - camY) * scaleY + this.offsetY;
            }
            el.style.left = Math.round(sx) + 'px';
            el.style.top = Math.round(sy) + 'px';
        } catch (_) {}
    }

    update(deltaTime) {
        // 僅視覺無敵：需要從遠程玩家位置更新（參考守護領域和斬擊的處理方式）
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            if (rt && typeof rt.RemotePlayerManager !== 'undefined' && typeof rt.RemotePlayerManager.get === 'function') {
                const remotePlayer = rt.RemotePlayerManager.get(this._remotePlayerUid);
                if (remotePlayer) {
                    // ✅ 修復：參考守護領域的處理方式，確保 this.player 引用始終是最新的
                    // 問題：this.player 可能是一個舊的對象引用，直接修改它的屬性可能不會正確更新（這是斬擊的BUG）
                    // 解決：直接使用 remotePlayer 對象，確保位置正確（參考守護領域的正確方式）
                    this.player = remotePlayer; // 更新引用，確保指向正確的遠程玩家對象
                    // ✅ 修復：確保 this.x 和 this.y 與 this.player.x 和 this.player.y 同步
                    // 這樣即使玩家靠近邊界，效果也會正確跟隨玩家（參考守護領域）
                    this.x = this.player.x;
                    this.y = this.player.y;
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    // 如果是本地玩家
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                        // ✅ 修復：確保 this.x 和 this.y 與 this.player.x 和 this.player.y 同步
                        this.x = Game.player.x;
                        this.y = Game.player.y;
                    }
                } else {
                    // ✅ 修復：參考守護領域的處理方式，給一個寬限期（避免瞬間消失）
                    // 如果找不到玩家，可能是網路延遲，給 500ms 寬限期
                    if (!this._playerNotFoundCount) {
                        this._playerNotFoundCount = 0;
                    }
                    this._playerNotFoundCount += deltaTime;
                    if (this._playerNotFoundCount > 500) {
                        this.markedForDeletion = true;
                        return;
                    }
                    // 在寬限期內，繼續更新（使用最後已知位置）
                    // ✅ 修復：確保即使找不到玩家，也繼續更新位置（參考守護領域）
                    // ⚠️ 注意：不要直接修改 this.player.x 和 this.player.y（這是斬擊的BUG）
                    // 應該使用 this.x 和 this.y，並在寬限期內繼續更新 DOM 位置
                    this.x = this.player ? this.player.x : this.x;
                    this.y = this.player ? this.player.y : this.y;
                    if (this.el) this._updateDomPosition();
                    if (Date.now() - this.startTime >= this.duration) {
                        if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
                        this.el = null;
                        this.markedForDeletion = true;
                    }
                    return;
                }
            } else {
                // ✅ 修復：參考守護領域的處理方式，如果 RemotePlayerManager 不可用，標記為刪除
                this.markedForDeletion = true;
                return;
            }
            // 僅視覺模式：只更新位置和DOM
            // ✅ 修復：參考守護領域的處理方式，確保 this.x 和 this.y 與 this.player.x 和 this.player.y 同步
            // 這樣即使玩家靠近邊界，效果也會正確跟隨玩家
            // ⚠️ 注意：不要直接修改 this.player.x 和 this.player.y（這是斬擊的BUG）
            // 應該更新 this.player 引用，然後同步 this.x 和 this.y
            this.x = this.player.x;
            this.y = this.player.y;
            if (this.el) this._updateDomPosition();
            if (Date.now() - this.startTime >= this.duration) {
                if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
                this.el = null;
                this.markedForDeletion = true;
            }
            return;
        }
        
        // 本地玩家的無敵效果
        // ✅ 修復：確保 this.x 和 this.y 與 this.player.x 和 this.player.y 同步
        this.x = this.player.x;
        this.y = this.player.y;
        if (this.el) this._updateDomPosition();
        if (Date.now() - this.startTime >= this.duration) {
            if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
            this.el = null;
            this.destroy();
        }
    }

    draw(ctx) {
        // DOM 視覺已涵蓋；Canvas 無需繪製
    }
}
