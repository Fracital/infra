// Ally minions summoned by towers (wolves, allays, skeletons, turrets, drones).
// Headless-safe.
//
// Units are invulnerable except for their lifespan (hp is tracked for future
// use); they seek the nearest targetable mob within a leash of their spawn tower
// and attack on cooldown. Kills and damage credit the summoning tower via the
// shared dealHit() path so tower stats and onKill behaviors stay consistent.

import { findTargets } from './targeting.js';
import { spawnProjectile, explodeAoe } from './projectiles.js';
import { dealHit } from './attacks.js';

/**
 * Tuned unit archetypes. `ranged` units fire homing projectiles; melee units
 * strike on contact; `static` units never move; `oneShot` (tnt_drone) flies to
 * the strongest mob and detonates.
 */
export const UNIT_TYPES = {
    wolf: {
        hp: 40, damage: 3, damageType: 'sharp', cooldown: 0.7, speed: 120,
        range: 24, life: 999, ranged: false, sfx: 'wolf_bite',
    },
    dire_wolf: {
        hp: 90, damage: 8, damageType: 'sharp', cooldown: 0.7, speed: 132,
        range: 26, life: 999, ranged: false, sfx: 'wolf_bite',
    },
    frost_wolf: {
        hp: 60, damage: 5, damageType: 'cold', cooldown: 0.8, speed: 120,
        range: 24, life: 999, ranged: false, sfx: 'wolf_bite',
        status: { id: 'slow', power: 0.6, duration: 1.2, damageType: 'cold' },
    },
    allay: {
        hp: 20, damage: 2, damageType: 'magic', cooldown: 0.6, speed: 150,
        range: 130, life: 999, ranged: true, flying: true, camoDetect: true,
        projectile: 'magic', projSpeed: 420, sfx: 'zap',
    },
    skeleton_squad: {
        hp: 30, damage: 4, damageType: 'sharp', cooldown: 1.0, speed: 70,
        range: 140, life: 999, ranged: true, projectile: 'arrow', projSpeed: 560, sfx: 'arrow',
    },
    raised_dead: {
        hp: 25, damage: 5, damageType: 'sharp', cooldown: 0.8, speed: 90,
        range: 22, life: 12, ranged: false, sfx: 'melee_hit',
    },
    auto_turret: {
        hp: 40, damage: 3, damageType: 'sharp', cooldown: 0.25, speed: 0,
        range: 150, life: 30, ranged: true, static: true, projectile: 'arrow', projSpeed: 640, sfx: 'bolt',
    },
    tnt_drone: {
        hp: 10, damage: 40, damageType: 'explosive', cooldown: 0, speed: 220,
        range: 40, life: 15, ranged: false, flying: true, oneShot: true,
        aoe: 60, target: 'strong', camoDetect: true, sfx: 'explosion_medium',
    },
};

export class Unit {
    constructor(game, unitType, x, y, opts = {}) {
        this.game = game;
        this.type = unitType;
        const base = UNIT_TYPES[unitType] || UNIT_TYPES.wolf;
        this.def = base;
        this.x = x;
        this.y = y;
        this.hp = base.hp || 10;
        this.maxHp = this.hp;
        this.alive = true;
        this.life = base.life != null ? base.life : 999;
        this.cd = 0;
        this.angle = 0;
        this.drawFrame = 0;
        this._frameT = 0;
        this.flying = !!base.flying;
        this.target = null;
        this.source = opts.source || null;
        this.leashX = opts.leashX != null ? opts.leashX : x;
        this.leashY = opts.leashY != null ? opts.leashY : y;
        this.leashRange = opts.leashRange != null ? opts.leashRange : (base.range ? base.range * 5 : 180);

        // Synthetic AttackDef reused for every strike so dealHit / spawnProjectile
        // treat unit hits exactly like tower hits.
        this._atk = {
            kind: base.ranged ? 'projectile' : 'melee',
            damage: base.damage || 1,
            pierce: 1,
            damageType: base.damageType || 'sharp',
            status: base.status || null,
            aoe: base.aoe || 0,
            camoDetect: !!base.camoDetect,
            projectile: base.ranged
                ? { sprite: base.projectile || 'arrow', speed: base.projSpeed || 520, lifetime: 1.4, motion: 'homing', turnRate: 8 }
                : null,
            sfx: base.sfx || null,
        };
    }

    update(dt, game) {
        if (!this.alive) return;
        this._frameT += dt;
        this.drawFrame = Math.floor(this._frameT * 6) % 2;

        if (this.def.life != null && this.def.life < 900) {
            this.life -= dt;
            if (this.life <= 0) { this.alive = false; return; }
        }
        if (this.cd > 0) this.cd -= dt;

        if (this.def.oneShot) { this._updateDrone(dt, game); return; }

        const groundOnly = !(this.def.ranged || this.flying);
        const t = findTargets(game, this.leashX, this.leashY, this.leashRange, {
            mode: this.def.target || 'close',
            count: 1,
            camoDetect: !!this.def.camoDetect,
            groundOnly,
        })[0] || null;
        this.target = t;

        const spd = this.def.speed || 0;
        if (t) {
            const dx = t.x - this.x;
            const dy = t.y - this.y;
            const d = Math.hypot(dx, dy);
            const reach = (this.def.range || 20) + (t.radius || 0);
            if (d > reach && spd > 0 && !this.def.static) {
                this._moveToward(t.x, t.y, spd * dt);
                this.angle = Math.atan2(dy, dx);
            } else if (d <= reach) {
                this.angle = Math.atan2(dy, dx);
                if (this.cd <= 0) {
                    this._attack(t, game);
                    this.cd = this.def.cooldown || 0.7;
                }
            }
        } else if (spd > 0 && !this.def.static) {
            const dl = Math.hypot(this.leashX - this.x, this.leashY - this.y);
            if (dl > 2) {
                this._moveToward(this.leashX, this.leashY, spd * dt);
                this.angle = Math.atan2(this.leashY - this.y, this.leashX - this.x);
            }
        }
    }

    _moveToward(tx, ty, step) {
        const a = Math.atan2(ty - this.y, tx - this.x);
        let nx = this.x + Math.cos(a) * step;
        let ny = this.y + Math.sin(a) * step;
        const ld = Math.hypot(nx - this.leashX, ny - this.leashY);
        if (ld > this.leashRange) {
            const la = Math.atan2(ny - this.leashY, nx - this.leashX);
            nx = this.leashX + Math.cos(la) * this.leashRange;
            ny = this.leashY + Math.sin(la) * this.leashRange;
        }
        this.x = nx;
        this.y = ny;
    }

    _attack(t, game) {
        if (this.def.ranged) {
            const a = Math.atan2(t.y - this.y, t.x - this.x);
            spawnProjectile(game, {
                x: this.x, y: this.y, angle: a, atk: this._atk, source: this.source || this,
                motion: 'homing', speed: this._atk.projectile.speed,
                lifetime: this._atk.projectile.lifetime, turnRate: 8, target: t,
            });
            if (game.sfx && this._atk.sfx) game.sfx.play(this._atk.sfx);
        } else {
            dealHit(game, this.source || this, t, this._atk, {});
            if (game.sfx && this.def.sfx) game.sfx.play(this.def.sfx);
        }
    }

    _updateDrone(dt, game) {
        let t = this.target;
        if (!t || !t.alive) {
            t = findTargets(game, this.x, this.y, 2000, { mode: 'strong', count: 1, camoDetect: true })[0] || null;
            this.target = t;
        }
        const spd = this.def.speed || 200;
        if (t) {
            const a = Math.atan2(t.y - this.y, t.x - this.x);
            this.angle = a;
            this.x += Math.cos(a) * spd * dt;
            this.y += Math.sin(a) * spd * dt;
            if (Math.hypot(t.x - this.x, t.y - this.y) <= (this.def.aoe || 60) * 0.4) {
                this._detonate(game);
                return;
            }
        }
        if (this.alive && this.life <= 0) this._detonate(game);
    }

    _detonate(game) {
        explodeAoe(game, this.x, this.y, this.def.aoe || 60, this._atk, this.source || this);
        if (game.sfx) game.sfx.play('explosion_medium');
        this.alive = false;
    }
}
