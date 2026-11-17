// Witch Hut -- a hag lobbing potions that leave lingering brews (CONTRACTS #7).
//
// The base attack is a 'zone': a splash of glue that drops on the lead mob and
// slows everything that walks through it (the glue-gunner analog). One splash
// carries one status slot -- the slow -- so the extra effects each path layers on
// (corrosive poison, hexing weakness) are applied by onHit behaviours instead,
// reading their power from stats.* fields so every tier is a clean stat bump.
//
// Polymorph (P2 t5) needs to actually swap a mob for a silverfish, and Tar Bomb
// (P1 t5) drops a real hazard, so this file imports the sim's Mob/spawnZone. That
// is allowed -- data files may not import gfx/audio/ui, but sim is headless-safe.

import { Mob } from '../../sim/mobs.js';
import { spawnZone } from '../../sim/projectiles.js';

/**
 * Corrosive Brew: coat a struck mob in poison (and, at Creeping Doom, spread it
 * to neighbours). addStatus refreshes the strongest dps, so re-tagging every zone
 * tick simply keeps the poison topped up while a mob wallows in the puddle.
 */
function witchPoison(ctx) {
    var t = ctx.tower;
    var s = t.stats;
    if (!s.brewPoisonDps) return;
    var m = ctx.mob;
    if (m.addStatus) {
        m.addStatus({ id: 'poison', dps: s.brewPoisonDps, duration: s.brewPoisonDur, damageType: 'poison' });
    }
    if (s.poisonSpread > 0 && ctx.game.grid) {
        var near = ctx.game.grid.queryCircle(m.x, m.y, s.poisonSpreadRange || 70);
        var spread = 0;
        for (var i = 0; i < near.length && spread < s.poisonSpread; i++) {
            var o = near[i];
            if (!o.alive || o === m || !o.addStatus) continue;
            o.addStatus({ id: 'poison', dps: s.brewPoisonDps * 0.6, duration: s.brewPoisonDur, damageType: 'poison' });
            spread++;
            if (ctx.game.fx && ctx.game.fx.spawn) ctx.game.fx.spawn('magic', o.x, o.y, { count: 2, color: '#8ede4b' });
        }
    }
}

/** Hexes: brand a struck mob with weakness so every other tower hits it harder. */
function witchHex(ctx) {
    var s = ctx.tower.stats;
    if (!(s.hexPower > 1)) return;
    var m = ctx.mob;
    if (m.addStatus) m.addStatus({ id: 'weakness', power: s.hexPower, duration: s.hexDur });
}

/**
 * Polymorph: on a timer, transform a random non-boss mob in range into a lowly
 * silverfish. The victim is voided directly (alive/_dead set) so it grants no
 * bounty and spawns no children -- you earn only the silverfish it becomes.
 */
function witchPolymorph(ctx) {
    var t = ctx.tower;
    var g = ctx.game;
    t._polyT = (t._polyT || 0) + ctx.dt;
    var iv = t.stats.polyInterval || 4;
    if (t._polyT < iv) return;
    t._polyT -= iv;

    var r = (t.stats.range || 150) * (t.stats.rangeMul || 1);
    var cand = g.grid ? g.grid.queryCircle(t.x, t.y, r) : (g.mobs || []);
    var pool = [];
    for (var i = 0; i < cand.length; i++) {
        var m = cand[i];
        if (!m.alive || m.id === 'silverfish') continue;
        if (m.def && m.def.flags && m.def.flags.boss) continue;
        pool.push(m);
    }
    if (!pool.length) return;

    var victim = g.rng ? g.rng.pick(pool) : pool[0];
    var ox = victim.x;
    var oy = victim.y;
    var pidx = victim.pathIndex;
    var pdist = victim.dist;
    victim.alive = false;
    victim._dead = true;

    var sf = new Mob(g, 'silverfish', { pathIndex: pidx, dist: pdist });
    g.mobs.push(sf);
    if (g.bus) g.bus.emit('mob:spawn', { mob: sf });
    if (g.fx && g.fx.spawn) g.fx.spawn('magic', ox, oy, { count: 12, color: '#c58bff' });
    if (g.sfx) g.sfx.play('splash_potion');
}

/** Tar Bomb ability: drop a giant near-stop tar pit on the most advanced mob. */
function tarBomb(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var px = t.x;
    var py = t.y;
    var mobs = g.mobs || [];
    var best = null;
    var bestFrac = -1;
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive) continue;
        var path = g.paths && g.paths[m.pathIndex || 0];
        var len = path && path.length ? path.length : 1;
        var frac = (m.dist || 0) / len;
        if (frac > bestFrac) { bestFrac = frac; best = m; }
    }
    if (best) { px = best.x; py = best.y; }

    spawnZone(g, {
        x: px, y: py, source: t, radius: 110, duration: 6, tickRate: 0.4,
        color: 'rgba(90,180,60,0.5)', kind: 'poison',
        atk: {
            kind: 'zone', damage: 2, damageType: 'poison',
            status: { id: 'slow', power: 0.12, duration: 1.4 },
        },
    });
    if (g.fx) { g.fx.splash(px, py, '#6ab24a'); g.fx.shockwave(px, py, 110); }
    if (g.sfx) g.sfx.play('splash_potion');
}

export default {
    id: 'witch_hut',
    name: 'Witch Hut',
    category: 'magic',
    cost: 270,
    desc: 'A swamp witch who lobs potions that pool into slowing, corroding brews.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 150,
        camoDetect: false,
        seesFlying: true,
        brewPoisonDps: 0,
        brewPoisonDur: 2.5,
        hexPower: 0,
        hexDur: 3,
        poisonSpread: 0,
        poisonSpreadRange: 70,
        polyInterval: 4,
        attacks: [
            {
                kind: 'zone',
                cooldown: 1.3,
                damage: 1,
                pierce: 1,
                damageType: 'poison',
                range: null,
                count: 1,
                spread: 0,
                aoe: 0,
                zone: { radius: 44, duration: 2.6, tickRate: 0.5, charges: null },
                status: { id: 'slow', power: 0.6, duration: 0.9 },
                sfx: 'splash_potion',
                zoneColor: 'rgba(120,220,70,0.32)',
                zoneKind: 'poison',
            },
        ],
    },
    paths: [
        {
            name: 'Corrosive Brew',
            upgrades: [
                {
                    name: 'Bubbling Brew',
                    cost: 160,
                    desc: 'The brew corrodes: struck mobs take 3 poison damage/sec.',
                    effects: [
                        { type: 'stat', target: 'brewPoisonDps', set: 3 },
                        { type: 'behavior', hook: 'onHit', fn: witchPoison },
                    ],
                },
                {
                    name: 'Corrosive Concoction',
                    cost: 300,
                    desc: 'Nastier acid: +4 poison/sec and it lingers longer.',
                    effects: [
                        { type: 'stat', target: 'brewPoisonDps', add: 4 },
                        { type: 'stat', target: 'brewPoisonDur', add: 1 },
                    ],
                },
                {
                    name: 'Festering Fumes',
                    cost: 800,
                    desc: '+7 poison/sec and a wider splash.',
                    effects: [
                        { type: 'stat', target: 'brewPoisonDps', add: 7 },
                        { type: 'stat', target: 'attacks.0.zone.radius', add: 10 },
                    ],
                },
                {
                    name: 'Plague Cauldron',
                    cost: 2200,
                    desc: '+14 poison/sec, longer-lasting puddles and rot.',
                    effects: [
                        { type: 'stat', target: 'brewPoisonDps', add: 14 },
                        { type: 'stat', target: 'brewPoisonDur', add: 2 },
                        { type: 'stat', target: 'attacks.0.zone.duration', add: 1 },
                    ],
                },
                {
                    name: 'Creeping Doom',
                    cost: 7500,
                    desc: 'Virulent rot (+30/sec) that leaps to 4 nearby mobs.',
                    effects: [
                        { type: 'stat', target: 'brewPoisonDps', add: 30 },
                        { type: 'stat', target: 'poisonSpread', set: 4 },
                        { type: 'stat', target: 'poisonSpreadRange', set: 84 },
                    ],
                },
            ],
        },
        {
            name: 'Widespread Splash',
            upgrades: [
                {
                    name: 'Wide Splash',
                    cost: 150,
                    desc: 'Bigger puddles that grip harder.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.zone.radius', add: 10 },
                        { type: 'stat', target: 'attacks.0.status.power', set: 0.5 },
                    ],
                },
                {
                    name: 'Sticky Residue',
                    cost: 290,
                    desc: 'Thicker glue slows more and clings longer.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.status.power', set: 0.42 },
                        { type: 'stat', target: 'attacks.0.status.duration', set: 1.2 },
                    ],
                },
                {
                    name: 'Lingering Potion',
                    cost: 720,
                    desc: 'Puddles last far longer and spread wider.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.zone.duration', add: 2 },
                        { type: 'stat', target: 'attacks.0.zone.radius', add: 8 },
                    ],
                },
                {
                    name: 'Molasses Mixture',
                    cost: 1950,
                    desc: 'Mobs crawl to a near halt across a huge splash.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.status.power', set: 0.3 },
                        { type: 'stat', target: 'attacks.0.zone.radius', add: 10 },
                    ],
                },
                {
                    name: 'Tar Pit Cauldron',
                    cost: 6800,
                    desc: 'Massive near-stop tar pits, plus the Tar Bomb ability.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.status.power', set: 0.15 },
                        { type: 'stat', target: 'attacks.0.zone.radius', add: 16 },
                        { type: 'stat', target: 'attacks.0.zone.duration', add: 2 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'tar_bomb',
                                name: 'Tar Bomb',
                                desc: 'Hurl a giant cauldron of tar onto the lead mob, near-stopping everything in it for 6s.',
                                cooldown: 35,
                                use: tarBomb,
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Hexes',
            upgrades: [
                {
                    name: 'Hex Brew',
                    cost: 180,
                    desc: 'Hexed mobs take +25% damage from all sources.',
                    effects: [
                        { type: 'stat', target: 'hexPower', set: 1.25 },
                        { type: 'behavior', hook: 'onHit', fn: witchHex },
                    ],
                },
                {
                    name: 'Deeper Hex',
                    cost: 330,
                    desc: 'A stronger curse: +40% damage taken.',
                    effects: [
                        { type: 'stat', target: 'hexPower', set: 1.4 },
                    ],
                },
                {
                    name: 'Ruinous Curse',
                    cost: 900,
                    desc: '+60% damage taken, a longer hex, and greater reach.',
                    effects: [
                        { type: 'stat', target: 'hexPower', set: 1.6 },
                        { type: 'stat', target: 'hexDur', set: 4 },
                        { type: 'stat', target: 'range', mul: 1.15 },
                    ],
                },
                {
                    name: "Witch's Sight",
                    cost: 2400,
                    desc: 'Sees through camo and deepens the hex to +80%.',
                    effects: [
                        { type: 'stat', target: 'hexPower', set: 1.8 },
                        { type: 'flag', flag: 'camoDetect' },
                    ],
                },
                {
                    name: 'Polymorph',
                    cost: 7200,
                    desc: 'Doubles damage taken and periodically morphs a non-boss mob into a silverfish.',
                    effects: [
                        { type: 'stat', target: 'hexPower', set: 2 },
                        { type: 'stat', target: 'polyInterval', set: 3.5 },
                        { type: 'behavior', hook: 'onTick', fn: witchPolymorph },
                    ],
                },
            ],
        },
    ],
};
