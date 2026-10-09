/**
 * 生存命中：浮動 ±10%，爆擊率 10%（可加成或覆蓋），爆擊倍數 1.75（可加成）。
 * 百分比乘完後只四捨五入一次。單人 DamageSystem 與組隊伺服器同一份。
 * 吸血、武器加算再乘不在這裡。
 */
(function (root) {
    'use strict';

    function computeHitRoll(baseDamage, options, rng) {
        var random = typeof rng === 'function' ? rng : Math.random;
        var allowCrit = !(options && options.allowCrit === false);
        var f = 0.10;
        var rand = 1 + (random() * 2 * f - f);
        var final = baseDamage * rand;
        var bonusCrit = options && typeof options.critChanceBonusPct === 'number' ? options.critChanceBonusPct : 0;
        var overrideCrit = options && typeof options.critChancePctOverride === 'number' ? options.critChancePctOverride : null;
        var critChance = overrideCrit != null ? overrideCrit : (0.10 + bonusCrit);
        var critMultiplierBonus = options && typeof options.critMultiplierBonusPct === 'number' ? options.critMultiplierBonusPct : 0;
        var effectiveCritMultiplier = 1.75 + critMultiplierBonus;
        var isCrit = false;
        if (allowCrit && random() < Math.max(0, Math.min(1, critChance))) {
            isCrit = true;
            final *= Math.max(1.0, effectiveCritMultiplier);
        }
        var amount = Math.max(1, Math.round(final));
        return { amount: amount, isCrit: isCrit };
    }

    var HitRoll = { computeHitRoll: computeHitRoll };
    root.HitRoll = HitRoll;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = HitRoll;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
