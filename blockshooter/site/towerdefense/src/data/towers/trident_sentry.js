// Trident Sentry -- a drowned that hurls a returning trident (CONTRACTS Appendix A #6).
//
// The base weapon is a boomerang: the trident flies out to the tower's range and
// loops back, so it can strike a line of mobs twice per throw. The three paths
// specialise that throw -- raw impact (Riptide), volume (Loyalty), and secondary
// lightning (Channeling) -- rather than adding new attacks, which keeps attacks[0]
// the only attack and makes every crosspath's stat targets unambiguous.
//
// Behaviours deal their bonus through mob.takeDamage() directly (never dealHit),
// exactly like the dispenser reference: routing bonus damage back through dealHit
// would re-run this same onHit hook and recurse. All damage/chance knobs live in
// stats.* custom fields so each tier is a plain stat bump the behaviour re-reads.

/** Depth Charger: extra armor-piercing bite reserved for MOAB-class bosses. */
function tridentBossBonus(ctx) {
    var f = ctx.mob && ctx.mob.def && ctx.mob.def.flags;
    if (f && f.boss) {
        ctx.mob.takeDamage(12, 'sharp', ctx.tower, { armorPiercing: true });
        ctx.tower.damageDealt = (ctx.tower.damageDealt || 0) + 12;
    }
}

/** Leviathan Trident: the returning giant drags struck mobs back down the track. */
function tridentDragBack(ctx) {
    var t = ctx.tower;
    var pull = t.stats && t.stats.dragBack;
    if (!pull) return;
    var m = ctx.mob;
    if (m.def && m.def.flags && m.def.flags.boss) return;   // bosses are knockback-immune
    m.dist = Math.max(0, m.dist - pull);
}

/**
 * Channeling: a struck mob is arced by lightning, which then leaps to nearby mobs
 * with 0.8x falloff. All magic (armor never stops it), gated by stats.channelChance.
 */
function tridentChannel(ctx) {
    var t = ctx.tower;
    var s = t.stats;
    if (!s.channelDamage) return;
    var g = ctx.game;
    if (s.channelChance < 1 && (!g.rng || !g.rng.chance(s.channelChance))) return;

    var m = ctx.mob;
    var base = s.channelDamage;
    m.takeDamage(base, 'magic', t, {});
    t.damageDealt = (t.damageDealt || 0) + base;

    var pts = [[m.x, m.y - 44], [m.x, m.y]];
    var jumps = s.channelJumps | 0;
    if (jumps > 0 && g.grid) {
        var hit = { }; // identity set via a tiny array is fine at these counts
        var seen = [m];
        var cur = m;
        var mul = 1;
        for (var j = 0; j < jumps; j++) {
            var near = g.grid.queryCircle(cur.x, cur.y, s.channelRange || 96);
            var best = null;
            var bestD = Infinity;
            for (var i = 0; i < near.length; i++) {
                var o = near[i];
                if (!o.alive || seen.indexOf(o) !== -1) continue;
                var dx = o.x - cur.x;
                var dy = o.y - cur.y;
                var dd = dx * dx + dy * dy;
                if (dd < bestD) { bestD = dd; best = o; }
            }
            if (!best) break;
            mul *= 0.8;
            var d = base * mul;
            best.takeDamage(d, 'magic', t, {});
            t.damageDealt = (t.damageDealt || 0) + d;
            seen.push(best);
            cur = best;
            pts.push([best.x, best.y]);
        }
    }
    if (g.fx) g.fx.lightning(pts);
    if (g.sfx) g.sfx.play('zap');
}

/** Storm Herald ability: a lightning maelstrom hammers and stuns the whole board. */
function maelstrom(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var mobs = g.mobs || [];
    var pts = [[t.x, t.y]];
    var n = 0;
    for (var i = 0; i < mobs.length && n < 24; i++) {
        var m = mobs[i];
        if (!m.alive) continue;
        m.takeDamage(60, 'magic', t, {});
        t.damageDealt = (t.damageDealt || 0) + 60;
        if (m.addStatus) m.addStatus({ id: 'stun', power: 1, duration: 1.2, damageType: 'magic' });
        pts.push([m.x, m.y]);
        n++;
    }
    if (g.fx) {
        g.fx.lightning(pts);
        g.fx.flash('#8fd0ff', 0.25);
        g.fx.shake(0.5);
    }
    if (g.sfx) g.sfx.play('chain_zap');
}

export default {
    id: 'trident_sentry',
    name: 'Trident Sentry',
    category: 'military',
    cost: 325,
    desc: 'A drowned that hurls a heavy trident which loops back through the horde.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 150,
        camoDetect: false,
        seesFlying: true,
        channelChance: 0,
        channelDamage: 0,
        channelJumps: 0,
        channelRange: 96,
        dragBack: 0,
        attacks: [
            {
                kind: 'projectile',
                cooldown: 1.1,
                damage: 5,
                pierce: 2,
                damageType: 'sharp',
                range: null,
                count: 1,
                spread: 0.3,
                aoe: 0,
                projectile: { sprite: 'trident', speed: 520, lifetime: 2.5, motion: 'boomerang', turnRate: 0 },
                sfx: 'trident_throw',
            },
        ],
    },
    paths: [
        {
            name: 'Riptide',
            upgrades: [
                {
                    name: 'Sharpened Prongs',
                    cost: 200,
                    desc: 'Honed barbs add +4 damage per throw.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 4 },
                    ],
                },
                {
                    name: 'Barbed Trident',
                    cost: 400,
                    desc: '+5 damage and the trident punches through 2 more mobs.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 5 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 2 },
                    ],
                },
                {
                    name: 'Riptide Enchant',
                    cost: 950,
                    desc: '+8 damage, +2 pierce, and a faster, heavier throw.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 8 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 2 },
                        { type: 'stat', target: 'attacks.0.projectile.speed', mul: 1.2 },
                    ],
                },
                {
                    name: 'Depth Charger',
                    cost: 2600,
                    desc: 'Armor-piercing tip, +14 damage, and +12 bonus vs bosses.',
                    effects: [
                        { type: 'flag', flag: 'armorPiercing' },
                        { type: 'stat', target: 'attacks.0.damage', add: 14 },
                        { type: 'behavior', hook: 'onHit', fn: tridentBossBonus },
                    ],
                },
                {
                    name: 'Leviathan Trident',
                    cost: 9000,
                    desc: 'A colossal trident: +30 damage, +4 pierce, and it drags struck mobs backward.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 30 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 4 },
                        { type: 'stat', target: 'attacks.0.projectile.speed', mul: 1.15 },
                        { type: 'stat', target: 'dragBack', set: 22 },
                        { type: 'behavior', hook: 'onHit', fn: tridentDragBack },
                    ],
                },
            ],
        },
        {
            name: 'Loyalty',
            upgrades: [
                {
                    name: 'Loyalty I',
                    cost: 180,
                    desc: 'The trident returns faster: +22% throw rate and speed.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.82 },
                        { type: 'stat', target: 'attacks.0.projectile.speed', mul: 1.25 },
                    ],
                },
                {
                    name: 'Twin Tridents',
                    cost: 360,
                    desc: 'Throws two tridents in a spread.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.count', set: 2 },
                    ],
                },
                {
                    name: 'Swift Recall',
                    cost: 900,
                    desc: 'Snappier recall: faster throws and faster tridents.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.8 },
                        { type: 'stat', target: 'attacks.0.projectile.speed', mul: 1.15 },
                    ],
                },
                {
                    name: 'Riptide Rush',
                    cost: 2400,
                    desc: 'Three tridents per volley and a tighter throw cadence.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.count', set: 3 },
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
                    ],
                },
                {
                    name: 'Tidal Barrage',
                    cost: 8500,
                    desc: 'An unrelenting stream of three tridents fills the lane.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', set: 0.18 },
                        { type: 'stat', target: 'attacks.0.count', set: 3 },
                        { type: 'stat', target: 'attacks.0.projectile.speed', mul: 1.1 },
                    ],
                },
            ],
        },
        {
            name: 'Channeling',
            upgrades: [
                {
                    name: 'Channeling I',
                    cost: 220,
                    desc: '35% of hits call a lightning bolt for 6 magic damage.',
                    effects: [
                        { type: 'stat', target: 'channelDamage', set: 6 },
                        { type: 'stat', target: 'channelChance', set: 0.35 },
                        { type: 'behavior', hook: 'onHit', fn: tridentChannel },
                    ],
                },
                {
                    name: 'Storm Caller',
                    cost: 380,
                    desc: 'Stronger, more frequent bolts (10 damage, 55% chance).',
                    effects: [
                        { type: 'stat', target: 'channelDamage', add: 4 },
                        { type: 'stat', target: 'channelChance', set: 0.55 },
                    ],
                },
                {
                    name: 'Trident of the Tempest',
                    cost: 1000,
                    desc: 'Every hit sparks lightning that arcs to a nearby mob.',
                    effects: [
                        { type: 'stat', target: 'channelChance', set: 1 },
                        { type: 'stat', target: 'channelDamage', add: 6 },
                        { type: 'stat', target: 'channelJumps', set: 1 },
                    ],
                },
                {
                    name: 'Thunderous Might',
                    cost: 2800,
                    desc: 'Bolts hit harder and chain across two more mobs.',
                    effects: [
                        { type: 'stat', target: 'channelDamage', add: 12 },
                        { type: 'stat', target: 'channelJumps', set: 2 },
                        { type: 'stat', target: 'channelRange', set: 120 },
                    ],
                },
                {
                    name: 'Storm Herald',
                    cost: 9500,
                    desc: 'Devastating chain lightning on every hit, plus the Maelstrom ability.',
                    effects: [
                        { type: 'stat', target: 'channelDamage', add: 24 },
                        { type: 'stat', target: 'channelJumps', set: 4 },
                        { type: 'stat', target: 'channelRange', set: 150 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'maelstrom',
                                name: 'Maelstrom',
                                desc: 'Call a thunderstorm: 60 magic damage and a stun to every mob on screen.',
                                cooldown: 40,
                                use: maelstrom,
                            },
                        },
                    ],
                },
            ],
        },
    ],
};
