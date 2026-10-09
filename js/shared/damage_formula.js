/**
 * 生存武器與召喚 AI 共用：固定值加完後，百分比加算再乘。
 * value = baseFlat * (1 + lvPct + talentPct + attrPct)
 * 不要改成連乘。數字與改前同一組輸入必須相同。
 */
(function (root) {
    'use strict';

    function levelPctFromMul(levelMul) {
        return Math.max(0, (levelMul || 1) - 1);
    }

    function applyAddThenMul(baseFlat, percentParts) {
        var sum = 0;
        var parts = percentParts || [];
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (typeof p === 'number' && isFinite(p)) sum += p;
        }
        return baseFlat * (1 + sum);
    }

    var DamageFormula = {
        levelPctFromMul: levelPctFromMul,
        applyAddThenMul: applyAddThenMul
    };
    root.DamageFormula = DamageFormula;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DamageFormula;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
