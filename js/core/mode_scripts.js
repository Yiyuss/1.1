/**
 * 非生存模式腳本延遲載入。生存／組隊開局不 parse 挑戰 BOSS、防禦、主線、冒險、3D。
 * 新模式：在 BUNDLES 加清單，不要把專用腳本塞回 index.html。
 * 冒險引繼碼 UI 仍用 index.html 的 adventure_save_code.js（選單就會按）。
 */
(function (global) {
    'use strict';

    const BUNDLES = {
        survival: [],
        challenge: [
            'js/modes/challenge/gif_overlay.js',
            'js/modes/challenge/ui.js',
            'js/modes/challenge/bullet_system.js',
            'js/modes/challenge/laser_art.js',
            'js/modes/challenge/boss_patterns.js',
            'js/modes/challenge/boss_patterns2.js',
            'js/modes/challenge/boss_patterns3.js',
            'js/modes/challenge/boss_patterns4.js',
            'js/modes/challenge/experience.js',
            'js/modes/challenge/boss.js',
            'js/modes/challenge/boss2.js',
            'js/modes/challenge/boss3.js',
            'js/modes/challenge/boss4.js',
            'js/modes/challenge/index.js'
        ],
        stage: [
            'js/modes/stage/ui.js',
            'js/modes/stage/index.js'
        ],
        defense: [
            'js/modes/defense/td_gif_overlay.js',
            'js/modes/defense/td_config.js',
            'js/modes/defense/td_damage_numbers.js',
            'js/modes/defense/td_map.js',
            'js/modes/defense/td_enemy.js',
            'js/modes/defense/td_tower.js',
            'js/modes/defense/td_player.js',
            'js/modes/defense/td_game.js',
            'js/modes/defense/td_ui_enhanced.js',
            'js/modes/defense/td_dom_ui.js',
            'js/modes/defense/td_settlement.js',
            'js/modes/defense/ui.js',
            'js/modes/defense/index.js'
        ],
        main: [
            'js/modes/main/layer_config.js',
            'js/modes/main/gif_overlay.js',
            'js/modes/main/index.js'
        ],
        adventure: [
            'js/modes/adventure/index.js'
        ],
        '3d': [
            'js/modes/3d/index.js'
        ]
    };

    const loaded = Object.create(null);
    const inflight = Object.create(null);

    function loadOne(src) {
        return new Promise(function (resolve, reject) {
            const existing = document.querySelector('script[data-mode-src="' + src + '"]');
            if (existing) {
                if (existing.getAttribute('data-loaded') === '1') {
                    resolve();
                    return;
                }
                existing.addEventListener('load', function () { resolve(); });
                existing.addEventListener('error', function () { reject(new Error(src)); });
                return;
            }
            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.setAttribute('data-mode-src', src);
            s.onload = function () {
                s.setAttribute('data-loaded', '1');
                resolve();
            };
            s.onerror = function () {
                reject(new Error('ModeScripts load failed: ' + src));
            };
            (document.body || document.head).appendChild(s);
        });
    }

    function ensure(id) {
        if (!id || loaded[id]) return Promise.resolve();
        if (inflight[id]) return inflight[id];
        const list = BUNDLES[id];
        if (!list || list.length === 0) {
            loaded[id] = true;
            return Promise.resolve();
        }
        inflight[id] = (async function () {
            for (let i = 0; i < list.length; i++) {
                await loadOne(list[i]);
            }
            loaded[id] = true;
            delete inflight[id];
        })();
        return inflight[id];
    }

    global.ModeScripts = { ensure: ensure, BUNDLES: BUNDLES };
})(typeof window !== 'undefined' ? window : globalThis);
