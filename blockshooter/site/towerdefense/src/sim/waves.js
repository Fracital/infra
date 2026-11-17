// Wave spawning. Headless-safe.
//
// startRound(n) flattens the round definition into a time-sorted spawn queue;
// update(dt) drains it against an elapsed clock. Multi-path maps spread each
// group's spawns round-robin across the available paths unless the group pins
// a pathIndex.

import { ROUNDS, freeplay } from '../data/rounds.js';
import { Mob } from './mobs.js';

export class WaveManager {
    /** @param {*} game */
    constructor(game) {
        this.game = game;
        this.queue = [];
        this._t = 0;
        this._i = 0;
        this._active = false;
    }

    /**
     * Build and arm the spawn queue for round n, then announce it.
     * @param {number} n 1-based round number
     */
    startRound(n) {
        const game = this.game;
        game.currentRound = n;

        const rdef = n <= ROUNDS.length ? ROUNDS[n - 1] : freeplay(n);
        const nPaths = Math.max(1, game.paths.length);
        const spawns = [];
        let autoRot = 0;

        for (const g of rdef.groups) {
            const delay = g.delay || 0;
            const spacing = g.spacing || 0;
            const mods = {};
            if (g.modifiers) for (const m of g.modifiers) mods[m] = true;

            for (let k = 0; k < g.count; k++) {
                let pi;
                if (g.pathIndex != null) pi = g.pathIndex % nPaths;
                else { pi = autoRot % nPaths; autoRot++; }
                spawns.push({
                    time: delay + k * spacing,
                    mob: g.mob,
                    modifiers: mods,
                    pathIndex: pi,
                });
            }
        }

        // Stable sort by spawn time (ties keep authoring order).
        spawns.sort((a, b) => a.time - b.time);

        this.queue = spawns;
        this._t = 0;
        this._i = 0;
        this._active = true;

        game.bus.emit('round:start', { round: n });
        game.sfx.play('round_start');
    }

    /** Drain any spawns whose scheduled time has arrived. */
    update(dt) {
        if (!this._active) return;
        this._t += dt;
        const q = this.queue;
        while (this._i < q.length && q[this._i].time <= this._t) {
            this._spawn(q[this._i]);
            this._i++;
        }
        if (this._i >= q.length) this._active = false;
    }

    _spawn(s) {
        const game = this.game;
        if (game.state.phase === 'over') return;
        const mob = new Mob(game, s.mob, {
            pathIndex: s.pathIndex,
            dist: 0,
            modifiers: s.modifiers,
        });
        game.mobs.push(mob);
        game.bus.emit('mob:spawn', { mob });
    }

    /** Hard stop (game over): drop the rest of the queue. */
    stop() {
        this._active = false;
        this.queue = [];
        this._i = 0;
    }

    /** Still emitting spawns. */
    get spawning() {
        return this._active && this._i < this.queue.length;
    }

    /**
     * Round in progress: still spawning, or ROUND mobs remain on the field.
     * PVP send-spawned mobs (m.sentMob) never hold a round open -- the round
     * completes off its own spawns, Battles-style, so send pressure can't
     * stall match progression (sentMob is never set in solo/co-op).
     */
    get roundActive() {
        if (this.spawning) return true;
        const mobs = this.game.mobs;
        for (let i = 0; i < mobs.length; i++) {
            if (mobs[i].alive && !mobs[i].sentMob) return true;
        }
        return false;
    }
}
