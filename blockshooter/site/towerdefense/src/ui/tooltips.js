// Floating tooltips + toasts. Browser-only.
//
// A single reused tooltip div lives in #tooltip-root; attach() wires hover
// listeners onto any element and re-evaluates its content each time it shows
// (so a function payload can report live prices/cooldowns). Toasts are cheap
// throwaway elements in #toast-root that self-retire on the base.css animation.

import { bus } from '../core/events.js';

const STAGE_W = 1280;
const STAGE_H = 720;
const SHOW_DELAY = 120;   // ms hover dwell before the tooltip appears

let _tipEl = null;
let _showTimer = 0;
let _activeEl = null;     // element the pending/visible tooltip belongs to

function _tooltipRoot() {
    return (typeof document !== 'undefined' && document.getElementById('tooltip-root')) ||
        (typeof document !== 'undefined' ? document.body : null);
}

function _toastRoot() {
    return (typeof document !== 'undefined' && document.getElementById('toast-root')) ||
        (typeof document !== 'undefined' ? document.body : null);
}

function _ensureTip() {
    if (_tipEl) return _tipEl;
    const root = _tooltipRoot();
    if (!root) return null;
    _tipEl = document.createElement('div');
    _tipEl.className = 'tooltip';
    _tipEl.style.display = 'none';
    root.appendChild(_tipEl);
    return _tipEl;
}

function _clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// Convert an element's on-screen rect into the stage's unscaled 1280x720 space,
// which is the coordinate system #tooltip-root children are laid out in (the
// stage's CSS transform scales both the element and the tooltip together).
function _stageRect(el) {
    const stage = document.getElementById('game-stage');
    const er = el.getBoundingClientRect();
    if (!stage) return { x: er.left, y: er.top, w: er.width, h: er.height };
    const sr = stage.getBoundingClientRect();
    const scale = sr.width / STAGE_W || 1;
    return {
        x: (er.left - sr.left) / scale,
        y: (er.top - sr.top) / scale,
        w: er.width / scale,
        h: er.height / scale,
    };
}

function _position(el) {
    const tip = _tipEl;
    if (!tip) return;
    const r = _stageRect(el);
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;

    // Prefer above the element; drop below if it would clip the top edge.
    let ty = r.y - th - 8;
    if (ty < 4) ty = r.y + r.h + 8;
    // Horizontally centre on the element, then clamp inside the stage.
    let tx = r.x + r.w / 2 - tw / 2;
    tx = _clamp(tx, 4, STAGE_W - tw - 4);
    ty = _clamp(ty, 4, STAGE_H - th - 4);

    tip.style.left = Math.round(tx) + 'px';
    tip.style.top = Math.round(ty) + 'px';
}

function _resolve(content) {
    let html;
    try {
        html = typeof content === 'function' ? content() : content;
    } catch (e) {
        html = null;
    }
    return html == null ? '' : String(html);
}

function _show(el, content) {
    const tip = _ensureTip();
    if (!tip) return;
    const html = _resolve(content);
    if (!html) { _hide(); return; }
    tip.innerHTML = html;
    tip.style.display = 'block';
    _activeEl = el;
    // Layout must settle before we can measure width/height for placement.
    _position(el);
}

function _hide() {
    if (_showTimer) { clearTimeout(_showTimer); _showTimer = 0; }
    _activeEl = null;
    if (_tipEl) _tipEl.style.display = 'none';
}

export const Tooltip = {
    /**
     * Show a tooltip when the pointer dwells over `el`.
     * @param {HTMLElement} el
     * @param {string|function():string} htmlOrFn re-evaluated every time it shows
     */
    attach(el, htmlOrFn) {
        if (!el) return;
        const enter = () => {
            if (_showTimer) clearTimeout(_showTimer);
            _showTimer = setTimeout(() => { _showTimer = 0; _show(el, htmlOrFn); }, SHOW_DELAY);
        };
        const leave = () => { if (_activeEl === el || _showTimer) _hide(); };
        el.addEventListener('mouseenter', enter);
        el.addEventListener('mouseleave', leave);
        // A click on the target should dismiss the hint rather than leave it
        // floating over the thing the player just pressed.
        el.addEventListener('mousedown', leave);
    },

    /** Hide any visible/pending tooltip (call on panel teardown / re-render). */
    hideAll() { _hide(); },
};

/**
 * Pop a transient toast into #toast-root. Auto-removes on the base.css timeline.
 * @param {string} text
 * @param {string} [icon] optional leading emoji/glyph
 */
export function toast(text, icon) {
    const root = _toastRoot();
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast';
    // Stack multiples so a burst of unlocks does not pile onto one line.
    const existing = root.querySelectorAll('.toast').length;
    el.style.top = (84 + existing * 52) + 'px';
    if (icon) {
        const ic = document.createElement('span');
        ic.className = 'toast-icon';
        ic.textContent = icon;
        el.appendChild(ic);
    }
    const tx = document.createElement('span');
    tx.textContent = text == null ? '' : String(text);
    el.appendChild(tx);
    root.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3600);
}

// Any module may fire a toast without importing this file directly.
bus.on('toast', (p) => { if (p) toast(p.text, p.icon); });
