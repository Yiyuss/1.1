/**
 * 挑戰／闖關／防禦 HUD 與 ESC 選單。id／文案／只有挑戰有操作提示 凍結。
 * 各模式 ui.js 邏輯仍分開（已分叉）。
 */
(function (root) {
    'use strict';

    function el(tag, attrs, kids) {
        var n = document.createElement(tag);
        if (attrs) {
            if (attrs.id) n.id = attrs.id;
            if (attrs.className) n.className = attrs.className;
            if (attrs.style) n.setAttribute('style', attrs.style);
            if (attrs.src) n.setAttribute('src', attrs.src);
            if (attrs.alt) n.setAttribute('alt', attrs.alt);
            if (attrs.htmlFor) n.setAttribute('for', attrs.htmlFor);
            if (attrs.type) n.setAttribute('type', attrs.type);
            if (attrs.min != null) n.setAttribute('min', attrs.min);
            if (attrs.max != null) n.setAttribute('max', attrs.max);
            if (attrs.step != null) n.setAttribute('step', attrs.step);
            if (attrs.value != null) n.setAttribute('value', attrs.value);
            if (attrs.text != null) n.textContent = attrs.text;
        }
        if (kids) {
            for (var i = 0; i < kids.length; i++) {
                if (kids[i]) n.appendChild(kids[i]);
            }
        }
        return n;
    }

    function barRow(prefix, kind, label, color) {
        return el('div', { className: 'cbar-row' }, [
            el('span', { className: 'cbar-label', text: label }),
            el('div', { id: prefix + '-' + kind + '-bar', className: 'cbar' }, [
                el('div', { id: prefix + '-' + kind + '-fill', className: 'cbar-fill', style: 'background:' + color + ';' })
            ]),
            el('span', { id: prefix + '-' + kind + '-text', className: 'cbar-text', text: '0/0' })
        ]);
    }

    function buildHud(slot) {
        var p = slot.prefix;
        var leftKids = [
            el('img', {
                id: p + '-avatar',
                alt: 'avatar',
                style: 'width:80px; height:auto; aspect-ratio:452/480; object-fit:contain; image-rendering:pixelated; border:2px solid #fff; border-radius:6px;'
            }),
            el('div', { style: 'display:flex; flex-direction:column; gap:6px;' }, [
                barRow(p, 'health', '生命', '#ff4d4f'),
                barRow(p, 'exp', '經驗', '#52c41a'),
                barRow(p, 'energy', '能量', '#40a9ff')
            ])
        ];
        var kids = [
            el('div', {
                id: p + '-left',
                style: 'position:absolute; top:10px; left:10px; display:flex; gap:10px; align-items:flex-start;'
            }, leftKids),
            el('div', {
                id: p + '-right',
                style: 'position:absolute; top:10px; right:10px; display:flex; flex-direction:column; gap:10px; align-items:flex-end;'
            }, [
                el('div', {
                    id: p + '-timer',
                    style: 'font-size:1.4rem; font-weight:bold; color:#fff; text-shadow:0 0 6px rgba(0,0,0,0.6);',
                    text: '00:00'
                }),
                el('div', {
                    id: p + '-coins',
                    style: 'display:flex; align-items:center; gap:6px; color:#ffd700; font-weight:bold; text-shadow:0 0 5px rgba(255,215,0,0.6);'
                }, [
                    el('img', {
                        id: p + '-coins-icon',
                        src: 'assets/images/money.png',
                        alt: '金幣',
                        style: 'width:24px; height:24px;'
                    }),
                    el('span', { id: p + '-coins-text', text: '0' })
                ])
            ])
        ];
        if (slot.legend) {
            kids.push(el('div', {
                id: p + '-legend',
                style: 'position:absolute; right:12px; bottom:12px; color:#ffffff; font-size:1.0rem; font-weight:600; text-shadow:0 0 6px rgba(0,0,0,0.6); pointer-events:none;',
                text: slot.legend
            }));
        }
        return el('div', {
            id: p + '-ui',
            style: 'display:none; position:absolute; top:0; left:0; width:100%; height:100%; z-index:3; pointer-events:none;'
        }, kids);
    }

    function volumeRow(prefix, kind, label, value) {
        var id = prefix + '-' + kind + '-volume';
        return el('div', { className: 'volume-row' }, [
            el('label', { htmlFor: id, text: label }),
            el('input', { id: id, type: 'range', min: '0', max: '1', step: '0.01', value: value }),
            el('span', { id: id + '-text', text: kind === 'music' ? '50%' : '70%' })
        ]);
    }

    function buildMenu(slot) {
        var p = slot.prefix;
        return el('div', { id: p + '-menu', className: 'hidden' }, [
            el('div', { className: 'skills-title', text: '技能與音量' }),
            el('div', { className: 'skills-hint', text: '按 ESC 關閉' }),
            el('div', { className: 'skills-volume' }, [
                volumeRow(p, 'music', '音樂', '0.5'),
                volumeRow(p, 'sound', '音效', '0.7')
            ]),
            el('div', { className: 'talents-section' }, [
                el('h3', { className: 'talents-title', text: '目前天賦' }),
                el('ul', { id: p + '-talents-list', className: 'talents-list', style: 'list-style:none; padding:0; margin:0;' })
            ])
        ]);
    }

    function renderModeHuds() {
        var host = document.getElementById('mode-hud-host');
        if (!host || host.getAttribute('data-rendered') === '1') return;
        var slots = (typeof CONFIG !== 'undefined' && CONFIG.MODE_HUD_SLOTS) ? CONFIG.MODE_HUD_SLOTS : [];
        host.innerHTML = '';
        for (var i = 0; i < slots.length; i++) {
            if (!slots[i] || !slots[i].prefix) continue;
            host.appendChild(buildHud(slots[i]));
            host.appendChild(buildMenu(slots[i]));
        }
        host.setAttribute('data-rendered', '1');
    }

    var ModeHud = { renderModeHuds: renderModeHuds };
    root.ModeHud = ModeHud;
    if (typeof document !== 'undefined' && document.getElementById('mode-hud-host')) {
        renderModeHuds();
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
