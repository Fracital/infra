// Alex -- the ranger hero (CONTRACTS Appendix D).
//
// A sharpshooter with the longest natural reach in the game. Her level curve
// climbs damage/range/attack-speed every level, with signature beats at 5
// (critical hits come online), 8 (piercing shots + eagle-eye camo sight), 13
// (crits get deadlier) and 16 (rail-velocity multi-pierce shots). Abilities land
// at 3 (Power Shot) and 10 (Rain of Arrows); level 20 makes crits chain to a
// second target. Headless-safe: behaviors touch the world only through ctx.

/** Path progress fraction of a mob (multi-path fair), for "first"-style aiming. */
function pathProgressOf(game, m) {
    var p = game.paths && game.paths[m.pathIndex || 0];
    var len = p && p.length ? p.length : 1;
    return (m.dist || 0) / len;
}

/** L5 crit: a percentage of hits deal bonus damage; at L20 the crit arcs to a neighbour. */
function alexCrit(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var m = ctx.mob;
    if (!m) return;
    var chance = (t.stats && t.stats.critChance) || 0;
    if (chance <= 0 || !g.rng || !g.rng.chance(chance)) return;
    var bonus = (t.stats && t.stats.critBonus) || 8;
    var ap = !!(t.stats && t.stats.armorPiercing);
    var dealt = m.takeDamage(bonus, 'sharp', t, { armorPiercing: ap });
    t.damageDealt = (t.damageDealt || 0) + dealt;
    if (g.fx) {
        g.fx.text(m.x, m.y - 16, 'CRIT', '#ffd54a');
        g.fx.spawn('crit', m.x, m.y, { count: 8 });
    }
    if (t.stats && t.stats.critChain) {
        var mobs = g.mobs;
        var best = null;
        var bestD = 100 * 100;
        for (var i = 0; i < mobs.length; i++) {
            var o = mobs[i];
            if (!o.alive || o === m) continue;
            var dx = o.x - m.x;
            var dy = o.y - m.y;
            var d2 = dx * dx + dy * dy;
            if (d2 < bestD) { bestD = d2; best = o; }
        }
        if (best) {
            var d = best.takeDamage(bonus * 0.7, 'sharp', t, { armorPiercing: ap });
            t.damageDealt = (t.damageDealt || 0) + d;
            if (g.fx) g.fx.spawn('crit', best.x, best.y, { count: 5 });
        }
    }
}

/** L3 Power Shot: a piercing line arrow that spears everything in a lane toward the lead mob. */
function alexPowerShot(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var mobs = g.mobs;
    if (!mobs || !mobs.length) return;
    var aim = null;
    var bestP = -1;
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive) continue;
        var p = pathProgressOf(g, m);
        if (p > bestP) { bestP = p; aim = m; }
    }
    if (!aim) return;
    var ang = Math.atan2(aim.y - t.y, aim.x - t.x);
    var dx = Math.cos(ang);
    var dy = Math.sin(ang);
    var range = ((t.stats && t.stats.range) || 180) * 1.6;
    var corridor = 24;
    var dmg = (t.stats && t.stats.powerShotDamage) || 34;
    var ap = !!(t.stats && t.stats.armorPiercing);
    for (var j = 0; j < mobs.length; j++) {
        var o = mobs[j];
        if (!o.alive) continue;
        var rx = o.x - t.x;
        var ry = o.y - t.y;
        var along = rx * dx + ry * dy;
        if (along < 0 || along > range) continue;
        var perp = Math.abs(rx * dy - ry * dx);
        if (perp > corridor + (o.radius || 0)) continue;
        var dealt = o.takeDamage(dmg, 'sharp', t, { armorPiercing: ap });
        t.damageDealt = (t.damageDealt || 0) + dealt;
    }
    if (g.fx) {
        g.fx.beam(t.x, t.y, t.x + dx * range, t.y + dy * range, { color: '#bfe9ff', width: 5, duration: 0.14 });
        g.fx.spawn('muzzle', t.x, t.y, { count: 8 });
    }
    if (g.sfx) g.sfx.play('bolt');
}

/** L10 Rain of Arrows: a map-wide volley that peppers every enemy on the field. */
function alexRain(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var mobs = g.mobs || [];
    var dmg = (t.stats && t.stats.rainDamage) || 16;
    var ap = !!(t.stats && t.stats.armorPiercing);
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive) continue;
        var dealt = m.takeDamage(dmg, 'sharp', t, { armorPiercing: ap });
        t.damageDealt = (t.damageDealt || 0) + dealt;
        if (g.fx && g.rng && g.rng.chance(0.5)) g.fx.spawn('feather', m.x, m.y - 10, { count: 2 });
    }
    if (g.fx) {
        g.fx.shake(0.4);
        g.fx.spawn('muzzle', t.x, t.y, { count: 10 });
    }
    if (g.sfx) g.sfx.play('arrow');
}

export default {
    id: 'alex',
    name: 'Alex',
    category: 'military',
    cost: 425,
    isHero: true,
    desc: 'A long-range ranger whose crits punch far above her arrow count.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 180,
        camoDetect: false,
        seesFlying: true,
        critChance: 0,
        critBonus: 0,
        powerShotDamage: 34,
        rainDamage: 16,
        attacks: [
            {
                kind: 'projectile',
                cooldown: 0.85,
                damage: 5,
                pierce: 1,
                damageType: 'sharp',
                range: null,
                count: 1,
                spread: 0,
                aoe: 0,
                projectile: { sprite: 'arrow', speed: 1000, lifetime: 1.5, motion: 'straight', turnRate: 0 },
                sfx: 'arrow',
            },
        ],
    },
    paths: [],
    levels: [
        {
            level: 2,
            desc: 'Steady aim: +2 damage and +8 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 2 },
                { type: 'stat', target: 'range', add: 8 },
            ],
        },
        {
            level: 3,
            desc: 'Power Shot (ability): a piercing line arrow that spears a whole lane. +5 range.',
            effects: [
                { type: 'stat', target: 'range', add: 5 },
                {
                    type: 'ability',
                    ability: {
                        id: 'alex_power_shot',
                        name: 'Power Shot',
                        desc: 'Fire a piercing arrow in a line, hitting everything in its path.',
                        cooldown: 14,
                        use: alexPowerShot,
                    },
                },
            ],
        },
        {
            level: 4,
            desc: 'Fletching: faster nocking, and arrows begin to pierce (+1).',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.94 },
                { type: 'stat', target: 'attacks.0.pierce', add: 1 },
            ],
        },
        {
            level: 5,
            desc: 'Critical Eye: 25% of shots crit for +10 damage. +2 damage.',
            effects: [
                { type: 'stat', target: 'critChance', set: 0.25 },
                { type: 'stat', target: 'critBonus', set: 10 },
                { type: 'stat', target: 'attacks.0.damage', add: 2 },
                { type: 'behavior', hook: 'onHit', fn: alexCrit },
            ],
        },
        {
            level: 6,
            desc: 'Broadheads: +3 damage and +8 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 3 },
                { type: 'stat', target: 'range', add: 8 },
            ],
        },
        {
            level: 7,
            desc: 'Quick draw: faster shots.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.92 },
            ],
        },
        {
            level: 8,
            desc: 'Eagle Eye: sees camo, and arrows pierce +2 more. +2 damage, swifter arrows.',
            effects: [
                { type: 'flag', flag: 'camoDetect' },
                { type: 'stat', target: 'attacks.0.pierce', add: 2 },
                { type: 'stat', target: 'attacks.0.damage', add: 2 },
                { type: 'stat', target: 'attacks.0.projectile.speed', mul: 1.15 },
            ],
        },
        {
            level: 9,
            desc: 'Marksmanship: +4 damage and +10 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 4 },
                { type: 'stat', target: 'range', add: 10 },
            ],
        },
        {
            level: 10,
            desc: 'Rain of Arrows (ability): a map-wide volley strikes every enemy. Faster shots.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.92 },
                {
                    type: 'ability',
                    ability: {
                        id: 'alex_rain_of_arrows',
                        name: 'Rain of Arrows',
                        desc: 'Loose a sky-darkening volley that hits every enemy on the map.',
                        cooldown: 30,
                        use: alexRain,
                    },
                },
            ],
        },
        {
            level: 11,
            desc: 'Deadlier crits: +6 crit damage and +5 base damage.',
            effects: [
                { type: 'stat', target: 'critBonus', add: 6 },
                { type: 'stat', target: 'attacks.0.damage', add: 5 },
            ],
        },
        {
            level: 12,
            desc: 'Snap shots: faster firing and +10 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.9 },
                { type: 'stat', target: 'range', add: 10 },
            ],
        },
        {
            level: 13,
            desc: 'Killer instinct: crit chance +10%, +4 damage, +1 pierce.',
            effects: [
                { type: 'stat', target: 'critChance', add: 0.1 },
                { type: 'stat', target: 'attacks.0.damage', add: 4 },
                { type: 'stat', target: 'attacks.0.pierce', add: 1 },
            ],
        },
        {
            level: 14,
            desc: 'Sharpshooter: +6 damage and +12 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 6 },
                { type: 'stat', target: 'range', add: 12 },
            ],
        },
        {
            level: 15,
            desc: 'Rapid volley: faster shots and +2 pierce.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.88 },
                { type: 'stat', target: 'attacks.0.pierce', add: 2 },
            ],
        },
        {
            level: 16,
            desc: 'Rail Shot: arrows fly at rail velocity through +3 more enemies. +8 damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.pierce', add: 3 },
                { type: 'stat', target: 'attacks.0.damage', add: 8 },
                { type: 'stat', target: 'attacks.0.projectile.speed', set: 1500 },
            ],
        },
        {
            level: 17,
            desc: 'Piercing shots: +8 damage and +12 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 8 },
                { type: 'stat', target: 'range', add: 12 },
            ],
        },
        {
            level: 18,
            desc: 'Blinding speed: faster firing and +8 crit damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.86 },
                { type: 'stat', target: 'critBonus', add: 8 },
            ],
        },
        {
            level: 19,
            desc: 'Deadeye: +10 damage and +2 pierce.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 10 },
                { type: 'stat', target: 'attacks.0.pierce', add: 2 },
            ],
        },
        {
            level: 20,
            desc: 'Chain Crits (passive): every crit ricochets to a nearby enemy. Crit chance +10%, +10 damage.',
            effects: [
                { type: 'flag', flag: 'critChain' },
                { type: 'stat', target: 'critChance', add: 0.1 },
                { type: 'stat', target: 'attacks.0.damage', add: 10 },
            ],
        },
    ],
};
