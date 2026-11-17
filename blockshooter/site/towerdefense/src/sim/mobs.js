// Mobs: the things that walk the path. Headless-safe.
//
// A Mob is a lightweight state bag driven entirely by dt (no wall clock, no
// Math.random -- special-timer accumulators advance by dt and any randomness
// comes from game.rng). Damage, statuses, defenses, child-splitting and the
// per-species "special" behaviours all live here; visuals/sound are requested
// through the game.fx / game.sfx facades so this file runs under node.

import { MOBS } from '../data/mobs.js';
import { hpMultiplier } from '../data/rounds.js';
import { applyStatus, updateStatuses } from './statuses.js';

const TELEPORT_HOP = 70;         // px the enderman jumps when hit
const TELEPORT_CD = 2;           // s between enderman hops
const REGROW_DELAY = 2;          // s undamaged before regrow kicks in
const REGROW_RATE = 0.08;        // maxHp per second
const HEAL_RADIUS = 80;          // witch heal radius
const HEAL_PER_SEC = 3;
const FATIGUE_RADIUS = 130;      // elder guardian tower-slow radius
const VEX_MAX = 6;               // per-evoker cap
const CHILD_STAGGER = 14;        // +- px spread when children spawn

export class Mob {
    /**
     * @param {*} game
     * @param {string} mobId
     * @param {{pathIndex?:number, dist?:number, modifiers?:{camo?:boolean, regrow?:boolean, fortified?:boolean},
     *   sent?:boolean, hpMul?:number}} [opts]
     *   sent  -- PVP send-spawned (never set in solo/co-op): excluded from
     *            round-completion, pays reduced bounty, counts against the
     *            destination board's send cap. Children inherit it.
     *   hpMul -- extra hp multiplier (PVP send round-scaling). Children inherit.
     */
    constructor(game, mobId, { pathIndex = 0, dist = 0, modifiers = {}, sent = false, hpMul = 1 } = {}) {
        const def = MOBS[mobId];
        if (!def) throw new Error('unknown mob id: ' + mobId);

        this.game = game;
        this.id = mobId;
        this.def = def;
        this.spawnOrder = game._spawnCounter++;

        const flags = def.flags || {};
        // Effective modifiers = round-imposed OR species-intrinsic. Children
        // inherit their parent's effective modifiers (see die()).
        this.modifiers = {
            camo: !!modifiers.camo || !!flags.camo,
            regrow: !!modifiers.regrow || !!flags.regrow,
            fortified: !!modifiers.fortified || !!flags.fortified,
        };

        const nPaths = game.paths.length;
        this.pathIndex = nPaths > 0 ? Math.min(pathIndex, nPaths - 1) : 0;
        this.dist = dist;

        this.sentMob = !!sent;
        this.hpMul = (typeof hpMul === 'number' && hpMul > 0) ? hpMul : 1;

        const scale = hpMultiplier(game.currentRound || 0);
        this.maxHp = def.hp * scale * this.hpMul * (this.modifiers.fortified ? 2 : 1);
        this.hp = this.maxHp;

        this.radius = def.radius;
        this.flying = !!flags.flying;
        this.statuses = new Map();
        this.alive = true;
        this.frozen = false;
        this.drawFrame = 0;
        this._dead = false;

        // Special-behaviour bookkeeping (all dt-driven).
        this._undamaged = REGROW_DELAY;      // start ready so a fresh mob can regrow
        this._lastTp = -TELEPORT_CD * 2;
        this._healTimer = 0;
        this._vexTimer = 0;
        this._fatigueTimer = 0;
        this._witherTimer = 0;
        this._owned = null;                  // lazily-built list of spawned children (evoker/wither)
        this._phase = 0;                     // dragon phase tracker

        const p = game.paths.length > 0 ? game.paths[this.pathIndex].posAt(this.dist) : { x: 0, y: 0, angle: 0 };
        this.x = p.x;
        this.y = p.y;
        this.angle = p.angle;
        this._usedPortals = null;
    }

    /**
     * Apply damage. Returns the amount actually dealt (0 if fully mitigated).
     * @param {number} amount
     * @param {string} damageType
     * @param {*} source tower/unit dealing the hit (may be null)
     * @param {{armorPiercing?:boolean, dot?:boolean}} [opts]
     * @returns {number}
     */
    takeDamage(amount, damageType, source, opts = {}) {
        if (!this.alive || amount <= 0) return 0;

        let dmg = amount;
        if (damageType !== 'true') {
            const def = this.def;
            if (def.immunities && def.immunities.indexOf(damageType) !== -1) return 0;
            if (damageType === 'sharp' && def.flags && def.flags.armored) {
                const pierces = opts.armorPiercing ||
                    (source && source.stats && source.stats.armorPiercing);
                if (!pierces) return 0;
            }
            const wk = this.statuses.get('weakness');
            if (wk) dmg *= wk.power;
        }

        const before = this.hp;
        this.hp = before - dmg;
        const dealt = before - Math.max(0, this.hp);
        if (dealt > 0) this._undamaged = 0;

        if (this.hp <= 0) {
            this.die(this.game, source);
            return dealt;
        }

        // Enderman blink: only on real damage, rate-limited, never on the lethal hit.
        if (dealt > 0 && this.def.special === 'teleport') {
            const t = this.game.time;
            if (t - this._lastTp > TELEPORT_CD) {
                this._lastTp = t;
                const ox = this.x, oy = this.y;
                this.dist = Math.min(this.dist + TELEPORT_HOP, this.game.paths[this.pathIndex].length);
                const p = this.game.paths[this.pathIndex].posAt(this.dist);
                this.x = p.x; this.y = p.y; this.angle = p.angle;
                this.game.fx.teleport(ox, oy, this.x, this.y);
                this.game.sfx.play('teleport');
            }
        }

        return dealt;
    }

    /**
     * @param {{id:string, power?:number, duration:number, source?:*, dps?:number, damageType?:string}} spec
     */
    addStatus(spec) {
        applyStatus(this, spec, this.game);
    }

    /**
     * Can a targeting query see/hit this mob?
     * @param {{camoDetect?:boolean, seesFlying?:boolean, groundOnly?:boolean}} query
     * @returns {boolean}
     */
    isTargetableBy(query) {
        if (!this.alive) return false;
        const q = query || {};
        if (this.modifiers.camo && !q.camoDetect) return false;
        if (this.flying) {
            if (q.seesFlying === false) return false;
            if (q.groundOnly) return false;
        }
        return true;
    }

    /**
     * Per-tick update: statuses -> regrow -> movement (+ portals/leak) -> special.
     * @param {number} dt
     * @param {*} game
     */
    update(dt, game) {
        if (!this.alive) return;

        updateStatuses(this, dt, game);
        if (!this.alive) return;   // DoT may have finished it

        // Regrow regen.
        this._undamaged += dt;
        if (this.modifiers.regrow && this._undamaged >= REGROW_DELAY && this.hp < this.maxHp) {
            this.hp = Math.min(this.maxHp, this.hp + this.maxHp * REGROW_RATE * dt);
        }

        // Movement.
        const path = game.paths[this.pathIndex];
        const spd = this.effectiveSpeed(game);
        if (spd > 0) {
            const before = this.dist;
            this.dist += spd * dt;
            this._maybePortal(game, before, this.dist);
        }

        if (this.dist >= path.length) {
            this._leak(game, path);
            return;
        }

        const p = path.posAt(this.dist);
        this.x = p.x;
        this.y = p.y;
        this.angle = p.angle;
        this.drawFrame += dt;

        this._updateSpecial(dt, game);
    }

    /** Current along-path speed in px/s (0 while frozen/stunned). */
    effectiveSpeed(game) {
        if (this.frozen) return 0;
        let s = this.def.speed * (game.difficulty ? game.difficulty.mobSpeedMul : 1);

        const slow = this.statuses.get('slow');
        if (slow) s *= slow.power;

        const zones = game.map && game.map.speedZones;
        if (zones) {
            for (let i = 0; i < zones.length; i++) {
                const z = zones[i];
                const dx = this.x - z.x, dy = this.y - z.y;
                if (dx * dx + dy * dy <= z.r * z.r) s *= z.mult;
            }
        }

        if (this.def.special === 'dragon_phases') {
            const frac = this.hp / this.maxHp;
            if (frac < 0.33) s *= 1.8;
            else if (frac < 0.66) s *= 1.4;
        }
        return s;
    }

    _maybePortal(game, fromDist, toDist) {
        const map = game.map;
        if (!map || map.feature !== 'portals' || !map.portals) return;
        const portals = map.portals;
        if (!this._usedPortals) this._usedPortals = new Set();
        for (let i = 0; i < portals.length; i++) {
            const pt = portals[i];
            if (pt.pathIndex !== this.pathIndex) continue;
            if (this._usedPortals.has(i)) continue;
            if (fromDist < pt.fromDist && toDist >= pt.fromDist) {
                this._usedPortals.add(i);
                this.dist = pt.toDist;
                const from = { x: pt.x1 != null ? pt.x1 : this.x, y: pt.y1 != null ? pt.y1 : this.y };
                const p = game.paths[this.pathIndex].posAt(this.dist);
                this.x = p.x; this.y = p.y; this.angle = p.angle;
                const to = { x: pt.x2 != null ? pt.x2 : this.x, y: pt.y2 != null ? pt.y2 : this.y };
                game.fx.teleport(from.x, from.y, to.x, to.y);
            }
        }
    }

    _leak(game, path) {
        const dmg = leakCost(this.id);
        game.state.lives -= dmg;
        game.bus.emit('lives', { lives: game.state.lives, delta: -dmg });
        game.bus.emit('mob:leak', { mob: this, damage: dmg });
        game.sfx.play('life_lost');
        game.fx.flash('#ff3b30', 0.22);
        this.alive = false;
        this._dead = true;   // children do NOT spawn on leak
        // Snap to the exit for any late render.
        const p = path.posAt(path.length);
        this.x = p.x; this.y = p.y;
    }

    _updateSpecial(dt, game) {
        switch (this.def.special) {
            case 'heal': {
                this._healTimer += dt;
                while (this._healTimer >= 0.5) {
                    this._healTimer -= 0.5;
                    const heal = HEAL_PER_SEC * 0.5;
                    const r2 = HEAL_RADIUS * HEAL_RADIUS;
                    const list = game.mobs;
                    for (let i = 0; i < list.length; i++) {
                        const o = list[i];
                        if (o === this || !o.alive || o.hp >= o.maxHp) continue;
                        const dx = o.x - this.x, dy = o.y - this.y;
                        if (dx * dx + dy * dy <= r2) {
                            o.hp = Math.min(o.maxHp, o.hp + heal);
                            if (game.rng.chance(0.2)) game.fx.spawn('heart', o.x, o.y - o.radius, { count: 1 });
                        }
                    }
                }
                break;
            }
            case 'spawn_vex': {
                this._vexTimer += dt;
                if (this._vexTimer >= 6) {
                    this._vexTimer -= 6;
                    if (this._countOwnedAlive() < VEX_MAX) {
                        this._spawnChildMob(game, 'vex', this.dist - 10);
                    }
                }
                break;
            }
            case 'aura_fatigue': {
                this._fatigueTimer += dt;
                if (this._fatigueTimer >= 0.4) {
                    this._fatigueTimer -= 0.4;
                    const r2 = FATIGUE_RADIUS * FATIGUE_RADIUS;
                    const towers = game.towers;
                    for (let i = 0; i < towers.length; i++) {
                        const tw = towers[i];
                        const dx = tw.x - this.x, dy = tw.y - this.y;
                        if (dx * dx + dy * dy <= r2 && typeof tw.addBuff === 'function') {
                            tw.addBuff({ id: 'fatigue', source: this, dur: 0.5, mults: { attackSpeed: 0.85 } });
                        }
                    }
                }
                break;
            }
            case 'spawn_wither_skeleton': {
                this._witherTimer += dt;
                if (this._witherTimer >= 8) {
                    this._witherTimer -= 8;
                    this._spawnChildMob(game, 'wither_skeleton', this.dist - 18);
                    this._spawnChildMob(game, 'wither_skeleton', this.dist - 34);
                    game.sfx.play('wither_spawn');
                }
                break;
            }
            case 'dragon_phases': {
                const frac = this.hp / this.maxHp;
                let phase = 0;
                if (frac < 0.33) phase = 2;
                else if (frac < 0.66) phase = 1;
                if (phase > this._phase) {
                    game.fx.shake(0.8);
                    game.sfx.play('dragon_roar');
                }
                this._phase = phase;
                break;
            }
            default:
                break;
        }
    }

    _countOwnedAlive() {
        if (!this._owned) return 0;
        let n = 0;
        for (let i = 0; i < this._owned.length; i++) if (this._owned[i].alive) n++;
        return n;
    }

    _spawnChildMob(game, mobId, dist) {
        const child = new Mob(game, mobId, {
            pathIndex: this.pathIndex,
            dist: Math.max(0, dist),
        });
        game.mobs.push(child);
        if (!this._owned) this._owned = [];
        this._owned.push(child);
        game.bus.emit('mob:spawn', { mob: child });
        return child;
    }

    /**
     * Kill: award bounty, split into children, emit death, request FX/SFX.
     * @param {*} game
     * @param {*} killer
     */
    die(game, killer) {
        if (this._dead) return;
        this._dead = true;
        this.alive = false;

        // Sent mobs pay a quarter bounty: killing your opponent's pressure must
        // not FUND your defense, or sending is self-defeating (PVP balance).
        const bounty = this.sentMob ? Math.ceil(this.def.bounty * 0.25) : this.def.bounty;
        game.economy.award(game, bounty, this.x, this.y);

        const children = this.def.children;
        if (children) {
            for (let ci = 0; ci < children.length; ci++) {
                const c = children[ci];
                for (let k = 0; k < c.count; k++) {
                    const stagger = game.rng.range(-CHILD_STAGGER, CHILD_STAGGER);
                    const child = new Mob(game, c.id, {
                        pathIndex: this.pathIndex,
                        dist: Math.max(0, this.dist + stagger),
                        modifiers: {
                            camo: this.modifiers.camo,
                            regrow: this.modifiers.regrow,
                            fortified: this.modifiers.fortified,
                        },
                        sent: this.sentMob,
                        hpMul: this.hpMul,
                    });
                    game.mobs.push(child);
                    game.bus.emit('mob:spawn', { mob: child });
                }
            }
        }

        game.bus.emit('mob:death', { mob: this, cause: killer ? 'killed' : 'popped' });
        game.fx.death(this);
        if (this.def.special === 'split_visual') {
            game.fx.spawn('blockShards', this.x, this.y, { count: 12, color: '#7bd66b' });
        }
        game.sfx.play(this.def.deathSfx || 'mob_death_small');
    }
}

// ---- static cost helpers (base-def recursion, memoized) ----

const _leakCache = new Map();
const _bountyCache = new Map();

/**
 * Contract helper: construct a mob, register it with the game, announce it.
 * @returns {Mob}
 */
export function spawnMob(game, mobId, opts = {}) {
    const mob = new Mob(game, mobId, opts);
    game.mobs.push(mob);
    game.bus.emit('mob:spawn', { mob });
    return mob;
}

/**
 * Full recursive leak cost of a mob and everything it splits into, using base
 * (unscaled) hp. This is the lives lost when it reaches the exit.
 * @param {string} mobId
 * @returns {number}
 */
export function leakCost(mobId) {
    if (_leakCache.has(mobId)) return _leakCache.get(mobId);
    const def = MOBS[mobId];
    if (!def) return 0;
    _leakCache.set(mobId, def.hp);   // cycle guard (roster is a DAG; belt-and-braces)
    let cost = def.hp;
    for (const c of def.children || []) cost += c.count * leakCost(c.id);
    _leakCache.set(mobId, cost);
    return cost;
}

/**
 * Full recursive bounty of a mob and its children (for stats/estimates).
 * @param {string} mobId
 * @returns {number}
 */
export function totalBounty(mobId) {
    if (_bountyCache.has(mobId)) return _bountyCache.get(mobId);
    const def = MOBS[mobId];
    if (!def) return 0;
    _bountyCache.set(mobId, def.bounty);
    let total = def.bounty;
    for (const c of def.children || []) total += c.count * totalBounty(c.id);
    _bountyCache.set(mobId, total);
    return total;
}
