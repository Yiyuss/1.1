// GIF 覆蓋層：在 #viewport 內用 <img> 疊加顯示，原生支援 GIF 動畫
// 用法：GifOverlay.showOrUpdate('player', src, centerX, centerY, size)
// - centerX/centerY 為相對於 #viewport 的中心座標（像素）
// - size 為寬高（像素），會等比設定寬高
(function(){
  const ID_PREFIX = 'gif-overlay-';
  const _flashTimers = new Map();

  function getViewport(){
    return document.getElementById('viewport');
  }

  function ensureImg(id){
    const vp = getViewport();
    if (!vp) return null;
    const domId = ID_PREFIX + id;
    let el = document.getElementById(domId);
    if (!el) {
      el = document.createElement('img');
      el.id = domId;
      el.style.position = 'absolute';
      // 玩家GIF層：置於畫布之上、UI之下
      el.style.zIndex = '3';
      el.style.pointerEvents = 'none';
      el.style.imageRendering = 'pixelated';
      // 預設隱藏，避免閃爍
      el.style.display = 'none';
      vp.appendChild(el);
    }
    return el;
  }

  function getUiScale(){
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale');
      const s = parseFloat(v);
      if (!isNaN(s) && s > 0) return s;
    } catch(_) {}
    // 後備：以 viewport 實際寬高推算相對於遊戲座標的縮放
    try {
      const vp = getViewport();
      if (!vp) return 1.0;
      const targetW = (window.CONFIG && window.CONFIG.CANVAS_WIDTH) ? window.CONFIG.CANVAS_WIDTH : vp.offsetWidth;
      const s = vp.offsetWidth / targetW;
      return (s > 0) ? s : 1.0;
    } catch(_) {}
    return 1.0;
  }

  const GifOverlay = {
    showOrUpdate(id, src, centerX, centerY, size){
      try {
        const el = ensureImg(id);
        if (!el) return;
        if (src && el.src !== src) el.src = src;
        const uiScale = getUiScale();
        const half = Math.floor(size / 2);
        el.style.left = (Math.floor((centerX - half) * uiScale)) + 'px';
        el.style.top = (Math.floor((centerY - half) * uiScale)) + 'px';
        el.style.width = Math.max(1, Math.floor(size * uiScale)) + 'px';
        el.style.height = Math.max(1, Math.floor(size * uiScale)) + 'px';
        el.style.display = '';
      } catch(_) {}
    },
    // 簡單紅閃：在指定圖片元素上暫時套用紅色光暈與透明度（不使用遮罩）
    // options: { color?: string, durationMs?: number, opacity?: number }
    flash(id, options){
      try {
        const el = ensureImg(id);
        if (!el) return;
        const domId = ID_PREFIX + id;
        const opts = options || {};
        const duration = (typeof opts.durationMs === 'number') ? opts.durationMs : 150;
        const color = opts.color || '#ff0000';
        const opacity = (typeof opts.opacity === 'number') ? String(opts.opacity) : '0.8';
        // 取消舊計時器避免疊加殘留
        const old = _flashTimers.get(domId);
        if (old) { try { clearTimeout(old); } catch(_){} _flashTimers.delete(domId); }
        // 單一效果：不與既有 filter 疊加，結束後回復初始
        el.style.filter = `drop-shadow(0 0 10px ${color}) saturate(1.6)`;
        el.style.opacity = opacity;
        el.style.display = '';
        const timer = setTimeout(() => {
          try { el.style.filter = ''; el.style.opacity = ''; } catch(_){}
          _flashTimers.delete(domId);
        }, duration);
        _flashTimers.set(domId, timer);
      } catch(_) {}
    },
    hide(id){
      try {
        const domId = ID_PREFIX + id;
        const el = document.getElementById(domId);
        if (el) el.style.display = 'none';
      } catch(_) {}
    },
    clearAll(){
      try {
        const vp = getViewport();
        if (!vp) return;
        const nodes = Array.from(vp.querySelectorAll('[id^="' + ID_PREFIX + '"]'));
        for (const n of nodes) { try { vp.removeChild(n); } catch(_) {} }
      } catch(_) {}
    }
  };

  if (typeof window !== 'undefined') {
    window.GifOverlay = GifOverlay;
  } else {
    // Node 或其他環境：略過
  }
})();