/**
 * 生存升級所需經驗。單人 Player 與組隊伺服器同一份。
 * 1～20 級：80 * 1.12^(等級-1)。20 級之後改 1.07 倍再加每級 30。
 * 挑戰模式的經驗不走這裡。
 */
(function (root) {
    'use strict';

    function computeToNextLevel(level, experienceCfg) {
        var cfg = experienceCfg || null;
        var base = cfg ? (cfg.LEVEL_UP_BASE || 80) : 80;
        var mult = cfg ? (cfg.LEVEL_UP_MULTIPLIER || 1.12) : 1.12;
        var softcap = cfg ? (cfg.SOFTCAP_LEVEL || 20) : 20;
        var lateMult = cfg ? (cfg.LEVEL_UP_MULTIPLIER_LATE || 1.07) : 1.07;
        var lateLinear = cfg ? (cfg.LEVEL_UP_LINEAR_LATE || 30) : 30;
        var lv = Math.max(1, Math.floor(level || 1));
        if (lv <= softcap) {
            return Math.floor(base * Math.pow(mult, lv - 1));
        }
        var xpAtSoftcap = Math.floor(base * Math.pow(mult, softcap - 1));
        var n = lv - softcap;
        var value = xpAtSoftcap * Math.pow(lateMult, n) + lateLinear * n;
        return Math.max(1, Math.floor(value));
    }

    var ExperienceCurve = { computeToNextLevel: computeToNextLevel };
    root.ExperienceCurve = ExperienceCurve;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ExperienceCurve;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
