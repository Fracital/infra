// Projectiles + ground zones. Headless-safe.
//
// Everything here is pooled (core/pool) because a late-game board throws hundreds
// of darts, snowballs and lightning bolts per second. Motions are hand-written
// integrators rather than a generic physics step so each weapon feels distinct.

import { Pool } from '../core/pool.js';
import { dealHit } from './attacks.js';
import { findTargets } from './targeting.js';

const PROJ_HIT = 6;      // projectile body half-width added to a mob's radius
const QUERY_R = 64;      // grid query radius: covers the largest boss (r=55) + slack

function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

/** Steer `cur` toward `target`, at most `maxStep` radians. */
function steer(cur, target, maxStep) {
    const d = angDiff(target, cur);
    if (d > maxStep) return cur + maxStep;
    if (d < -maxStep) return cur - maxStep;
    return target;
}

function sourceDetects(source, atk) {
    if (atk && atk.camoDetect) return true;
    return !!(source && source.stats && source.stats.camoDetect);
}

function camoBlocked(m, source, atk) {
    return m.modifiers && m.modifiers.camo && !sourceDetects(source, atk);
}

/**
 * Apply an area-of-effect blast: all mobs (camo + flying included) within
 * `radius` take a hit, plus explosion fx. Shared by projectiles and tnt drones.
 */
export function explodeAoe(game, x, y, radius, atk, source) {
    const mobs = game.grid ? game.grid.queryCircle(x, y, radius + QUERY_R) : (game.mobs || []);
    for (let i = 0; i < mobs.length; i++) {
        const m = mobs[i];
        if (!m.alive) continue;
        const reach = radius + (m.radius || 0);
        const dx = m.x - x;
        const dy = m.y - y;
        if (dx * dx + dy * dy > reach * reach) continue;
        dealHit(game, source, m, atk, { aoe: true });
    }
    if (game.fx) {
        game.fx.explosion(x, y, radius, (atk && atk.explosionStyle) || 'tnt');
    }
}

export class Projectile {
    constructor() {
        this.alive = false;
        this.hitSet = new Set();
        this.contact = new Map();
    }

    init(game, spec) {
        this.game = game;
        this.alive = true;
        this.age = 0;
        this.atk = spec.atk;
        this.source = spec.source || null;
        this.motion = spec.motion || 'straight';

        const proj = (spec.atk && spec.atk.projectile) || {};
        this.speed = spec.speed || proj.speed || 600;
        this.lifetime = spec.lifetime || proj.lifetime || 2;
        this.aoe = spec.aoe || (spec.atk && spec.atk.aoe) || 0;
        this.turnRate = spec.turnRate || proj.turnRate || 0;
        this.sprite = proj.sprite || 'arrow';
        this.pierce = ((spec.atk && spec.atk.pierce) || 1) +
            ((spec.source && spec.source.stats && spec.source.stats.pierceAdd) || 0);

        this.hitSet.clear();
        this.contact.clear();
        this.x = spec.x;
        this.y = spec.y;
        this.arcHeight = 0;
        this.shadow = false;
        this.target = spec.target || null;

        let ang = (spec.angle != null) ? spec.angle
            : (this.target ? Math.atan2(this.target.y - this.y, this.target.x - this.x) : 0);
        this.angle = ang;
        this.vx = Math.cos(ang) * this.speed;
        this.vy = Math.sin(ang) * this.speed;

        if (this.motion === 'arc' || this.motion === 'mortar') {
            this.startX = this.x;
            this.startY = this.y;
            const land = spec.landing || (this.target ? { x: this.target.x, y: this.target.y } : { x: this.x, y: this.y });
            this.landingX = land.x;
            this.landingY = land.y;
            const d = Math.hypot(this.landingX - this.startX, this.landingY - this.startY);
            this.arcDur = Math.max(0.2, d / this.speed);
            this.arcPeak = Math.min(140, 30 + d * 0.16);
            this.arcT = 0;
            this.shadow = true;
        } else if (this.motion === 'boomerang') {
            this.originX = this.x;
            this.originY = this.y;
            this.maxRange = spec.range || (spec.atk && spec.atk.range) ||
                (spec.source && spec.source.stats && spec.source.stats.range) || 150;
            this.leg = 'out';
        } else if (this.motion === 'orbit') {
            this.orbitRadius = spec.radius || (spec.atk && spec.atk.orbitRadius) || 44;
            this.orbitSpeed = spec.orbitSpeed || 3.2;
            this.orbitAngle = spec.angle || 0;
        }
        return this;
    }

    update(dt, game) {
        this.age += dt;
        if (this.motion === 'straight' || this.motion === 'homing' || this.motion === 'boomerang') {
            if (this.age >= this.lifetime) { this._expire(game); return; }
        }
        switch (this.motion) {
            case 'homing': this._moveHoming(dt, game); break;
            case 'arc':
            case 'mortar': this._moveArc(dt, game); break;
            case 'boomerang': this._moveBoomerang(dt, game); break;
            case 'orbit': this._moveOrbit(dt, game); break;
            case 'straight':
            default: this._moveStraight(dt, game); break;
        }
    }

    _moveStraight(dt, game) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this._collide(game);
    }

    _moveHoming(dt, game) {
        if (this.target && !this.target.alive) this.target = this._retarget(game);
        if (this.target) {
            const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            this.angle = steer(this.angle, desired, (this.turnRate || 6) * dt);
        }
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this._collide(game);
    }

    _retarget(game) {
        const found = findTargets(game, this.x, this.y, 260, {
            mode: 'close',
            count: 4,
            camoDetect: sourceDetects(this.source, this.atk),
        });
        for (let i = 0; i < found.length; i++) {
            if (!this.hitSet.has(found[i])) return found[i];
        }
        return null;
    }

    _moveArc(dt, game) {
        this.arcT += dt;
        const t = Math.min(1, this.arcT / this.arcDur);
        this.x = this.startX + (this.landingX - this.startX) * t;
        this.y = this.startY + (this.landingY - this.startY) * t;
        this.arcHeight = Math.sin(t * Math.PI) * this.arcPeak;
        if (t >= 1) {
            explodeAoe(game, this.landingX, this.landingY, this.aoe || 40, this.atk, this.source);
            this.alive = false;
        }
    }

    _moveBoomerang(dt, game) {
        const sp = this.speed;
        this.angle += 12 * dt; // visual spin
        if (this.leg === 'out') {
            this.x += Math.cos(this._outAngle()) * sp * dt;
            this.y += Math.sin(this._outAngle()) * sp * dt;
            if (Math.hypot(this.x - this.originX, this.y - this.originY) >= this.maxRange) {
                this.leg = 'return';
                this.hitSet.clear(); // second leg can hit the same mobs again
            }
        } else {
            const cx = this.source ? this.source.x : this.originX;
            const cy = this.source ? this.source.y : this.originY;
            const a = Math.atan2(cy - this.y, cx - this.x);
            this.x += Math.cos(a) * sp * dt;
            this.y += Math.sin(a) * sp * dt;
            if (Math.hypot(cx - this.x, cy - this.y) < 10) { this.alive = false; return; }
        }
        this._collide(game);
    }

    _outAngle() {
        if (this._cachedOut == null) this._cachedOut = Math.atan2(this.vy, this.vx);
        return this._cachedOut;
    }

    _moveOrbit(dt, game) {
        this.orbitAngle += this.orbitSpeed * dt;
        const cx = this.source ? this.source.x : this.x;
        const cy = this.source ? this.source.y : this.y;
        this.x = cx + Math.cos(this.orbitAngle) * this.orbitRadius;
        this.y = cy + Math.sin(this.orbitAngle) * this.orbitRadius;
        this.angle = this.orbitAngle + Math.PI / 2;

        for (const [m, t] of this.contact) {
            const nt = t - dt;
            if (nt <= 0 || !m.alive) this.contact.delete(m);
            else this.contact.set(m, nt);
        }
        const mobs = game.grid ? game.grid.queryCircle(this.x, this.y, QUERY_R) : (game.mobs || []);
        for (let i = 0; i < mobs.length; i++) {
            const m = mobs[i];
            if (!m.alive || this.contact.has(m)) continue;
            if (camoBlocked(m, this.source, this.atk)) continue;
            const rr = (m.radius || 8) + PROJ_HIT;
            const dx = m.x - this.x;
            const dy = m.y - this.y;
            if (dx * dx + dy * dy > rr * rr) continue;
            dealHit(game, this.source, m, this.atk, { projectile: this });
            this.contact.set(m, 0.5);
        }
        if (this.age >= this.lifetime) this.alive = false;
    }

    _collide(game) {
        if (!this.alive) return;
        const mobs = game.grid ? game.grid.queryCircle(this.x, this.y, QUERY_R) : (game.mobs || []);
        for (let i = 0; i < mobs.length; i++) {
            const m = mobs[i];
            if (!m.alive || this.hitSet.has(m)) continue;
            if (camoBlocked(m, this.source, this.atk)) continue;
            const rr = (m.radius || 8) + PROJ_HIT;
            const dx = m.x - this.x;
            const dy = m.y - this.y;
            if (dx * dx + dy * dy > rr * rr) continue;
            this.hitSet.add(m);
            if (this.aoe > 0) {
                explodeAoe(game, this.x, this.y, this.aoe, this.atk, this.source);
                this.alive = false;
                return;
            }
            dealHit(game, this.source, m, this.atk, { projectile: this });
            this.pierce--;
            if (this.pierce <= 0) { this.alive = false; return; }
        }
    }

    _expire(game) {
        if (this.aoe > 0) explodeAoe(game, this.x, this.y, this.aoe, this.atk, this.source);
        this.alive = false;
    }
}

const projPool = new Pool(() => new Projectile(), (p) => {
    p.source = null;
    p.atk = null;
    p.target = null;
    p._cachedOut = null;
});

/**
 * Spawn a projectile from a pool and register it with the game.
 * @param {object} game
 * @param {object} spec {x, y, angle|target, atk, source, motion, speed, lifetime, aoe, landing, range}
 * @returns {Projectile}
 */
export function spawnProjectile(game, spec) {
    const p = projPool.get();
    p._cachedOut = null;
    p.init(game, spec);
    game.projectiles.push(p);
    return p;
}

export class Zone {
    constructor() {
        this.alive = false;
    }

    init(game, spec) {
        this.game = game;
        this.alive = true;
        this.x = spec.x;
        this.y = spec.y;
        this.atk = spec.atk;
        this.source = spec.source || null;
        this.radius = spec.radius || (spec.atk && spec.atk.zone && spec.atk.zone.radius) || 40;
        this.duration = spec.duration != null ? spec.duration : 3;
        this.tickRate = spec.tickRate || 0.5;
        this.charges = spec.charges != null ? spec.charges : null;
        this.groundOnly = spec.groundOnly !== false;
        this.color = spec.color || '#ffffff';
        this.kind = spec.kind || 'zone';
        this.age = 0;
        this.tickTimer = 0;
        return this;
    }

    update(dt, game) {
        this.age += dt;
        this.tickTimer += dt;
        while (this.tickTimer >= this.tickRate && this.alive) {
            this.tickTimer -= this.tickRate;
            this._tick(game);
        }
        if (this.duration != null && this.age >= this.duration) this.alive = false;
    }

    _tick(game) {
        const mobs = game.grid ? game.grid.queryCircle(this.x, this.y, this.radius + QUERY_R) : (game.mobs || []);
        for (let i = 0; i < mobs.length; i++) {
            const m = mobs[i];
            if (!m.alive) continue;
            if (this.groundOnly && m.flying) continue;
            const reach = this.radius + (m.radius || 0);
            const dx = m.x - this.x;
            const dy = m.y - this.y;
            if (dx * dx + dy * dy > reach * reach) continue;
            const dealt = dealHit(game, this.source, m, this.atk, { zone: true });
            if (this.charges != null && dealt > 0) {
                this.charges -= 1;
                if (this.charges <= 0) { this.alive = false; return; }
            }
        }
    }
}

const zonePool = new Pool(() => new Zone(), (z) => {
    z.source = null;
    z.atk = null;
});

/**
 * Spawn a ground hazard zone.
 * @param {object} game
 * @param {object} spec {x, y, atk, source, radius, duration, tickRate, charges, color, kind, groundOnly}
 * @returns {Zone}
 */
export function spawnZone(game, spec) {
    const z = zonePool.get();
    z.init(game, spec);
    game.zones.push(z);
    return z;
}

/** Advance every projectile and zone; recycle the dead. Call once per tick. */
export function updateProjectiles(game, dt) {
    const arr = game.projectiles;
    for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.update(dt, game);
        if (!p.alive) {
            arr[i] = arr[arr.length - 1];
            arr.pop();
            projPool.release(p);
        }
    }
    const zs = game.zones;
    if (zs) {
        for (let i = zs.length - 1; i >= 0; i--) {
            const z = zs[i];
            z.update(dt, game);
            if (!z.alive) {
                zs[i] = zs[zs.length - 1];
                zs.pop();
                zonePool.release(z);
            }
        }
    }
}
