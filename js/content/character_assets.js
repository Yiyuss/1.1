/**
 * 可玩角色圖鍵（生存 Game.images 與防禦 getManifest 同一套）。
 * 來源：CONFIG.CHARACTERS 的 sprite／avatar／hud／levelUp／faceRight；大招 IMAGE_KEY；歷史選角 -3。
 * 不要在防禦手寫 player1–9。畫法／朝向 if 仍在各模式，這份只負責「要載哪些檔」。
 */
(function (root) {
    'use strict';

    var GIF_KEYS = { player: true, player3: true, player6: true, playerN2: true };
    // 選角 -3 除瑪格麗特外曾進生存預載。Canvas 不用；卡片走 <img src>。凍結以免少載。
    var SURVIVAL_SELECT_THUMB_KEYS = ['player2-3', 'player3-3', 'player4-3', 'player5-3', 'player6-3', 'player7-3', 'player8-3', 'player9-3'];

    function guessSrc(key) {
        if (GIF_KEYS[key]) return 'assets/images/' + key + '.gif';
        return 'assets/images/' + key + '.png';
    }

    function srcForKey(key, opts) {
        if (!(opts && opts.forceGuess)) {
            try {
                if (typeof ResourceLoader !== 'undefined' && ResourceLoader.getImageList) {
                    var list = ResourceLoader.getImageList();
                    for (var i = 0; i < list.length; i++) {
                        if (list[i] && list[i].name === key) return list[i].src;
                    }
                }
            } catch (_) {}
        }
        return guessSrc(key);
    }

    function pushKey(seen, out, key, opts) {
        if (!key || seen[key]) return;
        seen[key] = true;
        out.push({ key: key, src: srcForKey(key, opts) });
    }

    function collectPlayableImageEntries(opts) {
        var seen = {};
        var out = [];
        var chars = (typeof CONFIG !== 'undefined' && CONFIG.CHARACTERS) ? CONFIG.CHARACTERS : [];
        var fields = ['spriteImageKey', 'avatarImageKey', 'hudImageKey', 'levelUpBgKey', 'faceRightImageKey'];
        for (var c = 0; c < chars.length; c++) {
            var ch = chars[c] || {};
            for (var f = 0; f < fields.length; f++) {
                pushKey(seen, out, ch[fields[f]], opts);
            }
        }
        var alias = (opts && opts.alias) ? opts.alias : {};
        var names = Object.keys(alias);
        for (var a = 0; a < names.length; a++) {
            var aliasKey = names[a];
            var srcKey = alias[aliasKey];
            if (!aliasKey || seen[aliasKey]) continue;
            seen[aliasKey] = true;
            out.push({ key: aliasKey, src: srcForKey(srcKey, opts) });
        }
        return out;
    }

    function collectUltimateImageEntries(opts) {
        var seen = {};
        var out = [];
        var cfg = (typeof CONFIG !== 'undefined') ? CONFIG : {};
        if (cfg.ULTIMATE && cfg.ULTIMATE.IMAGE_KEY) {
            pushKey(seen, out, cfg.ULTIMATE.IMAGE_KEY, opts);
        }
        var table = cfg.CHARACTER_ULTIMATES || {};
        var ids = Object.keys(table);
        for (var i = 0; i < ids.length; i++) {
            var row = table[ids[i]];
            if (row && row.IMAGE_KEY) pushKey(seen, out, row.IMAGE_KEY, opts);
        }
        return out;
    }

    // 給 getImageList。forceGuess 避免跟 ResourceLoader 互相呼叫。
    function collectSurvivalPreloadCharacterEntries() {
        var opts = { forceGuess: true };
        var seen = {};
        var out = [];
        function addFrom(list) {
            for (var i = 0; i < list.length; i++) {
                var it = list[i];
                if (!it || !it.key || seen[it.key]) continue;
                seen[it.key] = true;
                out.push({ name: it.key, src: it.src });
            }
        }
        addFrom(collectPlayableImageEntries(opts));
        addFrom(collectUltimateImageEntries(opts));
        for (var t = 0; t < SURVIVAL_SELECT_THUMB_KEYS.length; t++) {
            var k = SURVIVAL_SELECT_THUMB_KEYS[t];
            if (!k || seen[k]) continue;
            seen[k] = true;
            out.push({ name: k, src: guessSrc(k) });
        }
        return out;
    }

    var CharacterAssets = {
        collectPlayableImageEntries: collectPlayableImageEntries,
        collectUltimateImageEntries: collectUltimateImageEntries,
        collectSurvivalPreloadCharacterEntries: collectSurvivalPreloadCharacterEntries,
        SURVIVAL_SELECT_THUMB_KEYS: SURVIVAL_SELECT_THUMB_KEYS,
        srcForKey: srcForKey
    };
    root.CharacterAssets = CharacterAssets;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CharacterAssets;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
