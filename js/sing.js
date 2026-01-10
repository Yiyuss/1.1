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
        // 僅視覺唱歌：需要從遠程玩家位置更新
        if (this._isVisualOnly && this._remotePlayerUid) {
            const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
            if (rt && typeof rt.getRemotePlayers === 'function') {
                const remotePlayers = rt.getRemotePlayers() || [];
                const remotePlayer = remotePlayers.find(p => p.uid === this._remotePlayerUid);
                if (remotePlayer) {
                    // 更新玩家位置
                    this.player.x = remotePlayer.x;
                    this.player.y = remotePlayer.y;
                    this.x = remotePlayer.x;
                    this.y = remotePlayer.y;
                } else if (this._remotePlayerUid === (typeof Game !== 'undefined' && Game.multiplayer && Game.multiplayer.uid)) {
                    // 如果是本地玩家
                    if (typeof Game !== 'undefined' && Game.player) {
                        this.player = Game.player;
                        this.x = Game.player.x;
                        this.y = Game.player.y;
                    }
                } else {
                    // 如果找不到對應的玩家，標記為刪除
                    this.markedForDeletion = true;
                    return;
                }
            } else {
                this.markedForDeletion = true;
                return;
            }
            // 僅視覺模式：只更新位置和DOM
            if (this.el) {
                this._updateDomPosition();
            }
            if (Date.now() - this.startTime >= this.duration) {
                if (this.el && this.el.parentNode) {
                    this.el.parentNode.removeChild(this.el);
                }
                this.el = null;
                this.markedForDeletion = true;
            }
            return;
        }
        
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
