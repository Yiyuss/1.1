/**
 * 生存／防禦結算列與影片殼。標題、標籤、value id、影片 id／路徑凍結。生存與防禦不合一。
 */
(function (root) {
    'use strict';

    function el(tag, attrs, kids) {
        var n = document.createElement(tag);
        if (attrs) {
            if (attrs.id) n.id = attrs.id;
            if (attrs.className) n.className = attrs.className;
            if (attrs.style) n.setAttribute('style', attrs.style);
            if (attrs.text != null) n.textContent = attrs.text;
            if (attrs.ariaLive) n.setAttribute('aria-live', attrs.ariaLive);
        }
        if (kids) {
            for (var i = 0; i < kids.length; i++) {
                if (kids[i]) n.appendChild(kids[i]);
            }
        }
        return n;
    }

    function buildBox(slot) {
        var rows = slot.rows || [];
        var statsKids = [];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (!r || !r.id) continue;
            statsKids.push(el('div', { className: 'summary-stat' }, [
                el('span', { className: 'stat-label', text: r.label || '' }),
                el('span', { className: 'stat-value', id: r.id, text: r.initial != null ? String(r.initial) : '' })
            ]));
        }
        var innerKids = [
            el('h2', { text: slot.title || '' }),
            el('div', { className: 'summary-stats' }, statsKids)
        ];
        if (slot.achievementsId) {
            innerKids.push(el('div', {
                id: slot.achievementsId,
                className: 'summary-achievements',
                ariaLive: 'polite',
                style: 'margin-top:12px;'
            }));
        }
        var boxAttrs = { className: slot.boxClass || 'game-over-summary' };
        if (slot.boxId) boxAttrs.id = slot.boxId;
        return el('div', boxAttrs, [
            el('div', { className: slot.innerClass || 'game-over-summary-content' }, innerKids)
        ]);
    }

    function ensureSummaryScreen(slot) {
        var screen = document.getElementById(slot.screenId);
        if (screen) return screen;
        var host = document.getElementById('summary-screen-host');
        if (!host || !slot.videoId || !slot.videoSrc) return null;
        if (host.getAttribute('data-host-styled') !== '1') {
            host.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;');
            host.setAttribute('data-host-styled', '1');
        }
        screen = el('div', { id: slot.screenId, className: 'screen hidden' });
        screen.style.pointerEvents = 'auto';
        var video = document.createElement('video');
        video.id = slot.videoId;
        video.setAttribute('src', slot.videoSrc);
        video.setAttribute('preload', 'auto');
        video.setAttribute('playsinline', '');
        screen.appendChild(video);
        host.appendChild(screen);
        return screen;
    }

    function renderSummaryPanels() {
        var slots = (typeof CONFIG !== 'undefined' && CONFIG.SUMMARY_PANELS) ? CONFIG.SUMMARY_PANELS : [];
        for (var i = 0; i < slots.length; i++) {
            var slot = slots[i];
            if (!slot || !slot.screenId) continue;
            var screen = ensureSummaryScreen(slot);
            if (!screen || screen.getAttribute('data-summary-rendered') === '1') continue;
            var ch = screen.firstChild;
            while (ch) {
                var next = ch.nextSibling;
                if (!(ch.nodeType === 1 && String(ch.tagName).toLowerCase() === 'video')) {
                    screen.removeChild(ch);
                }
                ch = next;
            }
            screen.appendChild(buildBox(slot));
            screen.setAttribute('data-summary-rendered', '1');
        }
    }

    var SummaryPanels = { renderSummaryPanels: renderSummaryPanels };
    root.SummaryPanels = SummaryPanels;
    if (typeof document !== 'undefined' && document.getElementById('summary-screen-host')) {
        renderSummaryPanels();
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
