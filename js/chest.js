// 寶箱（拾取後觸發一次免費升級）
/**
 * Chest（寶箱）
 * 重構說明：
 * - 抽出通用繪製函式以減少重複（radial ellipse、beam trapezoid）。
 * - 保持既有參數與繪製順序不變，視覺效果完全一致。
 */
class Chest extends Entity {
    constructor(x, y) {
        const size = 48;
        super(x, y, size, size);
        this.collisionRadius = size / 2;

        // 光束幾何
        this.beamH = 120;
        this.beamBaseW = 30;
        this.beamTopW = 12;
        this._beamPhase = 0;

        // 可微調參數（保持原值）
        this.tune = {
            // 外層光束透明與邊緣柔化
            outerAlpha0:   0.62,
            outerAlpha35:  0.42,
            outerAlpha80:  0.16,
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
            coreAlpha0:   0.82,
            coreAlpha40:  0.58,
            coreAlpha85:  0.18,
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
            breathAmplitudeCore:  0.02,

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
        const player = Game.player;
        const dx = this.x - player.x;
        const dy = this.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= (this.collisionRadius + player.collisionRadius)) {
            this.collect();
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

    collect() {
        if (typeof AudioManager !== 'undefined') {
            AudioManager.playSound('level_up');
        }
        UI.showLevelUpMenu();
        this.destroy();
    }
}
