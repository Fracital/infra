// PVP "MATCH FOUND" interstitial. Browser-only.
//
// Queue matches (and private duels) used to snap straight into the game the
// instant the server said so -- jarring. This overlay gives the moment a beat:
// MATCH FOUND, the two names slam in around a VS, the arena reveals, a short
// countdown, then the caller proceeds (the actual match_start payload is
// already in hand; the server spends the first ~5s in prep, so both clients
// sitting through the same fixed transition costs nothing).

import { SFX } from '../audio/sfx.js';

const STEP_MS = { names: 250, arena: 900, count: 1500, tick: 700 };

function mk(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
}

/**
 * Show the versus screen, then call onDone. Total ~3.1s. The overlay lives
 * directly under #screen-root (sibling of screen divs) so it survives the
 * screen swap underneath and is removed right after onDone fires.
 * @param {{meName:string, oppName:string, oppRating?:string, mapName:string, difficulty?:string}} opts
 * @param {Function} onDone
 */
export function showVersus(opts, onDone) {
    const host = document.getElementById('screen-root');
    if (!host) { onDone(); return; }

    const ov = mk('div', 'vs-overlay');
    const inner = mk('div', 'vs-inner');
    inner.appendChild(mk('div', 'vs-found pixel-title', 'MATCH FOUND'));

    const row = mk('div', 'vs-row');
    const me = mk('div', 'vs-name vs-name-me mc-panel');
    me.appendChild(mk('span', 'vs-tag', 'YOU'));
    me.appendChild(mk('span', 'vs-name-text', opts.meName || 'You'));
    const vs = mk('div', 'vs-mark', 'VS');
    const opp = mk('div', 'vs-name vs-name-opp mc-panel');
    opp.appendChild(mk('span', 'vs-name-text', opts.oppName || 'Opponent'));
    opp.appendChild(mk('span', 'vs-tag', opts.oppRating || 'THEM'));
    row.appendChild(me);
    row.appendChild(vs);
    row.appendChild(opp);
    inner.appendChild(row);

    const arena = mk('div', 'vs-arena');
    arena.appendChild(mk('span', 'vs-arena-lbl', 'ARENA'));
    arena.appendChild(mk('span', 'vs-arena-name', opts.mapName || '???'));
    if (opts.difficulty) arena.appendChild(mk('span', 'vs-arena-diff', opts.difficulty));
    inner.appendChild(arena);

    const count = mk('div', 'vs-count', '');
    inner.appendChild(count);

    ov.appendChild(inner);
    host.appendChild(ov);
    SFX.play('achievement', { vol: 0.8 });

    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));

    at(STEP_MS.names, () => { row.classList.add('vs-in'); SFX.play('ui_open', { vol: 0.7 }); });
    at(STEP_MS.arena, () => { arena.classList.add('vs-in'); });
    let n = 3;
    const tick = () => {
        if (!ov.parentNode) return;
        if (n > 0) {
            count.textContent = String(n);
            count.classList.remove('vs-pop');
            void count.offsetWidth;   // restart the pop animation
            count.classList.add('vs-pop');
            SFX.play('ui_click', { vol: 0.6 });
            n--;
            timers.push(setTimeout(tick, STEP_MS.tick));
        } else {
            count.textContent = 'FIGHT!';
            count.classList.remove('vs-pop');
            void count.offsetWidth;
            count.classList.add('vs-pop');
            SFX.play('round_start', { vol: 0.8 });
            timers.push(setTimeout(finish, 450));
        }
    };
    at(STEP_MS.count, tick);

    let done = false;
    function finish() {
        if (done) return;
        done = true;
        for (const t of timers) clearTimeout(t);
        try { onDone(); } catch (e) { /* the show must go on */ }
        ov.classList.add('vs-out');
        setTimeout(() => { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 350);
    }

    // Hard backstop: never gate the match on UI timers for more than 5s.
    at(5000, finish);
}
