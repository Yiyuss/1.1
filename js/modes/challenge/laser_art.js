// 挑戰模式專用雷射美術（不污染其他模式）
// 提供 draw(ctx, { sx, sy, ex, ey, width, color, alpha }) 供 ChallengeBulletSystem 使用
(function(global){
  const TAU = Math.PI * 2;
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  const Art = {
    draw(ctx, args){
      if (!ctx || !args) return;
      const sx = args.sx|0, sy = args.sy|0, ex = args.ex|0, ey = args.ey|0;
      const w = Math.max(2, (args.width|0));
      const col = String(args.color||'#99bbff');
      const alpha = clamp(Number(args.alpha)||0.9, 0, 1);
      ctx.save();
      // 核心：白藍線性漸層
      ctx.globalAlpha = alpha;
      const core = ctx.createLinearGradient(sx, sy, ex, ey);
      core.addColorStop(0, '#bfe8ff'); core.addColorStop(0.5, '#ffffff'); core.addColorStop(1, '#bfe8ff');
      ctx.strokeStyle = core; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      // 外層光暈與顏色疊加
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = col; ctx.globalAlpha = alpha * 0.38; ctx.lineWidth = w * 1.7;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      // 端點光暈球
      const glowR = Math.max(6, w * 0.65);
      const drawGlow = (x, y) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, glowR); rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.35, 'rgba(160,210,255,0.75)'); rg.addColorStop(1, 'rgba(160,210,255,0)'); ctx.fillStyle = rg; ctx.globalAlpha = 1.0 * (alpha*0.95); ctx.beginPath(); ctx.arc(x, y, glowR, 0, TAU); ctx.fill(); };
      drawGlow(sx, sy); drawGlow(ex, ey);
      ctx.restore();
    }
  };

  global.ChallengeLaserArt = Art;
})(this);