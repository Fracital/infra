// Tower: the core defensive unit. Headless-safe.
//
// A tower is a thin runtime shell around a declarative TowerDef (data/towers/*).
// recomputeStats() rebuilds effective stats from scratch on every purchase so the
// order of effects is always deterministic (base -> path0 -> path1 -> path2 ->
// hero levels -> support buffs). Behavior lives in inline functions on the def
// which are folded into hook arrays here and invoked by attacks.js / game.js.

import { SELL_RATIO } from '../core/constants.js';
import { Economy } from './economy.js';
import { updateTowerAttacks } from './attacks.js';

// One warning per unique bad stat path, so a typo in a def is loud but not spammy.
const _warnedPaths = new Set();
// One warning per throwing hook function, so a broken behavior cannot flood the log.
const _warnedHooks = new WeakSet();

/**
 * Deep clone that preserves FUNCTIONS and non-plain objects BY REFERENCE.
 * structuredClone throws on functions and JSON.parse(JSON.stringify()) silently
 * drops them; tower defs carry inline behavior functions we must keep callable.
 * Only plain objects and arrays are recursed into; everything else is passed
 * through (functions, class instances, primitives).
 * @param {*} v
 * @returns {*}
 */
export function cloneDef(v) {
    if (Array.isArray(v)) {
        const out = new Array(v.length);
        for (let i = 0; i < v.length; i++) out[i] = cloneDef(v[i]);
        return out;
    }
    if (v && typeof v === 'object') {
        const proto = Object.getPrototypeOf(v);
        if (proto === Object.prototype || proto === null) {
            const out = {};
            for (const k in v) {
                if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = cloneDef(v[k]);
            }
            return out;
        }
        // Non-plain object (Map, class instance, etc.) -> keep by reference.
        return v;
    }
    // Functions and primitives -> by reference / by value.
    return v;
}

/** Run one hook fn with the error containment the contract (6.4) demands. */
export function runHook(fn, ctx) {
    try {
        fn(ctx);
    } catch (err) {
        if (!_warnedHooks.has(fn)) {
            _warnedHooks.add(fn);
            // eslint-disable-next-line no-console
            console.warn('[towers] hook threw (suppressed further):', err);
        }
    }
}

/** Run every hook of a given name on a tower. */
export function runTowerHooks(tower, name, ctx) {
    const arr = tower.hooks && tower.hooks[name];
    if (!arr || arr.length === 0) return;
    for (let i = 0; i < arr.length; i++) runHook(arr[i], ctx);
}

function localClamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
}

export class Tower {
    constructor(game, def, x, y) {
        this.game = game;
        // Per-game uid (game._uidCounter). A module-level counter would leak
        // ids across games -- breaking replays and any server process hosting
        // multiple rooms. HeroTower inherits this via super().
        this.uid = game._uidCounter++;
        this.def = def;
        this.x = x;
        this.y = y;
        this.tiers = [0, 0, 0];
        this.isHero = false;

        // Default 'close' for melee towers, 'first' for everything else.
        const meleeBase = !!(def && def.base && Array.isArray(def.base.attacks) &&
            def.base.attacks.some((a) => a.kind === 'melee'));
        this.targetMode = def && def.defaultTargetMode ? def.defaultTargetMode : (meleeBase ? 'close' : 'first');

        this.stats = null;
        this.cooldowns = [];
        this.atkState = [];
        this.buffs = new Map();
        this.abilities = [];
        this.abilityState = new Map();
        this.hooks = { onFire: [], onHit: [], onKill: [], onTick: [], onRoundStart: [], onRoundEnd: [] };

        this.totalInvested = def && typeof def.cost === 'number' ? def.cost : 0;
        this.selected = false;
        this.kills = 0;
        this.damageDealt = 0;
        this.drawFrame = 0;
        this.stunnedUntil = 0;
        this.age = 0;
        this._ownCamoDetect = false;
        this._hadBuffs = false;

        this.recomputeStats();
    }

    /**
     * Rebuild `this.stats` from the def and all purchased upgrades. Deterministic
     * and idempotent: called after every tier purchase and every hero level.
     */
    recomputeStats() {
        const stats = cloneDef(this.def.base) || {};
        if (!Array.isArray(stats.attacks)) stats.attacks = [];
        this.stats = stats;

        this.hooks = { onFire: [], onHit: [], onKill: [], onTick: [], onRoundStart: [], onRoundEnd: [] };
        this.abilities = [];

        const paths = this.def.paths || [];
        for (let p = 0; p < paths.length; p++) {
            const ups = paths[p].upgrades || [];
            const n = this.tiers[p] | 0;
            for (let t = 0; t < n && t < ups.length; t++) {
                this._applyEffects(ups[t].effects);
            }
        }

        // Hero levels (base Tower: no-op; HeroTower folds level effects here so
        // the buff layer below cannot wipe them).
        this._foldProgression();

        // Synthesize end-of-round income hooks for 'income'/'roundEnd' attacks.
        this._synthIncomeHooks();

        this._ownCamoDetect = !!stats.camoDetect;

        // Preserve per-attack timer state where indices still line up.
        const oldCd = this.cooldowns || [];
        const oldSt = this.atkState || [];
        this.cooldowns = stats.attacks.map((a, i) => (i < oldCd.length ? oldCd[i] : 0));
        this.atkState = stats.attacks.map((a, i) => (i < oldSt.length && oldSt[i] ? oldSt[i] : {}));

        this._recomputeBuffLayer();
    }

    /** Overridden by HeroTower. */
    _foldProgression() { /* base towers have no extra progression */ }

    _synthIncomeHooks() {
        const attacks = this.stats.attacks;
        for (let i = 0; i < attacks.length; i++) {
            const atk = attacks[i];
            if (atk && atk.kind === 'income' && atk.when === 'roundEnd') {
                const amount = atk.amount || 0;
                const tower = this;
                this.hooks.onRoundEnd.push(function (ctx) {
                    Economy.award(ctx.game, amount, tower.x, tower.y);
                });
            }
        }
    }

    /** Apply one upgrade/level's effect list into stats + hooks + abilities. */
    _applyEffects(effects) {
        if (!Array.isArray(effects)) return;
        for (let i = 0; i < effects.length; i++) {
            const ef = effects[i];
            if (!ef) continue;
            switch (ef.type) {
                case 'stat':
                    this._applyStat(ef);
                    break;
                case 'flag':
                    this.stats[ef.flag] = true;
                    break;
                case 'attackAdd':
                    this.stats.attacks.push(cloneDef(ef.attack));
                    break;
                case 'attackReplace': {
                    const len = this.stats.attacks.length;
                    if (len === 0) { this.stats.attacks.push(cloneDef(ef.attack)); break; }
                    const idx = localClamp(ef.index | 0, 0, len - 1);
                    this.stats.attacks[idx] = cloneDef(ef.attack);
                    break;
                }
                case 'behavior':
                    if (this.hooks[ef.hook]) this.hooks[ef.hook].push(ef.fn);
                    break;
                case 'ability':
                    this.abilities.push({ def: ef.ability, tower: this });
                    break;
                default:
                    break;
            }
        }
    }

    _applyStat(ef) {
        const parts = ef.target.split('.');
        let obj = this.stats;
        for (let i = 0; i < parts.length - 1; i++) {
            if (obj == null || typeof obj !== 'object') { this._warnPath(ef.target); return; }
            obj = obj[parts[i]];
        }
        if (obj == null || typeof obj !== 'object') { this._warnPath(ef.target); return; }
        const last = parts[parts.length - 1];
        const cur = obj[last];
        if ('add' in ef) obj[last] = (typeof cur === 'number' ? cur : 0) + ef.add;
        else if ('mul' in ef) obj[last] = (typeof cur === 'number' ? cur : 0) * ef.mul;
        else if ('set' in ef) obj[last] = ef.set;
    }

    _warnPath(target) {
        if (_warnedPaths.has(target)) return;
        _warnedPaths.add(target);
        // eslint-disable-next-line no-console
        console.warn('[towers] stat path missing on ' + this.def.id + ': ' + target);
    }

    /** Fold current buff multipliers into stats.effective + convenience fields. */
    _recomputeBuffLayer() {
        let dmg = 1, spd = 1, rng = 1, pierce = 0, camo = false;
        for (const b of this.buffs.values()) {
            const m = b.mults || {};
            if (m.damage) dmg *= m.damage;
            if (m.attackSpeed) spd *= m.attackSpeed;
            if (m.range) rng *= m.range;
            if (m.pierce) pierce += m.pierce;
            if (b.flags && b.flags.camoDetect) camo = true;
        }
        const eff = this.stats.effective || (this.stats.effective = {});
        eff.damageMul = dmg;
        eff.attackSpeedMul = spd;
        eff.rangeMul = rng;
        eff.pierceAdd = pierce;
        this.stats.damageMul = dmg;
        this.stats.attackSpeedMul = spd;
        this.stats.rangeMul = rng;
        this.stats.pierceAdd = pierce;
        this.stats.camoDetect = this._ownCamoDetect || camo;
    }

    /** Add/replace a support buff (same id replaces -- no same-source stacking). */
    addBuff(buff) {
        if (!buff || buff.id == null) return;
        this.buffs.set(buff.id, buff);
        this._recomputeBuffLayer();
    }

    update(dt, game) {
        this.age += dt;

        if (this.buffs.size > 0) {
            let expired = false;
            for (const [id, b] of this.buffs) {
                b.dur -= dt;
                if (b.dur <= 0) { this.buffs.delete(id); expired = true; }
            }
            this._recomputeBuffLayer();
            this._hadBuffs = true;
        } else if (this._hadBuffs) {
            this._recomputeBuffLayer();
            this._hadBuffs = false;
        }

        runTowerHooks(this, 'onTick', { game, tower: this, dt });
        updateTowerAttacks(this, dt, game);
    }

    /** Cost of the NEXT tier on a path, or null if maxed / no such path. */
    upgradeCost(pathIdx) {
        const path = this.def.paths && this.def.paths[pathIdx];
        if (!path) return null;
        const tier = this.tiers[pathIdx];
        if (tier >= 5) return null;
        const up = path.upgrades[tier];
        return up ? up.cost : null;
    }

    /**
     * BTD6 crosspath law: max tier 5; at most two paths may have any tiers; only
     * one path may exceed tier 2.
     * @returns {{ok:boolean, reason:(string|null), cost:(number|null)}}
     */
    canUpgrade(pathIdx) {
        const path = this.def.paths && this.def.paths[pathIdx];
        if (!path) return { ok: false, reason: 'maxed', cost: null };
        const tiers = this.tiers;
        const cur = tiers[pathIdx];
        if (cur >= 5) return { ok: false, reason: 'maxed', cost: null };

        let active = 0;
        for (let i = 0; i < 3; i++) if (tiers[i] > 0) active++;
        // Starting a third path is illegal once two are already in use.
        if (cur === 0 && active >= 2) return { ok: false, reason: 'locked', cost: null };
        // Going past tier 2 is illegal if another path is already past tier 2.
        if (cur >= 2) {
            for (let i = 0; i < 3; i++) {
                if (i !== pathIdx && tiers[i] > 2) return { ok: false, reason: 'locked', cost: null };
            }
        }
        return { ok: true, reason: null, cost: path.upgrades[cur].cost };
    }

    /** Apply a tier on a path. No cash check (game.buyUpgrade owns the wallet). */
    applyUpgrade(pathIdx) {
        const path = this.def.paths && this.def.paths[pathIdx];
        if (!path) return;
        const tier = this.tiers[pathIdx];
        if (tier >= 5) return;
        const up = path.upgrades[tier];
        if (up && typeof up.cost === 'number') this.totalInvested += up.cost;
        this.tiers[pathIdx]++;
        this.recomputeStats();
    }

    sellValue() {
        return Math.floor(this.totalInvested * SELL_RATIO);
    }
}
