// AdventureGifOverlay
// 冒險模式專用 GIF 疊加層（只作用在本 iframe 內，不影響主體遊戲或其他模式）
// 目的：
// - 在 adventure/index.html 裡，以 <img> 疊加在 gameCanvas 上顯示 GIF 動畫角色
// - 不改動既有 Canvas 內容（地形、UI 等），僅作前景圖層
// - 不依賴主體的 GifOverlay，避免跨視窗衝突
(function(global){
  'use strict';

  const ID_PREFIX = 'adv-gif-';

  function getCanvas(){
    return global.document ? global.document.getElementById('gameCanvas') : null;
  }

  function ensureImg(id){
    const canvas = getCanvas();
    if (!canvas || !canvas.ownerDocument) return null;
    const doc = canvas.ownerDocument;
    const domId = ID_PREFIX + id;
    let el = doc.getElementById(domId);
    if (!el) {
      el = doc.createElement('img');
      el.id = domId;
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.imageRendering = 'pixelated';
      el.style.zIndex = '2'; // 高於 canvas，低於 UI
      el.style.display = 'none';
      // 直接掛在 body 上，以 canvas 的 boundingRect 為基準定位
      doc.body.appendChild(el);
    }
    return el;
  }

  function showOrUpdate(id, src, canvasX, canvasY, size){
    try {
      const canvas = getCanvas();
      if (!canvas) return;
      const el = ensureImg(id);
      if (!el) return;
      if (src && el.src !== src) el.src = src;

      const rect = canvas.getBoundingClientRect();
      const cw = canvas.width || rect.width;
      const ch = canvas.height || rect.height;
      const scaleX = rect.width / cw;
      const scaleY = rect.height / ch;

      let baseW, baseH;
      if (size && typeof size === 'object') {
        baseW = size.width || 1;
        baseH = size.height || 1;
      } else {
        const s = Number(size) || 32;
        baseW = s;
        baseH = s;
      }
      const w = Math.max(1, Math.floor(baseW * scaleX));
      const h = Math.max(1, Math.floor(baseH * scaleY));
      const halfW = Math.floor(w / 2);
      const halfH = Math.floor(h / 2);

      const left = rect.left + canvasX * scaleX - halfW;
      const top  = rect.top  + canvasY * scaleY - halfH;

      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.display = '';
    } catch(_) {}
  }

  function hide(id){
    try {
      const canvas = getCanvas();
      if (!canvas || !canvas.ownerDocument) return;
      const doc = canvas.ownerDocument;
      const el = doc.getElementById(ID_PREFIX + id);
      if (el) el.style.display = 'none';
    } catch(_) {}
  }

  function clearAll(){
    try {
      const canvas = getCanvas();
      if (!canvas || !canvas.ownerDocument) return;
      const doc = canvas.ownerDocument;
      const nodes = Array.from(doc.querySelectorAll('[id^="' + ID_PREFIX + '"]'));
      for (const n of nodes) {
        try { doc.body.removeChild(n); } catch(_) {}
      }
    } catch(_) {}
  }

  global.AdventureGifOverlay = { showOrUpdate, hide, clearAll };
})(typeof window !== 'undefined' ? window : globalThis);


