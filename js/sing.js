class SingEffect extends Entity {
    constructor(player, durationMs) {
        super(player.x, player.y, 1, 1);
        this.player = player;
        this.duration = durationMs || 2000; // 調整為2秒一次性播放
        this.startTime = Date.now();
        this.weaponType = 'SING';

        // DOM 覆蓋設定
        this.size = 500;            // 顯示尺寸（保留）
        this.offsetY = -250;          // 下移，讓更靠近玩家（原100 -> -250）
        this._layer = null;        // skill-effects-layer
        this.el = null;            // 實際的 <img>

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
            layer.style.zIndex = '7'; // 提高一層，確保光暈不被其他層蓋住
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
            img.alt = 'LA';
            img.src = 'assets/images/LA.gif'; // 優先使用 GIF
            img.style.position = 'absolute';
            img.style.width = this.size + 'px';
            img.style.height = 'auto';
            img.style.imageRendering = 'pixelated';
            img.style.transform = 'translate(-50%, -100%)';
            img.style.willChange = 'transform, opacity';
            img.style.opacity = '1';
            // 白色光暈提升可視性（透明背景可用 drop-shadow 模擬外發光）
            img.style.filter = 'drop-shadow(0 0 8px rgba(255,255,255,0.9)) drop-shadow(0 0 16px rgba(255,255,255,0.75))';
            // 若 GIF 不存在則退回 PNG
            img.addEventListener('error', () => {
                img.src = 'assets/images/LA.png';
            }, { once: true });
            layer.appendChild(img);
            this.el = img;
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
                // 直立旋轉：使用畫布原座標（交由 viewport 的 transform 處理縮放/旋轉）
                sx = this.player.x - camX;
                sy = this.player.y - camY - this.offsetY;
            } else {
                // 未旋轉：標準座標換算並加入偏移量
                sx = (this.player.x - camX) * scaleX;
                sy = (this.player.y - camY) * scaleY - this.offsetY;
            }

            el.style.left = Math.round(sx) + 'px';
            el.style.top = Math.round(sy) + 'px';
        } catch (_) {}
    }

    update(deltaTime) {
        // 僅視覺唱歌：需要從遠程玩家位置更新（參考無敵和守護領域的處理方式）
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            if (rt && typeof rt.RemotePlayerManager !== 'undefined' && typeof rt.RemotePlayerManager.get === 'function') {
                // ✅ 修復1：使用 RemotePlayerManager.get() 而不是 getRemotePlayers()（參考無敵和守護領域）
                const remotePlayer = rt.RemotePlayerManager.get(this._remotePlayerUid);
                if (remotePlayer) {
                    // ✅ 修復2：參考守護領域和無敵的處理方式，確保 this.player 引用始終是最新的
                    // 問題：this.player 可能是一個舊的對象引用，直接修改它的屬性可能不會正確更新（這是斬擊的BUG）
                    // 解決：直接使用 remotePlayer 對象，確保位置正確（參考守護領域的正確方式）
                    this.player = remotePlayer; // ✅ 修復：更新引用，確保指向正確的遠程玩家對象
                    // ✅ 修復3：確保 this.x 和 this.y 與 this.player.x 和 this.player.y 同步
                    // 這樣即使玩家靠近邊界，效果也會正確跟隨玩家（參考守護領域和無敵）
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
                    // ✅ 修復4：參考守護領域和無敵的處理方式，給一個寬限期（避免瞬間消失）
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
                    // ✅ 修復：確保即使找不到玩家，也繼續更新位置（參考守護領域和無敵）
                    // ⚠️ 注意：不要直接修改 this.player.x 和 this.player.y（這是斬擊的BUG）
                    // 應該使用 this.x 和 this.y，並在寬限期內繼續更新 DOM 位置
                    this.x = this.player ? this.player.x : this.x;
                    this.y = this.player ? this.player.y : this.y;
                    if (this.el) {
                        this._updateDomPosition();
                    }
                    // 檢查是否超過持續時間
                    if (Date.now() - this.startTime >= this.duration) {
                        if (this.el && this.el.parentNode) {
                            this.el.parentNode.removeChild(this.el);
                        }
                        this.el = null;
                        this.markedForDeletion = true;
                    }
                    return;
                }
            } else {
                this.markedForDeletion = true;
                return;
            }
            // 僅視覺模式：只更新位置和DOM
            // ✅ 修復：確保 this.x 和 this.y 與 this.player.x 和 this.player.y 同步
            // 這樣即使玩家靠近邊界，效果也會正確跟隨玩家（參考守護領域和無敵）
            this.x = this.player.x;
            this.y = this.player.y;
            if (this.el) {
                this._updateDomPosition();
            }
            // ✅ 修復：檢查是否超過持續時間，超過後立即清理DOM元素（參考無敵）
            if (Date.now() - this.startTime >= this.duration) {
                if (this.el && this.el.parentNode) {
                    this.el.parentNode.removeChild(this.el);
                }
                this.el = null;
                this.markedForDeletion = true;
            }
            return;
        }
        
        // 單機模式：跟隨玩家位置
        this.x = this.player.x;
        this.y = this.player.y;
        // 播放期間跟隨玩家位置（只在一次播放時間內）
        if (this.el) {
            this._updateDomPosition();
        }
        if (Date.now() - this.startTime >= this.duration) {
            // 播放一次後移除 DOM 並銷毀特效實例
            if (this.el && this.el.parentNode) {
                this.el.parentNode.removeChild(this.el);
            }
            this.el = null;
            this.destroy();
        }
    }

    draw(ctx) {
        // 本特效改為 DOM 顯示 LA.gif，不再在 Canvas 上繪製
    }
}
