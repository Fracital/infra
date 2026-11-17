// Activated-ability bar. Browser-only.
//
// One button per ability instance across all towers (AbilityRuntime.collect),
// bottom-centre. Each button shows the owning tower's icon, a hotkey digit and a
// radial conic-gradient cooldown sweep. The ability roster changes as towers are
// upgraded (abilities unlock at tier 4/5 and hero levels 3/10), so update() diffs
// the live key set each frame and only rebuilds the DOM when it actually changes.

import { AbilityRuntime } from '../sim/abilities.js';
import { TowerSprites } from '../gfx/towersprites.js';
import { SFX } from '../audio/sfx.js';
import { Tooltip } from './tooltips.js';

function _spriteCanvas(src, size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    if (src) {
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(src, 0, 0, size, size);
    }
    return c;
}

// A full-screen modal (pause / settings / end screen) suppresses ability hotkeys.
function _modalOpen() {
    return typeof document !== 'undefined' && !!document.querySelector('.mc-overlay.is-open');
}

export const AbilityBar = {
    mount(rootEl, game, gate) {
        this.game = game;
        // Firing routes through the gate (records an ABILITY command); collect()
        // still reads the live roster straight from the game.
        this.gate = gate || null;
        this.root = document.createElement('div');
        this.root.className = 'ability-bar';
        rootEl.appendChild(this.root);

        this._btns = new Map();   // key -> { el, sweep, icon, def, hotkey }
        this._order = [];         // keys in collect() order

        this._onKey = (e) => {
            if (e.repeat || _modalOpen()) return;
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            const k = e.key;
            if (k >= '1' && k <= '9') {
                const key = this._order[k.charCodeAt(0) - 49];
                if (key) this._fire(key);
            }
        };
        window.addEventListener('keydown', this._onKey);

        this._unsubReady = game.bus.on('ability:ready', (p) => this._flashReady(p));

        this._rebuild();
    },

    // Tear-down helper (safe to call even if the host never does).
    unmount() {
        if (this._onKey) window.removeEventListener('keydown', this._onKey);
        if (this._unsubReady) this._unsubReady();
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    },

    update() {
        const list = AbilityRuntime.collect(this.game);
        // Rebuild only when the roster identity changes, not every frame.
        let changed = list.length !== this._order.length;
        if (!changed) {
            for (let i = 0; i < list.length; i++) {
                if (list[i].key !== this._order[i]) { changed = true; break; }
            }
        }
        if (changed) { this._rebuild(list); return; }

        for (let i = 0; i < list.length; i++) {
            const d = list[i];
            const b = this._btns.get(d.key);
            if (!b) continue;
            const cd = (d.def && d.def.cooldown) || 0;
            // MP prediction: an in-flight use shows as a full cooldown sweep.
            let pendRemaining = d.remaining;
            const pend = this.game._pending;
            if (pend) {
                for (let i = 0; i < pend.length; i++) {
                    if (pend[i].kind === 'ability' && pend[i].key === d.key) { pendRemaining = cd; break; }
                }
            }
            const frac = cd > 0 ? Math.max(0, Math.min(1, pendRemaining / cd)) : 0;
            if (frac > 0.001) {
                const deg = frac * 360;
                b.sweep.style.background =
                    'conic-gradient(rgba(8,6,14,0.74) 0deg ' + deg + 'deg, transparent ' + deg + 'deg 360deg)';
                b.el.classList.remove('ready');
            } else {
                b.sweep.style.background = 'transparent';
                b.el.classList.add('ready');
            }
        }
    },

    _rebuild(list) {
        list = list || AbilityRuntime.collect(this.game);
        this.root.textContent = '';
        this._btns.clear();
        this._order = [];

        for (let i = 0; i < list.length; i++) {
            const d = list[i];
            const hotkey = i < 9 ? String(i + 1) : '';
            const el = document.createElement('button');
            el.className = 'ability-btn';
            el.type = 'button';

            const icon = _spriteCanvas(TowerSprites.icon(d.tower.def.id), 44);
            icon.className = 'ability-icon';
            el.appendChild(icon);

            const sweep = document.createElement('div');
            sweep.className = 'ability-sweep';
            el.appendChild(sweep);

            if (hotkey) {
                const hk = document.createElement('span');
                hk.className = 'ability-hotkey';
                hk.textContent = hotkey;
                el.appendChild(hk);
            }

            const key = d.key;
            el.addEventListener('click', () => {
                if (!this._fire(key).ok) SFX.play('ui_error', { vol: 0.5 });
            });

            const def = d.def;
            Tooltip.attach(el, () =>
                '<div class="tt-title">' + _esc(def.name) + '</div>' +
                '<div>' + _esc(def.desc) + '</div>' +
                '<div class="tt-cost">Cooldown ' + (def.cooldown || 0) + 's</div>');

            this.root.appendChild(el);
            this._btns.set(key, { el, sweep, icon, def, hotkey });
            this._order.push(key);
        }
        this.update();
    },

    // Fire an ability through the gate (records an ABILITY command). Falls back
    // to a direct call if mounted without a gate. Returns {ok:boolean}.
    _fire(key) {
        if (this.gate) return this.gate.ability(key);
        return AbilityRuntime.use(this.game, key) ? { ok: true } : { ok: false };
    },

    _flashReady(payload) {
        if (!payload || !payload.ability || !payload.tower) return;
        const key = payload.tower.uid + ':' + payload.ability.id;
        const b = this._btns.get(key);
        if (!b) return;
        b.el.classList.add('ready', 'pulse');
        setTimeout(() => b.el.classList.remove('pulse'), 620);
        SFX.play('ability_ready');
    },
};

function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
