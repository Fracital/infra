// Blaze Tower -- CONTRACTS Appendix A entry 4.
//
// A caged blaze that spits fire rods in eight directions at once (a full-circle
// projectile volley), short range but relentless. Everything it does is FIRE
// damage + a burn DoT, so it is deliberately walled off from the fire-immune
// (blaze/magma/wither skeleton) -- fighting fire with fire does not work. Three
// roles: a growing inferno ring (P0), blinding rod speed (P1), and a focused
// long-range lance/beam build (P2).

/** P0 t5 ability: erupt in a fire nova that torches everything close by. */
function supernova(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var radius = 220;
    var mobs = g.grid ? g.grid.queryCircle(t.x, t.y, radius + 64) : (g.mobs || []);
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m || !m.alive) continue;
        var reach = radius + (m.radius || 0);
        var dx = m.x - t.x;
        var dy = m.y - t.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        m.takeDamage(120, 'fire', t, {});
        if (m.alive && m.addStatus) {
            m.addStatus({ id: 'burn', dps: 14, duration: 4, damageType: 'fire', source: t });
        }
    }
    if (g.fx) { g.fx.explosion(t.x, t.y, radius, 'fire'); g.fx.shake(0.6); }
    if (g.sfx) g.sfx.play('explosion_large');
}

export default {
    id: 'blaze_tower',
    name: 'Blaze Tower',
    category: 'primary',
    cost: 280,
    desc: 'A caged blaze spraying fire rods in every direction at short range.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 95,
        camoDetect: false,
        seesFlying: true,
        attacks: [
            {
                kind: 'projectile',
                cooldown: 0.85,
                damage: 2,
                pierce: 2,
                damageType: 'fire',
                range: null,
                count: 8,
                spread: 6.2832,
                aoe: 0,
                projectile: { sprite: 'flame', speed: 360, lifetime: 0.4, motion: 'straight', turnRate: 0 },
                status: { id: 'burn', dps: 2, duration: 2, damageType: 'fire' },
                sfx: 'fire_whoosh',
            },
        ],
    },
    paths: [
        {
            name: 'Inferno Ring',
            upgrades: [
                {
                    name: 'Longer Rods',
                    cost: 195,
                    desc: 'Fire rods reach +25% further and burn hotter.',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.25 },
                        { type: 'stat', target: 'attacks.0.projectile.lifetime', mul: 1.25 },
                        { type: 'stat', target: 'attacks.0.status.dps', add: 2 },
                    ],
                },
                {
                    name: 'Stoked Flames',
                    cost: 340,
                    desc: 'Hotter rods (+1 damage) and a longer-lasting burn.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 1 },
                        { type: 'stat', target: 'attacks.0.status.duration', set: 3 },
                        { type: 'stat', target: 'attacks.0.status.dps', add: 2 },
                    ],
                },
                {
                    name: 'Blistering Heat',
                    cost: 840,
                    desc: '+2 damage and a searing burn DoT.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                        { type: 'stat', target: 'attacks.0.status.dps', add: 4 },
                    ],
                },
                {
                    name: 'Roaring Inferno',
                    cost: 2520,
                    desc: 'Longer, hotter rods (+3 damage, +30% reach).',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.3 },
                        { type: 'stat', target: 'attacks.0.projectile.lifetime', mul: 1.3 },
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                        { type: 'stat', target: 'attacks.0.status.dps', add: 5 },
                    ],
                },
                {
                    name: 'Ring of Inferno',
                    cost: 7280,
                    desc: 'A permanent ring of fire scorches everything nearby every moment, plus a Supernova ability that erupts in a huge fire nova.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 4 },
                        { type: 'stat', target: 'attacks.0.status.dps', add: 6 },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'aura',
                                cooldown: 0.25,
                                tick: 0.25,
                                radius: 130,
                                damage: 6,
                                pierce: 1,
                                damageType: 'fire',
                                status: { id: 'burn', dps: 6, duration: 2, damageType: 'fire' },
                                auraFx: 'flame',
                            },
                        },
                        {
                            type: 'ability',
                            ability: {
                                id: 'supernova',
                                name: 'Supernova',
                                desc: 'Detonates a fire nova dealing heavy fire damage and igniting all nearby mobs.',
                                cooldown: 30,
                                use: supernova,
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Rapid Rods',
            upgrades: [
                {
                    name: 'Quick Flicker',
                    cost: 200,
                    desc: '15% faster fire rods.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
                    ],
                },
                {
                    name: 'Fanning Flames',
                    cost: 360,
                    desc: 'The blaze flails faster still.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.82 },
                    ],
                },
                {
                    name: 'Overheated',
                    cost: 900,
                    desc: 'A furious cadence and +1 damage per rod.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.8 },
                        { type: 'stat', target: 'attacks.0.damage', add: 1 },
                    ],
                },
                {
                    name: 'Blaze Rush',
                    cost: 2600,
                    desc: 'Rods pour out in a near-continuous stream.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.72 },
                    ],
                },
                {
                    name: 'Firestorm',
                    cost: 7500,
                    desc: 'Sixteen fire rods at blinding speed engulf everything around the cage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.count', set: 16 },
                        { type: 'stat', target: 'attacks.0.cooldown', set: 0.12 },
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                    ],
                },
            ],
        },
        {
            name: 'Focused Rods',
            upgrades: [
                {
                    name: 'Focused Rods',
                    cost: 210,
                    desc: 'Four longer, piercing rods instead of eight scattered ones.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.count', set: 4 },
                        { type: 'stat', target: 'attacks.0.spread', set: 0.6 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 2 },
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                        { type: 'stat', target: 'attacks.0.projectile.lifetime', mul: 1.6 },
                        { type: 'stat', target: 'range', mul: 1.3 },
                    ],
                },
                {
                    name: 'Lance Rods',
                    cost: 380,
                    desc: 'Three even longer lances that punch through more.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.count', set: 3 },
                        { type: 'stat', target: 'attacks.0.spread', set: 0.35 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 2 },
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                        { type: 'stat', target: 'attacks.0.projectile.speed', mul: 1.3 },
                    ],
                },
                {
                    name: 'Twin Lances',
                    cost: 950,
                    desc: 'Two searing long-range lances with deep penetration.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.count', set: 2 },
                        { type: 'stat', target: 'attacks.0.spread', set: 0.12 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 3 },
                        { type: 'stat', target: 'attacks.0.damage', add: 5 },
                        { type: 'stat', target: 'range', mul: 1.3 },
                    ],
                },
                {
                    name: 'Piercing Beam Rods',
                    cost: 2850,
                    desc: 'Long lances that skewer whole columns of mobs and see through camo.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.pierce', add: 4 },
                        { type: 'stat', target: 'attacks.0.damage', add: 8 },
                        { type: 'stat', target: 'attacks.0.projectile.lifetime', mul: 1.4 },
                        { type: 'flag', flag: 'camoDetect' },
                    ],
                },
                {
                    name: 'Solar Lance',
                    cost: 8200,
                    desc: 'Replaces the rods with four ramping solar beams that vaporize the leading target.',
                    effects: [
                        {
                            type: 'attackReplace',
                            index: 0,
                            attack: {
                                kind: 'beam',
                                cooldown: 0.1,
                                damage: 7,
                                pierce: 1,
                                damageType: 'fire',
                                range: null,
                                ramp: { rate: 0.03, max: 2.5 },
                                beamStyle: { color: '#ffcf4a', width: 5, duration: 0.12 },
                                status: { id: 'burn', dps: 6, duration: 2, damageType: 'fire' },
                                sfx: 'laser',
                            },
                        },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'beam',
                                cooldown: 0.1,
                                damage: 7,
                                pierce: 1,
                                damageType: 'fire',
                                range: null,
                                ramp: { rate: 0.03, max: 2.5 },
                                beamStyle: { color: '#ffcf4a', width: 5, duration: 0.12 },
                                sfx: 'laser',
                            },
                        },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'beam',
                                cooldown: 0.1,
                                damage: 7,
                                pierce: 1,
                                damageType: 'fire',
                                range: null,
                                ramp: { rate: 0.03, max: 2.5 },
                                beamStyle: { color: '#ffcf4a', width: 5, duration: 0.12 },
                                sfx: 'laser',
                            },
                        },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'beam',
                                cooldown: 0.1,
                                damage: 7,
                                pierce: 1,
                                damageType: 'fire',
                                range: null,
                                ramp: { rate: 0.03, max: 2.5 },
                                beamStyle: { color: '#ffcf4a', width: 5, duration: 0.12 },
                                sfx: 'laser',
                            },
                        },
                    ],
                },
            ],
        },
    ],
};
