// 厄倫蒂兒大招：分身（Q）
// - 召喚 4 隻分身，體型比本體小 10%，無血量/無碰撞
// - 自動跟隨玩家（參考 AICompanion 的跟隨更新模式）
// - 會自動投擲「分身投擲物」，傷害/邏輯/特效/音效參考 HEART_TRANSMISSION LV10
// - 投擲外觀使用 A51.png（100x98），實體大小約比星隕下落物小 30%
// - 特效大小約比 HEART_TRANSMISSION 小 50%（由 projectile.js / survival_online.js 命中效果縮放處理）

class ElondierUltimateClone extends Entity {
    constructor(player, x, y, opts = {}) {
        const baseSize = (player && typeof player.width === 'number') ? player.width : (CONFIG && CONFIG.PLAYER ? CONFIG.PLAYER.SIZE : 32);
        const cloneSize = Math.max(1, Math.floor(baseSize * 0.9)); // 體型比本體小 10%
        super(x, y, cloneSize, cloneSize);

        this.player = player;
        this.weaponType = 'ELONDIER_ULTIMATE_CLONE';

        // 無血量/無碰撞（碰撞邏輯主要以玩家為準；此處保險設為 0）
        this.health = Infinity;
        this.maxHealth = Infinity;
        this.collisionRadius = 0;

        // 分身站位（避免重疊）
        this.cloneIndex = (typeof opts.cloneIndex === 'number') ? opts.cloneIndex : 0;
        const offsets = [
            { x: -120, y: -80 },
            { x:  120, y: -80 },
            { x: -120, y:  80 },
            { x:  120, y:  80 }
        ];
        const off = offsets[this.cloneIndex % offsets.length];
        this.offsetX = (typeof opts.offsetX === 'number') ? opts.offsetX : off.x;
        this.offsetY = (typeof opts.offsetY === 'number') ? opts.offsetY : off.y;

        // 存在時間：與大招變身時間相同（由 Player.ultimateEndTime 傳入或 durationMs）
        this.durationMs = (typeof opts.durationMs === 'number' && opts.durationMs > 0) ? opts.durationMs : (CONFIG && CONFIG.ULTIMATE ? CONFIG.ULTIMATE.DURATION_MS : 8000);
        const endTime = (typeof opts.endTime === 'number' && opts.endTime > 0) ? opts.endTime : (Date.now() + this.durationMs);
        this.endTime = endTime;

        // 投擲冷卻：參考 HEART_TRANSMISSION（1.5s）
        const ht = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS.HEART_TRANSMISSION) ? CONFIG.WEAPONS.HEART_TRANSMISSION : null;
        this.throwCooldownMax = (ht && typeof ht.COOLDOWN === 'number') ? ht.COOLDOWN : 1500;
        this.throwCooldown = 0;

        // 遠程/純視覺標記（組隊模式遠程分身不做本地投擲，避免雙重送包/雙重傷害）
        this._isVisualOnly = (opts && opts._isVisualOnly === true);
        this._remotePlayerUid = (typeof opts.remotePlayerUid === 'string') ? opts.remotePlayerUid : null;
    }

    destroy() {
        this._hideOverlay();
        this.markedForDeletion = true;
    }

    _hideOverlay() {
        try {
            if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.hide === 'function') {
                const id = this._getOverlayId();
                window.GifOverlay.hide(id);
            }
        } catch (_) { }
    }

    _getOverlayId() {
        const base = (this._remotePlayerUid && typeof this._remotePlayerUid === 'string')
            ? `elondier-clone-${this._remotePlayerUid}-${this.cloneIndex}`
            : `elondier-clone-${this.cloneIndex}`;
        return base;
    }

    _resolvePlayerRef() {
        // ✅ 組隊模式：遠程分身跟隨遠程玩家（參考 AICompanion 的引用更新）
        try {
            if (this._remotePlayerUid) {
                const rt = (typeof window !== 'undefined') ? window.SurvivalOnlineRuntime : null;
                if (rt && rt.RemotePlayerManager && typeof rt.RemotePlayerManager.get === 'function') {
                    const rp = rt.RemotePlayerManager.get(this._remotePlayerUid);
                    if (rp) {
                        this.player = rp;
                        return;
                    }
                }
                if (rt && typeof rt.getRemotePlayers === 'function') {
                    const arr = rt.getRemotePlayers() || [];
                    const rp = arr.find(p => p && p.uid === this._remotePlayerUid);
                    if (rp) {
                        this.player = rp;
                        return;
                    }
                }
            } else {
                // 本地：確保指向 Game.player
                if (typeof Game !== 'undefined' && Game.player && this.player !== Game.player) {
                    this.player = Game.player;
                }
            }
        } catch (_) { }
    }

    update(deltaTime) {
        if (typeof Game === 'undefined' || !Game || Game.isGameOver) {
            this._hideOverlay();
            this.markedForDeletion = true;
            return;
        }
        if (!deltaTime || deltaTime <= 0) deltaTime = 16.67;

        // 時間到自動清理
        if (this.endTime && Date.now() >= this.endTime) {
            this._hideOverlay();
            this.markedForDeletion = true;
            return;
        }

        this._resolvePlayerRef();
        if (!this.player) return;

        // 跟隨：同步移動（固定在 4 個偏移位置，消除停下抖動）
        // 注意：位置更新不節流（符合 性能優化計畫.md：人物/AI 類不可節流、不改比例）
        const margin = this.width / 2;
        const worldWidth = (Game.worldWidth || (CONFIG && CONFIG.CANVAS_WIDTH) || 1280);
        const worldHeight = (Game.worldHeight || (CONFIG && CONFIG.CANVAS_HEIGHT) || 720);
        const desiredX = Utils.clamp(this.player.x + this.offsetX, margin, worldWidth - margin);
        const desiredY = Utils.clamp(this.player.y + this.offsetY, margin, worldHeight - margin);
        this.x = desiredX;
        this.y = desiredY;

        // 投擲：只在本地玩家的分身執行（避免遠程分身重複投擲）
        const isOwnerLocal = (typeof Game !== 'undefined' && Game.player && this.player === Game.player && !this.player._isRemotePlayer);
        if (!this._isVisualOnly && isOwnerLocal) {
            this.throwCooldown += deltaTime;
            if (this.throwCooldown >= this.throwCooldownMax) {
                this.throwCooldown = 0;
                this._throwCloneProjectile();
            }
        }
    }

    _throwCloneProjectile() {
        try {
            if (typeof Projectile === 'undefined' || typeof Weapon === 'undefined' || !this.player) return;
            const enemies = (typeof Game !== 'undefined') ? (Game.enemies || []) : [];
            if (!Array.isArray(enemies) || enemies.length === 0) return;

            // HEART_TRANSMISSION LV10：每次發射 10 發（完整照搬 fire() 的數量邏輯）
            const count = 10;

            // 傷害：用 HEART_TRANSMISSION LV10 的最終基礎傷害計算（統一邏輯，不自創公式）
            const w = new Weapon(this.player, 'HEART_TRANSMISSION');
            w.level = 10;
            const levelMul = (typeof DamageSystem !== 'undefined' && DamageSystem.levelMultiplier)
                ? DamageSystem.levelMultiplier(w.level)
                : (1 + 0.05 * Math.max(0, w.level - 1));
            const dmg = (typeof w._computeFinalDamage === 'function') ? w._computeFinalDamage(levelMul) : (w.config && w.config.DAMAGE ? w.config.DAMAGE : 0);

            // 實體大小：比星隕下落物小約 30%
            // 以 CONFIG.WEAPONS.STARFALL.SWORD_IMAGE_WIDTH 作為「星隕下落物」的實際顯示尺寸基準（目前為 30）
            let starSize = 30;
            try {
                const sf = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS.STARFALL) ? CONFIG.WEAPONS.STARFALL : null;
                if (sf && typeof sf.SWORD_IMAGE_WIDTH === 'number') starSize = sf.SWORD_IMAGE_WIDTH;
            } catch (_) { }
            const size = Math.max(1, Math.floor(starSize * 0.7));

            const ht = (typeof CONFIG !== 'undefined' && CONFIG.WEAPONS && CONFIG.WEAPONS.HEART_TRANSMISSION) ? CONFIG.WEAPONS.HEART_TRANSMISSION : {};
            const speed = (typeof ht.PROJECTILE_SPEED === 'number') ? ht.PROJECTILE_SPEED : 10;

            // 取距離分身最近的前 count 名敵人作為目標（優先用近鄰 API，遵守性能優化計畫）
            let candidates = enemies;
            try {
                if (typeof Game !== 'undefined' && typeof Game.getEnemiesNearCircle === 'function') {
                    candidates = Game.getEnemiesNearCircle(this.x, this.y, 900);
                }
            } catch (_) { }
            const sorted = [...(candidates || [])].filter(e => e && !e.markedForDeletion && e.health > 0).sort((a, b) => {
                const da = Utils.distance(this.x, this.y, a.x, a.y);
                const db = Utils.distance(this.x, this.y, b.x, b.y);
                return da - db;
            });
            const targets = sorted.slice(0, count);

            for (let i = 0; i < count; i++) {
                const target = targets[i] || null;
                let angle;
                if (target) {
                    const baseAngle = Utils.angle(this.x, this.y, target.x, target.y);
                    const jitter = (Math.random() - 0.5) * 0.20; // ±0.1rad
                    angle = baseAngle + jitter;
                } else {
                    // 沒有足夠目標時，平均分布在360度
                    angle = (i / Math.max(1, count)) * Math.PI * 2;
                }

                const spawnOffset = 12;
                const sx = this.x + Math.cos(angle) * spawnOffset;
                const sy = this.y + Math.sin(angle) * spawnOffset;

                const projectile = new Projectile(
                    sx,
                    sy,
                    angle,
                    'ELONDIER_CLONE_THROW',
                    dmg,
                    speed,
                    size
                );
                projectile.player = this.player; // ✅ 讓 bo 音效/本地判定與 HEART_TRANSMISSION 一致
                projectile.critChanceBonusPct = ((this.player && this.player.critChanceBonusPct) || 0); // ✅ LV10 HEART_TRANSMISSION 同源
                projectile.critMultiplierBonusPct = ((this.player && this.player.awakeningCritDamageBonusPct) || 0);
                projectile.homing = true;
                projectile.turnRatePerSec = 6.0; // LV10 HEART_TRANSMISSION
                if (target) projectile.assignedTargetId = target.id;

                // ✅ 音效：參考 HEART_TRANSMISSION（lightning_shoot）
                // 避免 4 隻同時刷音：只讓 cloneIndex==0 播放一次（本次 volley 的第一發）
                if (i === 0 && this.cloneIndex === 0 && this.player && !this.player._isRemotePlayer && typeof AudioManager !== 'undefined') {
                    try { AudioManager.playSound('lightning_shoot'); } catch (_) { }
                }

                if (typeof Game !== 'undefined' && typeof Game.addProjectile === 'function') {
                    Game.addProjectile(projectile);
                }
            }
        } catch (_) { }
    }

    draw(ctx) {
        if (!this.player || !ctx) return;

        // ✅ 參考 Player.draw：使用 GifOverlay（玩家/AI 顯示維持 DOM 疊層，不節流、不改比例）
        let baseKey = (this.player.spriteImageKey && Game.images && Game.images[this.player.spriteImageKey])
            ? this.player.spriteImageKey
            : 'player';

        // player7 左右圖（僅非大招期間）
        try {
            if (!this.player.isUltimateActive) {
                if (baseKey === 'player7') {
                    const facingRight = (this.player && typeof this.player.facingRight === 'boolean') ? this.player.facingRight : true;
                    baseKey = facingRight ? 'player7-1' : 'player7';
                }
            }
        } catch (_) { }

        // 大招期間使用大招圖（與 Player 一致）
        const ultimateImgKey = (this.player.isUltimateActive && this.player._ultimateImageKey && Game.images && Game.images[this.player._ultimateImageKey])
            ? this.player._ultimateImageKey
            : (this.player.isUltimateActive && Game.images && Game.images[CONFIG.ULTIMATE.IMAGE_KEY])
                ? CONFIG.ULTIMATE.IMAGE_KEY
                : null;
        const imgKey = ultimateImgKey || baseKey;
        const imgObj = (Game.images && Game.images[imgKey]) ? Game.images[imgKey] : null;
        if (!imgObj || !imgObj.complete) return;

        const visualScale = (CONFIG && CONFIG.PLAYER && typeof CONFIG.PLAYER.VISUAL_SCALE === 'number') ? CONFIG.PLAYER.VISUAL_SCALE : 1.0;
        const baseSize = Math.max(this.player.width || this.width, this.player.height || this.height) * 0.9; // 小 10%
        const camX = (typeof Game !== 'undefined' && Game && Game.camera) ? Game.camera.x : 0;
        const camY = (typeof Game !== 'undefined' && Game && Game.camera) ? Game.camera.y : 0;
        const shakeX = (typeof Game !== 'undefined' && Game && Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetX || 0) : 0;
        const shakeY = (typeof Game !== 'undefined' && Game && Game.cameraShake && Game.cameraShake.active) ? (Game.cameraShake.offsetY || 0) : 0;
        const screenX = this.x - camX - shakeX;
        const screenY = this.y - camY - shakeY;

        if (typeof window !== 'undefined' && window.GifOverlay && typeof window.GifOverlay.showOrUpdate === 'function') {
            const overlayId = this._getOverlayId();

            // player7.png / player7-1.png 保持原比例（290x242），沿用 Player.draw 的比例策略
            if ((imgKey === 'player7' || imgKey === 'player7-1') && imgObj.complete) {
                const imgWidth = imgObj.naturalWidth || imgObj.width || 290;
                const imgHeight = imgObj.naturalHeight || imgObj.height || 242;
                const aspectRatio = imgWidth / imgHeight;
                const renderHeight = Math.max(1, Math.floor(baseSize * visualScale));
                const renderWidth = Math.max(1, Math.floor(renderHeight * aspectRatio));
                window.GifOverlay.showOrUpdate(overlayId, imgObj.src, screenX, screenY, { width: renderWidth, height: renderHeight });
            } else {
                // 其他角色：使用正方形顯示（維持既有行為）
                const renderSize = Math.max(1, Math.floor(baseSize * visualScale));
                window.GifOverlay.showOrUpdate(overlayId, imgObj.src, screenX, screenY, renderSize);
            }

            // 分身層級略低於玩家本尊（避免遮擋）
            try {
                const el = document.getElementById(`gif-overlay-${overlayId}`);
                if (el) el.style.zIndex = '2';
            } catch (_) { }
        } else {
            // 後備：Canvas
            const renderSize = Math.max(1, Math.floor(baseSize * visualScale));
            ctx.drawImage(imgObj, this.x - renderSize / 2, this.y - renderSize / 2, renderSize, renderSize);
        }
    }
}

// ✅ ES Module 相容：讓多人模組能透過 globalThis/window 取得 ctor
try {
    if (typeof window !== 'undefined') {
        window.ElondierUltimateClone = ElondierUltimateClone;
    }
} catch (_) { }


