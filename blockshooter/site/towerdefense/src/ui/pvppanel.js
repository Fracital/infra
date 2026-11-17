// PVP "Battles" chrome. Browser-only UI component, mounted by the MP
// gamescreen (into the STAGE ROOT -- it spans the whole screen) in PVP.
//
// Layout (mirrors BTD Battles):
//   - single top bar: [YOU name+lives] .. Round banner .. [lives+name THEM] +
//     the standard speed/pause/settings cluster on the far right
//   - boards split-screen on the canvas underneath (gamescreen renders them)
//   - bottom band: SEND TROOPS as a full grid (every card visible, NO
//     scrolling) + the match console (cash/eco/income/round/queue)
//   - building uses the ORIGINAL vertical arsenal rail (gamescreen's Shop),
//     repositioned by css/pvp.css -- this component does not own it
//
// CLICK-EATING TRAP (see project note): combat fires per-frame; this chrome is
// .update()'d every frame. It builds its DOM ONCE at mount and, on update,
// ONLY mutates textContent / toggles classes -- it NEVER rebuilds child nodes.
// Sends fire on pointerdown so a mid-gesture reprice cannot swallow the click.

import { formatCash } from '../core/mathutil.js';
import { SFX } from '../audio/sfx.js';
import { PVP_SENDS, PVP_SEND_IDS } from '../data/pvpsends.js';
import { SEND_QUEUE_MAX } from '../sim/pvpmatch.js';

function mk(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
}

export const PvpPanel = {
    _root: null,
    _pvp: null,
    _driver: null,
    _mySlot: 0,
    _game: null,
    _oppGame: null,
    _sendFn: null,
    _els: null,
    _sendBtns: null,

    /**
     * @param {HTMLElement} hostEl the gamescreen stage root
     * @param {{pvp:*, mySlot:number, game:*, oppGame:*, names:{me:string, opp:string},
     *          sendFn:(id:string)=>void}} ctx
     */
    mount(hostEl, ctx) {
        this.unmount();
        this._pvp = ctx.pvp;
        this._mySlot = ctx.mySlot === 1 ? 1 : 0;
        this._game = ctx.game;
        this._oppGame = ctx.oppGame;
        this._sendFn = typeof ctx.sendFn === 'function' ? ctx.sendFn : null;
        const names = ctx.names || {};

        const p = this._pvp || {};
        this._driver = (typeof p.getEco === 'function') ? p : (p.match || p.driver || p);

        const root = mk('div', 'pvp-chrome');
        this._root = root;

        // ---- top-bar chips (flank the HUD round banner) ----
        const meChip = mk('div', 'pvp-topchip pvp-topchip-me');
        meChip.appendChild(mk('span', 'pvp-topchip-tag', 'YOU'));
        meChip.appendChild(mk('span', 'pvp-topchip-name', names.me || 'You'));
        const meLives = mk('span', 'pvp-topchip-lives', '150');
        meChip.appendChild(meLives);
        root.appendChild(meChip);

        const oppChip = mk('div', 'pvp-topchip pvp-topchip-opp');
        const oppLives = mk('span', 'pvp-topchip-lives', '150');
        oppChip.appendChild(oppLives);
        oppChip.appendChild(mk('span', 'pvp-topchip-name', names.opp || 'Opponent'));
        const rating = this._opponentRating();
        oppChip.appendChild(mk('span', 'pvp-topchip-tag', rating || 'THEM'));
        root.appendChild(oppChip);

        // ---- top info strip: cash / eco / income / round / sends ----
        const info = mk('div', 'pvp-infobar mc-panel');
        const addSeg = (lbl, cls, initial) => {
            const seg = mk('span', 'pvp-i-seg');
            seg.appendChild(mk('span', 'pvp-i-lbl', lbl));
            const val = mk('span', cls, initial);
            seg.appendChild(val);
            info.appendChild(seg);
            return val;
        };
        const cashVal = addSeg('CASH', 'pvp-i-cash', '$0');
        const ecoVal = addSeg('ECO', 'pvp-i-eco', '150');
        const incomeVal = addSeg('INCOME', 'pvp-i-val', '');
        const roundVal = addSeg('ROUND', 'pvp-i-val', '');
        // Counts individual queued MOBS (a 6-pack send adds 6), so label it as
        // the queue it is -- "SENDS 6/24" after one click read as a bug.
        const queueVal = addSeg('QUEUE', 'pvp-i-val', '0/' + SEND_QUEUE_MAX);
        root.appendChild(info);

        // ---- bottom band: the full-width send grid ----
        const bottom = mk('div', 'pvp-bottom');

        const sendsWrap = mk('div', 'pvp-sends-wrap mc-panel');
        const sendsHead = mk('div', 'pvp-sends-head');
        sendsHead.appendChild(mk('span', 'pvp-sends-title', 'SEND TROOPS'));
        sendsHead.appendChild(mk('span', 'pvp-sends-hint text-dim', 'spend cash -- grow eco -- pressure their lanes'));
        sendsWrap.appendChild(sendsHead);
        const grid = mk('div', 'pvp-sends-grid');
        this._sendBtns = new Map();
        for (const id of PVP_SEND_IDS) {
            const def = PVP_SENDS[id];
            if (!def) continue;
            grid.appendChild(this._buildSendCard(id, def));
        }
        sendsWrap.appendChild(grid);
        bottom.appendChild(sendsWrap);

        root.appendChild(bottom);

        this._els = { meLives, oppLives, cashVal, ecoVal, incomeVal, roundVal, queueVal };
        hostEl.appendChild(root);
        this.update();
    },

    _buildSendCard(id, def) {
        const btn = mk('button', 'pvp-send');
        btn.type = 'button';
        btn.dataset.send = id;
        btn._sendable = false;

        const ecoText = def.ecoDelta > 0 ? ('+' + def.ecoDelta) : String(def.ecoDelta);
        btn.appendChild(mk('span', 'pvp-send-name', def.label || id));
        btn.appendChild(mk('span', 'pvp-send-cost', '$' + formatCash(def.cost)));
        btn.appendChild(mk('span', 'pvp-send-eco' + (def.ecoDelta < 0 ? ' neg' : ''), 'eco ' + ecoText));
        const lock = mk('span', 'pvp-send-lock', 'R' + def.unlock);
        btn.appendChild(lock);

        btn.addEventListener('pointerdown', (ev) => {
            ev.preventDefault();
            if (!btn._sendable) { SFX.play('ui_error', { vol: 0.5 }); return; }
            SFX.play('ui_click');
            if (this._sendFn) this._sendFn(id);
        });
        btn.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.35 }));

        this._sendBtns.set(id, { btn, lock });
        return btn;
    },

    _opponentRating() {
        const p = this._pvp;
        let r = null;
        if (p && p.opponent && typeof p.opponent.rating === 'number') r = p.opponent.rating;
        else if (p && p.pvp && p.pvp.opponent && typeof p.pvp.opponent.rating === 'number') r = p.pvp.opponent.rating;
        return r != null ? (String(r) + ' ELO') : '';
    },

    /** Per-frame refresh: textContent + class toggles ONLY. */
    update() {
        if (!this._root) return;
        const pvp = this._driver;
        const game = this._game;
        const opp = this._oppGame;
        const els = this._els;

        const cash = (game && game.state) ? (game.state.cash + (game._pendingCashDelta || 0)) : 0;
        if (game && game.state) {
            this._setText(els.meLives, String(game.state.lives));
            this._setText(els.cashVal, '$' + formatCash(cash));
        }
        if (opp && opp.state) this._setText(els.oppLives, String(opp.state.lives));

        let queueLen = 0;
        if (pvp) {
            const eco = pvp.getEco ? pvp.getEco(this._mySlot) : 150;
            this._setText(els.ecoVal, String(eco));

            const incTicks = pvp.ticksToIncome ? pvp.ticksToIncome() : 0;
            this._setText(els.incomeVal, '+' + Math.max(0, eco) + ' in ' + Math.max(1, Math.ceil(incTicks / 60)) + 's');

            const rn = pvp.roundNum || 0;
            const toNext = pvp.ticksToNextRound ? pvp.ticksToNextRound() : null;
            if (toNext != null) {
                this._setText(els.roundVal, (rn > 0 ? rn + ' -- next ' : 'prep -- ') + Math.max(0, Math.ceil(toNext / 60)) + 's');
            } else {
                this._setText(els.roundVal, rn > 0 ? String(rn) : 'prep');
            }

            queueLen = pvp.sendQueueLen ? pvp.sendQueueLen(this._mySlot) : 0;
            this._setText(els.queueVal, queueLen + '/' + SEND_QUEUE_MAX);
        }

        const round = (game) ? (game.currentRound || 0) : 0;
        const queueFull = queueLen >= SEND_QUEUE_MAX;
        for (const id of PVP_SEND_IDS) {
            const ref = this._sendBtns.get(id);
            if (!ref) continue;
            const def = PVP_SENDS[id];
            const locked = round < def.unlock;
            const affordable = cash >= def.cost;
            const sendable = !locked && affordable && !queueFull;
            ref.btn._sendable = sendable;
            this._toggle(ref.btn, 'locked', locked);
            this._toggle(ref.btn, 'unaffordable', !locked && !affordable);
            this._toggle(ref.btn, 'queuefull', !locked && affordable && queueFull);
            this._toggle(ref.lock, 'hidden', !locked);
        }
    },

    _setText(el, txt) { if (el && el.textContent !== txt) el.textContent = txt; },

    _toggle(el, cls, on) {
        if (!el) return;
        if (on) el.classList.add(cls); else el.classList.remove(cls);
    },

    unmount() {
        if (this._root && this._root.parentNode) this._root.parentNode.removeChild(this._root);
        this._root = null;
        this._pvp = null;
        this._driver = null;
        this._game = null;
        this._oppGame = null;
        this._sendFn = null;
        this._els = null;
        this._sendBtns = null;
    },
};
