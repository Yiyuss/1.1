// 寶箱（拾取後觸發一次免費升級）
/**
 * Chest（寶箱）
 * 重構說明：
 * - 抽出通用繪製函式以減少重複（radial ellipse、beam trapezoid）。
 * - 保持既有參數與繪製順序不變，視覺效果完全一致。
 */
class Chest extends Entity {
    constructor(x, y, id = null) {
        const size = 48;
        super(x, y, size, size);
        this.collisionRadius = size / 2;
        // ✅ MMORPG 架構：唯一ID（用於服務器驗證）
        this.id = id || Utils.generateUUID();
        // 防止重複收集標記
        this.isCollecting = false;

        // 光束幾何
        this.beamH = 120;
        this.beamBaseW = 30;
        this.beamTopW = 12;
        this._beamPhase = 0;

        // 可微調參數（保持原值）
        this.tune = {
            // 外層光束透明與邊緣柔化
            outerAlpha0: 0.62,
            outerAlpha35: 0.42,
            outerAlpha80: 0.16,
            outerAlpha100: 0.04,
            shadowAlphaOuter: 0.38,
            shadowBlurOuter: 26,

            // 光束底部羽化（與底部光圈接合）
            linkBeamToBase: true,
            beamBottomGapPx: 6,
            beamBottomFeatherPx: 12,
            outerBottomAlpha: 0.22,
            coreBottomAlpha: 0.35,

            // 內層核心（亮度與合成）
            useCore: true,
            coreBaseW: 12,
            coreTopW: 6,
            coreAlpha0: 0.82,
            coreAlpha40: 0.58,
            coreAlpha85: 0.18,
            coreAlpha100: 0.00,
            coreComposite: 'screen',
            shadowAlphaCore: 0.28,
            shadowBlurCore: 12,

            // 核心過渡環帶（漸層+漸層）
            useBaseCoreRim: true,
            baseCoreRimRx: 30,
            baseCoreRimRy: 12,
            baseCoreRimInnerRatio: 0.55,
            baseCoreRimAlpha: 0.16,
            baseCoreRimEdgeAlpha: 0.00,
            baseCoreRimComposite: 'screen',

            // 底部光圈：多層橢圓、亮度同步
            baseSync: true,
            baseMatchFactor: 0.95,

            // 第一層（外層）光暈：中等範圍
            baseEllipseRxOuter: 34,
            baseEllipseRyOuter: 14,
            baseOuterMidAlpha: 0.20,
            baseOuterEdgeAlpha: 0.00,

            // 第二層（更外層、更柔和）
            useBaseSoft: true,
            baseEllipseRxSoft: 56,
            baseEllipseRySoft: 22,
            baseSoftFactor: 0.50,
            baseSoftMidAlpha: 0.08,
            baseSoftEdgeAlpha: 0.00,

            // 內層（核心）光暈
            baseEllipseRxCore: 26,
            baseEllipseRyCore: 10,

            // 呼吸振幅
            breathAmplitudeOuter: 0.04,
            breathAmplitudeCore: 0.02,

            // 合成與前景薄環
            compositeBack: 'source-over',
            ringAlpha: 0.0,
            ringLineWidth: 1.2,
            ringColor: 'rgba(255,255,255,0.65)',
            ringRx: 20,
            ringRy: 7,
        };
    }

    update(deltaTime) {
        // ✅ MMORPG 架構：防止重複處理，如果已經被標記為刪除，不再處理
        if (this.markedForDeletion) return;

        // ✅ MMORPG 架構：支援多玩家收集（本地玩家 + 遠程玩家），不依賴室長端
        const allPlayers = [];
        if (Game.player) allPlayers.push(Game.player);
        // ✅ MMORPG 架構：使用 RemotePlayerManager 獲取遠程玩家（所有端都可以）
        if (Game.multiplayer) {
            try {
                let isSurvivalMode = false;
                try {
                    const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                        ? GameModeManager.getCurrent()
                        : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                            ? ModeManager.getActiveModeId()
                            : null);
                    isSurvivalMode = (activeId === 'survival' || activeId === null);
                } catch (_) { }

                if (isSurvivalMode && typeof window !== 'undefined' && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                    const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                    if (typeof rm.getAllPlayers === 'function') {
                        const remotePlayers = rm.getAllPlayers();
                        for (const remotePlayer of remotePlayers) {
                            if (remotePlayer && !remotePlayer.markedForDeletion) {
                                allPlayers.push(remotePlayer);
                            }
                        }
                    }
                }
            } catch (_) { }
        }

        // 檢查是否被任何玩家收集
        for (const player of allPlayers) {
            const dx = this.x - player.x;
            const dy = this.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= (this.collisionRadius + player.collisionRadius)) {
                this.collect(player);
                return; // 只處理一次，防止重複
            }
        }
        this.x = Utils.clamp(this.x, this.width / 2, (Game.worldWidth || Game.canvas.width) - this.width / 2);
        this.y = Utils.clamp(this.y, this.height / 2, (Game.worldHeight || Game.canvas.height) - this.height / 2);

        const dt = Math.max(1, deltaTime);
        this._beamPhase += dt * 0.0025;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = this.tune.compositeBack;

        const H = this.beamH;
        const x = this.x, y = this.y;
        const baseY = this.y + this.height * 0.35;

        // 與光束底部同步的中心亮度
        const baseAlphaInner = this.tune.baseSync
            ? Math.max(this.tune.outerAlpha0, this.tune.coreAlpha0 || 0) * this.tune.baseMatchFactor
            : 0.45;
        const baseAlphaSoft = baseAlphaInner * (this.tune.baseSoftFactor || 0.55);

        // 第二層柔光暈（外層，擴散慢）
        if (this.tune.useBaseSoft) {
            this._drawRadialEllipse(ctx, x, baseY, this.tune.baseEllipseRxSoft, this.tune.baseEllipseRySoft, [
                [0.00, `rgba(255,230,150,${baseAlphaSoft})`],
                [0.70, `rgba(255,220,140,${this.tune.baseSoftMidAlpha})`],
                [1.00, `rgba(255,220,140,${this.tune.baseSoftEdgeAlpha})`],
            ], 'source-over');
        }

        // 第一層外光暈（淡、漸層高）
        this._drawRadialEllipse(ctx, x, baseY, this.tune.baseEllipseRxOuter, this.tune.baseEllipseRyOuter, [
            [0.00, `rgba(255,230,150,${baseAlphaInner})`],
            [0.50, `rgba(255,215,120,${this.tune.baseOuterMidAlpha})`],
            [1.00, `rgba(255,215,120,${this.tune.baseOuterEdgeAlpha})`],
        ], 'source-over');

        // 內層核心光暈（亮、也有漸層淡化）
        this._drawRadialEllipse(ctx, x, baseY, this.tune.baseEllipseRxCore, this.tune.baseEllipseRyCore, [
            [0.00, `rgba(255,240,190,${this.tune.coreAlpha0})`],
            [0.40, `rgba(255,235,175,${this.tune.coreAlpha40})`],
            [0.85, `rgba(255,235,175,${this.tune.coreAlpha85})`],
            [1.00, `rgba(255,235,175,${this.tune.coreAlpha100})`],
        ], this.tune.coreComposite);

        // 核心過渡環帶（漸層+漸層）：由內向外淡化銜接外層
        if (this.tune.useBaseCoreRim) {
            this._drawRadialEllipse(ctx, x, baseY, this.tune.baseCoreRimRx, this.tune.baseCoreRimRy, [
                [0.00, `rgba(255,236,180,${this.tune.baseCoreRimAlpha})`],
                [1.00, `rgba(255,236,180,${this.tune.baseCoreRimEdgeAlpha})`],
            ], this.tune.baseCoreRimComposite, 32, this.tune.baseCoreRimInnerRatio);
        }

        // 光束底部錨點與羽化
        const beamBottomY = this.tune.linkBeamToBase
            ? (baseY - (this.tune.beamBottomGapPx || 0))
            : (y + (this.tune.beamBottomOffsetPx || 0));
        const featherRatio = Math.min(0.25, (this.tune.beamBottomFeatherPx || 0) / H);

        // 外層光束（淡、漸層高、底部羽化）
        const WbOuter = this.beamBaseW * (1 + Math.sin(this._beamPhase) * this.tune.breathAmplitudeOuter);
        const WtOuter = this.beamTopW;
        this._drawBeamTrapezoid(ctx, x, beamBottomY, H, WbOuter, WtOuter, [
            [0.00, `rgba(255,235,170,${this.tune.outerBottomAlpha})`],
            [featherRatio, `rgba(255,235,170,${this.tune.outerAlpha0})`],
            [0.35, `rgba(255,225,150,${this.tune.outerAlpha35})`],
            [0.80, `rgba(255,225,150,${this.tune.outerAlpha80})`],
            [1.00, `rgba(255,225,150,${this.tune.outerAlpha100})`],
        ], `rgba(255,225,150,${this.tune.shadowAlphaOuter})`, this.tune.shadowBlurOuter, 'source-over');

        // 內層核心光束（更細、亮、底部羽化）
        if (this.tune.useCore) {
            const WbCore = this.tune.coreBaseW * (1 + Math.sin(this._beamPhase) * this.tune.breathAmplitudeCore);
            const WtCore = this.tune.coreTopW;
            this._drawBeamTrapezoid(ctx, x, beamBottomY, H, WbCore, WtCore, [
                [0.00, `rgba(255,240,190,${this.tune.coreBottomAlpha})`],
                [featherRatio, `rgba(255,240,190,${this.tune.coreAlpha0})`],
                [0.40, `rgba(255,235,175,${this.tune.coreAlpha40})`],
                [0.85, `rgba(255,235,175,${this.tune.coreAlpha85})`],
                [1.00, `rgba(255,235,175,${this.tune.coreAlpha100})`],
            ], `rgba(255,235,175,${this.tune.shadowAlphaCore})`, this.tune.shadowBlurCore, this.tune.coreComposite);
        }

        // 中景：圖片
        const img = (Game.images || {})['box'];
        const size = Math.max(this.width, this.height);
        const s = size;
        if (img) {
            ctx.drawImage(img, this.x - s / 2, this.y - s / 2, s, s);
        } else {
            ctx.fillStyle = '#cfa216';
            ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x - s / 2, this.y - s / 2, s, s);
        }

        // 前景：薄環（預設關閉）
        if (this.tune.ringAlpha > 0) {
            ctx.globalAlpha = this.tune.ringAlpha;
            ctx.strokeStyle = this.tune.ringColor;
            ctx.lineWidth = this.tune.ringLineWidth;
            ctx.beginPath();
            ctx.ellipse(this.x, baseY, this.tune.ringRx, this.tune.ringRy, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    // === 通用繪製輔助 ===
    _drawRadialEllipse(ctx, cx, cy, rx, ry, stops, composite = 'source-over', scaleRefR = 32, innerRatio = null) {
        ctx.save();
        const prevComp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = composite || prevComp;
        ctx.translate(cx, cy);
        ctx.scale(rx / scaleRefR, ry / scaleRefR);
        const g = ctx.createRadialGradient(0, 0, innerRatio ? scaleRefR * innerRatio : 0, 0, 0, scaleRefR);
        for (const [offset, color] of stops) g.addColorStop(offset, color);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, scaleRefR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = prevComp;
        ctx.restore();
    }

    _drawBeamTrapezoid(ctx, cx, yBottom, H, Wb, Wt, stops, shadowColor, shadowBlur, composite = 'source-over') {
        ctx.save();
        const prevComp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = composite || prevComp;
        const g = ctx.createLinearGradient(cx, yBottom, cx, yBottom - H);
        for (const [offset, color] of stops) g.addColorStop(offset, color);
        ctx.fillStyle = g;
        if (shadowColor && shadowBlur) {
            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = shadowBlur;
        }
        ctx.beginPath();
        ctx.moveTo(cx - Wb / 2, yBottom);
        ctx.lineTo(cx - Wt / 2, yBottom - H);
        ctx.lineTo(cx + Wt / 2, yBottom - H);
        ctx.lineTo(cx + Wb / 2, yBottom);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = prevComp;
        ctx.restore();
    }

    collect(player) {
        // ✅ MMORPG 架構：防止重複撿取，如果已經被標記為刪除，不再處理
        if (this.markedForDeletion || this.isCollecting) return;

        // M4：支援遠程玩家收集（但只有本地玩家觸發升級選單）
        const targetPlayer = player || Game.player;
        if (!targetPlayer) {
            this.markedForDeletion = true;
            this.destroy();
            return;
        }

        // ✅ MMORPG 架構：多人模式下，先發送請求給服務器驗證
        // 由服務器確認後廣播 chest_collected 事件，再執行實際收集邏輯
        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer);

        if (isMultiplayer) {
            // 標記為正在收集，防止重複發送請求
            this.isCollecting = true;

            // 發送收集請求
            if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                window.SurvivalOnlineRuntime.sendToNet({
                    type: 'try_collect_chest',
                    chestId: this.id,
                    chestType: 'NORMAL',
                    x: this.x,
                    y: this.y
                });
            }
            // 這裡不執行 destroy，等待服務器回傳 chest_collected 事件
            // 當收到 chest_collected 事件時，在 external event handler 中處理移除和獎勵
            return;
        }

        // --- 單機模式邏輯 (保持不變) ---

        // ✅ MMORPG 架構：立即標記為刪除，防止多個玩家同時檢測到碰撞時重複處理
        this.markedForDeletion = true;

        // 只有本地玩家收集時才顯示升級選單（避免重複顯示）
        if (targetPlayer === Game.player) {
            if (typeof AudioManager !== 'undefined') {
                AudioManager.playSound('level_up');
            }
            if (typeof UI !== 'undefined' && UI.showLevelUpMenu) {
                UI.showLevelUpMenu();
            }
        }
        this.destroy();
    }
}

// 鳳梨大絕掉落物：外觀/特效沿用寶箱（BOX.png）光束，但圖片改為 A45.png（53x100）
// - 不會被吸引（不是 ExperienceOrb），必須玩家碰觸才能收集
// - 收集後給予「50 + 當下所需升級的30%經驗」並播放 collect_exp 音效
class PineappleUltimatePickup extends Chest {
    constructor(x, y, opts = {}) {
        // 如果 opts 包含 id，則使用之
        super(x, y, (opts && opts.id) ? opts.id : null);
        // 視覺尺寸：A45.png 53x100
        this.width = 53;
        this.height = 100;
        // 以矩形碰撞更符合「必須碰觸」：用多邊形碰撞取代圓形近似
        try {
            this.collisionRadius = Math.max(this.width, this.height) / 2;
            this.setCollisionPolygon([
                [-this.width / 2, -this.height / 2],
                [this.width / 2, -this.height / 2],
                [this.width / 2, this.height / 2],
                [-this.width / 2, this.height / 2]
            ]);
        } catch (_) { }

        // 掉落參數（保留欄位，避免外部有人傳入；但目前規則為「純30%當下所需升級經驗」）
        this.expValue = (opts && typeof opts.expValue === 'number') ? Math.max(0, Math.floor(opts.expValue)) : 0;

        // 簡單噴出動畫：從 spawn 點飛到 target 點
        this._spawnX = (opts && typeof opts.spawnX === 'number') ? opts.spawnX : x;
        this._spawnY = (opts && typeof opts.spawnY === 'number') ? opts.spawnY : y;
        this._targetX = x;
        this._targetY = y;
        this._flyStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        this._flyDuration = (opts && typeof opts.flyDurationMs === 'number') ? Math.max(0, Math.floor(opts.flyDurationMs)) : 600;
        // 起始先放在玩家位置，逐步飛到目標
        this.x = this._spawnX;
        this.y = this._spawnY;
        this._landed = (this._flyDuration <= 0);
    }

    update(deltaTime) {
        // 噴出飛行階段（不吸、也不提前收集）
        if (!this._landed) {
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const t = Math.min(1, Math.max(0, (now - this._flyStart) / Math.max(1, this._flyDuration)));
            // easeOutQuad
            const k = 1 - (1 - t) * (1 - t);
            this.x = this._spawnX + (this._targetX - this._spawnX) * k;
            this.y = this._spawnY + (this._targetY - this._spawnY) * k;
            if (t >= 1) this._landed = true;
        }

        // ✅ MMORPG 架構：與玩家碰觸收集（必須落地後），檢查所有玩家（本地+遠程）
        if (this._landed && !this.markedForDeletion) {
            // 檢查是否被任何玩家收集（本地玩家 + 遠程玩家）
            const allPlayers = [];
            if (Game.player) allPlayers.push(Game.player);
            // ✅ MMORPG 架構：使用 RemotePlayerManager 獲取遠程玩家（所有端都可以）
            if (Game.multiplayer) {
                try {
                    let isSurvivalMode = false;
                    try {
                        const activeId = (typeof GameModeManager !== 'undefined' && typeof GameModeManager.getCurrent === 'function')
                            ? GameModeManager.getCurrent()
                            : ((typeof ModeManager !== 'undefined' && typeof ModeManager.getActiveModeId === 'function')
                                ? ModeManager.getActiveModeId()
                                : null);
                        isSurvivalMode = (activeId === 'survival' || activeId === null);
                    } catch (_) { }

                    if (isSurvivalMode && typeof window !== 'undefined' && window.SurvivalOnlineRuntime && window.SurvivalOnlineRuntime.RemotePlayerManager) {
                        const rm = window.SurvivalOnlineRuntime.RemotePlayerManager;
                        if (typeof rm.getAllPlayers === 'function') {
                            const remotePlayers = rm.getAllPlayers();
                            for (const remotePlayer of remotePlayers) {
                                if (remotePlayer && !remotePlayer.markedForDeletion) {
                                    allPlayers.push(remotePlayer);
                                }
                            }
                        }
                    }
                } catch (_) { }
            }

            // 檢查是否被任何玩家收集
            for (const player of allPlayers) {
                if (this.isColliding(player)) {
                    this.collect();
                    return; // 只處理一次，防止重複
                }
            }
        }

        // 邊界約束（沿用 Chest 行為）
        this.x = Utils.clamp(this.x, this.width / 2, (Game.worldWidth || Game.canvas.width) - this.width / 2);
        this.y = Utils.clamp(this.y, this.height / 2, (Game.worldHeight || Game.canvas.height) - this.height / 2);

        const dt = Math.max(1, deltaTime);
        this._beamPhase += dt * 0.0025;
    }

    draw(ctx) {
        // 完全沿用 Chest 的光束與底部光圈效果，但把中景圖片改為 A45 並保持 53:100
        ctx.save();
        ctx.globalCompositeOperation = this.tune.compositeBack;

        const H = this.beamH;
        const x = this.x, y = this.y;
        const baseY = this.y + this.height * 0.35;

        const baseAlphaInner = this.tune.baseSync
            ? Math.max(this.tune.outerAlpha0, this.tune.coreAlpha0 || 0) * this.tune.baseMatchFactor
            : 0.45;
        const baseAlphaSoft = baseAlphaInner * (this.tune.baseSoftFactor || 0.55);

        if (this.tune.useBaseSoft) {
            this._drawRadialEllipse(ctx, x, baseY, this.tune.baseEllipseRxSoft, this.tune.baseEllipseRySoft, [
                [0.00, `rgba(255,230,150,${baseAlphaSoft})`],
                [0.70, `rgba(255,220,140,${this.tune.baseSoftMidAlpha})`],
                [1.00, `rgba(255,220,140,${this.tune.baseSoftEdgeAlpha})`],
            ], 'source-over');
        }

        this._drawRadialEllipse(ctx, x, baseY, this.tune.baseEllipseRxOuter, this.tune.baseEllipseRyOuter, [
            [0.00, `rgba(255,230,150,${baseAlphaInner})`],
            [0.50, `rgba(255,215,120,${this.tune.baseOuterMidAlpha})`],
            [1.00, `rgba(255,215,120,${this.tune.baseOuterEdgeAlpha})`],
        ], 'source-over');

        this._drawRadialEllipse(ctx, x, baseY, this.tune.baseEllipseRxCore, this.tune.baseEllipseRyCore, [
            [0.00, `rgba(255,240,190,${this.tune.coreAlpha0})`],
            [0.40, `rgba(255,235,175,${this.tune.coreAlpha40})`],
            [0.85, `rgba(255,235,175,${this.tune.coreAlpha85})`],
            [1.00, `rgba(255,235,175,${this.tune.coreAlpha100})`],
        ], this.tune.coreComposite);

        if (this.tune.useBaseCoreRim) {
            this._drawRadialEllipse(ctx, x, baseY, this.tune.baseCoreRimRx, this.tune.baseCoreRimRy, [
                [0.00, `rgba(255,236,180,${this.tune.baseCoreRimAlpha})`],
                [1.00, `rgba(255,236,180,${this.tune.baseCoreRimEdgeAlpha})`],
            ], this.tune.baseCoreRimComposite, 32, this.tune.baseCoreRimInnerRatio);
        }

        const beamBottomY = this.tune.linkBeamToBase
            ? (baseY - (this.tune.beamBottomGapPx || 0))
            : (y + (this.tune.beamBottomOffsetPx || 0));
        const featherRatio = Math.min(0.25, (this.tune.beamBottomFeatherPx || 0) / H);

        const WbOuter = this.beamBaseW * (1 + Math.sin(this._beamPhase) * this.tune.breathAmplitudeOuter);
        const WtOuter = this.beamTopW;
        this._drawBeamTrapezoid(ctx, x, beamBottomY, H, WbOuter, WtOuter, [
            [0.00, `rgba(255,235,170,${this.tune.outerBottomAlpha})`],
            [featherRatio, `rgba(255,235,170,${this.tune.outerAlpha0})`],
            [0.35, `rgba(255,225,150,${this.tune.outerAlpha35})`],
            [0.80, `rgba(255,225,150,${this.tune.outerAlpha80})`],
            [1.00, `rgba(255,225,150,${this.tune.outerAlpha100})`],
        ], `rgba(255,225,150,${this.tune.shadowAlphaOuter})`, this.tune.shadowBlurOuter, 'source-over');

        if (this.tune.useCore) {
            const WbCore = this.tune.coreBaseW * (1 + Math.sin(this._beamPhase) * this.tune.breathAmplitudeCore);
            const WtCore = this.tune.coreTopW;
            this._drawBeamTrapezoid(ctx, x, beamBottomY, H, WbCore, WtCore, [
                [0.00, `rgba(255,240,190,${this.tune.coreBottomAlpha})`],
                [featherRatio, `rgba(255,240,190,${this.tune.coreAlpha0})`],
                [0.40, `rgba(255,235,175,${this.tune.coreAlpha40})`],
                [0.85, `rgba(255,235,175,${this.tune.coreAlpha85})`],
                [1.00, `rgba(255,235,175,${this.tune.coreAlpha100})`],
            ], `rgba(255,235,175,${this.tune.shadowAlphaCore})`, this.tune.shadowBlurCore, this.tune.coreComposite);
        }

        // 中景：A45.png（53x100）保持寬高比
        const img = (Game.images || {})['A45'];
        if (img) {
            const h = this.height;
            const w = this.width;
            ctx.drawImage(img, this.x - w / 2, this.y - h / 2, w, h);
        } else {
            // 後備：以黃框矩形表示
            ctx.fillStyle = '#f4d03f';
            ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        }

        ctx.restore();
    }

    collect(player) {
        // ✅ MMORPG 架構：防止重複撿取
        if (this.markedForDeletion || this.isCollecting) return;

        const isMultiplayer = (typeof Game !== 'undefined' && Game.multiplayer);

        if (isMultiplayer) {
            // 標記為正在收集
            this.isCollecting = true;

            // 發送收集請求
            if (typeof window !== "undefined" && window.SurvivalOnlineRuntime && typeof window.SurvivalOnlineRuntime.sendToNet === 'function') {
                window.SurvivalOnlineRuntime.sendToNet({
                    type: 'try_collect_chest',
                    chestId: this.id,
                    chestType: 'PINEAPPLE',
                    x: this.x,
                    y: this.y
                });
            }
            // 等待服務器廣播
            return;
        }

        // --- 單機模式邏輯 (保持不變) ---

        // ✅ MMORPG 架構：立即標記為刪除，防止重複處理（多個玩家同時檢測到碰撞時）
        this.markedForDeletion = true;

        // 確認玩家
        const targetPlayer = player || Game.player;

        // 單人模式：給予經驗
        // 只有本地玩家播放音效
        if (targetPlayer === Game.player && !targetPlayer._isRemotePlayer) {
            try {
                if (typeof AudioManager !== 'undefined') {
                    if (AudioManager.expSoundEnabled !== false) {
                        AudioManager.playSound('collect_exp');
                    }
                }
            } catch (_) { }
        }

        // 給予經驗
        if (targetPlayer && typeof targetPlayer.gainExperience === 'function') {
            // 平衡：每顆鳳梨給「50 + 當下所需升級的30%經驗」
            const base = 50;
            let needNow = 0;
            try {
                if (typeof targetPlayer.experienceToNextLevel === 'number' && typeof targetPlayer.experience === 'number') {
                    needNow = Math.max(0, Math.floor(targetPlayer.experienceToNextLevel - targetPlayer.experience));
                }
            } catch (_) { }
            const bonus = Math.max(0, Math.floor(needNow * 0.30));
            targetPlayer.gainExperience(base + bonus);
        }

        this.destroy();
    }
}
