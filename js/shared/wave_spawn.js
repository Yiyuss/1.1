/**
 * 單人 wave.js 與組隊 server/game-state.js 共用的出怪數量。
 * 數字與舊兩份公式相同：無第 5 波 LATE，乘 spawnCountMultiplier。
 */
(function (root) {
    'use strict';

    function computeSpawnCount(wave, spawnCountCfg, spawnCountMultiplier) {
        const sc = spawnCountCfg || {};
        const base = sc.INITIAL ?? 3;
        const inc = sc.INCREASE_PER_WAVE ?? 0.9;
        const max = sc.MAXIMUM ?? 12;
        const w = Math.max(1, wave || 1);
        const countBase = Math.min(Math.floor(base + (w - 1) * inc), max);
        const countMult = spawnCountMultiplier || 1;
        return Math.max(1, Math.floor(countBase * countMult));
    }

    const WaveSpawn = { computeSpawnCount: computeSpawnCount };
    root.WaveSpawn = WaveSpawn;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = WaveSpawn;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
