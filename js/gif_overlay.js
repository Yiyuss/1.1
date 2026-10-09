// GIF 覆蓋層：在 #viewport 內用 <img> 疊加顯示，原生支援 GIF 動畫
// 用法：GifOverlay.showOrUpdate('player', src, centerX, centerY, size)
// - centerX/centerY 為相對於 #viewport 的中心座標（像素）
// - size 為寬高（像素），會等比設定寬高
// 闖關等模式請 createGifOverlay('stage-gif-overlay-')，不要畫進生存層、不要 clearAll 生存節點。
(function(){
  function getViewport(){
    return document.getElementById('viewport');
  }

  function getUiScale(){
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale');
      const s = parseFloat(v);
      if (!isNaN(s) && s > 0) return s;
    } catch(_) {}
    try {
      const vp = getViewport();
      if (!vp) return 1.0;
      const targetW = (window.CONFIG && window.CONFIG.CANVAS_WIDTH) ? window.CONFIG.CANVAS_WIDTH : vp.offsetWidth;
      const s = vp.offsetWidth / targetW;
      return (s > 0) ? s : 1.0;
    } catch(_) {}
    return 1.0;
  }

  function createGifOverlay(idPrefix){
    const ID_PREFIX = idPrefix || 'gif-overlay-';
    const _flashTimers = new Map();

    function ensureImg(id, isBackground){
      const vp = getViewport();
      if (!vp) return null;
      const domId = ID_PREFIX + id;
      let el = document.getElementById(domId);
      if (!el) {
        el = document.createElement('img');
        el.id = domId;
        el.style.position = 'absolute';
        el.style.zIndex = isBackground ? '0.5' : '3';
        el.style.pointerEvents = 'none';
        el.style.imageRendering = 'pixelated';
        el.style.display = 'none';
        vp.appendChild(el);
      } else if (isBackground && el.style.zIndex !== '0.5') {
        el.style.zIndex = '0.5';
      } else if (!isBackground && el.style.zIndex === '0.5') {
        el.style.zIndex = '3';
      }
      return el;
    }

    return {
      showOrUpdate(id, src, centerX, centerY, size, isBackground){
        try {
          const el = ensureImg(id, isBackground);
          if (!el) return;
          if (src && el.src !== src) el.src = src;
          const uiScale = getUiScale();
          let w, h;
          if (size && typeof size === 'object') {
            w = Math.max(1, Math.floor((size.width || 1) * uiScale));
            h = Math.max(1, Math.floor((size.height || 1) * uiScale));
          } else {
            const s = Math.max(1, Math.floor((Number(size) || 1) * uiScale));
            w = s;
            h = s;
          }
          const halfW = Math.floor(w / 2);
          const halfH = Math.floor(h / 2);
          el.style.left = (Math.floor(centerX * uiScale) - halfW) + 'px';
          el.style.top = (Math.floor(centerY * uiScale) - halfH) + 'px';
          el.style.width = w + 'px';
          el.style.height = h + 'px';
          el.style.display = '';
        } catch(_) {}
      },
      flash(id, options){
        try {
          const el = ensureImg(id, false);
          if (!el) return;
          const domId = ID_PREFIX + id;
          const opts = options || {};
          const duration = (typeof opts.durationMs === 'number') ? opts.durationMs : 150;
          const color = opts.color || '#ff0000';
          const opacity = (typeof opts.opacity === 'number') ? String(opts.opacity) : '0.8';
          const old = _flashTimers.get(domId);
          if (old) { try { clearTimeout(old); } catch(_){} _flashTimers.delete(domId); }
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
          const el = document.getElementById(ID_PREFIX + id);
          if (el) el.style.display = 'none';
        } catch(_) {}
      },
      hideAll(){
        try {
          const vp = getViewport();
          if (!vp) return;
          const nodes = Array.from(vp.querySelectorAll('[id^="' + ID_PREFIX + '"]'));
          for (const n of nodes) { try { n.style.display = 'none'; } catch(_) {} }
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
  }

  if (typeof window !== 'undefined') {
    window.createGifOverlay = createGifOverlay;
    window.GifOverlay = createGifOverlay('gif-overlay-');
  }
})();
