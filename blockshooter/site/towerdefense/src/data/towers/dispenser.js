// Dispenser -- the reference tower (CONTRACTS.md Appendix A entry 1).
//
// A humble arrow-shooting redstone contraption and the cheapest primary tower.
// This def is the worked example for the whole roster: it deliberately exercises
// EVERY effect type -- stat, flag, attackReplace, behavior and ability -- so the
// other 19 towers (and the reviewer) have a concrete pattern to follow.
//
// Crosspath note on P2 t4 'Seeker Rounds': attackReplace swaps attacks[0] for a
// homing variant. A full replacement discards multiplicative crosspath already
// applied to that attack (P0/P1 tiers run first), so the replacement's base
// damage/pierce are tuned to equal-or-exceed the legal 2-tier crosspath, keeping
// the swap a net upgrade rather than a regression.

/** Boss-bonus behavior: Diamond-Tip darts punch extra hard through bosses. */
function diamondBossBonus(ctx) {
    var f = ctx.mob && ctx.mob.def && ctx.mob.def.flags;
    if (f && f.boss) ctx.mob.takeDamage(8, 'sharp', ctx.tower, { armorPiercing: true });
}

/** Crit behavior: 15% chance for +5 bonus sharp damage, seeded via game.rng. */
function critEye(ctx) {
    if (!ctx.game.rng || !ctx.game.rng.chance(0.15)) return;
    var t = ctx.tower;
    var ap = !!(t.stats && t.stats.armorPiercing);
    ctx.mob.takeDamage(5, 'sharp', t, { armorPiercing: ap });
    if (t) t.damageDealt = (t.damageDealt || 0) + 5;
    if (ctx.game.fx) {
        ctx.game.fx.text(ctx.mob.x, ctx.mob.y - 14, 'CRIT', '#ffd54a');
        if (ctx.game.fx.spawn) ctx.game.fx.spawn('crit', ctx.mob.x, ctx.mob.y, { count: 6 });
    }
}

export default {
    id: 'dispenser',
    name: 'Dispenser',
    category: 'primary',
    cost: 170,
    desc: 'A redstone dispenser that flings arrows at anything on the track.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 130,
        camoDetect: false,
        seesFlying: true,
        attacks: [
            {
                kind: 'projectile',
                cooldown: 0.85,
                damage: 1,
                pierce: 1,
                damageType: 'sharp',
                range: null,
                count: 1,
                spread: 0,
                aoe: 0,
                projectile: { sprite: 'arrow', speed: 780, lifetime: 1.1, motion: 'straight', turnRate: 0 },
                sfx: 'arrow',
            },
        ],
    },
    paths: [
        {
            name: 'Piercing Point',
            upgrades: [
                {
                    name: 'Sharpened Tips',
                    cost: 95,
                    desc: 'Filed arrowheads deal +1 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 1 },
                    ],
                },
                {
                    name: 'Barbed Arrows',
                    cost: 150,
                    desc: 'Barbs let each arrow pierce +2 extra targets.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.pierce', add: 2 },
                    ],
                },
                {
                    name: 'Spectral Arrows',
                    cost: 500,
                    desc: '+2 damage, +1 pierce, and 30% faster arrows.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 1 },
                        { type: 'stat', target: 'attacks.0.projectile.speed', mul: 1.3 },
                    ],
                },
                {
                    name: 'Tungsten Tips',
                    cost: 1400,
                    desc: 'Armor-piercing heads ignore armor, and +2 damage.',
                    effects: [
                        { type: 'flag', flag: 'armorPiercing' },
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                    ],
                },
                {
                    name: 'Diamond-Tip Barrage',
                    cost: 5200,
                    desc: 'Massive diamond darts: 12 damage, 9 pierce, +8 bonus vs bosses.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', set: 12 },
                        { type: 'stat', target: 'attacks.0.pierce', set: 9 },
                        { type: 'stat', target: 'attacks.0.projectile.speed', set: 1000 },
                        { type: 'behavior', hook: 'onHit', fn: diamondBossBonus },
                    ],
                },
            ],
        },
        {
            name: 'Redstone Clock',
            upgrades: [
                {
                    name: 'Oiled Gears',
                    cost: 100,
                    desc: '15% faster firing.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
                    ],
                },
                {
                    name: 'Tuned Springs',
                    cost: 160,
                    desc: 'A tighter clock cuts the firing delay further.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.82 },
                    ],
                },
                {
                    name: 'Rapid Redstone',
                    cost: 480,
                    desc: 'Overclocked redstone: noticeably faster arrows.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.78 },
                    ],
                },
                {
                    name: 'Redstone Engine',
                    cost: 1300,
                    desc: 'A pumping engine drives the fire rate way up.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.7 },
                    ],
                },
                {
                    name: 'Redstone Overdrive',
                    cost: 4800,
                    desc: 'A blistering arrow stream, plus Overdrive: 8s of doubled speed.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', set: 0.06 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'overdrive',
                                name: 'Overdrive',
                                desc: 'Doubles this Dispenser\'s attack speed for 8 seconds.',
                                cooldown: 45,
                                use: function (ctx) {
                                    ctx.tower.addBuff({
                                        id: 'dispenser_overdrive',
                                        source: ctx.tower,
                                        dur: 8,
                                        mults: { attackSpeed: 2 },
                                        flags: {},
                                    });
                                    if (ctx.game.fx && ctx.game.fx.spawn) {
                                        ctx.game.fx.spawn('spark', ctx.tower.x, ctx.tower.y, { count: 18, color: '#ff3b30' });
                                    }
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Spotter Optics',
            upgrades: [
                {
                    name: 'Spyglass',
                    cost: 110,
                    desc: '+25% range.',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.25 },
                    ],
                },
                {
                    name: 'Optical Sensor',
                    cost: 150,
                    desc: 'Detects camo mobs.',
                    effects: [
                        { type: 'flag', flag: 'camoDetect' },
                    ],
                },
                {
                    name: 'Critical Eye',
                    cost: 520,
                    desc: '15% of hits crit for +5 bonus damage.',
                    effects: [
                        { type: 'behavior', hook: 'onHit', fn: critEye },
                    ],
                },
                {
                    name: 'Seeker Rounds',
                    cost: 1500,
                    desc: 'Arrows home in on their target.',
                    effects: [
                        {
                            type: 'attackReplace',
                            index: 0,
                            attack: {
                                kind: 'projectile',
                                cooldown: 0.8,
                                damage: 3,
                                pierce: 3,
                                damageType: 'sharp',
                                range: null,
                                count: 1,
                                spread: 0,
                                aoe: 0,
                                projectile: { sprite: 'arrow', speed: 820, lifetime: 1.6, motion: 'homing', turnRate: 6 },
                                sfx: 'arrow',
                            },
                        },
                    ],
                },
                {
                    name: 'Ender Seeker',
                    cost: 5000,
                    desc: 'Relentless homing darts: +4 pierce, +3 damage, +40% range.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.pierce', add: 4 },
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                        { type: 'stat', target: 'range', mul: 1.4 },
                        { type: 'stat', target: 'attacks.0.projectile.speed', set: 900 },
                    ],
                },
            ],
        },
    ],
};
