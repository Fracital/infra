// Deterministic match execution + replay helper. Headless-safe.
//
// A MatchRunner owns one Game and a command log. It is the single place that
// advances a game in exact tick steps and applies commands at exact tick
// boundaries, so every consumer -- solo recording, server rooms, resync, daily
// validation, and the determinism tests -- reproduces identical state from the
// same (seed, config, log).
//
// Tick/command timing rule (contract Section 1.3): a command stamped T executes
// AFTER the update() that makes game.tick === T (i.e. between tick T and T+1).
// Multiple commands stamped T apply in log order.

import { SIM_DT } from '../core/constants.js';
import { Game } from './game.js';
import { applyCommand, validateCommand, encodeCmd, decodeCmd } from './commands.js';

export class MatchRunner {
    /**
     * @param {{mapDef:*, difficulty?:string, seed?:number, modeFlags?:object,
     *          headless?:boolean}} cfg
     */
    constructor({ mapDef, difficulty = 'medium', seed = 1234, modeFlags = {}, headless = false }) {
        this.game = new Game({ mapDef, difficulty, seed, modeFlags, headless });
        // Rows: [tick, slot, ...encodeCmd(cmd)] flattened, sorted by (tick, insertion).
        this.log = [];
        // Count of log rows already applied to this.game (cursor for stepTo).
        this._applied = 0;
    }

    /**
     * Apply every pending log row whose stamp is due at the current tick, in log
     * order. Called at each tick boundary by stepTo. Solo rows are pre-applied by
     * applyNow (which advances the cursor past them), so this is a no-op for them.
     */
    _applyDue() {
        const log = this.log;
        const g = this.game;
        while (this._applied < log.length && log[this._applied][0] <= g.tick) {
            const cmd = decodeCmd(log[this._applied].slice(2));
            if (cmd) applyCommand(g, cmd);
            this._applied++;
        }
    }

    /**
     * Advance the game until game.tick === tick, applying scheduled/logged
     * commands at their exact boundaries. No-op if already at or past tick.
     * @param {number} tick
     */
    stepTo(tick) {
        // Catch anything already due (e.g. stamp-0 commands before the first
        // update, or a command scheduled onto the current tick edge).
        this._applyDue();
        const g = this.game;
        while (g.tick < tick) {
            g.update(SIM_DT);
            this._applyDue();
        }
    }

    /**
     * Schedule a future command (multiplayer path). The row is appended to the
     * log in (tick, insertion) order and applied later by stepTo -- it is NOT
     * applied now. A server-authoritative broadcast is always scheduled; the
     * returned validation is best-effort/advisory only (applyCommand at the
     * boundary is the deterministic final word). Ticks <= game.tick are rejected.
     * @param {number} tick execution tick (must be > game.tick)
     * @param {number} slot owning slot (-1 for server-injected / solo)
     * @param {{op:number}} cmd
     * @returns {{ok:boolean, reason?:string}}
     */
    schedule(tick, slot, cmd) {
        if (!(tick > this.game.tick)) return { ok: false, reason: 'past' };
        const enc = encodeCmd(cmd);
        if (!enc) return { ok: false, reason: 'badcmd' };

        const row = [tick, slot].concat(enc);
        const log = this.log;
        // Insert keeping (tick, insertion) order. A future-stamped row always
        // sorts after every already-applied row, so the cursor stays valid.
        let i = log.length;
        while (i > 0 && log[i - 1][0] > tick) i--;
        log.splice(i, 0, row);

        return validateCommand(this.game, cmd, slot);
    }

    /**
     * Solo path: stamp with the current tick, apply immediately, and (on success)
     * record it in the log. The command takes effect at the current game state,
     * exactly as a direct game mutator would -- so solo behaviour is unchanged
     * while the log stays a faithful, replayable record.
     * @param {number} slot -1 for solo
     * @param {{op:number}} cmd
     * @returns {{ok:boolean, reason?:string}} applyCommand's result
     */
    applyNow(slot, cmd) {
        const tick = this.game.tick;
        const res = applyCommand(this.game, cmd);
        if (res.ok) {
            const enc = encodeCmd(cmd);
            if (enc) {
                this.log.push([tick, slot].concat(enc));
                this._applied = this.log.length;   // already applied
            }
        }
        return res;
    }

    /** JSON string of the command log (array-of-arrays). */
    serializeLog() {
        return JSON.stringify(this.log);
    }

    /**
     * Parse a serialized log back into an array-of-arrays. Accepts a JSON string
     * or an already-parsed array; returns [] on anything malformed.
     * @param {string|Array} json
     * @returns {Array}
     */
    static parseLog(json) {
        let arr = json;
        if (typeof json === 'string') {
            try { arr = JSON.parse(json); } catch (e) { return []; }
        }
        return Array.isArray(arr) ? arr : [];
    }

    /**
     * Build a fresh runner and fast-forward it through an entire log (and to
     * untilTick if that is further). Runs headless at full speed -- the canonical
     * re-simulation used by resync and daily/leaderboard verification.
     * @param {{mapDef:*, difficulty?:string, seed?:number, modeFlags?:object,
     *          log?:Array, untilTick?:number}} cfg
     * @returns {MatchRunner}
     */
    static replay({ mapDef, difficulty, seed, modeFlags, log, untilTick }) {
        const runner = new MatchRunner({ mapDef, difficulty, seed, modeFlags, headless: true });
        // Copy rows so the caller's log is never mutated by scheduling/sorting.
        runner.log = (log || []).map((row) => row.slice());
        runner._applied = 0;

        let maxTick = 0;
        for (let i = 0; i < runner.log.length; i++) {
            if (runner.log[i][0] > maxTick) maxTick = runner.log[i][0];
        }
        const target = (typeof untilTick === 'number') ? Math.max(untilTick, maxTick) : maxTick;
        runner.stepTo(target);
        return runner;
    }
}
