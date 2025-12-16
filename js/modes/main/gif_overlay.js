// 主線模式專用 GIF 疊加層（零汙染）：僅在主線模式使用
// 提供：MainGifOverlay.showOrUpdate, .hide, .clearAll
// 注意：不影響全域 GifOverlay；DOM id 前綴使用 main 專屬，避免衝突。
(function(){
  const ID_PREFIX = 'main-gif-overlay-';

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
      el.style.zIndex = '3'; // 預設在畫布之上、UI之下（會根據 layerIndex 動態調整）
      el.style.pointerEvents = 'none';
      el.style.imageRendering = 'pixelated';
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
    try {
      const vp = getViewport();
      if (!vp) return 1.0;
      const targetW = (window.CONFIG && window.CONFIG.CANVAS_WIDTH) ? window.CONFIG.CANVAS_WIDTH : vp.offsetWidth;
      const s = vp.offsetWidth / targetW;
      return (s > 0) ? s : 1.0;
    } catch(_) {}
    return 1.0;
  }

  const MainGifOverlay = {
    // id: 'main-player' | 'main-tree-{index}' | 'main-home' | 'main-house-{index}' 等
    // 主線模式專用：使用左上角座標（與 rpg_map.html 的 canvas 繪製方式一致）
    // x, y 為左上角座標，而非中心點座標
    // layerIndex: 用於動態調整 z-index（與 rpg_map.html 的排序邏輯一致）
    // src: 可以是圖片 URL 或 Image 對象
    showOrUpdate(id, src, x, y, size, layerIndex){
      try {
        const el = ensureImg(id);
        if (!el) return;
        
        // 處理 src（支援 Image 對象或 URL 字串）
        let srcUrl = src;
        if (src && typeof src === 'object' && src.src) {
          srcUrl = src.src;
        } else if (src && typeof src === 'object' && src.nodeName === 'IMG') {
          srcUrl = src.src;
        }
        if (srcUrl && el.src !== srcUrl) el.src = srcUrl;
        
        // 主線模式圖層順序：使用獨立的圖層配置，支援動態調整
        // layerIndex 可以是：
        //   - { layerId: 'xxx', dynamicZIndex: 5 } - 動態 z-index（優先）
        //   - { layerId: 'xxx' } - 從配置獲取 z-index
        //   - number - 向後兼容
        let zIndex = 3; // 預設
        
        if (typeof layerIndex === 'object' && layerIndex !== null) {
          // 優先使用動態 z-index（如果提供）
          if (typeof layerIndex.dynamicZIndex === 'number') {
            zIndex = layerIndex.dynamicZIndex;
          } else if (layerIndex.layerId) {
            // 使用 layerId 從配置中獲取 z-index
            if (typeof window !== 'undefined' && typeof window.getLayerZIndex === 'function') {
              zIndex = window.getLayerZIndex(layerIndex.layerId);
            }
          }
        } else if (typeof layerIndex === 'number') {
          // 向後兼容：使用 layerIndex
          const maxZIndex = 9;
          zIndex = Math.min(3 + layerIndex, maxZIndex);
        }
        
        el.style.zIndex = String(zIndex);
        
        const uiScale = getUiScale();
        let w, h;
        if (size && typeof size === 'object') {
          // 支援 { width, height }，用於維持原始比例
          w = Math.max(1, Math.floor((size.width || 1) * uiScale));
          h = Math.max(1, Math.floor((size.height || 1) * uiScale));
        } else {
          const s = Math.max(1, Math.floor((Number(size) || 1) * uiScale));
          w = s;
          h = s;
        }
        // 主線模式使用左上角座標，直接定位（不減去 halfW/halfH）
        el.style.left = Math.floor(x * uiScale) + 'px';
        el.style.top = Math.floor(y * uiScale) + 'px';
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        el.style.display = '';
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
    window.MainGifOverlay = MainGifOverlay;
  }
})();

