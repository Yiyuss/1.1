(function() {
    // 合併新配置到全域 CONFIG（避免與舊版 config.js 衝突）
    var g = typeof CONFIG_GAME !== 'undefined' ? CONFIG_GAME : null;
    var p = typeof CONFIG_PLAYER !== 'undefined' ? CONFIG_PLAYER : null;
    var w = typeof CONFIG_WEAPONS !== 'undefined' ? CONFIG_WEAPONS : null;
    var e = typeof CONFIG_ENEMIES !== 'undefined' ? CONFIG_ENEMIES : null;

    // 若舊版 CONFIG 尚未建立，先建立空殼（不使用 const，避免重複宣告）
    if (typeof window.CONFIG === 'undefined') {
        window.CONFIG = {};
    }

    // 僅在不存在時填入，保留舊版 config.js 的完整鍵
    if (g) {
        if (typeof window.CONFIG.CANVAS_WIDTH === 'undefined') window.CONFIG.CANVAS_WIDTH = g.CANVAS_WIDTH;
        if (typeof window.CONFIG.CANVAS_HEIGHT === 'undefined') window.CONFIG.CANVAS_HEIGHT = g.CANVAS_HEIGHT;
        if (typeof window.CONFIG.WORLD === 'undefined') window.CONFIG.WORLD = g.WORLD;
        if (typeof window.CONFIG.DIFFICULTY === 'undefined' && typeof g.DIFFICULTY !== 'undefined') {
            window.CONFIG.DIFFICULTY = g.DIFFICULTY;
        }
        // 注意：舊版使用 CONFIG.WAVES，保留由舊版 config.js 提供的內容
        if (typeof window.CONFIG.WAVE === 'undefined' && typeof g.WAVE !== 'undefined') {
            window.CONFIG.WAVE = g.WAVE;
        }
        if (typeof window.CONFIG.TIME === 'undefined' && typeof g.TIME !== 'undefined') {
            window.CONFIG.TIME = g.TIME;
        }
    }

    if (p && typeof window.CONFIG.PLAYER === 'undefined') {
        window.CONFIG.PLAYER = p;
        if (typeof window.CONFIG.EXPERIENCE === 'undefined' && typeof p.EXPERIENCE !== 'undefined') {
            window.CONFIG.EXPERIENCE = p.EXPERIENCE;
        }
        if (typeof window.CONFIG.ENERGY === 'undefined' && typeof p.ENERGY !== 'undefined') {
            window.CONFIG.ENERGY = p.ENERGY;
        }
    }
    if (w && typeof window.CONFIG.WEAPONS === 'undefined') {
        window.CONFIG.WEAPONS = w;
    }
    if (e && typeof window.CONFIG.ENEMIES === 'undefined') {
        window.CONFIG.ENEMIES = e;
    }
})();