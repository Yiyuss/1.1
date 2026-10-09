/**
 * 生存繪製圖層：這些武器先跳過、等敵人畫完再畫，才不會沉到怪下面。
 * 加新技能若要在怪上方，這裡加一次即可（不要再抄 game.js 兩段 or）。
 * 名單與改前兩段白名單相同。不要改 isPersistentEffect（那兩份已經分叉）。
 */
(function (root) {
    'use strict';

    var ABOVE_ENEMIES = {
        CHAIN_LIGHTNING: true,
        FRENZY_LIGHTNING: true,
        SLASH: true,
        YOUNG_DADA_GLORY: true,
        FRENZY_YOUNG_DADA_GLORY: true,
        DEATHLINE_WARRIOR: true,
        DEATHLINE_SUPERMAN: true,
        JUDGMENT: true,
        DIVINE_JUDGMENT: true,
        STARFALL: true,
        STARFALL_MOON: true,
        INTERSECTION_CAR: true,
        FBI: true,
        WHITE_NIGHT_BEAM: true,
        WHITE_RAINBOW_BEAM: true,
        BLACK_HOLE_PARTICLE: true,
        GRAVITY_COLLAPSE: true
    };

    function isAboveEnemies(type) {
        return !!(type && ABOVE_ENEMIES[type]);
    }

    var DrawLayers = {
        ABOVE_ENEMIES: ABOVE_ENEMIES,
        isAboveEnemies: isAboveEnemies
    };
    root.DrawLayers = DrawLayers;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DrawLayers;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
