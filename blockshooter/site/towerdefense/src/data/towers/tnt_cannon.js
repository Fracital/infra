// TNT Cannon -- CONTRACTS Appendix A entry 3.
//
// A dispenser-fed cannon that lobs primed TNT in a mortar arc, exploding for
// EXPLOSIVE area damage on impact. Explosive already ignores the 'armored'
// immunity, so this is the roster's answer to husks/wither skeletons. Three
// roles: raw blast size (P0), cluster sub-munitions (P1), and concussive
// crowd-stunning (P2).
//
// Bomblets (P1) are launched as real arc sub-projectiles at fire time via
// spawnProjectile -- the only thing the engine's arc-impact has no hook for is
// spawning children mid-air, so they lob from the cannon toward a ring around
// the primary target and land alongside the main shell.

import { spawnProjectile } from '../../sim/projectiles.js';

// Reusable sub-munition AttackDef; damage/aoe are read live from tower stats so
// a single onFire hook covers every P1 tier without stacking duplicate hooks.
function fireBomblets(ctx) {
    if (!ctx.atk || ctx.atk.kind !== 'lob') return;   // only the primary shell splits
    var t = ctx.tower;
    var g = ctx.game;
    var n = t.stats.bombletCount | 0;
    if (n <= 0) return;
    var tgt = ctx.targets && ctx.targets[0];
    if (!tgt) return;
    var dmg = t.stats.bombletDamage || 4;
    var aoe = t.stats.bombletAoe || 26;
    var atk = {
        kind: 'lob',
        damage: dmg,
        pierce: 1,
        damageType: 'explosive',
        aoe: aoe,
        explosionStyle: 'tnt',
        projectile: { sprite: 'tnt', speed: 300, lifetime: 2 },
    };
    var rng = g.rng;
    for (var k = 0; k < n; k++) {
        var ang = rng ? rng.angle() : (k / n) * Math.PI * 2;
        var rad = rng ? rng.range(18, 46) : 30;
        spawnProjectile(g, {
            x: t.x, y: t.y, atk: atk, source: t, motion: 'arc',
            speed: 300, lifetime: 2.4, aoe: aoe,
            landing: { x: tgt.x + Math.cos(ang) * rad, y: tgt.y + Math.sin(ang) * rad },
        });
    }
}

/** P0 t5: struck mobs catch radioactive fire (fallout that survives the blast). */
function nuclearFallout(ctx) {
    var m = ctx.mob;
    if (!m || !m.addStatus) return;
    m.addStatus({ id: 'burn', dps: 8, duration: 4, damageType: 'fire', source: ctx.tower });
}

/** P2 t5: MOAB-class targets get a doubled stun so it still lands ~50% uptime. */
function bossStun(ctx) {
    var m = ctx.mob;
    var f = m && m.def && m.def.flags;
    if (!f || !f.boss || !m.addStatus) return;
    // Bosses cut stun/freeze to x0.25, so 4.0s -> ~1.0s vs the 2.0s non-boss stun.
    m.addStatus({ id: 'stun', duration: 4.0, source: ctx.tower });
}

/** P1 t5 ability: carpet the whole track with a wave of burning TNT. */
function carpetBomb(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var paths = g.paths || [];
    if (!paths.length) return;
    var atk = {
        kind: 'lob',
        damage: 45,
        pierce: 1,
        damageType: 'explosive',
        aoe: 46,
        explosionStyle: 'tnt',
        projectile: { sprite: 'tnt', speed: 320, lifetime: 2.4 },
        status: { id: 'burn', dps: 6, duration: 3, damageType: 'fire' },
    };
    var shots = 16;
    for (var i = 0; i < shots; i++) {
        var path = paths[i % paths.length];
        if (!path) break;
        var f = g.rng ? g.rng.next() : (i / shots);
        var p = path.posAt(f * path.length);
        var jx = g.rng ? g.rng.range(-42, 42) : 0;
        var jy = g.rng ? g.rng.range(-30, 30) : 0;
        spawnProjectile(g, {
            x: t.x, y: t.y, atk: atk, source: t, motion: 'arc',
            speed: 320, lifetime: 2.4, aoe: 46,
            landing: { x: p.x + jx, y: p.y + jy },
        });
    }
    if (g.fx) g.fx.shake(0.6);
    if (g.sfx) g.sfx.play('explosion_large');
}

export default {
    id: 'tnt_cannon',
    name: 'TNT Cannon',
    category: 'primary',
    cost: 525,
    desc: 'Lobs primed TNT in an arc for heavy explosive area damage.',
    placement: 'land',
    footprint: 20,
    base: {
        range: 165,
        camoDetect: false,
        seesFlying: true,
        bombletCount: 0,
        bombletDamage: 4,
        bombletAoe: 26,
        attacks: [
            {
                kind: 'lob',
                cooldown: 1.9,
                damage: 5,
                pierce: 1,
                damageType: 'explosive',
                range: null,
                count: 1,
                spread: 0,
                aoe: 58,
                projectile: { sprite: 'tnt', speed: 300, lifetime: 3, motion: 'arc' },
                explosionStyle: 'tnt',
                sfx: 'cannon',
            },
        ],
    },
    paths: [
        {
            name: 'Bigger Blast',
            upgrades: [
                {
                    name: 'Bigger Blast',
                    cost: 315,
                    desc: 'A fatter charge: +20% blast radius and +3 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.aoe', mul: 1.2 },
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                    ],
                },
                {
                    name: 'Bulk Powder',
                    cost: 640,
                    desc: 'More powder, wider blast, +4 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.aoe', mul: 1.2 },
                        { type: 'stat', target: 'attacks.0.damage', add: 4 },
                    ],
                },
                {
                    name: 'Demolition Charge',
                    cost: 1575,
                    desc: 'Purpose-built demo charge: much bigger blast, +8 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.aoe', mul: 1.25 },
                        { type: 'stat', target: 'attacks.0.damage', add: 8 },
                    ],
                },
                {
                    name: 'Fat Man',
                    cost: 4725,
                    desc: 'An oversized shell that levels clusters: +14 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.aoe', mul: 1.3 },
                        { type: 'stat', target: 'attacks.0.damage', add: 14 },
                    ],
                },
                {
                    name: 'Nuclear Creeper Core',
                    cost: 15750,
                    desc: 'A colossal blast that irradiates survivors with fire and leaves a lingering burning crater on the track.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.aoe', mul: 1.4 },
                        { type: 'stat', target: 'attacks.0.damage', add: 40 },
                        { type: 'behavior', hook: 'onHit', fn: nuclearFallout },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'zone',
                                cooldown: 2.2,
                                damage: 6,
                                pierce: 1,
                                damageType: 'fire',
                                range: null,
                                zone: { radius: 54, duration: 3.5, tickRate: 0.5 },
                                status: { id: 'burn', dps: 6, duration: 3, damageType: 'fire' },
                                zoneColor: 'rgba(255,120,40,0.35)',
                                sfx: 'flame_tick',
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Cluster Charges',
            upgrades: [
                {
                    name: 'Cluster Charges',
                    cost: 300,
                    desc: 'Each shell scatters two bomblets around the impact.',
                    effects: [
                        { type: 'stat', target: 'bombletCount', set: 2 },
                        { type: 'stat', target: 'bombletDamage', set: 4 },
                        { type: 'stat', target: 'bombletAoe', set: 24 },
                        { type: 'behavior', hook: 'onFire', fn: fireBomblets },
                    ],
                },
                {
                    name: 'Fragmentation',
                    cost: 660,
                    desc: 'Three punchier bomblets per shell.',
                    effects: [
                        { type: 'stat', target: 'bombletCount', set: 3 },
                        { type: 'stat', target: 'bombletDamage', set: 6 },
                    ],
                },
                {
                    name: 'Saturation Bombing',
                    cost: 1650,
                    desc: 'Four wider-bursting bomblets carpet the impact zone.',
                    effects: [
                        { type: 'stat', target: 'bombletCount', set: 4 },
                        { type: 'stat', target: 'bombletDamage', set: 9 },
                        { type: 'stat', target: 'bombletAoe', set: 28 },
                    ],
                },
                {
                    name: 'MIRV Warhead',
                    cost: 4950,
                    desc: 'Five heavy bomblets rain down on the target area.',
                    effects: [
                        { type: 'stat', target: 'bombletCount', set: 5 },
                        { type: 'stat', target: 'bombletDamage', set: 14 },
                        { type: 'stat', target: 'bombletAoe', set: 32 },
                    ],
                },
                {
                    name: 'Carpet Bomb',
                    cost: 16000,
                    desc: 'Six devastating bomblets per shell, plus an ability that carpets the entire path in burning explosions.',
                    effects: [
                        { type: 'stat', target: 'bombletCount', set: 6 },
                        { type: 'stat', target: 'bombletDamage', set: 22 },
                        { type: 'stat', target: 'bombletAoe', set: 36 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'carpet_bomb',
                                name: 'Carpet Bomb',
                                desc: 'Rains 16 burning TNT charges across the whole track.',
                                cooldown: 40,
                                use: carpetBomb,
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Concussive Shells',
            upgrades: [
                {
                    name: 'Concussive Shells',
                    cost: 340,
                    desc: 'The shockwave briefly stuns everything caught in the blast.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.status', set: { id: 'stun', duration: 0.4 } },
                    ],
                },
                {
                    name: 'Ringing Ears',
                    cost: 680,
                    desc: 'Longer stun (0.7s) and +3 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.status', set: { id: 'stun', duration: 0.7 } },
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                    ],
                },
                {
                    name: 'Skull Rattler',
                    cost: 1700,
                    desc: 'A full-second stun and +6 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.status', set: { id: 'stun', duration: 1.0 } },
                        { type: 'stat', target: 'attacks.0.damage', add: 6 },
                    ],
                },
                {
                    name: 'Brain Scrambler',
                    cost: 5100,
                    desc: 'A punishing 1.4s stun and +10 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.status', set: { id: 'stun', duration: 1.4 } },
                        { type: 'stat', target: 'attacks.0.damage', add: 10 },
                    ],
                },
                {
                    name: 'Shell Shock',
                    cost: 15500,
                    desc: 'A crushing 2s stun that even holds MOAB-class bosses for about half that, and +18 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.status', set: { id: 'stun', duration: 2.0 } },
                        { type: 'stat', target: 'attacks.0.damage', add: 18 },
                        { type: 'behavior', hook: 'onHit', fn: bossStun },
                    ],
                },
            ],
        },
    ],
};
