// Hero towers: auto-leveling command units. Headless-safe.
//
// A HeroTower is a Tower whose progression comes from levels (1..20) rather than
// purchasable paths. Level effects use the same UpgradeDef effect schema and are
// folded in during recomputeStats() -- AFTER the (empty) path upgrades and BEFORE
// the support-buff layer -- so incoming buffs can never wipe a hero's levels.

import { Tower } from './towers.js';

export class HeroTower extends Tower {
    constructor(game, def, x, y) {
        // Base ctor runs recomputeStats(); _foldProgression() below is guarded
        // against appliedLevels being undefined during that first pass.
        super(game, def, x, y);
        this.isHero = true;
        this._level = 1;
        this.xp = 0;
        this.appliedLevels = [];
        // Rebuild now that hero state exists (no levels yet, but establishes the
        // invariant that stats always reflect appliedLevels).
        this.recomputeStats();
    }

    get level() {
        return this._level;
    }

    /** Fold every earned level's effects into stats. Called by recomputeStats. */
    _foldProgression() {
        if (!this.appliedLevels) return; // first pass during super() -- nothing yet
        for (let i = 0; i < this.appliedLevels.length; i++) {
            this._applyEffects(this.appliedLevels[i].effects);
        }
    }

    /** XP required to advance from the current level. */
    xpToNext() {
        return Math.floor(120 * Math.pow(this._level, 1.6));
    }

    /** Insta-level cost for game.buyHeroLevel(). */
    levelUpCost() {
        return Math.floor(150 * Math.pow(this._level, 1.5));
    }

    /** Add XP, resolving as many level-ups as it funds (multi-level safe). */
    addXp(n) {
        if (this._level >= 20) return;
        this.xp += n;
        let leveled = false;
        while (this._level < 20 && this.xp >= this.xpToNext()) {
            this.xp -= this.xpToNext();
            this._gainLevel(false);
            leveled = true;
        }
        if (leveled) this._afterLevel();
    }

    /** Force a single level (paid insta-level). */
    levelUp() {
        if (this._level >= 20) return false;
        this._gainLevel(true);
        return true;
    }

    _gainLevel(emit) {
        this._level++;
        const lvDef = this.def.levels && this.def.levels[this._level - 2];
        if (lvDef) this.appliedLevels.push(lvDef);
        this.recomputeStats();
        if (emit) this._afterLevel();
    }

    _afterLevel() {
        const g = this.game;
        if (!g) return;
        if (g.bus) g.bus.emit('hero:level', { tower: this, level: this._level });
        if (g.fx && g.fx.spawn) g.fx.spawn('emerald', this.x, this.y, { count: 14 });
        if (g.sfx) g.sfx.play('hero_level');
    }
}
