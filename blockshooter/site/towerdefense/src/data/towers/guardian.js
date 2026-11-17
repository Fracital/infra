// Guardian -- a water-only elder guardian firing a charging laser (CONTRACTS #9).
//
// Base is a 'beam' that ramps the longer it holds one target (Focused Gaze pushes
// that to Elder-Wrath levels and adds a fatigue slow-aura). Path 1 bolts on a
// global-range homing spike volley; Path 2 turns the Guardian into a support ward
// -- revealing camo, thorn-damaging passing mobs, and finally opening an Abyssal
// Vortex that drags the horde backward.
//
// Elder Wrath's aura, the thorns, and the vortex are onTick BEHAVIOURS rather than
// aura attacks: P0 must never *add* an attack, or it would shift the Path-1 spike
// out of attacks[1] and scramble that path's stat targets. The Monument Barrage
// ability fires real projectiles, so this file imports the sim's spawnProjectile.

import { spawnProjectile } from '../../sim/projectiles.js';

/** Elder Wrath: a mining-fatigue aura that slows every mob near the monument. */
function elderFatigue(ctx) {
    var t = ctx.tower;
    var s = t.stats;
    if (!s.fatiguePower) return;
    t._fatT = (t._fatT || 0) + ctx.dt;
    if (t._fatT < 0.5) return;
    t._fatT -= 0.5;
    var r = s.fatigueRange || (s.range || 150) * (s.rangeMul || 1);
    var g = ctx.game;
    var near = g.grid ? g.grid.queryCircle(t.x, t.y, r) : (g.mobs || []);
    for (var i = 0; i < near.length; i++) {
        var m = near[i];
        if (m.alive && m.addStatus) m.addStatus({ id: 'slow', power: s.fatiguePower, duration: 1.2 });
    }
}

/** Tidal Ward thorns: sear mobs that pass within the ward, optionally slowing them. */
function wardThorns(ctx) {
    var t = ctx.tower;
    var s = t.stats;
    if (!s.thornsDmg) return;
    t._thornT = (t._thornT || 0) + ctx.dt;
    var iv = s.thornsInterval || 0.5;
    if (t._thornT < iv) return;
    t._thornT -= iv;
    var r = (s.range || 150) * (s.rangeMul || 1);
    var g = ctx.game;
    var near = g.grid ? g.grid.queryCircle(t.x, t.y, r) : (g.mobs || []);
    for (var i = 0; i < near.length; i++) {
        var m = near[i];
        if (!m.alive) continue;
        var dealt = m.takeDamage(s.thornsDmg, 'magic', t, {});
        if (dealt > 0) {
            t.damageDealt = (t.damageDealt || 0) + dealt;
            if (s.thornsSlow > 0 && m.addStatus) m.addStatus({ id: 'slow', power: s.thornsSlow, duration: 0.8 });
        }
    }
    if (g.fx && g.fx.spawn) g.fx.spawn('spark', t.x, t.y, { count: 2, color: '#4aedd9' });
}

/** Abyssal Vortex: periodically wrench every non-boss mob in reach backward. */
function abyssalVortex(ctx) {
    var t = ctx.tower;
    var s = t.stats;
    if (!s.vortexPull) return;
    t._vortT = (t._vortT || 0) + ctx.dt;
    var iv = s.vortexInterval || 3;
    if (t._vortT < iv) return;
    t._vortT -= iv;
    var r = s.vortexRange || (s.range || 150) * (s.rangeMul || 1) * 1.3;
    var g = ctx.game;
    var near = g.grid ? g.grid.queryCircle(t.x, t.y, r) : (g.mobs || []);
    var any = false;
    for (var i = 0; i < near.length; i++) {
        var m = near[i];
        if (!m.alive) continue;
        if (m.def && m.def.flags && m.def.flags.boss) continue;
        m.dist = Math.max(0, m.dist - s.vortexPull);
        any = true;
    }
    if (any && g.fx) {
        g.fx.shockwave(t.x, t.y, r);
        if (g.fx.spawn) g.fx.spawn('portal', t.x, t.y, { count: 14, color: '#4aedd9' });
    }
    if (any && g.sfx) g.sfx.play('teleport');
}

/** Monument Barrage ability: a one-shot storm of homing guardian spikes. */
function monumentBarrage(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var atk = {
        kind: 'projectile', damage: 24, pierce: 2, damageType: 'magic', camoDetect: true,
        projectile: { sprite: 'spike', speed: 520, lifetime: 2.8, motion: 'homing', turnRate: 6 },
    };
    var live = [];
    var mobs = g.mobs || [];
    for (var m = 0; m < mobs.length; m++) if (mobs[m].alive) live.push(mobs[m]);
    var count = 24;
    for (var i = 0; i < count; i++) {
        var target = live.length ? live[i % live.length] : null;
        var a = (i / count) * Math.PI * 2;
        spawnProjectile(g, {
            x: t.x, y: t.y, angle: a, atk: atk, source: t,
            motion: 'homing', speed: 520, lifetime: 2.8, turnRate: 6, target: target,
        });
    }
    if (g.fx) g.fx.shockwave(t.x, t.y, 60);
    if (g.sfx) g.sfx.play('bolt');
}

export default {
    id: 'guardian',
    name: 'Guardian',
    category: 'magic',
    cost: 380,
    desc: 'A submerged elder guardian whose charging laser burns hotter the longer it holds.',
    placement: 'water',
    footprint: 20,
    base: {
        range: 150,
        camoDetect: false,
        seesFlying: true,
        thornsDmg: 0,
        thornsSlow: 0,
        thornsInterval: 0.5,
        fatiguePower: 0,
        vortexPull: 0,
        vortexInterval: 3,
        vortexRange: 0,
        attacks: [
            {
                kind: 'beam',
                cooldown: 0.1,
                damage: 2,
                pierce: 1,
                damageType: 'magic',
                range: null,
                ramp: { rate: 0.03, max: 2.5 },
                beamStyle: { color: '#4aedd9', width: 3, duration: 0.12 },
                sfx: 'laser',
            },
        ],
    },
    paths: [
        {
            name: 'Focused Gaze',
            upgrades: [
                {
                    name: 'Piercing Gaze',
                    cost: 240,
                    desc: '+2 base beam damage and a faster charge.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                        { type: 'stat', target: 'attacks.0.ramp.rate', set: 0.04 },
                    ],
                },
                {
                    name: 'Searing Beam',
                    cost: 400,
                    desc: '+3 damage and a higher charge ceiling.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                        { type: 'stat', target: 'attacks.0.ramp.max', set: 3.5 },
                    ],
                },
                {
                    name: 'Concentrated Wrath',
                    cost: 1100,
                    desc: '+5 damage and the beam ramps even hotter.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 5 },
                        { type: 'stat', target: 'attacks.0.ramp.max', set: 4.5 },
                    ],
                },
                {
                    name: 'Elder Focus',
                    cost: 2900,
                    desc: '+9 damage and a devastating maximum charge.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 9 },
                        { type: 'stat', target: 'attacks.0.ramp.max', set: 6 },
                    ],
                },
                {
                    name: 'Elder Wrath',
                    cost: 11000,
                    desc: 'A monstrous beam (up to 8x charge) plus a fatigue aura slowing all nearby mobs.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 18 },
                        { type: 'stat', target: 'attacks.0.ramp.max', set: 8 },
                        { type: 'stat', target: 'fatiguePower', set: 0.6 },
                        { type: 'behavior', hook: 'onTick', fn: elderFatigue },
                    ],
                },
            ],
        },
        {
            name: 'Spike Volley',
            upgrades: [
                {
                    name: 'Spike Volley',
                    cost: 260,
                    desc: 'Also fires homing prismarine spikes at mobs anywhere on the map.',
                    effects: [
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'projectile',
                                cooldown: 1.6,
                                damage: 5,
                                pierce: 1,
                                damageType: 'sharp',
                                range: 2000,
                                count: 2,
                                spread: 0.6,
                                aoe: 0,
                                projectile: { sprite: 'spike', speed: 440, lifetime: 2.6, motion: 'homing', turnRate: 5 },
                                sfx: 'bolt',
                            },
                        },
                    ],
                },
                {
                    name: 'Barbed Spikes',
                    cost: 440,
                    desc: '+4 spike damage and a third spike per volley.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.damage', add: 4 },
                        { type: 'stat', target: 'attacks.1.count', set: 3 },
                    ],
                },
                {
                    name: 'Prismarine Shards',
                    cost: 1200,
                    desc: '+6 damage, four spikes, and a faster launch.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.damage', add: 6 },
                        { type: 'stat', target: 'attacks.1.count', set: 4 },
                        { type: 'stat', target: 'attacks.1.cooldown', mul: 0.8 },
                    ],
                },
                {
                    name: 'Guardian Volley',
                    cost: 3100,
                    desc: '+10 damage, five spikes, and each pierces an extra mob.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.damage', add: 10 },
                        { type: 'stat', target: 'attacks.1.count', set: 5 },
                        { type: 'stat', target: 'attacks.1.pierce', add: 1 },
                    ],
                },
                {
                    name: 'Monument Barrage',
                    cost: 12000,
                    desc: 'Seven heavy spikes per volley, plus a one-shot Monument Barrage ability.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.damage', add: 16 },
                        { type: 'stat', target: 'attacks.1.count', set: 7 },
                        { type: 'stat', target: 'attacks.1.cooldown', mul: 0.7 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'monument_barrage',
                                name: 'Monument Barrage',
                                desc: 'Unleash a storm of 24 homing guardian spikes across the whole map.',
                                cooldown: 40,
                                use: monumentBarrage,
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Tidal Ward',
            upgrades: [
                {
                    name: 'Tidal Ward',
                    cost: 280,
                    desc: 'Reveals camo mobs and grants camo detection to nearby towers.',
                    effects: [
                        { type: 'flag', flag: 'camoDetect' },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'aura',
                                cooldown: 0.5,
                                range: null,
                                tick: 0.5,
                                excludeSelf: false,
                                buffId: 'tidal_ward',
                                buff: { flags: { camoDetect: true } },
                            },
                        },
                    ],
                },
                {
                    name: 'Prismarine Thorns',
                    cost: 420,
                    desc: 'Mobs passing through the ward are seared for 3 magic damage.',
                    effects: [
                        { type: 'stat', target: 'thornsDmg', set: 3 },
                        { type: 'behavior', hook: 'onTick', fn: wardThorns },
                    ],
                },
                {
                    name: 'Reinforced Ward',
                    cost: 1150,
                    desc: 'Stronger thorns (6 damage) over a wider ward.',
                    effects: [
                        { type: 'stat', target: 'thornsDmg', set: 6 },
                        { type: 'stat', target: 'range', mul: 1.15 },
                    ],
                },
                {
                    name: "Warden's Ward",
                    cost: 2900,
                    desc: 'Brutal thorns (11 damage) that also slow whatever they touch.',
                    effects: [
                        { type: 'stat', target: 'thornsDmg', set: 11 },
                        { type: 'stat', target: 'thornsSlow', set: 0.6 },
                    ],
                },
                {
                    name: 'Abyssal Vortex',
                    cost: 12500,
                    desc: 'Searing thorns (16 damage) and a vortex that wrenches the horde backward every few seconds.',
                    effects: [
                        { type: 'stat', target: 'thornsDmg', set: 16 },
                        { type: 'stat', target: 'vortexPull', set: 90 },
                        { type: 'behavior', hook: 'onTick', fn: abyssalVortex },
                    ],
                },
            ],
        },
    ],
};
