// Attack execution: the bridge from a tower's per-tick cooldowns to damage on
// mobs. Headless-safe.
//
// updateTowerAttacks() ticks every AttackDef on a tower. Discrete kinds
// (projectile/ray/lob/melee/zone/chain) fire on a cooldown when a target exists;
// continuous kinds (beam/aura/spawn/income) run on their own internal schedule.
// executeAttack() performs ONE action of any kind and is the only place that
// spawns projectiles / zones / units. dealHit() is the single authoritative
// damage entry (buffs, statuses, hooks, fx) shared by attacks, projectiles,
// zones and units.

import { findTargets } from './targeting.js';
import { spawnProjectile, spawnZone } from './projectiles.js';
import { Unit } from './units.js';
import { Economy } from './economy.js';
import { runTowerHooks, runHook } from './towers.js';

const EMPTY = [];

const DAMAGE_TEXT_COLORS = {
    sharp: '#f4f6ff',
    blunt: '#c9cdd6',
    explosive: '#ff9838',
    fire: '#ff6a2b',
    cold: '#8fdcff',
    magic: '#c58bff',
    poison: '#8ede4b',
    true: '#ffffff',
};

const ZONE_COLORS = {
    fire: 'rgba(255,120,40,0.35)',
    poison: 'rgba(120,220,70,0.32)',
    cold: 'rgba(150,220,255,0.32)',
    explosive: 'rgba(255,150,60,0.30)',
    magic: 'rgba(190,130,255,0.32)',
    blunt: 'rgba(200,200,210,0.28)',
    sharp: 'rgba(220,225,240,0.28)',
    true: 'rgba(255,255,255,0.28)',
};

function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

function effRange(tower, atk) {
    const s = tower.stats;
    const base = (atk.range != null ? atk.range : s.range);
    return base * (s.rangeMul || 1);
}

function cloneStatus(spec) {
    const out = {};
    for (const k in spec) {
        if (Object.prototype.hasOwnProperty.call(spec, k)) out[k] = spec[k];
    }
    return out;
}

/**
 * Predict where to aim so a projectile intercepts a moving mob. One-iteration
 * lead: advance the target along its path by (flight time * path speed).
 */
function leadPoint(tower, target, projSpeed, game) {
    if (!projSpeed || projSpeed <= 0) return { x: target.x, y: target.y };
    const d = Math.hypot(target.x - tower.x, target.y - tower.y);
    const eta = d / projSpeed;
    const path = game.paths && game.paths[target.pathIndex || 0];
    if (!path || !path.posAt) return { x: target.x, y: target.y };
    const speed = (target.def && target.def.speed) || 0;
    const p = path.posAt((target.dist || 0) + speed * eta);
    return { x: p.x, y: p.y };
}

function nearestPathPoint(game, x, y, range) {
    const paths = game.paths;
    if (!paths || !paths.length) return null;
    let best = null;
    let bestD = range * range;
    const step = 22;
    for (let pi = 0; pi < paths.length; pi++) {
        const path = paths[pi];
        if (!path || !path.posAt) continue;
        const len = path.length || 0;
        for (let d = 0; d <= len; d += step) {
            const p = path.posAt(d);
            const dd = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
            if (dd < bestD) { bestD = dd; best = { x: p.x, y: p.y }; }
        }
    }
    return best;
}

function acquire(tower, atk, game, count) {
    const s = tower.stats;
    const range = effRange(tower, atk);
    const camoDetect = !!(s.camoDetect || atk.camoDetect);
    let groundOnly = false;
    if (atk.kind === 'melee') groundOnly = !(atk.hitsFlying || s.hitsFlying);
    else if (atk.kind === 'zone') groundOnly = true;
    if (atk.groundOnly) groundOnly = true;
    return findTargets(game, tower.x, tower.y, range, {
        mode: tower.targetMode,
        count,
        camoDetect,
        groundOnly,
    });
}

/**
 * Single authoritative damage application.
 * @returns {number} damage actually dealt (0 if immune/blocked).
 */
export function dealHit(game, source, mob, atk, opts = {}) {
    if (!mob || !mob.alive) return 0;
    const stats = source && source.stats ? source.stats : null;
    const dmgMul = (stats && stats.damageMul) ? stats.damageMul : 1;
    const dmg = (atk.damage || 0) * dmgMul * (opts.damageMul != null ? opts.damageMul : 1);
    const armorPiercing = (stats && stats.armorPiercing) || atk.armorPiercing || opts.armorPiercing || false;

    const dealt = mob.takeDamage(dmg, atk.damageType || 'sharp', source, { armorPiercing });
    if (dealt > 0) {
        if (atk.status) {
            const spec = cloneStatus(atk.status);
            spec.source = source;
            if (mob.addStatus) mob.addStatus(spec);
        }
        if (game.fx) {
            game.fx.hit(mob.x, mob.y, atk.damageType || 'sharp');
            game.fx.text(mob.x, mob.y - (mob.radius || 8), String(Math.round(dealt)),
                DAMAGE_TEXT_COLORS[atk.damageType || 'sharp'] || '#ffffff');
        }
        if (source) {
            source.damageDealt = (source.damageDealt || 0) + dealt;
            const killed = !mob.alive || mob.hp <= 0;
            const ctx = { game, tower: source, atk, mob, damageDealt: dealt, projectile: opts.projectile };
            if (killed) {
                source.kills = (source.kills || 0) + 1;
                if (typeof atk.onKill === 'function') runHook(atk.onKill, ctx);
                runTowerHooks(source, 'onKill', ctx);
            } else {
                if (typeof atk.onHit === 'function') runHook(atk.onHit, ctx);
                runTowerHooks(source, 'onHit', ctx);
            }
        }
    }
    return dealt;
}

/** Perform ONE action of an attack (one volley / beam tick / pulse / spawn). */
export function executeAttack(tower, atk, game, targets) {
    switch (atk.kind) {
        case 'projectile': fireProjectile(tower, atk, game, targets); break;
        case 'ray': fireRay(tower, atk, game, targets); break;
        case 'lob': fireLob(tower, atk, game, targets); break;
        case 'melee': fireMelee(tower, atk, game, targets); break;
        case 'zone': fireZone(tower, atk, game, targets); break;
        case 'chain': fireChain(tower, atk, game, targets); break;
        case 'beam': fireBeam(tower, atk, game, targets); break;
        case 'aura': fireAura(tower, atk, game); break;
        case 'spawn': fireSpawn(tower, atk, game); break;
        case 'income': Economy.award(game, atk.amount || 0, tower.x, tower.y); break;
        default: break;
    }
    if (typeof atk.onFire === 'function') runHook(atk.onFire, { game, tower, atk, targets });
    runTowerHooks(tower, 'onFire', { game, tower, atk, targets });
    if (atk.sfx && atk.kind !== 'beam' && game.sfx) game.sfx.play(atk.sfx);
}

function fireProjectile(tower, atk, game, targets) {
    const target = targets[0];
    if (!target) return;
    const proj = atk.projectile || {};
    const speed = proj.speed || 600;
    const aim = leadPoint(tower, target, speed, game);
    const base = Math.atan2(aim.y - tower.y, aim.x - tower.x);
    const count = Math.max(1, atk.count || 1);
    const spread = atk.spread || 0;
    const motion = proj.motion || 'straight';
    for (let k = 0; k < count; k++) {
        let a = base;
        if (count > 1) a = base + spread * ((k / (count - 1)) - 0.5);
        spawnProjectile(game, {
            x: tower.x, y: tower.y, angle: a, atk, source: tower,
            motion, speed, lifetime: proj.lifetime || 1.2, turnRate: proj.turnRate || 0,
            aoe: atk.aoe || 0, range: effRange(tower, atk),
            target: (motion === 'homing') ? target : null,
        });
    }
}

function fireLob(tower, atk, game, targets) {
    const target = targets[0];
    if (!target) return;
    const proj = atk.projectile || {};
    const speed = proj.speed || 320;
    const landing = leadPoint(tower, target, speed, game);
    spawnProjectile(game, {
        x: tower.x, y: tower.y, atk, source: tower, motion: 'arc',
        speed, lifetime: proj.lifetime || 3, aoe: atk.aoe || 40, landing,
    });
}

function fireRay(tower, atk, game, targets) {
    const target = targets[0];
    if (!target) return;
    const range = effRange(tower, atk);
    const ang = Math.atan2(target.y - tower.y, target.x - tower.x);
    const dirx = Math.cos(ang);
    const diry = Math.sin(ang);
    const corridor = (atk.width || 14) / 2;
    const maxPierce = (atk.pierce || 1) + (tower.stats.pierceAdd || 0);
    const camoDetect = !!(tower.stats.camoDetect || atk.camoDetect);

    const cand = game.grid
        ? game.grid.queryCircle(tower.x + dirx * range * 0.5, tower.y + diry * range * 0.5, range * 0.5 + 64)
        : (game.mobs || []);
    const hits = [];
    for (let i = 0; i < cand.length; i++) {
        const m = cand[i];
        if (!m.alive) continue;
        if (m.modifiers && m.modifiers.camo && !camoDetect) continue;
        const rx = m.x - tower.x;
        const ry = m.y - tower.y;
        const along = rx * dirx + ry * diry;
        if (along < 0 || along > range) continue;
        const perp = Math.abs(rx * diry - ry * dirx);
        if (perp > corridor + (m.radius || 0)) continue;
        hits.push({ m, along });
    }
    hits.sort((a, b) => a.along - b.along);
    if (game.fx) {
        game.fx.beam(tower.x, tower.y, tower.x + dirx * range, tower.y + diry * range,
            atk.beamStyle || { color: '#eef2ff', width: 2, duration: 0.06 });
    }
    for (let i = 0; i < hits.length && i < maxPierce; i++) {
        dealHit(game, tower, hits[i].m, atk, {});
    }
}

function fireMelee(tower, atk, game, targets) {
    if (!targets.length) return;
    const face = targets[0];
    const faceAng = Math.atan2(face.y - tower.y, face.x - tower.x);
    const arc = atk.arc != null ? atk.arc : Math.PI * 2;
    const half = arc / 2;
    const maxHits = (atk.pierce || 1) + (tower.stats.pierceAdd || 0);
    let n = 0;
    for (let i = 0; i < targets.length && n < maxHits; i++) {
        const m = targets[i];
        if (arc < Math.PI * 2) {
            const a = Math.atan2(m.y - tower.y, m.x - tower.x);
            if (Math.abs(angDiff(a, faceAng)) > half) continue;
        }
        const dealt = dealHit(game, tower, m, atk, {});
        if (dealt > 0 && atk.knockback && !(m.def && m.def.flags && m.def.flags.boss)) {
            m.dist = Math.max(0, m.dist - atk.knockback);
        }
        n++;
    }
}

function fireZone(tower, atk, game, targets) {
    const zone = atk.zone || {};
    let px, py;
    if (atk.atTower) {
        px = tower.x; py = tower.y;
    } else if (targets.length) {
        px = targets[0].x; py = targets[0].y;
    } else {
        const pt = nearestPathPoint(game, tower.x, tower.y, effRange(tower, atk));
        if (!pt) return;
        px = pt.x; py = pt.y;
    }
    spawnZone(game, {
        x: px, y: py, atk, source: tower,
        radius: zone.radius || 40,
        duration: zone.duration != null ? zone.duration : 3,
        tickRate: zone.tickRate || 0.5,
        charges: zone.charges != null ? zone.charges : null,
        color: atk.zoneColor || ZONE_COLORS[atk.damageType || 'sharp'] || 'rgba(255,255,255,0.3)',
        kind: atk.zoneKind || atk.damageType || 'zone',
        groundOnly: atk.groundOnly !== false,
    });
}

function fireChain(tower, atk, game, targets) {
    const first = targets[0];
    if (!first) return;
    const jumps = atk.jumps || 4;
    const jr = atk.jumpRange || 110;
    const falloff = atk.falloff || 0.85;
    const camoDetect = !!(tower.stats.camoDetect || atk.camoDetect);

    const points = [[tower.x, tower.y], [first.x, first.y]];
    const hit = new Set();
    let mul = 1;
    dealHit(game, tower, first, atk, { damageMul: mul });
    hit.add(first);
    let cur = first;

    for (let j = 0; j < jumps; j++) {
        const near = game.grid ? game.grid.queryCircle(cur.x, cur.y, jr) : (game.mobs || []);
        let best = null;
        let bestD = jr * jr;
        for (let i = 0; i < near.length; i++) {
            const m = near[i];
            if (!m.alive || hit.has(m)) continue;
            if (m.modifiers && m.modifiers.camo && !camoDetect) continue;
            const dd = (m.x - cur.x) * (m.x - cur.x) + (m.y - cur.y) * (m.y - cur.y);
            if (dd <= bestD) { bestD = dd; best = m; }
        }
        if (!best) break;
        mul *= falloff;
        dealHit(game, tower, best, atk, { damageMul: mul });
        hit.add(best);
        cur = best;
        points.push([best.x, best.y]);
    }
    if (game.fx) game.fx.lightning(points);
}

function fireBeam(tower, atk, game, targets) {
    const m = targets[0];
    if (!m) return;
    const idx = tower.stats.attacks.indexOf(atk);
    const st = idx >= 0 ? tower.atkState[idx] : null;
    const ramp = st && st.beamRamp ? st.beamRamp : 1;
    if (game.fx) {
        game.fx.beam(tower.x, tower.y, m.x, m.y,
            atk.beamStyle || { color: '#4aedd9', width: 4, duration: 0.1 });
    }
    dealHit(game, tower, m, atk, { damageMul: ramp });
}

function fireAura(tower, atk, game) {
    const s = tower.stats;
    const idx = tower.stats.attacks.indexOf(atk);
    const r = (atk.radius != null ? atk.radius : s.range) * (s.rangeMul || 1);
    const r2 = r * r;

    if (atk.buff) {
        const buffId = tower.uid + ':' + (atk.buffId || ('aura' + idx));
        const dur = atk.buff.dur != null ? atk.buff.dur : (atk.tick || 0.5) * 1.2;
        for (let i = 0; i < game.towers.length; i++) {
            const t2 = game.towers[i];
            if (!t2) continue;
            if (atk.excludeSelf && t2 === tower) continue;
            const dx = t2.x - tower.x;
            const dy = t2.y - tower.y;
            if (dx * dx + dy * dy > r2) continue;
            t2.addBuff({
                id: buffId,
                source: tower,
                dur,
                mults: atk.buff.mults || {},
                flags: atk.buff.flags || {},
            });
        }
    }

    if (atk.damage || atk.status) {
        const mobs = game.grid ? game.grid.queryCircle(tower.x, tower.y, r + 64) : (game.mobs || []);
        for (let i = 0; i < mobs.length; i++) {
            const m = mobs[i];
            if (!m.alive) continue;
            const reach = r + (m.radius || 0);
            const dx = m.x - tower.x;
            const dy = m.y - tower.y;
            if (dx * dx + dy * dy > reach * reach) continue;
            if (atk.damage) {
                dealHit(game, tower, m, atk, {});
            } else if (atk.status && m.addStatus) {
                const sp = cloneStatus(atk.status);
                sp.source = tower;
                m.addStatus(sp);
            }
        }
    }
    if (game.fx && game.fx.spawn && atk.auraFx) game.fx.spawn(atk.auraFx, tower.x, tower.y, { count: 6 });
}

function fireSpawn(tower, atk, game) {
    const s = tower.stats;
    const leashRange = (atk.leashRange != null ? atk.leashRange : s.range) * (s.rangeMul || 1);
    const u = new Unit(game, atk.unit, tower.x, tower.y, {
        leashX: tower.x, leashY: tower.y, leashRange, source: tower,
    });
    if (game.units) game.units.push(u);
    const idx = tower.stats.attacks.indexOf(atk);
    if (idx >= 0) {
        const st = tower.atkState[idx];
        st.units = st.units || [];
        st.units.push(u);
    }
}

// ---- per-kind scheduling --------------------------------------------------

function tickCooldownFire(tower, atk, i, dt, game) {
    tower.cooldowns[i] -= dt;
    if (tower.cooldowns[i] > 0) return;
    const spd = tower.stats.attackSpeedMul || 1;
    let count = 1;
    if (atk.kind === 'melee') count = Math.max(1, (atk.pierce || 1) + (tower.stats.pierceAdd || 0));
    else if (atk.kind === 'ray') count = Math.max(1, (atk.pierce || 1) + (tower.stats.pierceAdd || 0));
    const targets = acquire(tower, atk, game, count);
    if (atk.kind === 'zone') {
        if (!atk.atTower && targets.length === 0) { tower.cooldowns[i] = 0; return; }
    } else if (targets.length === 0) {
        tower.cooldowns[i] = 0;
        return;
    }
    executeAttack(tower, atk, game, targets);
    tower.cooldowns[i] = atk.cooldown / spd;
}

function tickBeam(tower, atk, i, dt, game) {
    const st = tower.atkState[i];
    st.beamTimer = (st.beamTimer || 0) + dt;
    const targets = acquire(tower, atk, game, 1);
    const target = targets[0] || null;
    if (!target) {
        st.beamRamp = 1;
        if (st.beamOn) st.beamOn = false;
        st.beamTimer = Math.min(st.beamTimer, 0.1);
        return;
    }
    if (!st.beamOn) { st.beamOn = true; if (atk.sfx && game.sfx) game.sfx.play(atk.sfx); }
    const tick = 0.1;
    while (st.beamTimer >= tick) {
        st.beamTimer -= tick;
        if (atk.ramp) {
            st.beamRamp = Math.min(atk.ramp.max || 3, (st.beamRamp || 1) * (1 + (atk.ramp.rate || 0.05)));
        } else {
            st.beamRamp = 1;
        }
        executeAttack(tower, atk, game, [target]);
    }
}

function tickAura(tower, atk, i, dt, game) {
    const st = tower.atkState[i];
    const tick = atk.tick || 0.5;
    st.auraTimer = (st.auraTimer || 0) + dt;
    while (st.auraTimer >= tick) {
        st.auraTimer -= tick;
        executeAttack(tower, atk, game, EMPTY);
    }
}

function tickIncome(tower, atk, i, dt, game) {
    if (atk.when !== 'interval') return; // roundEnd income is a synthesized hook
    if (!game.state || game.state.phase !== 'combat') return;
    const st = tower.atkState[i];
    const iv = atk.interval || 10;
    st.incomeTimer = (st.incomeTimer || 0) + dt;
    while (st.incomeTimer >= iv) {
        st.incomeTimer -= iv;
        executeAttack(tower, atk, game, EMPTY);
    }
}

function tickSpawn(tower, atk, i, dt, game) {
    const st = tower.atkState[i];
    st.units = (st.units || []).filter((u) => u && u.alive);
    const max = Math.max(1, Math.floor(atk.max || 1));
    tower.cooldowns[i] -= dt;
    if (st.units.length >= max) {
        if (tower.cooldowns[i] < 0) tower.cooldowns[i] = 0;
        return;
    }
    if (tower.cooldowns[i] > 0) return;
    executeAttack(tower, atk, game, EMPTY);
    tower.cooldowns[i] = atk.cooldown / (tower.stats.attackSpeedMul || 1);
}

/** Tick every attack on a tower for one sim step. */
export function updateTowerAttacks(tower, dt, game) {
    if (tower.stunnedUntil && tower.age < tower.stunnedUntil) return;
    const attacks = tower.stats.attacks;
    for (let i = 0; i < attacks.length; i++) {
        const atk = attacks[i];
        if (!atk) continue;
        switch (atk.kind) {
            case 'beam': tickBeam(tower, atk, i, dt, game); break;
            case 'aura': tickAura(tower, atk, i, dt, game); break;
            case 'income': tickIncome(tower, atk, i, dt, game); break;
            case 'spawn': tickSpawn(tower, atk, i, dt, game); break;
            default: tickCooldownFire(tower, atk, i, dt, game); break;
        }
    }
}
