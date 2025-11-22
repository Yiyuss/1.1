// 挑戰模式專用 GIF 覆蓋層（零汙染）：僅在挑戰模式使用
// 提供：ChallengeGifOverlay.showOrUpdate, .showFullscreenCover, .shakeViewport, .flash, .hide, .clearAll
// 注意：不影響全域 GifOverlay；DOM id 前綴使用 challenge 專屬，避免衝突。
(function(){
  const ID_PREFIX = 'challenge-gif-overlay-';
  const _flashTimers = new Map();
  let _styleInjected = false;

  function getViewport(){
    return document.getElementById('viewport');
  }

  function canonicalizeId(id){
    if (id === 'challenge-player') return 'player';
    if (id === 'challenge-boss' || id === 'challenge-boss2' || id === 'challenge-boss3' || id === 'challenge-boss4') return 'boss';
    if (id === 'challenge-phase-banner') return 'phase-banner';
    return id || '';
  }

  function ensureImg(id){
    const vp = getViewport();
    if (!vp) return null;
    const role = canonicalizeId(id);
    const domId = ID_PREFIX + role;
    let el = document.getElementById(domId);
    if (!el) {
      el = document.createElement('img');
      el.id = domId;
      el.style.position = 'absolute';
      // 專屬層級規則（僅挑戰模式）：
      // - boss: 6
      // - player: 預設 3；若 CHALLENGE_PLAYER_ON_TOP 為真則 7
      // - phase-banner: 8（全畫面覆蓋）
      // - 其他：3
      try {
        if (role === 'boss') {
          el.style.zIndex = '6';
        } else if (role === 'player') {
          const onTop = (typeof window !== 'undefined' && window.CHALLENGE_PLAYER_ON_TOP) ? true : false;
          el.style.zIndex = onTop ? '7' : '3';
        } else if (role === 'phase-banner') {
          el.style.zIndex = '8';
        } else {
          el.style.zIndex = '3';
        }
      } catch(_) { el.style.zIndex = '3'; }
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

  const ChallengeGifOverlay = {
    // id 採用挑戰模式簡名：'player' | 'boss' | 'phase-banner' | ...
    showOrUpdate(id, src, centerX, centerY, size){
      try {
        const role = canonicalizeId(id);
        const el = ensureImg(role);
        if (!el) return;
        // 更新層級（允許動態切換 CHALLENGE_PLAYER_ON_TOP）
        try {
          if (role === 'boss') {
            el.style.zIndex = '6';
          } else if (role === 'player') {
            const onTop = (typeof window !== 'undefined' && window.CHALLENGE_PLAYER_ON_TOP) ? true : false;
            el.style.zIndex = onTop ? '7' : '3';
          } else if (role === 'phase-banner') {
            el.style.zIndex = '8';
          }
        } catch(_) {}
        if (src && el.src !== src) el.src = src;
        const uiScale = getUiScale();
        let w, h;
        if (size && typeof size === 'object') {
          w = Math.max(1, Math.floor((size.width || 1) * uiScale));
          h = Math.max(1, Math.floor((size.height || 1) * uiScale));
        } else {
          const s = Math.max(1, Math.floor((Number(size) || 1) * uiScale));
          w = s; h = s;
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
    // 全螢幕覆蓋（挑戰模式 banner）
    // 支援 GIF / PNG / JPG（<img>）與 MP4（<video>），透明度與淡入淡出邏輯與原本一致
    showFullscreenCover(id, src, options){
      try {
        const role = canonicalizeId(id || 'phase-banner');
        const vp = getViewport();
        if (!vp) return;
        const domId = ID_PREFIX + role;
        const isVideo = typeof src === 'string' && src.toLowerCase().endsWith('.mp4');

        let el = document.getElementById(domId);

        // 若型態不符（例如原本是 <img>，現在要顯示 MP4），則移除重建
        if (el && isVideo && el.tagName !== 'VIDEO') {
          try { el.parentNode && el.parentNode.removeChild(el); } catch(_) {}
          el = null;
        } else if (el && !isVideo && el.tagName !== 'IMG') {
          try { el.parentNode && el.parentNode.removeChild(el); } catch(_) {}
          el = null;
        }

        if (!el) {
          el = document.createElement(isVideo ? 'video' : 'img');
          el.id = domId;
          el.style.position = 'absolute';
          el.style.zIndex = '8'; // phase-banner 專用層級
          el.style.pointerEvents = 'none';
          el.style.display = 'none';
          el.style.left = '0px';
          el.style.top = '0px';
          el.style.width = '100%';
          el.style.height = '100%';
          el.style.objectFit = 'cover';
          el.style.objectPosition = 'center center';

          if (isVideo) {
            el.muted = true;
            el.loop = true;
            el.autoplay = true;
            el.playsInline = true;
          } else {
            el.style.imageRendering = 'pixelated';
          }

          vp.appendChild(el);
        }

        if (src) {
          if (isVideo) {
            if (el.src !== src) {
              el.src = src;
              try { el.load(); } catch(_) {}
            }
            try { el.currentTime = 0; } catch(_) {}
            try { el.play().catch(()=>{}); } catch(_) {}
          } else if (el.src !== src) {
            el.src = src;
          }
        }

        const opts = Object.assign({ opacity: 0.5, fadeInMs: 300, holdMs: 3900, fadeOutMs: 300 }, options || {});
        el.style.opacity = '0';
        el.style.transition = `opacity ${Math.max(1, opts.fadeInMs)}ms ease-in-out`;
        el.style.display = '';
        requestAnimationFrame(() => { el.style.opacity = String(opts.opacity); });
        const total = Math.max(0, (opts.fadeInMs + opts.holdMs));
        setTimeout(() => {
          try {
            el.style.transition = `opacity ${Math.max(1, opts.fadeOutMs)}ms ease-in-out`;
            el.style.opacity = '0';
            setTimeout(() => {
              try {
                el.style.display = 'none';
                if (isVideo) {
                  try { el.pause(); } catch(_) {}
                  try { el.currentTime = 0; } catch(_) {}
                }
              } catch(_) {}
            }, Math.max(1, opts.fadeOutMs) + 40);
          } catch(_){ }
        }, total);
      } catch(_) {}
    },
    // 震動效果（挑戰模式）
    shakeViewport(intensityPx, durationMs){
      try {
        const vp = getViewport(); if (!vp) return;
        const intensity = Math.max(1, Number(intensityPx)||14);
        const dur = Math.max(60, Number(durationMs)||600);
        if (!_styleInjected) {
          const style = document.createElement('style');
          style.type = 'text/css';
          style.textContent = `@keyframes challenge-shake {\n  0%{ transform: translate(0,0); }\n  10%{ transform: translate(${intensity}px,-${intensity}px); }\n  20%{ transform: translate(-${intensity}px,${intensity}px); }\n  30%{ transform: translate(${intensity*0.8}px,${intensity*0.6}px); }\n  40%{ transform: translate(-${intensity*0.6}px,-${intensity*0.8}px); }\n  50%{ transform: translate(${intensity*0.5}px,-${intensity*0.5}px); }\n  60%{ transform: translate(-${intensity*0.5}px,${intensity*0.5}px); }\n  70%{ transform: translate(${intensity*0.3}px,${intensity*0.3}px); }\n  80%{ transform: translate(-${intensity*0.3}px,-${intensity*0.3}px); }\n  90%{ transform: translate(${intensity*0.15}px,-${intensity*0.15}px); }\n  100%{ transform: translate(0,0); }\n}`;
          document.head.appendChild(style);
          _styleInjected = true;
        }
        vp.style.animation = `challenge-shake ${dur}ms ease-in-out`;
        setTimeout(() => { try { vp.style.animation = ''; } catch(_){} }, dur + 50);
      } catch(_) {}
    },
    // 紅閃
    flash(id, options){
      try {
        const role = canonicalizeId(id);
        const el = ensureImg(role);
        if (!el) return;
        const domId = ID_PREFIX + role;
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
        const role = canonicalizeId(id);
        const domId = ID_PREFIX + role;
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
    window.ChallengeGifOverlay = ChallengeGifOverlay;
  }
})();
