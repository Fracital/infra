// Anvil Catapult (CONTRACTS.md Appendix A entry 20) -- $700 military mortar.
//
// Lobs a heavy anvil that lands with a blunt AoE crush (attacks.js fireLob ->
// projectiles.js mortar arc -> explodeAoe). Blunt damage ignores armor, and the
// impact dazes survivors with a slow -- the "crater" is modeled as an on-impact
// slow status rather than a persistent ground zone (see deviations), while the
// Volcanic tier adds a real lingering lava zone.
//
// P0 grows the blast and the crater slow, P1 speeds the reload and finishes with
// a triple-anvil volley + barrage ability, P2 sets the payload on fire (burn +
// camo-stripping flare + lava pools). Burn strength lives as custom stats
// (burnDps/burnDur) so upgrades scale a single onHit behavior.

/** Meteor Anvil: an extra crush on bosses, with an occasional screen shake. */
function meteorCrush(ctx) {
    var f = ctx.mob.def && ctx.mob.def.flags;
    if (f && f.boss) ctx.mob.takeDamage(50, 'explosive', ctx.tower);
    if (ctx.game.fx && ctx.game.rng && ctx.game.rng.chance(0.2)) ctx.game.fx.shake(0.35);
}

/** Burning Payload: caught mobs catch fire (fire-immune mobs shrug it off in statuses.js). */
function applyBurn(ctx) {
    var s = ctx.tower.stats || {};
    var dps = s.burnDps || 0;
    if (dps <= 0) return;
    ctx.mob.addStatus({ id: 'burn', dps: dps, duration: s.burnDur || 2.5, damageType: 'fire', source: ctx.tower });
}

/** Decamo Flare: the blast burns off a mob's camo cloak for good. */
function decamoFlare(ctx) {
    var mob = ctx.mob;
    if (mob.modifiers && mob.modifiers.camo) {
        mob.modifiers.camo = false;
        var g = ctx.game;
        g.sfx.play('camo_reveal');
        if (g.fx && g.fx.spawn) g.fx.spawn('spark', mob.x, mob.y, { count: 8, color: '#ffd54a' });
    }
}

export default {
    id: 'anvil_catapult',
    name: 'Anvil Catapult',
    category: 'military',
    cost: 700,
    desc: 'Lobs a crushing anvil that flattens a patch of track and dazes survivors.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 210,
        camoDetect: false,
        seesFlying: false,             // anvils drop on the ground; they cannot swat fliers
        burnDps: 0,                    // Burning Payload dot strength (P2)
        burnDur: 0,
        attacks: [
            {
                kind: 'lob',
                cooldown: 2.2,
                damage: 12,
                damageType: 'blunt',
                range: null,
                aoe: 45,
                projectile: { sprite: 'anvil', speed: 340, lifetime: 3, motion: 'mortar' },
                status: { id: 'slow', power: 0.6, duration: 2.0 },
                sfx: 'anvil_land',
            },
        ],
    },
    paths: [
        {
            name: 'Heavier Anvils',
            upgrades: [
                {
                    name: 'Cast Iron',
                    cost: 420,
                    desc: '+6 damage and a wider blast.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 6 },
                        { type: 'stat', target: 'attacks.0.aoe', add: 10 },
                    ],
                },
                {
                    name: 'Reinforced Payload',
                    cost: 800,
                    desc: '+8 damage and a wider blast.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 8 },
                        { type: 'stat', target: 'attacks.0.aoe', add: 12 },
                    ],
                },
                {
                    name: 'Falling Star',
                    cost: 2000,
                    desc: '+14 damage, bigger blast, and a stronger crater slow.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 14 },
                        { type: 'stat', target: 'attacks.0.aoe', add: 16 },
                        { type: 'stat', target: 'attacks.0.status.power', mul: 0.85 },
                    ],
                },
                {
                    name: 'Gravity Well',
                    cost: 5500,
                    desc: '+24 damage, bigger blast, and the crater slow lasts longer.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 24 },
                        { type: 'stat', target: 'attacks.0.aoe', add: 18 },
                        { type: 'stat', target: 'attacks.0.status.duration', add: 1 },
                    ],
                },
                {
                    name: 'Meteor Anvil',
                    cost: 19000,
                    desc: 'A cratering meteor: +60 damage, huge blast, near-stop slow, extra boss crush.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 60 },
                        { type: 'stat', target: 'attacks.0.aoe', add: 40 },
                        { type: 'stat', target: 'attacks.0.status.power', mul: 0.7 },
                        { type: 'behavior', hook: 'onHit', fn: meteorCrush },
                    ],
                },
            ],
        },
        {
            name: 'Rapid Winch',
            upgrades: [
                {
                    name: 'Greased Winch',
                    cost: 400,
                    desc: 'Reload 18% faster.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.82 },
                    ],
                },
                {
                    name: 'Quick Crank',
                    cost: 720,
                    desc: 'Reload 20% faster.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.8 },
                    ],
                },
                {
                    name: 'Auto-Loader',
                    cost: 1900,
                    desc: 'Reload 25% faster and +4 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.75 },
                        { type: 'stat', target: 'attacks.0.damage', add: 4 },
                    ],
                },
                {
                    name: 'Rapid Winch',
                    cost: 5200,
                    desc: 'Reload 30% faster and +8 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.7 },
                        { type: 'stat', target: 'attacks.0.damage', add: 8 },
                    ],
                },
                {
                    name: 'Anvil Rain',
                    cost: 18000,
                    desc: 'Two extra catapult arms fire in staggered volleys, plus an Anvil Barrage ability.',
                    effects: [
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'lob',
                                cooldown: 2.4,
                                damage: 16,
                                damageType: 'blunt',
                                range: null,
                                aoe: 48,
                                projectile: { sprite: 'anvil', speed: 340, lifetime: 3, motion: 'mortar' },
                                status: { id: 'slow', power: 0.6, duration: 2.0 },
                                sfx: 'anvil_land',
                            },
                        },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'lob',
                                cooldown: 2.6,
                                damage: 16,
                                damageType: 'blunt',
                                range: null,
                                aoe: 48,
                                projectile: { sprite: 'anvil', speed: 340, lifetime: 3, motion: 'mortar' },
                                status: { id: 'slow', power: 0.6, duration: 2.0 },
                                sfx: 'anvil_land',
                            },
                        },
                        {
                            type: 'ability',
                            ability: {
                                id: 'anvil_barrage',
                                name: 'Anvil Barrage',
                                desc: 'Cranks every arm into a 5s downpour of anvils.',
                                cooldown: 40,
                                use: function (ctx) {
                                    ctx.tower.addBuff({
                                        id: 'anvil_barrage',
                                        source: ctx.tower,
                                        dur: 5,
                                        mults: { attackSpeed: 2.5, damage: 1.3 },
                                        flags: {},
                                    });
                                    if (ctx.game.fx) ctx.game.fx.shake(0.5);
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Burning Payload',
            upgrades: [
                {
                    name: 'Molten Core',
                    cost: 480,
                    desc: 'Impacts set caught mobs alight.',
                    effects: [
                        { type: 'behavior', hook: 'onHit', fn: applyBurn },
                        { type: 'stat', target: 'burnDps', set: 3 },
                        { type: 'stat', target: 'burnDur', set: 2.5 },
                    ],
                },
                {
                    name: 'Decamo Flare',
                    cost: 850,
                    desc: 'The flare reveals camo mobs and strips their cloak; hotter burn.',
                    effects: [
                        { type: 'behavior', hook: 'onHit', fn: decamoFlare },
                        { type: 'flag', flag: 'camoDetect' },
                        { type: 'stat', target: 'burnDps', add: 3 },
                    ],
                },
                {
                    name: 'Ashfall',
                    cost: 2100,
                    desc: 'Hotter, longer burn and a wider blast.',
                    effects: [
                        { type: 'stat', target: 'burnDps', add: 6 },
                        { type: 'stat', target: 'burnDur', add: 2 },
                        { type: 'stat', target: 'attacks.0.aoe', add: 12 },
                    ],
                },
                {
                    name: 'Pyroclasm',
                    cost: 5800,
                    desc: 'Searing burn and +12 impact damage.',
                    effects: [
                        { type: 'stat', target: 'burnDps', add: 10 },
                        { type: 'stat', target: 'burnDur', add: 2 },
                        { type: 'stat', target: 'attacks.0.damage', add: 12 },
                    ],
                },
                {
                    name: 'Volcanic Payload',
                    cost: 19500,
                    desc: 'Impacts leave lingering lava pools, plus a raging burn and +20 damage.',
                    effects: [
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'zone',
                                cooldown: 3.0,
                                damage: 8,
                                damageType: 'fire',
                                range: null,
                                sfx: 'fire_whoosh',
                                zone: { radius: 45, duration: 5, tickRate: 0.5, charges: null },
                            },
                        },
                        { type: 'stat', target: 'burnDps', add: 15 },
                        { type: 'stat', target: 'attacks.0.damage', add: 20 },
                    ],
                },
            ],
        },
    ],
};
