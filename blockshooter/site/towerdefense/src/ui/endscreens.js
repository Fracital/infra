// Victory / defeat overlays. Browser-only. Listens to the game bus and stages a
// medal ceremony (win) or a muted defeat card.
//
// Run stats: kills are summed from tower.kills; "cash earned" is tracked live by
// accumulating positive 'cash' deltas from mount time (the sim keeps no lifetime
// earnings counter, so the end screen owns that tally).

import { DIFFICULTIES } from '../data/difficulties.js';
import { Particles } from '../gfx/particles.js';
import { formatCash, easeOutCubic } from '../core/mathutil.js';
import { SFX } from '../audio/sfx.js';

// Built from code points so the source file stays pure ASCII (project rule).
const MEDAL_STAR = String.fromCharCode(0x2605);   // black star
const SKULL_GLYPH = String.fromCharCode(0x2620);  // skull and crossbones

export const EndScreens = {
    /**
     * @param {HTMLElement} rootEl
     * @param {object} game
     * @param {object} cfg
     * @param {function} [cfg.onContinueFreeplay]
     * @param {function} [cfg.onRestart]
     * @param {function} [cfg.onQuit]
     * @param {function} [cfg.onBackToLobby] MP: return to the room lobby
     * @param {boolean} [cfg.mp] MP mode -> end is server-driven (showMpResult)
     * @param {boolean} [cfg.pvp] MP pvp variant
     * @param {number} [cfg.mySlot] this client's slot
     */
    mount(rootEl, game, cfg) {
        cfg = cfg || {};
        this.game = game;
        this._onContinue = cfg.onContinueFreeplay || function () {};
        this._onRestart = cfg.onRestart || function () {};
        this._onQuit = cfg.onQuit || function () {};
        this._onBackToLobby = cfg.onBackToLobby || function () {};
        this._mp = !!cfg.mp;
        this._pvp = !!cfg.pvp;
        this._mySlot = (typeof cfg.mySlot === 'number') ? cfg.mySlot : -1;

        this._cashEarned = 0;
        this._lastCash = game.state.cash;
        this._raf = 0;
        this._confettiTimers = [];

        const ov = document.createElement('div');
        ov.className = 'mc-overlay end-overlay';
        const backdrop = document.createElement('div');
        backdrop.className = 'ov-backdrop';
        ov.appendChild(backdrop);
        this._card = document.createElement('div');
        this._card.className = 'ov-card end-card mc-panel';
        ov.appendChild(this._card);
        rootEl.appendChild(ov);
        this._el = ov;
        this._backdrop = backdrop;

        // Cash-earned tally is useful in every mode.
        game.bus.on('cash', (p) => {
            const d = p.cash - this._lastCash;
            if (d > 0) this._cashEarned += d;
            this._lastCash = p.cash;
        });

        // In MP the authoritative end comes from the server (match_end) via
        // showMpResult() -- the local sim's game:won/over must NOT stage the solo
        // overlay (it would fire early / disagree with the server verdict).
        if (!this._mp) {
            game.bus.on('game:won', (p) => this._showVictory(p ? p.round : game.state.round));
            game.bus.on('game:over', (p) => this._showDefeat(p ? p.round : game.currentRound));
        }
    },

    /**
     * Stage the MP end overlay from the server's `match_end` result.
     * @param {object} result co-op {kind:'coop',victory,round}; pvp {kind:'pvp',
     *   winnerSlot,reason,rounds,ratings}
     * @param {{players:Array, mySlot:number, game:object}} ctx
     */
    showMpResult(result, ctx) {
        result = result || {};
        ctx = ctx || {};
        if ((result.kind || 'coop') === 'pvp') this._showMpPvp(result, ctx);
        else this._showMpCoop(result, ctx);
    },

    // Per-player contribution table from the shared co-op board: rank each slot
    // by the kills of the towers that player placed (ownerSlot).
    _mpPlacements(players, game) {
        const bySlot = new Map();
        for (const p of players || []) {
            bySlot.set(p.slot, { slot: p.slot, name: p.name, color: p.color, kills: 0, towers: 0 });
        }
        const towers = (game && game.towers) || [];
        for (let i = 0; i < towers.length; i++) {
            const t = towers[i];
            const slot = (typeof t.ownerSlot === 'number') ? t.ownerSlot : -1;
            let row = bySlot.get(slot);
            if (!row) { row = { slot, name: 'Player ' + (slot + 1), color: null, kills: 0, towers: 0 }; bySlot.set(slot, row); }
            row.kills += t.kills || 0;
            row.towers += 1;
        }
        const rows = [...bySlot.values()];
        rows.sort((a, b) => b.kills - a.kills);
        return rows;
    },

    _showMpCoop(result, ctx) {
        const victory = !!result.victory;
        const round = result.round | 0;
        this._card.className = 'ov-card end-card mc-panel anim-pop ' + (victory ? 'end-victory' : 'end-defeat');
        this._backdrop.classList.toggle('victory-backdrop', victory);
        this._card.textContent = '';

        const badge = document.createElement('div');
        if (victory) {
            // Medal star / skull are built from code points (top of file) so the
            // source stays pure ASCII per the project rule.
            badge.className = 'end-medal';
            badge.innerHTML = '<div class="end-medal-disc"></div><div class="end-ribbon end-ribbon-l"></div>' +
                '<div class="end-ribbon end-ribbon-r"></div><div class="end-medal-star">' + MEDAL_STAR + '</div>';
        } else {
            badge.className = 'end-skull';
            badge.textContent = SKULL_GLYPH;
        }
        this._card.appendChild(badge);

        const title = document.createElement('div');
        title.className = 'end-title pixel-title';
        title.textContent = victory ? 'Victory!' : 'Defeat';
        this._card.appendChild(title);

        const sub = document.createElement('div');
        sub.className = 'end-sub';
        sub.textContent = (victory ? 'Cleared together at Round ' : 'Fell at Round ') + round;
        this._card.appendChild(sub);

        this._card.appendChild(this._placementTable(this._mpPlacements(ctx.players, ctx.game), ctx.mySlot));

        const btns = document.createElement('div');
        btns.className = 'end-buttons';
        this._btn(btns, 'Back to Lobby', 'mc-btn-green', () => this._onBackToLobby());
        this._btn(btns, 'Menu', '', () => this._onQuit());
        this._card.appendChild(btns);

        this._open();
        if (victory) { SFX.play('medal'); this._confettiBurst(); } else { SFX.play('defeat'); }
    },

    _showMpPvp(result, ctx) {
        const mySlot = (typeof ctx.mySlot === 'number') ? ctx.mySlot : this._mySlot;
        const draw = result.reason === 'draw' || result.winnerSlot == null || result.winnerSlot < 0;
        const win = !draw && result.winnerSlot === mySlot;
        const kind = draw ? 'draw' : (win ? 'win' : 'lose');

        this._card.className = 'ov-card end-card mc-panel anim-pop ' +
            (win ? 'end-victory' : (draw ? 'end-draw' : 'end-defeat'));
        this._backdrop.classList.toggle('victory-backdrop', win);
        this._card.textContent = '';

        const title = document.createElement('div');
        title.className = 'end-title pixel-title';
        title.textContent = draw ? 'Draw' : (win ? 'Victory!' : 'Defeat');
        this._card.appendChild(title);

        const sub = document.createElement('div');
        sub.className = 'end-sub';
        const reasonTxt = result.reason === 'forfeit' ? 'by forfeit'
            : (result.reason === 'lives' ? 'by lives' : '');
        sub.textContent = (draw ? 'Stalemate ' : ((win ? 'You won ' : 'You lost ') + reasonTxt)).trim() +
            (result.rounds ? ' -- ' + (result.rounds | 0) + ' rounds' : '');
        this._card.appendChild(sub);

        // Practice vs AI is unranked -- label it so, no rating line.
        if (result.practice) {
            const pr = document.createElement('div');
            pr.className = 'end-rating';
            pr.textContent = 'Practice -- unranked';
            this._card.appendChild(pr);
        } else {
            // Rating + delta (delta needs a prior rating; show it when supplied).
            const ratings = result.ratings || {};
            const newRating = ratings[mySlot];
            if (typeof newRating === 'number') {
                const rr = document.createElement('div');
                rr.className = 'end-rating';
                let deltaTxt = '';
                if (typeof ctx.oldRating === 'number') {
                    const d = Math.round(newRating - ctx.oldRating);
                    deltaTxt = ' (' + (d >= 0 ? '+' : '') + d + ')';
                }
                rr.textContent = 'Rating ' + Math.round(newRating) + deltaTxt;
                this._card.appendChild(rr);
            }
        }

        const btns = document.createElement('div');
        btns.className = 'end-buttons';
        this._btn(btns, 'Back to Lobby', 'mc-btn-green', () => this._onBackToLobby());
        this._btn(btns, 'Menu', '', () => this._onQuit());
        this._card.appendChild(btns);

        this._open();
        if (kind === 'win') { SFX.play('victory'); this._confettiBurst(); }
        else if (kind === 'lose') { SFX.play('defeat'); }
        else { SFX.play('round_end'); }
    },

    // A compact per-player leaderboard (name + towers + kills), your row lit.
    _placementTable(rows, mySlot) {
        const wrap = document.createElement('div');
        wrap.className = 'end-placements';
        let rank = 1;
        for (const r of rows) {
            const row = document.createElement('div');
            row.className = 'end-place-row' + (r.slot === mySlot ? ' is-me' : '');
            const pos = document.createElement('span');
            pos.className = 'end-place-pos';
            pos.textContent = '#' + rank++;
            const nm = document.createElement('span');
            nm.className = 'end-place-name';
            nm.textContent = r.name || ('Player ' + (r.slot + 1));
            if (r.color) nm.style.color = r.color;
            const stat = document.createElement('span');
            stat.className = 'end-place-stat';
            stat.textContent = r.kills + ' kills';
            row.appendChild(pos);
            row.appendChild(nm);
            row.appendChild(stat);
            wrap.appendChild(row);
        }
        return wrap;
    },

    _kills() {
        let k = 0;
        const towers = this.game.towers || [];
        for (let i = 0; i < towers.length; i++) k += towers[i].kills || 0;
        return k;
    },

    _open() {
        this._el.classList.add('is-open', 'anim-fade');
    },

    _showVictory(round) {
        const diff = DIFFICULTIES[this.game.difficultyId] || DIFFICULTIES.medium;
        const color = diff.color || '#fcdc5f';
        this._card.className = 'ov-card end-card end-victory mc-panel anim-pop';
        this._card.style.setProperty('--medal-c', color);
        this._backdrop.classList.add('victory-backdrop');
        this._card.textContent = '';

        const medal = document.createElement('div');
        medal.className = 'end-medal';
        medal.innerHTML = '<div class="end-medal-disc"></div><div class="end-ribbon end-ribbon-l"></div>' +
            '<div class="end-ribbon end-ribbon-r"></div><div class="end-medal-star">\u2605</div>';
        this._card.appendChild(medal);

        const title = document.createElement('div');
        title.className = 'end-title pixel-title';
        title.textContent = 'Victory!';
        this._card.appendChild(title);

        const sub = document.createElement('div');
        sub.className = 'end-sub';
        sub.textContent = diff.name + ' cleared';
        this._card.appendChild(sub);

        this._card.appendChild(this._statGrid([
            ['Round', round, false],
            ['Kills', this._kills(), false],
            ['Cash Earned', Math.round(this._cashEarned), true],
        ]));

        const btns = document.createElement('div');
        btns.className = 'end-buttons';
        this._btn(btns, 'Continue Freeplay', 'mc-btn-green', () => this._onContinue());
        this._btn(btns, 'New Game', 'mc-btn-gold', () => this._onRestart());
        this._btn(btns, 'Menu', '', () => this._onQuit());
        this._card.appendChild(btns);

        this._open();
        SFX.play('medal');
        this._confettiBurst();
    },

    _showDefeat(round) {
        this._card.className = 'ov-card end-card end-defeat mc-panel anim-pop';
        this._backdrop.classList.remove('victory-backdrop');
        this._card.textContent = '';

        const skull = document.createElement('div');
        skull.className = 'end-skull';
        skull.textContent = '\u2620';
        this._card.appendChild(skull);

        const title = document.createElement('div');
        title.className = 'end-title pixel-title';
        title.textContent = 'Defeat';
        this._card.appendChild(title);

        const sub = document.createElement('div');
        sub.className = 'end-sub';
        sub.textContent = 'Reached Round ' + round;
        this._card.appendChild(sub);

        this._card.appendChild(this._statGrid([
            ['Round', round, false],
            ['Kills', this._kills(), false],
            ['Cash Earned', Math.round(this._cashEarned), true],
        ]));

        const btns = document.createElement('div');
        btns.className = 'end-buttons';
        this._btn(btns, 'Retry', 'mc-btn-green', () => this._onRestart());
        this._btn(btns, 'Menu', '', () => this._onQuit());
        this._card.appendChild(btns);

        this._open();
    },

    _statGrid(rows) {
        const grid = document.createElement('div');
        grid.className = 'end-stats';
        const targets = [];
        for (const [label, value, cash] of rows) {
            const cell = document.createElement('div');
            cell.className = 'end-stat';
            const v = document.createElement('div');
            v.className = 'end-stat-v';
            v.textContent = cash ? '$0' : '0';
            const l = document.createElement('div');
            l.className = 'end-stat-l';
            l.textContent = label;
            cell.appendChild(v);
            cell.appendChild(l);
            grid.appendChild(cell);
            targets.push({ el: v, value, cash });
        }
        this._countUp(targets);
        return grid;
    },

    // Animated count-up over ~0.9s, easeOutCubic.
    _countUp(targets) {
        if (this._raf) cancelAnimationFrame(this._raf);
        const dur = 900;
        const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const step = (now) => {
            const t = Math.min(1, (now - start) / dur);
            const e = easeOutCubic(t);
            for (const tg of targets) {
                const n = Math.round(tg.value * e);
                tg.el.textContent = tg.cash ? '$' + formatCash(n) : String(n);
            }
            if (t < 1) this._raf = requestAnimationFrame(step);
            else this._raf = 0;
        };
        this._raf = requestAnimationFrame(step);
    },

    // Three staggered confetti waves across the top of the field.
    _confettiBurst() {
        for (const id of this._confettiTimers) clearTimeout(id);
        this._confettiTimers = [];
        const wave = () => {
            const xs = [180, 440, 640, 840, 1100];
            for (const x of xs) Particles.spawn('confetti', x, 30, { count: 28, size: 7 });
        };
        this._confettiTimers.push(setTimeout(wave, 0));
        this._confettiTimers.push(setTimeout(wave, 480));
        this._confettiTimers.push(setTimeout(wave, 980));
    },

    _btn(parent, label, cls, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mc-btn' + (cls ? ' ' + cls : '');
        b.textContent = label;
        b.addEventListener('click', () => { SFX.play('ui_click'); onClick(); });
        parent.appendChild(b);
        return b;
    },
};
