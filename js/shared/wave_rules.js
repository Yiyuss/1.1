/**
 * 單人 wave.js 與組隊 server 共用的波次規則。
 * 只含：換波時間、出怪間隔、可出種類、地圖換皮、首領種類與小首領數量。
 * 出生座標、音效、彈幕不在這裡。
 */
(function (root) {
    'use strict';

    var REMAP = {
        forest: { ZOMBIE: 'ZOMBIE2', SKELETON: 'SKELETON2', GHOST: 'GHOST2' },
        desert: { ZOMBIE: 'ZOMBIE3', SKELETON: 'SKELETON3', GHOST: 'GHOST3' },
        garden: { ZOMBIE: 'ELF', SKELETON: 'ELF2', GHOST: 'ELF3' },
        intersection: { ZOMBIE: 'HUMAN1', SKELETON: 'HUMAN2', GHOST: 'HUMAN3' },
        branch: { ZOMBIE: 'UNKNOWN1', SKELETON: 'UNKNOWN2', GHOST: 'UNKNOWN3' }
    };

    var DOUBLE_MINI = {
        forest: true,
        desert: true,
        garden: true,
        intersection: true,
        branch: true
    };

    var NOT_SMALL = /^(MINI_BOSS|ELF_MINI_BOSS|HUMAN_MINI_BOSS|UNKNOWN_MINI_BOSS|BOSS|ELF_BOSS|HUMAN_BOSS|UNKNOWN_BOSS)$/;

    function waveDurationMs(wavesCfg) {
        return (wavesCfg && typeof wavesCfg.DURATION === 'number') ? wavesCfg.DURATION : 60000;
    }

    function bossWaveNumber(wavesCfg) {
        return (wavesCfg && typeof wavesCfg.BOSS_WAVE === 'number') ? wavesCfg.BOSS_WAVE : 20;
    }

    function computeSpawnInterval(wave, rateCfg, spawnIntervalMultiplier) {
        var cfg = rateCfg || {};
        var initial = typeof cfg.INITIAL === 'number' ? cfg.INITIAL : 2000;
        var dec = typeof cfg.DECREASE_PER_WAVE === 'number' ? cfg.DECREASE_PER_WAVE : 100;
        var min = typeof cfg.MINIMUM === 'number' ? cfg.MINIMUM : 300;
        var w = Math.max(1, wave || 1);
        var mult = spawnIntervalMultiplier || 1;
        return Math.max(min, (initial - (w - 1) * dec) * mult);
    }

    function availableEnemyTypes(entries, wave) {
        return (entries || []).filter(function (entry) {
            return entry && entry.WAVE <= wave;
        }).map(function (entry) {
            return entry.TYPE;
        }).filter(Boolean);
    }

    function remapEnemyType(mapId, enemyType) {
        var table = REMAP[mapId];
        if (!table || !enemyType) return enemyType;
        return table[enemyType] || enemyType;
    }

    function bossTypeForMap(mapId) {
        if (mapId === 'garden') return 'ELF_BOSS';
        if (mapId === 'intersection') return 'HUMAN_BOSS';
        if (mapId === 'branch') return 'UNKNOWN_BOSS';
        return 'BOSS';
    }

    function miniBossTypeForMap(mapId) {
        if (mapId === 'garden') return 'ELF_MINI_BOSS';
        if (mapId === 'intersection') return 'HUMAN_MINI_BOSS';
        if (mapId === 'branch') return 'UNKNOWN_MINI_BOSS';
        return 'MINI_BOSS';
    }

    function miniBossCountForMap(mapId) {
        return DOUBLE_MINI[mapId] ? 2 : 1;
    }

    function isSmallEnemyType(type) {
        return !NOT_SMALL.test(type || '');
    }

    var WaveRules = {
        waveDurationMs: waveDurationMs,
        bossWaveNumber: bossWaveNumber,
        computeSpawnInterval: computeSpawnInterval,
        availableEnemyTypes: availableEnemyTypes,
        remapEnemyType: remapEnemyType,
        bossTypeForMap: bossTypeForMap,
        miniBossTypeForMap: miniBossTypeForMap,
        miniBossCountForMap: miniBossCountForMap,
        isSmallEnemyType: isSmallEnemyType
    };
    root.WaveRules = WaveRules;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = WaveRules;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
