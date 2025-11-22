// 防禦模式專用 GIF 疊加層
// 說明：
// - 不直接使用全域 GifOverlay，而是建立自己的 <img>，z-index 設在 HUD / 介面之下
// - 目標：塔的 GIF 永遠顯示，但位於防禦資訊介面、HUD、蓋塔介面「後方」
// - 不讀寫任何存檔或 SaveCode/localStorage 鍵名，純視覺效果
(function () {
    const ID_PREFIX = 'defense-gif-overlay-';

    function getViewport() {
        return document.getElementById('viewport');
    }

    function ensureImg(id) {
        const vp = getViewport();
        if (!vp) return null;
        const domId = ID_PREFIX + id;
        let el = document.getElementById(domId);
        if (!el) {
            el = document.createElement('img');
            el.id = domId;
            el.style.position = 'absolute';
            // 比 Canvas 高一層，但低於 #game-ui / 其他 HUD （那些通常 z-index >= 2）
            el.style.zIndex = '1';
            el.style.pointerEvents = 'none';
            el.style.imageRendering = 'pixelated';
            el.style.display = 'none';
            vp.appendChild(el);
        }
        return el;
    }

    function getUiScale() {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale');
            const s = parseFloat(v);
            if (!isNaN(s) && s > 0) return s;
        } catch (_) { }
        try {
            const vp = getViewport();
            if (!vp) return 1.0;
            const targetW = (window.CONFIG && window.CONFIG.CANVAS_WIDTH) ? window.CONFIG.CANVAS_WIDTH : vp.offsetWidth;
            const s = vp.offsetWidth / targetW;
            return (s > 0) ? s : 1.0;
        } catch (_) { }
        return 1.0;
    }

    const TDGifOverlay = {
        /**
         * 在畫面上顯示或更新一個 GIF
         * @param {string} id - 唯一ID
         * @param {string} src - 圖片路徑，例如 'assets/images/ICE.gif'
         * @param {number} screenX - 螢幕座標X（已扣除相機偏移後的座標）
         * @param {number} screenY - 螢幕座標Y（已扣除相機偏移後的座標）
         * @param {{width:number,height:number}|number} size - 顯示大小
         */
        showOrUpdate(id, src, screenX, screenY, size) {
            try {
                const vp = getViewport();
                if (!vp) return;
                const el = ensureImg(String(id || ''));
                if (!el) return;
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
                el.style.left = (Math.floor(screenX * uiScale) - halfW) + 'px';
                el.style.top = (Math.floor(screenY * uiScale) - halfH) + 'px';
                el.style.width = w + 'px';
                el.style.height = h + 'px';
                el.style.display = '';
            } catch (_) { }
        },

        hide(id) {
            try {
                const domId = ID_PREFIX + String(id || '');
                const el = document.getElementById(domId);
                if (el) el.style.display = 'none';
            } catch (_) { }
        },

        clearAll() {
            try {
                const vp = getViewport();
                if (!vp) return;
                const nodes = Array.from(vp.querySelectorAll('[id^="' + ID_PREFIX + '"]'));
                for (const n of nodes) {
                    try { vp.removeChild(n); } catch (_) { }
                }
            } catch (_) { }
        }
    };

    if (typeof window !== 'undefined') {
        window.TDGifOverlay = TDGifOverlay;
    }
})();
