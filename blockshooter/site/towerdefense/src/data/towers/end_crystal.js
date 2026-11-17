// End Crystal -- a floating obsidian crystal that fires a searing magic death
// beam (CONTRACTS Appendix A entry 11). The premium "super" tower: expensive,
// enormous single-target damage that ramps, with a Prismatic path for multi-
// target and a Void path that yanks mobs back down the track.
//
// The beam engine (attacks.js fireBeam) is single-target, so the Prismatic
// path's extra beams are driven by an onFire hook that fans secondary beams to
// nearby mobs each tick. Everything reaches the sim through ctx.game except zone
// spawning, which needs the sim helper (allowed: only gfx/audio/ui are barred).

import { spawnZone } from '../../sim/projectiles.js';

/**
 * P1 'Prismatic Array': after the primary beam tick, fire up to stats.extraBeams
 * secondary beams at other in-range mobs. Secondary hits use raw takeDamage
 * (no ramp) so they are cheap; damage is credited to the tower by hand.
 */
function prismaticBeams(ctx) {
    var atk = ctx.atk;
    if (!atk || atk.kind !== 'beam') return;
    var tower = ctx.tower;
    var game = ctx.game;
    var extra = (tower.stats && tower.stats.extraBeams) || 0;
    if (extra <= 0) return;

    var primary = ctx.targets && ctx.targets[0];
    var range = (atk.range != null ? atk.range : tower.stats.range) * (tower.stats.rangeMul || 1);
    var camo = !!(tower.stats.camoDetect || atk.camoDetect);
    var ap = !!(tower.stats && tower.stats.armorPiercing);
    var dmg = (atk.damage || 0) * (tower.stats.damageMul || 1);
    var near = game.grid ? game.grid.queryCircle(tower.x, tower.y, range + 64) : (game.mobs || []);
    var hit = 0;
    for (var i = 0; i < near.length && hit < extra; i++) {
        var m = near[i];
        if (!m.alive || m === primary) continue;
        if (m.modifiers && m.modifiers.camo && !camo) continue;
        var dx = m.x - tower.x;
        var dy = m.y - tower.y;
        if (dx * dx + dy * dy > range * range) continue;
        var dealt = m.takeDamage(dmg, atk.damageType || 'magic', tower, { armorPiercing: ap });
        if (dealt > 0) {
            tower.damageDealt = (tower.damageDealt || 0) + dealt;
            if (game.fx) game.fx.beam(tower.x, tower.y, m.x, m.y, { color: '#c58bff', width: 3, duration: 0.08 });
        }
        hit++;
    }
}

/** P0 t5 'Death Ray of the End': extra magic damage to bosses on every tick. */
function endBossBonus(ctx) {
    var f = ctx.mob && ctx.mob.def && ctx.mob.def.flags;
    if (f && f.boss) ctx.mob.takeDamage(20, 'magic', ctx.tower, { armorPiercing: true });
}

/** Pull a single mob back down the path (bosses are immune to knockback). */
function pullBack(mob, game, pull) {
    if (!mob || !mob.alive) return;
    if (mob.def && mob.def.flags && mob.def.flags.boss) return;
    var ox = mob.x;
    var oy = mob.y;
    mob.dist = Math.max(0, mob.dist - pull);
    var path = game.paths && game.paths[mob.pathIndex || 0];
    if (path && path.posAt) {
        var p = path.posAt(mob.dist);
        mob.x = p.x;
        mob.y = p.y;
        mob.angle = p.angle;
    }
    if (game.fx) game.fx.teleport(ox, oy, mob.x, mob.y);
}

/**
 * P2 'Void Rifts': a chance on every damaging hit to tear a mini black hole that
 * drags the struck mob backward. Chance and pull distance grow with the tier and
 * are read from tower.stats so later tiers just bump the numbers.
 */
function voidRift(ctx) {
    var tower = ctx.tower;
    var game = ctx.game;
    var chance = (tower.stats && tower.stats.riftChance) || 0;
    if (chance <= 0 || !game.rng || !game.rng.chance(chance)) return;
    var pull = (tower.stats && tower.stats.riftPull) || 60;
    pullBack(ctx.mob, game, pull);
    if (game.fx && game.fx.spawn) game.fx.spawn('portal', ctx.mob.x, ctx.mob.y, { count: 6, color: '#b26bff' });
}

/** The Event Horizon zone drags everything caught in it backward each tick. */
function eventHorizonDrag(ctx) {
    pullBack(ctx.mob, ctx.game, 42);
}

/** P2 t5 ability: open a huge rift on the leading mob that swallows the wave. */
function eventHorizonUse(ctx) {
    var game = ctx.game;
    var tower = ctx.tower;
    var cx = tower.x;
    var cy = tower.y;
    var best = -1;
    var mobs = game.mobs || [];
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive) continue;
        var path = game.paths[m.pathIndex || 0];
        var frac = m.dist / ((path && path.length) || 1);
        if (frac > best) { best = frac; cx = m.x; cy = m.y; }
    }
    spawnZone(game, {
        x: cx, y: cy, source: tower,
        radius: 145, duration: 5, tickRate: 0.4,
        atk: { kind: 'zone', damage: 8, damageType: 'magic', onHit: eventHorizonDrag, zoneKind: 'magic' },
        color: 'rgba(150,60,255,0.4)', kind: 'magic', groundOnly: false,
    });
    if (game.fx) {
        game.fx.shockwave(cx, cy, 145);
        if (game.fx.spawn) game.fx.spawn('portal', cx, cy, { count: 26, color: '#b26bff' });
    }
    if (game.sfx) game.sfx.play('explosion_large');
}

export default {
    id: 'end_crystal',
    name: 'End Crystal',
    category: 'magic',
    cost: 2500,
    desc: 'A floating crystal that carves through anything with a ramping magic death beam.',
    placement: 'land',
    footprint: 22,
    base: {
        range: 205,
        camoDetect: false,
        seesFlying: true,
        extraBeams: 0,
        riftChance: 0,
        riftPull: 0,
        attacks: [
            {
                kind: 'beam',
                cooldown: 0.1,          // beams tick on their own schedule; kept > 0 for schema
                damage: 3,
                damageType: 'magic',
                range: null,
                ramp: null,
                beamStyle: { color: '#c58bff', width: 4, duration: 0.12 },
                sfx: 'crystal_hum',
            },
        ],
    },
    paths: [
        {
            name: 'Dragon Beam',
            upgrades: [
                {
                    name: 'Focused Crystal',
                    cost: 1400,
                    desc: 'A tighter focus adds +2 beam damage per tick.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                    ],
                },
                {
                    name: 'Amethyst Core',
                    cost: 2400,
                    desc: '+3 beam damage per tick.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                    ],
                },
                {
                    name: 'Corrupted Beam',
                    cost: 7000,
                    desc: '+5 damage, and the beam ramps up the longer it burns one target.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 5 },
                        { type: 'stat', target: 'attacks.0.ramp', set: { rate: 0.03, max: 2.5 } },
                    ],
                },
                {
                    name: "Dragon's Breath",
                    cost: 20000,
                    desc: '+10 damage and a far faster, deadlier ramp.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 10 },
                        { type: 'stat', target: 'attacks.0.ramp', set: { rate: 0.05, max: 3.5 } },
                    ],
                },
                {
                    name: 'Death Ray of the End',
                    cost: 60000,
                    desc: 'An armor-melting death ray that ramps to devastating levels and shreds bosses.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', set: 40 },
                        { type: 'stat', target: 'attacks.0.ramp', set: { rate: 0.06, max: 5 } },
                        { type: 'flag', flag: 'armorPiercing' },
                        { type: 'behavior', hook: 'onHit', fn: endBossBonus },
                    ],
                },
            ],
        },
        {
            name: 'Prismatic Array',
            upgrades: [
                {
                    name: 'Split Prism',
                    cost: 1600,
                    desc: 'Refracts a second beam onto another nearby target.',
                    effects: [
                        { type: 'stat', target: 'extraBeams', set: 1 },
                        { type: 'behavior', hook: 'onFire', fn: prismaticBeams },
                    ],
                },
                {
                    name: 'Twin Focus',
                    cost: 3000,
                    desc: 'A third refracted beam splits off to hit more mobs at once.',
                    effects: [
                        { type: 'stat', target: 'extraBeams', set: 2 },
                    ],
                },
                {
                    name: 'Rainbow Lattice',
                    cost: 8000,
                    desc: 'A fourth beam, and +3 damage on every beam.',
                    effects: [
                        { type: 'stat', target: 'extraBeams', set: 3 },
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                    ],
                },
                {
                    name: 'Prism Engine',
                    cost: 22000,
                    desc: 'Supercharged optics: +6 damage on all beams.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 6 },
                        { type: 'stat', target: 'range', mul: 1.15 },
                    ],
                },
                {
                    name: 'Prismatic Overlord',
                    cost: 62000,
                    desc: 'Five simultaneous beams, each carving for +8 damage a tick.',
                    effects: [
                        { type: 'stat', target: 'extraBeams', set: 4 },
                        { type: 'stat', target: 'attacks.0.damage', add: 8 },
                        { type: 'stat', target: 'range', mul: 1.15 },
                    ],
                },
            ],
        },
        {
            name: 'Void Rifts',
            upgrades: [
                {
                    name: 'Rift Tear',
                    cost: 1300,
                    desc: '10% of hits open a rift that drags the mob 60px back down the path.',
                    effects: [
                        { type: 'stat', target: 'riftChance', set: 0.1 },
                        { type: 'stat', target: 'riftPull', set: 60 },
                        { type: 'behavior', hook: 'onHit', fn: voidRift },
                    ],
                },
                {
                    name: 'Warped Space',
                    cost: 2200,
                    desc: 'Rifts trigger more often (18%) and drag mobs 90px back.',
                    effects: [
                        { type: 'stat', target: 'riftChance', set: 0.18 },
                        { type: 'stat', target: 'riftPull', set: 90 },
                    ],
                },
                {
                    name: 'Gravity Well',
                    cost: 7500,
                    desc: '25% rift chance, 130px pull, and +2 beam damage.',
                    effects: [
                        { type: 'stat', target: 'riftChance', set: 0.25 },
                        { type: 'stat', target: 'riftPull', set: 130 },
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                    ],
                },
                {
                    name: 'Singularity',
                    cost: 18000,
                    desc: '35% rift chance and a brutal 180px pull.',
                    effects: [
                        { type: 'stat', target: 'riftChance', set: 0.35 },
                        { type: 'stat', target: 'riftPull', set: 180 },
                    ],
                },
                {
                    name: 'Event Horizon',
                    cost: 55000,
                    desc: 'Half of all hits rift for 240px, plus an ability that opens a wave-swallowing black hole.',
                    effects: [
                        { type: 'stat', target: 'riftChance', set: 0.5 },
                        { type: 'stat', target: 'riftPull', set: 240 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'event_horizon',
                                name: 'Event Horizon',
                                desc: 'Tears a massive rift at the front of the wave that damages and drags mobs back for 5s.',
                                cooldown: 32,
                                use: eventHorizonUse,
                            },
                        },
                    ],
                },
            ],
        },
    ],
};
