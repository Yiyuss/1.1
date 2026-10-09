/**
 * 生存地圖 id 與預載底圖。正本：MAP_SELECT_GRIDS['grid-survival']（略過 disabled）。
 * 挑戰／防禦／主線底圖仍走該模式 getManifest。鎖定卡 background3 走 <img src>。
 */
(function (root) {
    'use strict';

    var SURVIVAL_MAP_IDS_FALLBACK = ['city', 'forest', 'desert', 'garden', 'intersection', 'branch'];

    function collectSurvivalMapIds() {
        var slots = (typeof CONFIG !== 'undefined' && CONFIG.MAP_SELECT_GRIDS && CONFIG.MAP_SELECT_GRIDS['grid-survival'])
            ? CONFIG.MAP_SELECT_GRIDS['grid-survival']
            : null;
        var out = [];
        if (slots && slots.length) {
            for (var i = 0; i < slots.length; i++) {
                if (slots[i] && slots[i].id && !slots[i].disabled) out.push(slots[i].id);
            }
            if (out.length) return out;
        }
        return SURVIVAL_MAP_IDS_FALLBACK.slice();
    }

    function collectSurvivalBackgroundEntries() {
        var maps = (typeof CONFIG !== 'undefined' && CONFIG.MAPS) ? CONFIG.MAPS : [];
        var byId = {};
        for (var i = 0; i < maps.length; i++) {
            if (maps[i] && maps[i].id) byId[maps[i].id] = maps[i];
        }
        var ids = collectSurvivalMapIds();
        var seen = {};
        var out = [];
        for (var j = 0; j < ids.length; j++) {
            var m = byId[ids[j]];
            if (!m || !m.backgroundKey || seen[m.backgroundKey]) continue;
            seen[m.backgroundKey] = true;
            out.push({
                name: m.backgroundKey,
                src: m.selectCardSrc || ('assets/images/' + m.backgroundKey + '.png')
            });
        }
        return out;
    }

    var MapAssets = {
        collectSurvivalMapIds: collectSurvivalMapIds,
        collectSurvivalBackgroundEntries: collectSurvivalBackgroundEntries
    };
    root.MapAssets = MapAssets;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MapAssets;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
