// The Game: the authoritative simulation. Headless-safe.
//
// Owns all sim state (mobs/towers/projectiles/zones/units), the placement mask,
// the economy, wave scheduling, and the fx/sfx facades. Everything visual or
// audible is requested through game.fx / game.sfx, which emit bus 'fx' events;
// under node there are no listeners so they are free no-ops, which is what lets
// entire games run headlessly in tests.

import { EventBus } from '../core/events.js';
import { RNG } from '../core/rng.js';
import { W, H, TILE, GRID_W, GRID_H, TARGET_MODES, PATH_COLORS } from '../core/constants.js';
import { dist2 } from '../core/mathutil.js';

import { Path } from './path.js';
import { WaveManager } from './waves.js';
import { Economy } from './economy.js';

import { SpatialGrid } from './targeting.js';
import { Tower } from './towers.js';
import { HeroTower } from './heroes.js';
import { updateProjectiles } from './projectiles.js';
import { AbilityRuntime } from './abilities.js';

import { DIFFICULTIES } from '../data/difficulties.js';
import { TOWERS } from '../data/towers/index.js';
import { HEROES } from '../data/heroes/index.js';
import { decorationBlocksPlacement } from '../gfx/decorations.js';

const PATH_KEEPOUT = 26;         // px: no building this close to the track
const DECOR_KEEPOUT = 20;        // px around blocking decorations
const BOUNDS_MARGIN = 4;         // tower footprint must stay this far inside the field

/** Resolve a tower/hero def from an id or pass a def straight through. */
function resolveDef(idOrDef) {
    if (idOrDef && typeof idOrDef === 'object') return idOrDef;
    return TOWERS[idOrDef] || HEROES[idOrDef] || null;
}

/**
 * Fold one 32-bit integer into a running FNV-1a-32 hash, byte by byte.
 * @param {number} h current hash (uint32)
 * @param {number} x value to fold (coerced to uint32)
 * @returns {number} new hash (uint32)
 */
function _fnv32(h, x) {
    x = x >>> 0;
    for (let i = 0; i < 4; i++) {
        h ^= (x & 0xff);
        h = Math.imul(h, 0x01000193) >>> 0;   // FNV prime 16777619
        x >>>= 8;
    }
    return h >>> 0;
}

/**
 * Fold one number into the checksum stream: both its integer part (`n | 0`) and
 * its 16.16 fixed-point representation (`Math.round(n * 65536)`), so integers and
 * fractional values are captured identically on every JS engine.
 * @param {number} h current hash (uint32)
 * @param {number} n value to fold
 * @returns {number} new hash (uint32)
 */
function _fnv(h, n) {
    h = _fnv32(h, n | 0);
    h = _fnv32(h, Math.round(n * 65536) | 0);
    return h >>> 0;
}

export class Game {
    /**
     * @param {{mapDef:*, difficulty?:string, seed?:number, headless?:boolean, modeFlags?:object}} cfg
     */
    constructor({ mapDef, difficulty = 'medium', seed = 1234, headless = false, modeFlags = {} }) {
        this.headless = headless;
        this.map = mapDef;
        this.difficultyId = difficulty;
        this.difficulty = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;

        // Mode modifiers (PVP / daily challenges). Recognized flags: noRoundBonus,
        // bannedTowers, livesOverride, cashOverride, priceMulExtra. Never mutate
        // the shared DIFFICULTIES object -- all mods are applied at point of use.
        this.modeFlags = modeFlags || {};

        this.bus = new EventBus();
        this.rng = new RNG((seed >>> 0) || 1);
        this.seed = seed;

        this.paths = (mapDef.paths || []).map((p) => new Path(p.waypoints));

        this.state = {
            cash: this.difficulty.cash,
            lives: this.difficulty.lives,
            round: 0,           // last COMPLETED round
            phase: 'idle',      // 'idle' | 'combat' | 'won' | 'over'
            speed: 1,
            freeplay: false,
        };

        // Difficulty defaults are in place; mode overrides win.
        if (typeof this.modeFlags.livesOverride === 'number') this.state.lives = this.modeFlags.livesOverride;
        if (typeof this.modeFlags.cashOverride === 'number') this.state.cash = this.modeFlags.cashOverride;

        this.tick = 0;          // integer sim tick (command-stamp clock)
        this.currentRound = 0;  // round currently being fought (waves set this)
        this.time = 0;          // accumulated sim seconds (the only clock)
        this._spawnCounter = 0;
        this._uidCounter = 1;
        this._wonEmitted = false;
        this._heroPlaced = false;

        this.mobs = [];
        this.towers = [];
        this.projectiles = [];
        this.zones = [];
        this.units = [];

        this.grid = new SpatialGrid(80);
        this.grid.rebuild(this.mobs);
        this.economy = Economy;
        this.waveManager = new WaveManager(this);
        this.selectedTower = null;

        // FX/SFX facades -> bus 'fx' events (Section 8). Always safe under node.
        const bus = this.bus;
        this.fx = {
            explosion: (x, y, r, style = 'tnt') => bus.emit('fx', { type: 'explosion', x, y, r, style }),
            hit: (x, y, damageType) => bus.emit('fx', { type: 'hit', x, y, damageType }),
            death: (mob) => bus.emit('fx', { type: 'death', mob }),
            text: (x, y, str, color) => bus.emit('fx', { type: 'text', x, y, str, color }),
            beam: (x1, y1, x2, y2, style) => bus.emit('fx', { type: 'beam', x1, y1, x2, y2, style }),
            lightning: (points) => bus.emit('fx', { type: 'lightning', points }),
            shockwave: (x, y, r) => bus.emit('fx', { type: 'shockwave', x, y, r }),
            splash: (x, y, color) => bus.emit('fx', { type: 'splash', x, y, color }),
            teleport: (x1, y1, x2, y2) => bus.emit('fx', { type: 'teleport', x1, y1, x2, y2 }),
            shake: (power) => bus.emit('fx', { type: 'shake', power }),
            flash: (color, alpha) => bus.emit('fx', { type: 'flash', color, alpha }),
            // Raw particle passthrough: the particle type IS the event type.
            spawn: (type, x, y, opts) => bus.emit('fx', { type, x, y, opts: opts || {} }),
        };
        this.sfx = { play: (name, opts) => bus.emit('fx', { type: 'sfx', name, opts: opts || {} }) };

        // Placement mask. Browser code (gamescreen) may overwrite this with the
        // terrain-baked mask; keep the field writable.
        this.mask = this._computeMask();
    }

    // ---------------- placement mask ----------------

    _computeMask() {
        const mask = new Uint8Array(GRID_W * GRID_H);
        const terrain = this.map.terrain;
        const legend = terrain && terrain.legend ? terrain.legend : {};
        const rows = terrain && terrain.rows ? terrain.rows : null;

        for (let gy = 0; gy < GRID_H; gy++) {
            const row = rows ? rows[gy] : null;
            for (let gx = 0; gx < GRID_W; gx++) {
                let v = 1;
                if (row) {
                    const tile = legend[row[gx]];
                    if (tile === 'water' || tile === 'water_deep') v = 2;
                    else if (tile === 'lava' || tile === 'magma') v = 0;
                }
                mask[gy * GRID_W + gx] = v;
            }
        }

        // Keep-out around the path.
        for (let gy = 0; gy < GRID_H; gy++) {
            for (let gx = 0; gx < GRID_W; gx++) {
                const cx = gx * TILE + TILE / 2;
                const cy = gy * TILE + TILE / 2;
                if (this._nearAnyPath(cx, cy, PATH_KEEPOUT)) mask[gy * GRID_W + gx] = 0;
            }
        }

        // Explicit no-build circles.
        for (const b of this.map.blockers || []) this._blockCircle(mask, b.x, b.y, b.r);

        // Blocking decorations (trees, boulders, ...).
        for (const d of this.map.decorations || []) {
            if (decorationBlocksPlacement(d.type)) this._blockCircle(mask, d.x, d.y, DECOR_KEEPOUT);
        }

        return mask;
    }

    _nearAnyPath(x, y, maxD) {
        const paths = this.paths;
        for (let i = 0; i < paths.length; i++) {
            if (paths[i].distanceTo(x, y) <= maxD) return true;
        }
        return false;
    }

    _blockCircle(mask, cx, cy, r) {
        const r2 = r * r;
        for (let gy = 0; gy < GRID_H; gy++) {
            const py = gy * TILE + TILE / 2;
            for (let gx = 0; gx < GRID_W; gx++) {
                const px = gx * TILE + TILE / 2;
                const dx = px - cx, dy = py - cy;
                if (dx * dx + dy * dy <= r2) mask[gy * GRID_W + gx] = 0;
            }
        }
    }

    // ---------------- placement / building ----------------

    /**
     * @param {string|object} towerDefOrId
     * @param {number} x
     * @param {number} y
     * @returns {{ok:boolean, reason?:string}}
     */
    canPlaceAt(towerDefOrId, x, y) {
        const def = resolveDef(towerDefOrId);
        if (!def) return { ok: false, reason: 'bounds' };

        // Daily-mod banned kit: named tower ids cannot be placed at all.
        const banned = this.modeFlags.bannedTowers;
        if (banned && def.id && banned.indexOf(def.id) !== -1) return { ok: false, reason: 'banned' };

        const fp = def.footprint || 16;
        if (x - fp < BOUNDS_MARGIN || x + fp > W - BOUNDS_MARGIN ||
            y - fp < BOUNDS_MARGIN || y + fp > H - BOUNDS_MARGIN) {
            return { ok: false, reason: 'bounds' };
        }

        const gx = Math.floor(x / TILE);
        const gy = Math.floor(y / TILE);
        if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return { ok: false, reason: 'bounds' };

        const cell = this.mask[gy * GRID_W + gx];
        if (cell === 0) {
            return { ok: false, reason: this._nearAnyPath(x, y, PATH_KEEPOUT) ? 'path' : 'terrain' };
        }

        const placement = def.placement || 'land';
        if (placement === 'land' && cell !== 1) return { ok: false, reason: 'water' };
        if (placement === 'water' && cell !== 2) return { ok: false, reason: 'land' };

        for (let i = 0; i < this.towers.length; i++) {
            const t = this.towers[i];
            const mind = fp + (t.def.footprint || 16);
            if (dist2(x, y, t.x, t.y) < mind * mind) return { ok: false, reason: 'overlap' };
        }

        if (def.isHero && this._heroPlaced) return { ok: false, reason: 'hero' };

        return { ok: true };
    }

    /**
     * Discounted, difficulty-scaled price for a tower def or a raw upgrade cost.
     * Applies the single best discount aura in range (Section 6.3), rounds to 5.
     * @param {object|number} arg tower def (uses .cost) or a raw cost number
     * @param {number} [x]
     * @param {number} [y]
     * @returns {number}
     */
    priceFor(arg, x, y) {
        let base = typeof arg === 'number' ? arg : (arg && arg.cost) || 0;
        base *= this.difficulty.priceMul;
        // Mode price modifier (e.g. daily 'Expensive week'). Applied on top of the
        // difficulty multiplier without mutating the shared DIFFICULTIES object.
        if (this.modeFlags.priceMulExtra) base *= this.modeFlags.priceMulExtra;

        if (x != null && y != null) {
            let bestMul = 1;
            for (let i = 0; i < this.towers.length; i++) {
                const t = this.towers[i];
                if (t.x === x && t.y === y) continue;   // never let a tower discount itself
                const da = t.stats && t.stats.discountAura;
                if (da && da.mul < bestMul) {
                    const r = da.radius || 0;
                    if (dist2(t.x, t.y, x, y) <= r * r) bestMul = da.mul;
                }
            }
            base *= bestMul;
        }

        return Math.max(0, Math.round(base / 5) * 5);
    }

    /**
     * @param {string} towerId
     * @param {number} x
     * @param {number} y
     * @returns {*} the placed Tower/HeroTower, or null
     */
    placeTower(towerId, x, y) {
        const def = resolveDef(towerId);
        if (!def) return null;
        if (!this.canPlaceAt(def, x, y).ok) return null;

        const price = this.priceFor(def, x, y);
        if (this.state.cash < price) return null;

        this.state.cash -= price;
        this.bus.emit('cash', { cash: this.state.cash });

        let tower;
        if (def.isHero) {
            tower = new HeroTower(this, def, x, y);
            this._heroPlaced = true;
        } else {
            tower = new Tower(this, def, x, y);
        }
        tower.totalInvested = price;
        this.towers.push(tower);

        this.bus.emit('tower:place', { tower });
        this.fx.spawn('blockShards', x, y, { count: 8, color: '#c9c9c9' });
        this.sfx.play('place');
        return tower;
    }

    /**
     * @param {*} tower
     * @param {number} pathIdx
     * @returns {boolean}
     */
    buyUpgrade(tower, pathIdx) {
        const can = tower.canUpgrade(pathIdx);
        // Reject only for structural reasons; recompute affordability with the
        // discounted price (canUpgrade's own cash check is undiscounted).
        if (!can.ok && can.reason !== 'cash') return false;
        if (typeof can.cost !== 'number') return false;

        const price = this.priceFor(can.cost, tower.x, tower.y);
        if (this.state.cash < price) return false;

        this.state.cash -= price;
        this.bus.emit('cash', { cash: this.state.cash });

        tower.applyUpgrade(pathIdx);
        tower.totalInvested += price;
        const tier = tower.tiers[pathIdx];

        this.bus.emit('tower:upgrade', { tower, path: pathIdx, tier });
        this.fx.spawn('spark', tower.x, tower.y, { count: 12, color: PATH_COLORS[pathIdx] });
        this.sfx.play('upgrade');
        return true;
    }

    /**
     * @param {*} tower
     * @returns {number} refund
     */
    sellTower(tower) {
        const idx = this.towers.indexOf(tower);
        if (idx < 0) return 0;

        const refund = tower.sellValue();
        this.towers.splice(idx, 1);
        if (tower.isHero) this._heroPlaced = false;
        if (this.selectedTower === tower) this.selectTower(null);

        this.state.cash += refund;
        this.bus.emit('cash', { cash: this.state.cash });
        this.bus.emit('tower:sell', { tower, refund });
        this.fx.spawn('coin', tower.x, tower.y, { count: 6 });
        this.sfx.play('sell');
        return refund;
    }

    /**
     * Buy one instant hero level. cost = floor(150 * level^1.5).
     * @param {*} tower
     * @returns {boolean}
     */
    buyHeroLevel(tower) {
        if (!tower.isHero) return false;
        if (tower.level >= 20) return false;
        const cost = Math.floor(150 * Math.pow(tower.level, 1.5));
        if (this.state.cash < cost) return false;

        this.state.cash -= cost;
        this.bus.emit('cash', { cash: this.state.cash });
        tower.addXp(tower.xpToNext());
        this.sfx.play('hero_level');
        return true;
    }

    /**
     * @param {*} tower
     * @param {string} mode
     * @returns {boolean}
     */
    setTargetMode(tower, mode) {
        if (TARGET_MODES.indexOf(mode) === -1) return false;
        tower.targetMode = mode;
        return true;
    }

    // ---------------- selection ----------------

    selectTower(t) {
        const next = t || null;
        if (this.selectedTower === next) return;
        if (this.selectedTower) this.selectedTower.selected = false;
        this.selectedTower = next;
        if (next) next.selected = true;
        this.bus.emit('tower:select', { tower: next });
    }

    // ---------------- rounds ----------------

    get finalRound() {
        return this.difficulty.rounds;
    }

    /** Begin the next round. Valid from 'idle' (normal) or 'won' (freeplay). */
    startRound() {
        if (this.state.phase !== 'idle' && this.state.phase !== 'won') return;

        const n = this.state.round + 1;
        if (n > this.finalRound) this.state.freeplay = true;
        this.state.phase = 'combat';
        this.waveManager.startRound(n);

        for (let i = 0; i < this.towers.length; i++) {
            this._runHooks(this.towers[i], 'onRoundStart', { game: this, tower: this.towers[i], round: n });
        }
    }

    _runHooks(tower, name, ctx) {
        const hooks = tower.hooks && tower.hooks[name];
        if (!hooks || hooks.length === 0) return;
        for (let i = 0; i < hooks.length; i++) {
            const fn = hooks[i];
            try {
                fn(ctx);
            } catch (e) {
                if (!fn._warned) {
                    fn._warned = true;
                    // eslint-disable-next-line no-console
                    console.warn('[hook] ' + name + ' threw:', e && e.message ? e.message : e);
                }
            }
        }
    }

    // ---------------- tick ----------------

    /**
     * Advance the simulation one fixed step.
     * Order: waves -> mobs -> towers -> units -> projectiles/zones -> abilities
     *        -> grid rebuild -> cleanup -> round-end.
     * @param {number} dt
     */
    update(dt) {
        this.tick++;
        this.time += dt;
        if (this.state.phase === 'over') return;

        if (this.state.phase === 'combat') this.waveManager.update(dt);

        // Mobs (snapshot count so mobs spawned this tick wait until next tick).
        const mobCount = this.mobs.length;
        for (let i = 0; i < mobCount; i++) {
            const m = this.mobs[i];
            if (m.alive) m.update(dt, this);
        }

        // Leaks may have ended the run.
        if (this.state.lives <= 0) {
            this._gameOver();
            return;
        }

        for (let i = 0; i < this.towers.length; i++) this.towers[i].update(dt, this);

        for (let i = 0; i < this.units.length; i++) this.units[i].update(dt, this);

        updateProjectiles(this, dt);
        for (let i = 0; i < this.zones.length; i++) {
            const z = this.zones[i];
            if (typeof z.update === 'function') z.update(dt, this);
        }

        AbilityRuntime.update(this, dt);

        this.grid.rebuild(this.mobs);
        this._cleanup();
        this._checkRoundEnd();
    }

    _gameOver() {
        this.state.phase = 'over';
        this.waveManager.stop();
        this.mobs.length = 0;
        this.bus.emit('game:over', { round: this.currentRound });
        this.sfx.play('defeat');
    }

    _cleanup() {
        // Mobs.
        let w = 0;
        const mobs = this.mobs;
        for (let i = 0; i < mobs.length; i++) if (mobs[i].alive) mobs[w++] = mobs[i];
        mobs.length = w;

        // Units.
        w = 0;
        const units = this.units;
        for (let i = 0; i < units.length; i++) if (!this._entityDead(units[i])) units[w++] = units[i];
        units.length = w;

        // Zones.
        w = 0;
        const zones = this.zones;
        for (let i = 0; i < zones.length; i++) if (!this._zoneDead(zones[i])) zones[w++] = zones[i];
        zones.length = w;

        // Projectiles are pooled and reclaimed inside updateProjectiles().
    }

    _entityDead(u) {
        return u.dead === true || u.alive === false ||
            (typeof u.hp === 'number' && u.hp <= 0) ||
            (typeof u.life === 'number' && u.life <= 0);
    }

    _zoneDead(z) {
        return z.dead === true || z.alive === false ||
            (typeof z.duration === 'number' && z.duration <= 0) ||
            (typeof z.remaining === 'number' && z.remaining <= 0);
    }

    _checkRoundEnd() {
        if (this.state.phase !== 'combat') return;
        if (this.waveManager.roundActive) return;

        const n = this.currentRound;
        // PVP suppresses the flat round bonus (eco is driven by pvpmatch instead).
        const bonus = this.modeFlags.noRoundBonus ? 0 : this.economy.endOfRound(this, n);

        for (let i = 0; i < this.towers.length; i++) {
            this._runHooks(this.towers[i], 'onRoundEnd', { game: this, tower: this.towers[i], round: n });
        }
        for (let i = 0; i < this.towers.length; i++) {
            const t = this.towers[i];
            if (t.isHero && typeof t.addXp === 'function') t.addXp(60 + 8 * n);
        }

        this.state.round = n;
        this.state.phase = 'idle';
        this.bus.emit('round:end', { round: n, bonus });
        this.bus.emit('round:ready', {});

        if (this.state.round >= this.finalRound && !this._wonEmitted) {
            this._wonEmitted = true;
            this.state.phase = 'won';
            this.bus.emit('game:won', { round: this.state.round });
            this.sfx.play('victory');
        }
    }

    // ---------------- determinism checksum ----------------

    /**
     * FNV-1a-32 over a canonical state stream (contract Section 1.1). Two sims
     * that agree here have identical authoritative state; a mismatch triggers a
     * resync. Order is fixed and MUST match on client and server -- this is the
     * single source of truth for both.
     * @returns {number} uint32
     */
    checksum() {
        const st = this.state;
        const phaseIndex = st.phase === 'combat' ? 1
            : (st.phase === 'won' ? 2 : (st.phase === 'over' ? 3 : 0));

        let h = 0x811c9dc5;                 // FNV offset basis
        h = _fnv(h, this.rng.getState());
        h = _fnv(h, this.tick);
        h = _fnv(h, Math.round(st.cash));
        h = _fnv(h, st.lives);
        h = _fnv(h, st.round);
        h = _fnv(h, this.currentRound);
        h = _fnv(h, phaseIndex);
        h = _fnv(h, this.mobs.length);
        h = _fnv(h, this.towers.length);
        h = _fnv(h, this.units.length);
        h = _fnv(h, this.zones.length);

        const mobs = this.mobs;
        for (let i = 0; i < mobs.length; i++) {
            const m = mobs[i];
            h = _fnv(h, Math.round(m.x * 256));
            h = _fnv(h, Math.round(m.y * 256));
            h = _fnv(h, Math.round(m.hp * 256));
        }

        const towers = this.towers;
        for (let i = 0; i < towers.length; i++) {
            const t = towers[i];
            h = _fnv(h, t.uid);
            h = _fnv(h, t.tiers[0]);
            h = _fnv(h, t.tiers[1]);
            h = _fnv(h, t.tiers[2]);
            // Appendix W item 2: hero progression was a checksum blind spot.
            h = _fnv(h, t.isHero ? t.level : 0);
            h = _fnv(h, t.isHero ? Math.round(t.xp) : 0);
        }

        return h >>> 0;
    }

    // ---------------- save / load (between rounds) ----------------

    /** @returns {object} run snapshot (Section 9 schema) */
    snapshot() {
        return {
            v: 1,
            mapId: this.map.id,
            difficulty: this.difficultyId,
            round: this.state.round,
            cash: this.state.cash,
            lives: this.state.lives,
            freeplay: this.state.freeplay,
            towers: this.towers.map((t) => ({
                id: t.def.id,
                x: t.x,
                y: t.y,
                tiers: t.tiers.slice(),
                targetMode: t.targetMode,
                invested: t.totalInvested,
                kills: t.kills || 0,
                damageDealt: t.damageDealt || 0,
                heroXp: t.isHero ? t.xp : undefined,
            })),
            // Wall-clock stamp for the save UI only -- never read by the sim.
            timestamp: (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0,
        };
    }

    /**
     * Rebuild a Game from a snapshot. Towers are reconstructed by re-applying
     * their tiers (no cash), heroes by re-feeding xp.
     * @param {object} data
     * @param {*} mapDef
     * @returns {Game}
     */
    static restore(data, mapDef) {
        const game = new Game({ mapDef, difficulty: data.difficulty, seed: 1234, headless: true });

        game.state.cash = data.cash;
        game.state.lives = data.lives;
        game.state.round = data.round;
        game.state.freeplay = !!data.freeplay;
        game.currentRound = data.round;

        for (const ts of data.towers || []) {
            const def = resolveDef(ts.id);
            if (!def) continue;

            let tower;
            if (def.isHero) {
                tower = new HeroTower(game, def, ts.x, ts.y);
                game._heroPlaced = true;
            } else {
                tower = new Tower(game, def, ts.x, ts.y);
            }

            const tiers = ts.tiers || [0, 0, 0];
            for (let p = 0; p < 3; p++) {
                const target = tiers[p] || 0;
                for (let k = 0; k < target; k++) tower.applyUpgrade(p);
            }

            tower.targetMode = ts.targetMode || 'first';
            tower.totalInvested = ts.invested || 0;
            tower.kills = ts.kills || 0;
            tower.damageDealt = ts.damageDealt || 0;
            if (def.isHero && typeof ts.heroXp === 'number' && typeof tower.addXp === 'function') {
                tower.addXp(ts.heroXp);
            }

            game.towers.push(tower);
        }

        if (game.state.round >= game.finalRound) {
            game._wonEmitted = true;
            game.state.phase = 'won';
        } else {
            game.state.phase = 'idle';
        }

        return game;
    }
}
