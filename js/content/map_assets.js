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

    // 一邊超過 1920 像素算大地圖（現有是花園、路口、支部）。看實際像素，不看地圖 id。
    function survivalMapRecords() {
        var maps = (typeof CONFIG !== 'undefined' && CONFIG.MAPS) ? CONFIG.MAPS : [];
        var byId = {};
        for (var i = 0; i < maps.length; i++) {
            if (maps[i] && maps[i].id) byId[maps[i].id] = maps[i];
        }
        var ids = collectSurvivalMapIds();
        var out = [];
        for (var j = 0; j < ids.length; j++) {
            var m = byId[ids[j]];
            if (!m || !m.backgroundKey) continue;
            out.push({
                id: m.id,
                key: m.backgroundKey,
                src: m.selectCardSrc || ('assets/images/' + m.backgroundKey + '.png')
            });
        }
        return out;
    }

    function bitmapOf(rec) {
        var loaded = (typeof Game !== 'undefined' && Game.images) ? Game.images[rec.key] : null;
        if (imageReady(loaded)) return loaded;
        var card = cardImg(rec.id);
        if (imageReady(card)) return card;
        return null;
    }

    function isLargeBitmap(img) {
        return imageReady(img) && (img.naturalWidth > 1920 || img.naturalHeight > 1200);
    }

    function largeSurvivalMaps() {
        var recs = survivalMapRecords();
        var out = [];
        for (var i = 0; i < recs.length; i++) {
            var card = cardImg(recs[i].id);
            if (isLargeBitmap(bitmapOf(recs[i])) || (card && card.getAttribute('data-full-src'))) out.push(recs[i]);
        }
        return out;
    }

    function cardImg(mapId) {
        if (typeof document === 'undefined') return null;
        return document.querySelector('#grid-survival button[data-map-id="' + mapId + '"] img');
    }

    function imageReady(img) {
        return !!(img && img.complete && img.naturalWidth > 0);
    }

    function dropBitmap(img, keep) {
        if (!img || img === keep) return;
        try { img.removeAttribute('src'); } catch (e) { }
        try { img.src = ''; } catch (e2) { }
    }

    function retainOnlyPlayingBackground(activeMapId) {
        if (typeof Game === 'undefined' || !Game.images) return;
        var list = largeSurvivalMaps();
        var active = null;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === activeMapId) active = list[i];
        }
        var keep = null;
        if (active) {
            var loaded = Game.images[active.key];
            var card = cardImg(active.id);
            if (!imageReady(loaded) && imageReady(card)) Game.images[active.key] = card;
            keep = Game.images[active.key];
            if (!imageReady(keep)) return;
        }
        for (var k = 0; k < list.length; k++) {
            var item = list[k];
            var cardEl = cardImg(item.id);
            if (active && item.id === active.id) {
                if (keep && cardEl && cardEl !== keep) {
                    cardEl.setAttribute('data-full-src', item.src);
                    dropBitmap(cardEl, keep);
                }
                continue;
            }
            if (cardEl && cardEl !== keep) cardEl.setAttribute('data-full-src', item.src);
            dropBitmap(cardEl, keep);
            var extra = Game.images[item.key];
            if (extra && extra !== keep) {
                dropBitmap(extra, keep);
                delete Game.images[item.key];
            }
        }
    }

    function restoreLargeMapCards() {
        var list = largeSurvivalMaps();
        var pending = [];
        for (var i = 0; i < list.length; i++) {
            var card = cardImg(list[i].id);
            if (!card) continue;
            if (!card.getAttribute('src')) card.src = card.getAttribute('data-full-src') || list[i].src;
            if (!imageReady(card)) {
                pending.push(new Promise(function (resolve) {
                    var done = function () { resolve(); };
                    if (imageReady(card)) { done(); return; }
                    card.addEventListener('load', done, { once: true });
                    card.addEventListener('error', done, { once: true });
                    if (imageReady(card)) done();
                }));
            }
        }
        return pending;
    }

    var MapAssets = {
        collectSurvivalMapIds: collectSurvivalMapIds,
        collectSurvivalBackgroundEntries: collectSurvivalBackgroundEntries,
        retainOnlyPlayingBackground: retainOnlyPlayingBackground,
        restoreLargeMapCards: restoreLargeMapCards
    };
    root.MapAssets = MapAssets;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MapAssets;
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
