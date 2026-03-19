// 吞噬之力特效：熙歌專屬，效果與音效同唱歌、幼妲光輝
// 在玩家頭頂上方顯示 A79 雪碧圖動畫（1行12列共12幀，每張128x128）
// 生命週期與優化參考唱歌、無敵技能（SingEffect、InvincibleEffect）
class DevouringPowerEffect extends Entity {
    constructor(player, durationMs) {
        super(player.x, player.y, 1, 1);
        this.player = player;
        this.duration = durationMs || 2000; // 與唱歌、幼妲光輝相同
        this.startTime = Date.now();
        this.weaponType = 'DEVOURING_POWER';

        // 特效參數：A79 雪碧圖 1行12列 12幀 128x128
        this.spriteRows = 1;
        this.spriteCols = 12;
        this.frameCount = 12;
        this.frameSize = 128;
        this.offsetY = 0; // 玩家中間
        this.renderSize = 200; // 繪製尺寸（可視化調整）
    }

    update(deltaTime) {
        // 僅視覺吞噬之力：需要從遠程玩家位置更新（參考唱歌、無敵）
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
                    // 寬限期（參考無敵、唱歌）
                    if (!this._playerNotFoundCount) this._playerNotFoundCount = 0;
                    this._playerNotFoundCount += deltaTime;
                    if (this._playerNotFoundCount > 500) {
                        this.markedForDeletion = true;
                        return;
                    }
                    this.x = this.player ? this.player.x : this.x;
                    this.y = this.player ? this.player.y : this.y;
                    if (Date.now() - this.startTime >= this.duration) {
                        this.markedForDeletion = true;
                    }
                    return;
                }
            } else {
                this.markedForDeletion = true;
                return;
            }
            // 僅視覺模式：只更新位置
            this.x = this.player.x;
            this.y = this.player.y;
            if (Date.now() - this.startTime >= this.duration) {
                this.markedForDeletion = true;
            }
            return;
        }

        // 單機模式：跟隨玩家
        this.x = this.player.x;
        this.y = this.player.y;
        if (Date.now() - this.startTime >= this.duration) {
            this.destroy();
        }
    }

    draw(ctx) {
        const spriteSheet = (Game && Game.images && Game.images['A79']) ? Game.images['A79'] : null;
        if (!spriteSheet || !spriteSheet.complete || spriteSheet.naturalWidth <= 0) return;

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
        const drawX = this.x;
        const drawY = this.y + (this.offsetY || 0);
        let sx = (drawX - camX) * scaleX;
        let sy = (drawY - camY) * scaleY;
        if (canvas && (sx < -margin || sy < -margin || sx > vw + margin || sy > vh + margin)) return;

        const elapsed = Date.now() - this.startTime;
        const frameDuration = Math.max(50, Math.floor(this.duration / this.frameCount));
        const frameIndex = Math.min(this.frameCount - 1, Math.floor(elapsed / frameDuration) % this.frameCount);
        const col = frameIndex % this.spriteCols;
        const row = Math.floor(frameIndex / this.spriteCols);

        const size = this.renderSize || 200;
        ctx.save();
        ctx.drawImage(
            spriteSheet,
            col * this.frameSize, row * this.frameSize, this.frameSize, this.frameSize,
            drawX - size / 2, drawY - size / 2, size, size
        );
        ctx.restore();
    }

    destroy() {
        this.markedForDeletion = true;
    }
}

window.DevouringPowerEffect = DevouringPowerEffect;
