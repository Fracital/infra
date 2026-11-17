// PVP battle rules -- two boards, one deterministic driver. Headless-safe.
//
// A PvpMatch owns TWO Games (slot 0 and slot 1), same map/seed-family/difficulty,
// both in pvp mode (modeFlags {pvp:true, noRoundBonus:true}). It is itself fully
// deterministic: a `tick` counter, a command `log`, and a fixed per-tick pipeline
// (advance both games -> income -> drain sends -> manage rounds -> apply commands
// -> check result). The same (mapDef, seed, log) reproduces byte-identical state
// on every machine, which is what makes resync, spectating, and replay possible.
//
// Driver surface mirrors MatchRunner (src/sim/runner.js) so the client match
// driver (B1) and the server room (B2) can drive a PvpMatch exactly like a
// MatchRunner: tick, game, gameFor(slot), oppGame(slot), stepTo(tick),
// schedule(tick, slot, cmd), checksum(), log, static replay(...). Board-scoped
// commands route to that slot's Game via applyCommand; OP.SEND is intercepted
// here (it never reaches a plain Game).
//
// Contract: docs/MULTIPLAYER_CONTRACTS.md Section 7.1.

import { SIM_DT } from '../core/constants.js';
import { Game } from './game.js';
import { Economy } from './economy.js';
import { spawnMob } from './mobs.js';
import { MOBS } from '../data/mobs.js';
import {
    OP, encodeCmd, decodeCmd, validateCommand,
    applyCommand as applyGameCommand,
} from './commands.js';
import { PVP_SENDS } from '../data/pvpsends.js';

// Second board's seed is decorrelated from the first so identical play does not
// share tower/kill RNG streams (contract 7.1: seed, seed ^ 0x9e3779b9).
const SEED_XOR = 0x9e3779b9;

const ECO_START = 100;              // starting income per slot
const ECO_INTERVAL = 360;           // ticks between income awards
const SEND_LEAD = 30;               // ticks between send acceptance and first spawn
/**
 * Per-slot pending-send depth gate (individual mob spawn entries, serialized
 * stream). Exported: the send-panel UI displays and gates on the SAME number
 * (a stale duplicate once showed 35/24 while the sim accepted 48).
 */
export const SEND_QUEUE_MAX = 48;
const SEND_BOARD_MAX = 60;          // max ALIVE sent mobs on a destination board
const SEND_HP_RAMP = 0.05;          // sent-mob hp: * (1 + ramp * senderRound)
const ROUND1_TICK = 300;            // round 1 fires at this match tick

/**
 * Intermission length before round N+1, in ticks (contract 7.1):
 * `max(120, 600 - 12*N)` where N is the round that just finished.
 * @param {number} n round just completed
 * @returns {number}
 */
export function intermission(n) {
    return Math.max(120, 600 - 12 * n);
}

// -- FNV-1a-32 combine helpers (same scheme as game.js checksum) --

function _fnv32(h, x) {
    x = x >>> 0;
    for (let i = 0; i < 4; i++) {
        h ^= (x & 0xff);
        h = Math.imul(h, 0x01000193) >>> 0;
        x >>>= 8;
    }
    return h >>> 0;
}

function _fnv(h, n) {
    h = _fnv32(h, n | 0);
    h = _fnv32(h, Math.round(n * 65536) | 0);
    return h >>> 0;
}

/** Spawn modifiers from a send's opts (fortified/camo/regrow flow to Mob). */
function _sendModifiers(opts) {
    const m = {};
    if (!opts) return m;
    if (opts.fortified) m.fortified = true;
    if (opts.camo) m.camo = true;
    if (opts.regrow) m.regrow = true;
    return m;
}

export class PvpMatch {
    /**
     * @param {{mapDef:*, seed?:number, difficulty?:string, mySlot?:number}} cfg
     */
    constructor({ mapDef, seed = 1234, difficulty = 'medium', mySlot = 0 }) {
        this.mapDef = mapDef;
        this.seed = (seed >>> 0) || 1;
        this.difficulty = difficulty || 'medium';
        this.mySlot = mySlot === 1 ? 1 : 0;

        this._games = [
            new Game({ mapDef, difficulty: this.difficulty, seed: this.seed, headless: true, modeFlags: { pvp: true, noRoundBonus: true } }),
            new Game({ mapDef, difficulty: this.difficulty, seed: (this.seed ^ SEED_XOR) >>> 0, headless: true, modeFlags: { pvp: true, noRoundBonus: true } }),
        ];

        this._tick = 0;
        this.eco = [ECO_START, ECO_START];

        // _sendQueues[slot] = pending spawn entries CREATED BY `slot`, each landing
        // on the OPPONENT board (1 - slot). Draining shrinks the sender's depth so
        // the SEND_QUEUE_MAX gate frees up over time.
        this._sendQueues = [[], []];
        this._pathRR = [0, 0];       // round-robin path cursor per DESTINATION board

        this._roundNum = 0;          // last round started on both boards
        this._nextRoundTick = ROUND1_TICK;   // null while a round is in progress

        // Rows: [tick, slot, ...encodeCmd(cmd)] flattened, sorted by (tick, insertion).
        this.log = [];
        this._applied = 0;

        this.result = null;          // {winnerSlot, reason, rounds} once decided
        this._resultCb = null;
    }

    // ---------------------------------------------------------- driver surface

    /** Current match tick (both games' game.tick stay equal to this). */
    get tick() { return this._tick; }

    /** The caller's own board (mySlot). */
    get game() { return this._games[this.mySlot]; }

    /** Round both boards are currently on (0 before round 1). */
    get roundNum() { return this._roundNum; }

    /**
     * @param {number} slot
     * @returns {Game} that slot's board
     */
    gameFor(slot) { return this._games[(slot | 0) & 1]; }

    /**
     * @param {number} [slot] defaults to mySlot
     * @returns {Game} the opponent of `slot`
     */
    oppGame(slot) {
        const s = (slot == null ? this.mySlot : slot) & 1;
        return this._games[1 - s];
    }

    /** @param {number} slot @returns {number} that slot's current income value */
    getEco(slot) { return this.eco[(slot | 0) & 1]; }

    /** @param {number} slot @returns {number} that slot's remaining lives */
    getLives(slot) { return this._games[(slot | 0) & 1].state.lives; }

    /** @param {number} slot @returns {number} pending sends created by this slot */
    sendQueueLen(slot) { return this._sendQueues[(slot | 0) & 1].length; }

    /** @returns {number} ticks until the next income award */
    ticksToIncome() { return ECO_INTERVAL - (this._tick % ECO_INTERVAL); }

    /**
     * @returns {number|null} ticks until the next round starts, or null while a
     *   round is in progress (next round not yet scheduled)
     */
    ticksToNextRound() {
        return this._nextRoundTick == null ? null : Math.max(0, this._nextRoundTick - this._tick);
    }

    /** The command log as a plain array-of-arrays copy (wire/persistence). */
    logRows() { return this.log.map((r) => r.slice()); }

    /**
     * Register a result callback (fires once, immediately if already decided).
     * @param {(result:{winnerSlot:number, reason:string, rounds:number})=>void} fn
     * @returns {PvpMatch}
     */
    onResult(fn) {
        this._resultCb = fn;
        if (this.result && typeof fn === 'function') fn(this.result);
        return this;
    }

    // ------------------------------------------------------------- commands

    /**
     * Apply one command immediately at the current tick. Board-scoped commands
     * route to that slot's Game; OP.SEND is intercepted here. Not logged (callers
     * that need replay use schedule()).
     * @param {number} slot
     * @param {{op:number}} cmd
     * @returns {{ok:boolean, reason?:string}}
     */
    applyCommand(slot, cmd) {
        if (!cmd || typeof cmd.op !== 'number') return { ok: false, reason: 'badcmd' };
        if (cmd.op === OP.SEND) return this._handleSend((slot | 0) & 1, cmd.sendId);
        return applyGameCommand(this._games[(slot | 0) & 1], cmd);
    }

    /**
     * Non-mutating pre-check for the server. SEND is validated here (unlock/cash/
     * queue depth); board commands defer to commands.validateCommand.
     * @param {number} slot
     * @param {{op:number}} cmd
     * @returns {{ok:boolean, reason?:string}}
     */
    validate(slot, cmd) {
        if (!cmd || typeof cmd.op !== 'number') return { ok: false, reason: 'badcmd' };
        const s = (slot | 0) & 1;
        if (cmd.op === OP.SEND) return this._validateSend(s, cmd.sendId);
        return validateCommand(this._games[s], cmd, s);
    }

    /**
     * Schedule a future command (server path): validate best-effort, append to the
     * log in (tick, insertion) order. Rejects ticks <= current. The scheduled row
     * always applies later via stepTo -- applyCommand/_handleSend at the boundary
     * is the deterministic final word (the returned validation is advisory).
     * @param {number} tick execution tick (> current)
     * @param {number} slot owning slot
     * @param {{op:number}} cmd
     * @returns {{ok:boolean, reason?:string}}
     */
    schedule(tick, slot, cmd) {
        if (!(tick > this._tick)) return { ok: false, reason: 'past' };
        const enc = encodeCmd(cmd);
        if (!enc) return { ok: false, reason: 'badcmd' };

        const row = [tick, slot].concat(enc);
        const log = this.log;
        let i = log.length;
        while (i > 0 && log[i - 1][0] > tick) i--;
        log.splice(i, 0, row);

        return this.validate(slot, cmd);
    }

    /**
     * Board-scoped SEND validation (advisory: re-checked deterministically at
     * apply time by _handleSend).
     * @param {number} slot
     * @param {string} sendId
     * @returns {{ok:boolean, reason?:string}}
     */
    _validateSend(slot, sendId) {
        const entry = PVP_SENDS[sendId];
        if (!entry) return { ok: false, reason: 'badsend' };
        const g = this._games[slot];
        if ((g.currentRound || 0) < entry.unlock) return { ok: false, reason: 'locked' };
        if (this._sendQueues[slot].length >= SEND_QUEUE_MAX) return { ok: false, reason: 'queue' };
        // Destination-board saturation gate: alive sent mobs are capped so a
        // send flood can never grow a board past what clients can simulate in
        // real time (the 150-elder-guardian resync death spiral).
        const dest = this._games[1 - slot];
        let alive = 0;
        for (let i = 0; i < dest.mobs.length; i++) {
            if (dest.mobs[i].alive && dest.mobs[i].sentMob) alive++;
        }
        if (alive >= SEND_BOARD_MAX) return { ok: false, reason: 'board' };
        if (g.state.cash < entry.cost) return { ok: false, reason: 'cash' };
        return { ok: true };
    }

    /**
     * Authoritative SEND: debit sender, bump sender eco, enqueue `count` spawns
     * onto the opponent board spaced `spacing` ticks apart starting SEND_LEAD
     * ticks from now, on round-robin paths.
     * @param {number} senderSlot
     * @param {string} sendId
     * @returns {{ok:boolean, reason?:string}}
     */
    _handleSend(senderSlot, sendId) {
        const check = this._validateSend(senderSlot, sendId);
        if (!check.ok) return check;

        const entry = PVP_SENDS[sendId];
        const g = this._games[senderSlot];
        if (!Economy.trySpend(g, entry.cost)) return { ok: false, reason: 'cash' };

        this.eco[senderSlot] += entry.ecoDelta;

        const destSlot = 1 - senderSlot;
        const modifiers = _sendModifiers(entry.opts);
        // Sent mobs scale with the SENDER's round (frozen at acceptance): late
        // sends must threaten late defenses or matches can never end. BOSS
        // sends cap at x2 -- an uncapped late wither (20k+ hp, 5000-life leak)
        // was a banked win-button no defense in the game could answer.
        const mobDef = MOBS[entry.mobId];
        const isBoss = !!(mobDef && mobDef.flags && mobDef.flags.boss);
        let hpMul = 1 + SEND_HP_RAMP * (g.currentRound || 0);
        if (isBoss) hpMul = Math.min(hpMul, 2);
        const q = this._sendQueues[senderSlot];
        // SERIALIZED stream (Battles-style): a new send appends AFTER the last
        // pending spawn instead of starting its own parallel stream. Mashing
        // the send button produces one continuous evenly-spaced line of mobs,
        // never same-tick stacked wads. Queue tick order is strictly ascending,
        // so the last entry is always the stream's end.
        let start = this._tick + SEND_LEAD;
        if (q.length) start = Math.max(start, q[q.length - 1].tick + Math.max(1, entry.spacing));
        // One lane per GROUP: the whole send walks a single path together; the
        // round-robin alternates lanes between sends, not within one.
        const pathIndex = this._nextPath(destSlot);
        for (let k = 0; k < entry.count; k++) {
            q.push({
                tick: start + k * entry.spacing,
                mobId: entry.mobId,
                modifiers,
                hpMul,
                destSlot,
                pathIndex,
            });
        }
        return { ok: true };
    }

    /** Next round-robin path index for a destination board. */
    _nextPath(destSlot) {
        const nPaths = Math.max(1, this._games[destSlot].paths.length);
        const p = this._pathRR[destSlot] % nPaths;
        this._pathRR[destSlot] = (this._pathRR[destSlot] + 1) % 0x7fffffff;
        return p;
    }

    // ----------------------------------------------------------- tick pipeline

    /**
     * Apply every logged command whose stamp is due at the current tick, in log
     * order. Board commands route to their game; SEND is intercepted.
     */
    _applyDue() {
        const log = this.log;
        while (this._applied < log.length && log[this._applied][0] <= this._tick) {
            const row = log[this._applied];
            const cmd = decodeCmd(row.slice(2));
            if (cmd) this.applyCommand(row[1], cmd);
            this._applied++;
        }
    }

    /** Award income to both boards at each ECO_INTERVAL boundary (never tick 0). */
    _maybeIncome() {
        if (this._tick > 0 && this._tick % ECO_INTERVAL === 0) {
            for (let s = 0; s < 2; s++) {
                // Negative income (from over-sending late-game bosses) never DRAINS
                // cash -- the award floors at 0. The eco value itself stays the true
                // running sum so it must be climbed back above 0 to earn again.
                const inc = Math.max(0, this.eco[s]);
                if (inc > 0) Economy.award(this._games[s], inc);
            }
        }
    }

    /** Spawn queued send-mobs whose scheduled tick has arrived. */
    _drainSpawns() {
        for (let s = 0; s < 2; s++) {
            const q = this._sendQueues[s];
            if (q.length === 0) continue;
            let w = 0;
            for (let i = 0; i < q.length; i++) {
                const e = q[i];
                if (e.tick <= this._tick) {
                    const g = this._games[e.destSlot];
                    if (g.state.phase !== 'over') {
                        spawnMob(g, e.mobId, {
                            pathIndex: e.pathIndex, modifiers: e.modifiers,
                            sent: true, hpMul: e.hpMul || 1,
                        });
                    }
                } else {
                    q[w++] = e;
                }
            }
            q.length = w;
        }
    }

    /** Both boards ready for the next round (round finished: idle or won). */
    _boardReady(g) {
        const ph = g.state.phase;
        return ph === 'idle' || ph === 'won';
    }

    /** Synchronized round starts (contract 7.1). */
    _manageRounds() {
        // Fire the scheduled round on both boards simultaneously.
        if (this._nextRoundTick != null && this._tick >= this._nextRoundTick) {
            this._games[0].startRound();
            this._games[1].startRound();
            this._roundNum += 1;
            this._nextRoundTick = null;
        }
        // Once BOTH boards have gone idle after a round, schedule the next one.
        if (this._nextRoundTick == null && this._roundNum >= 1 &&
            this._boardReady(this._games[0]) && this._boardReady(this._games[1])) {
            this._nextRoundTick = this._tick + intermission(this._roundNum);
        }
    }

    /** Win/draw detection at the end of a step. */
    _checkResult() {
        if (this.result) return;
        const dead0 = this._games[0].state.lives <= 0 || this._games[0].state.phase === 'over';
        const dead1 = this._games[1].state.lives <= 0 || this._games[1].state.phase === 'over';
        if (!dead0 && !dead1) return;
        if (dead0 && dead1) this._finish(-1, 'draw');
        else if (dead0) this._finish(1, 'lives');
        else this._finish(0, 'lives');
    }

    /**
     * Declare the match over (once). winnerSlot -1 = draw.
     * @param {number} winnerSlot
     * @param {string} reason 'lives' | 'forfeit' | 'draw'
     */
    _finish(winnerSlot, reason) {
        if (this.result) return;
        this.result = { winnerSlot, reason, rounds: this._roundNum };
        if (typeof this._resultCb === 'function') this._resultCb(this.result);
    }

    /**
     * End the match by forfeit: the OTHER slot wins.
     * @param {number} slot the slot that forfeits (disconnect-timeout/leave)
     */
    forfeit(slot) {
        if (this.result) return;
        this._finish(1 - ((slot | 0) & 1), 'forfeit');
    }

    /**
     * Advance both boards + PVP rules to an absolute match tick. No-op once a
     * result has been decided. Per-tick order (the determinism contract):
     *   tick++ -> game0.update -> game1.update -> income -> drain sends ->
     *   manage rounds -> apply logged commands -> check result.
     * @param {number} tick
     */
    stepTo(tick) {
        if (this.result) return;
        this._applyDue();                 // stamp-0 / current-edge commands
        while (this._tick < tick && !this.result) {
            this._tick++;
            this._games[0].update(SIM_DT);
            this._games[1].update(SIM_DT);
            this._maybeIncome();
            this._drainSpawns();
            this._manageRounds();
            this._applyDue();
            this._checkResult();
        }
    }

    /**
     * Combined checksum: both games' checksums + eco values + send-queue lengths
     * (+ tick/round for good measure). A mismatch between two sims triggers a
     * server-ordered resync (contract 7.1).
     * @returns {number} uint32
     */
    checksum() {
        let h = 0x811c9dc5;
        h = _fnv(h, this._games[0].checksum());
        h = _fnv(h, this._games[1].checksum());
        h = _fnv(h, this.eco[0]);
        h = _fnv(h, this.eco[1]);
        h = _fnv(h, this._sendQueues[0].length);
        h = _fnv(h, this._sendQueues[1].length);
        h = _fnv(h, this._tick);
        h = _fnv(h, this._roundNum);
        return h >>> 0;
    }

    /**
     * Build a fresh match and fast-forward it through a whole log (and to
     * untilTick if further) -- the canonical re-simulation for resync/spectate/
     * verification. Runs headless at full speed and stops early if the match ends.
     * @param {{mapDef:*, seed?:number, difficulty?:string, log?:Array, untilTick?:number}} cfg
     * @returns {PvpMatch}
     */
    static replay({ mapDef, seed, difficulty, log, untilTick }) {
        const m = new PvpMatch({ mapDef, seed, difficulty, mySlot: 0 });
        m.log = (log || []).map((row) => row.slice());
        m._applied = 0;

        let maxTick = 0;
        for (let i = 0; i < m.log.length; i++) {
            if (m.log[i][0] > maxTick) maxTick = m.log[i][0];
        }
        const target = (typeof untilTick === 'number') ? Math.max(untilTick, maxTick) : maxTick;
        m.stepTo(target);
        return m;
    }
}
