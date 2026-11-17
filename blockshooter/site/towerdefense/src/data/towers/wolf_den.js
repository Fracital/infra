// Wolf Den -- a spawner that looses a hunting pack of wolves onto the track
// (CONTRACTS Appendix A entry 14).
//
// Engine reality that shapes this whole kit: summoned Units read their stats from
// UNIT_TYPES at spawn and never expire (life 999), so a tower upgrade can NOT
// retro-buff a wolf that is already prowling. Everything that must scale with
// tiers is therefore delivered through the DEN'S OWN onHit/onTick hooks, which
// dealHit() runs for every wolf bite (the wolf's source is this tower) and reads
// live from tower.stats. That keeps upgrades effective on the existing pack.
// Consequences worth noting: unit hp is invulnerable in this engine (so P0's
// "hp" is flavor only), and wolves cannot be granted camo sight or a speed buff
// through UNIT_TYPES from here -- the frost pack's "scent" is realised as the den
// stripping camo in its hunting range, and the Wild Hunt howl rallies allied
// towers instead of the (unbuffable) wolves.

/**
 * Live per-bite bonus. Read fresh from tower.stats each hit so P0 upgrades land
 * on wolves that were summoned before the upgrade was bought. Armor-piercing so
 * the pack still shreds husks and wither skeletons (their base bite is 'sharp'
 * and would otherwise glance off armor).
 */
function wolfRend(ctx) {
    var t = ctx.tower;
    var m = ctx.mob;
    var r = (t.stats && t.stats.wolfRend) || 0;
    if (r <= 0 || !m) return;
    var dealt = m.takeDamage(r, 'sharp', t, { armorPiercing: true });
    if (dealt > 0) t.damageDealt = (t.damageDealt || 0) + dealt;
}

/** Throat-Ripper: dire fangs sink true damage into MOAB-class hide. */
function bossBite(ctx) {
    var m = ctx.mob;
    var f = m && m.def && m.def.flags;
    if (f && f.boss) {
        var d = m.takeDamage(18, 'true', ctx.tower, {});
        if (d > 0) ctx.tower.damageDealt = (ctx.tower.damageDealt || 0) + d;
    }
}

/** Alpha: rend bosses harder and finish off any weakened prey outright. */
function alphaExecute(ctx) {
    var t = ctx.tower;
    var m = ctx.mob;
    var g = ctx.game;
    if (!m || !m.alive) return;
    var f = m.def && m.def.flags;
    if (f && f.boss) {
        var d = m.takeDamage(40, 'true', t, {});
        if (d > 0) t.damageDealt = (t.damageDealt || 0) + d;
        return;
    }
    if (m.hp <= m.maxHp * 0.12) {
        var k = m.takeDamage(m.maxHp, 'true', t, {});
        if (k > 0) t.damageDealt = (t.damageDealt || 0) + k;
        if (g.fx) g.fx.spawn('bone', m.x, m.y, { count: 4 });
    }
}

/** Frost Wolves: every bite chills, with a freeze chance once the pack is deep-frozen. */
function frostBite(ctx) {
    var t = ctx.tower;
    var m = ctx.mob;
    var g = ctx.game;
    var fp = t.stats && t.stats.frostBite;
    if (!fp || !m || !m.addStatus) return;
    m.addStatus({ id: 'slow', power: fp.power, duration: fp.duration, damageType: 'cold', source: t });
    if (fp.freezeChance && g.rng && g.rng.chance(fp.freezeChance)) {
        m.addStatus({ id: 'freeze', duration: fp.freezeDur || 0.6, damageType: 'cold', source: t });
    }
    if (g.fx) g.fx.spawn('frost', m.x, m.y, { count: 2 });
}

/**
 * Winter Pack scent: the den itself reveals camo prey in the wolves' hunting
 * range (a Unit's camo sight is fixed by its archetype and cannot be granted
 * from the tower, so we strip the camo modifier instead).
 */
function scentDetect(ctx) {
    var t = ctx.tower;
    var g = ctx.game;
    t._scentT = (t._scentT || 0) + ctx.dt;
    if (t._scentT < 0.5) return;
    t._scentT = 0;
    var r = (t.stats.range || 160) * (t.stats.rangeMul || 1);
    var r2 = r * r;
    var mobs = g.grid ? g.grid.queryCircle(t.x, t.y, r + 64) : (g.mobs || []);
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive || !m.modifiers || !m.modifiers.camo) continue;
        var dx = m.x - t.x;
        var dy = m.y - t.y;
        if (dx * dx + dy * dy > r2) continue;
        m.modifiers.camo = false;
        if (g.fx) g.fx.spawn('frost', m.x, m.y, { count: 1 });
    }
}

/** The Wild Hunt: a rallying howl that hastes allied towers in range (see note above). */
function howlUse(ctx) {
    var t = ctx.tower;
    var g = ctx.game;
    var r = (t.stats.range || 160) * (t.stats.rangeMul || 1);
    var r2 = r * r;
    for (var i = 0; i < g.towers.length; i++) {
        var o = g.towers[i];
        var dx = o.x - t.x;
        var dy = o.y - t.y;
        if (dx * dx + dy * dy > r2) continue;
        o.addBuff({ id: 'wild_hunt_howl', source: t, dur: 6, mults: { attackSpeed: 1.3 }, flags: {} });
    }
    if (g.sfx) g.sfx.play('wolf_bark');
    if (g.fx) g.fx.spawn('note', t.x, t.y - 10, { count: 8 });
}

export default {
    id: 'wolf_den',
    name: 'Wolf Den',
    category: 'military',
    cost: 425,
    desc: 'A den that looses a pack of wolves to hunt anything within its territory.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 165,
        camoDetect: false,
        seesFlying: false,
        attacks: [
            {
                kind: 'spawn',
                cooldown: 3.5,
                unit: 'wolf',
                max: 2,
                sfx: 'wolf_bark',
            },
        ],
    },
    paths: [
        {
            name: 'Dire Wolves',
            upgrades: [
                {
                    name: 'Sharpened Fangs',
                    cost: 300,
                    desc: 'Wolves rend for +4 bonus armor-piercing damage on every bite.',
                    effects: [
                        { type: 'behavior', hook: 'onHit', fn: wolfRend },
                        { type: 'stat', target: 'wolfRend', set: 4 },
                    ],
                },
                {
                    name: 'Dire Wolves',
                    cost: 520,
                    desc: 'Bigger, hungrier wolves: +5 bite damage and they deploy faster.',
                    effects: [
                        { type: 'stat', target: 'wolfRend', add: 5 },
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
                    ],
                },
                {
                    name: 'Savage Bloodline',
                    cost: 1300,
                    desc: '+9 bite damage and a wider hunting range.',
                    effects: [
                        { type: 'stat', target: 'wolfRend', add: 9 },
                        { type: 'stat', target: 'range', add: 15 },
                    ],
                },
                {
                    name: 'Throat-Ripper',
                    cost: 3400,
                    desc: '+14 bite damage; fangs also tear 18 true damage into bosses.',
                    effects: [
                        { type: 'stat', target: 'wolfRend', add: 14 },
                        { type: 'behavior', hook: 'onHit', fn: bossBite },
                    ],
                },
                {
                    name: 'Alpha',
                    cost: 12000,
                    desc: 'An apex pack: 65 bonus bite, executes prey under 12% HP and savages bosses.',
                    effects: [
                        { type: 'stat', target: 'wolfRend', set: 65 },
                        { type: 'stat', target: 'attacks.0.cooldown', set: 1.5 },
                        { type: 'behavior', hook: 'onHit', fn: alphaExecute },
                    ],
                },
            ],
        },
        {
            name: 'Growing Pack',
            upgrades: [
                {
                    name: 'Growing Pack',
                    cost: 300,
                    desc: 'Raise a third wolf.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.max', add: 1 },
                    ],
                },
                {
                    name: 'Pack Tactics',
                    cost: 500,
                    desc: 'A fourth wolf, and the den replaces losses faster.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.max', add: 1 },
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
                    ],
                },
                {
                    name: 'Wolf Warren',
                    cost: 1200,
                    desc: 'A fifth wolf joins the hunt.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.max', add: 1 },
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.8 },
                    ],
                },
                {
                    name: 'Hunting Party',
                    cost: 3200,
                    desc: 'A sixth wolf and near-instant replacements.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.max', add: 1 },
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.7 },
                    ],
                },
                {
                    name: 'The Wild Hunt',
                    cost: 11000,
                    desc: 'A full pack of six, and a rallying howl that hastes nearby towers 30% for 6s.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.max', set: 6 },
                        { type: 'stat', target: 'attacks.0.cooldown', set: 1.2 },
                        { type: 'stat', target: 'range', add: 25 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'wild_hunt',
                                name: 'Howl of the Hunt',
                                desc: 'The pack howls, hasting every tower in range by 30% for 6 seconds.',
                                cooldown: 40,
                                use: howlUse,
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Frost Wolves',
            upgrades: [
                {
                    name: 'Frost Wolves',
                    cost: 320,
                    desc: 'Icy bites slow enemies to 70% speed for 1.2s.',
                    effects: [
                        { type: 'behavior', hook: 'onHit', fn: frostBite },
                        { type: 'stat', target: 'frostBite', set: { power: 0.7, duration: 1.2 } },
                    ],
                },
                {
                    name: 'Biting Cold',
                    cost: 560,
                    desc: 'Deeper chill: enemies crawl at 55% speed for 1.6s.',
                    effects: [
                        { type: 'stat', target: 'frostBite', set: { power: 0.55, duration: 1.6 } },
                    ],
                },
                {
                    name: 'Deep Frost',
                    cost: 1400,
                    desc: 'A crippling 40% slow for 2s and a longer leash to chase chilled prey.',
                    effects: [
                        { type: 'stat', target: 'frostBite', set: { power: 0.4, duration: 2.0 } },
                        { type: 'stat', target: 'range', add: 20 },
                    ],
                },
                {
                    name: 'Frostbite',
                    cost: 3600,
                    desc: 'Bites occasionally freeze enemies solid.',
                    effects: [
                        { type: 'stat', target: 'frostBite', set: { power: 0.38, duration: 2.2, freezeChance: 0.14, freezeDur: 0.6 } },
                    ],
                },
                {
                    name: 'Winter Pack',
                    cost: 12500,
                    desc: 'Every bite may freeze, and the pack\'s keen nose reveals camo prey in range.',
                    effects: [
                        { type: 'stat', target: 'frostBite', set: { power: 0.35, duration: 2.4, freezeChance: 0.3, freezeDur: 0.8 } },
                        { type: 'flag', flag: 'camoDetect' },
                        { type: 'behavior', hook: 'onTick', fn: scentDetect },
                    ],
                },
            ],
        },
    ],
};
