// Ghast -- a tethered ghast balloon that drifts over its anchor and lobs
// exploding fireballs onto the track (CONTRACTS Appendix A entry 10).
//
// The "patrol" is purely cosmetic (the sprite floats on its tether); mechanically
// this is a lob tower with a generous range and aoe. Fire-typed, so it does
// nothing to fire-immune mobs (blazes, magma cubes) -- an intentional weakness
// that its High-Altitude path partly offsets with reach and camo sight.

/**
 * P0 t5 'Hellfire Rain': every fireball also rains two extra fire blasts on
 * random live mobs, each leaving a short burn. Uses raw mob.takeDamage so the
 * def needs no sim imports; damage is credited back to the tower by hand.
 */
function hellfireRain(ctx) {
    var atk = ctx.atk;
    if (!atk || atk.kind !== 'lob') return;             // only the fireball rains, not any aura tick
    var tower = ctx.tower;
    var game = ctx.game;
    var rng = game.rng;
    var mobs = game.mobs;
    if (!rng || !mobs || mobs.length === 0) return;

    var r = 52;
    var dmg = (atk.damage || 0) * 0.6 * (tower.stats.damageMul || 1);
    for (var n = 0; n < 2; n++) {
        var focus = mobs[rng.int(0, mobs.length - 1)];
        if (!focus || !focus.alive) continue;
        var near = game.grid ? game.grid.queryCircle(focus.x, focus.y, r + 64) : mobs;
        for (var i = 0; i < near.length; i++) {
            var o = near[i];
            if (!o.alive) continue;
            var reach = r + (o.radius || 0);
            var dx = o.x - focus.x;
            var dy = o.y - focus.y;
            if (dx * dx + dy * dy > reach * reach) continue;
            var dealt = o.takeDamage(dmg, 'fire', tower, {});
            if (dealt > 0) {
                tower.damageDealt = (tower.damageDealt || 0) + dealt;
                if (o.addStatus) o.addStatus({ id: 'burn', dps: dmg * 0.4, duration: 2, damageType: 'fire', source: tower });
            }
        }
        if (game.fx) game.fx.explosion(focus.x, focus.y, r, 'tnt');
    }
}

/** P1 t5 ability: a soul-rending scream that slows every mob on the field. */
function terrifyingScream(ctx) {
    var game = ctx.game;
    var mobs = game.mobs || [];
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive || !m.addStatus) continue;
        m.addStatus({ id: 'slow', power: 0.4, duration: 4, source: ctx.tower });
    }
    if (game.fx) {
        game.fx.shake(0.5);
        if (game.fx.spawn) game.fx.spawn('soul', ctx.tower.x, ctx.tower.y, { count: 20, color: '#dfeaff' });
    }
    if (game.sfx) game.sfx.play('ghast_shoot');
}

export default {
    id: 'ghast',
    name: 'Ghast',
    category: 'military',
    cost: 800,
    desc: 'A tethered ghast that drifts overhead and lobs exploding fireballs onto the track.',
    placement: 'land',
    footprint: 20,
    base: {
        range: 165,
        camoDetect: false,
        seesFlying: true,
        attacks: [
            {
                kind: 'lob',
                cooldown: 1.7,
                damage: 6,
                pierce: 1,
                damageType: 'fire',
                range: null,
                aoe: 46,
                projectile: { sprite: 'fireball', speed: 300, lifetime: 3, motion: 'arc' },
                status: null,
                sfx: 'ghast_shoot',
            },
        ],
    },
    paths: [
        {
            name: 'Bigger Fireballs',
            upgrades: [
                {
                    name: 'Charged Cores',
                    cost: 520,
                    desc: 'Denser fireballs: +3 damage and a 15% wider blast.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                        { type: 'stat', target: 'attacks.0.aoe', mul: 1.15 },
                    ],
                },
                {
                    name: 'Volatile Payload',
                    cost: 900,
                    desc: '+4 damage and a 20% larger explosion.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 4 },
                        { type: 'stat', target: 'attacks.0.aoe', mul: 1.2 },
                    ],
                },
                {
                    name: 'Blast Furnace',
                    cost: 2400,
                    desc: '+6 damage, 40% bigger blast, and fireballs leave a lingering burn.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 6 },
                        { type: 'stat', target: 'attacks.0.aoe', mul: 1.4 },
                        { type: 'stat', target: 'attacks.0.status', set: { id: 'burn', dps: 5, duration: 2.5, damageType: 'fire' } },
                    ],
                },
                {
                    name: 'Meteor Shower',
                    cost: 7200,
                    desc: 'Colossal fireballs: +12 damage, wider blast, and a fiercer burn.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 12 },
                        { type: 'stat', target: 'attacks.0.aoe', mul: 1.3 },
                        { type: 'stat', target: 'attacks.0.status', set: { id: 'burn', dps: 12, duration: 3, damageType: 'fire' } },
                    ],
                },
                {
                    name: 'Hellfire Rain',
                    cost: 22000,
                    // The replacement bakes in a large base so it stays a net gain even
                    // after discarding any legal 2-tier crosspath applied to attacks[0].
                    desc: 'Each fireball hits like a bomb and rains extra fire blasts across the field.',
                    effects: [
                        {
                            type: 'attackReplace',
                            index: 0,
                            attack: {
                                kind: 'lob',
                                cooldown: 1.4,
                                damage: 40,
                                pierce: 1,
                                damageType: 'fire',
                                range: null,
                                aoe: 96,
                                projectile: { sprite: 'fireball', speed: 320, lifetime: 3, motion: 'arc' },
                                status: { id: 'burn', dps: 22, duration: 3.5, damageType: 'fire' },
                                sfx: 'ghast_shoot',
                            },
                        },
                        { type: 'behavior', hook: 'onFire', fn: hellfireRain },
                    ],
                },
            ],
        },
        {
            name: 'Aggressive Pursuit',
            upgrades: [
                {
                    name: 'Twitchy Ghast',
                    cost: 480,
                    desc: 'An agitated ghast fires 18% faster.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.82 },
                    ],
                },
                {
                    name: 'Relentless Hunter',
                    cost: 780,
                    desc: 'Tighter patrol loop -- 20% faster fire rate.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.8 },
                    ],
                },
                {
                    name: 'Frenzied Wails',
                    cost: 2100,
                    desc: '28% faster fire rate and +2 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.72 },
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                    ],
                },
                {
                    name: 'Screeching Dive',
                    cost: 6400,
                    desc: 'Dive-bombs relentlessly: 32% faster and a 15% wider blast.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.68 },
                        { type: 'stat', target: 'attacks.0.aoe', mul: 1.15 },
                    ],
                },
                {
                    name: 'Terror of the Skies',
                    cost: 24000,
                    desc: 'A constant dread aura slows all mobs, plus a scream ability that slows the whole field.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.7 },
                        {
                            // Map-wide gentle slow pulse -- the passive half of "screams periodically".
                            type: 'attackAdd',
                            attack: {
                                kind: 'aura',
                                cooldown: 1,
                                radius: 900,
                                tick: 4,
                                status: { id: 'slow', power: 0.8, duration: 2 },
                                auraFx: 'soul',
                            },
                        },
                        {
                            type: 'ability',
                            ability: {
                                id: 'terror_scream',
                                name: 'Terrifying Scream',
                                desc: 'Screams across the map, slowing every mob to 40% speed for 4 seconds.',
                                cooldown: 25,
                                use: terrifyingScream,
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'High Altitude',
            upgrades: [
                {
                    name: 'Rising Thermals',
                    cost: 500,
                    desc: 'A higher tether extends range by 25%.',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.25 },
                    ],
                },
                {
                    name: 'Spectral Sight',
                    cost: 700,
                    desc: 'Spectral eyes reveal and target camo mobs.',
                    effects: [
                        { type: 'flag', flag: 'camoDetect' },
                    ],
                },
                {
                    name: 'All-Seeing Ghast',
                    cost: 2200,
                    desc: '+30% range and +3 damage from its commanding altitude.',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.3 },
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                    ],
                },
                {
                    name: 'Soulfire Payload',
                    cost: 6000,
                    desc: '30% wider blast wreathed in soulfire that burns for longer.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.aoe', mul: 1.3 },
                        { type: 'stat', target: 'attacks.0.status', set: { id: 'burn', dps: 10, duration: 3.5, damageType: 'fire' } },
                    ],
                },
                {
                    name: 'Spectral Bombardier',
                    cost: 20000,
                    // Lob explodes rather than pierces; "piercing fireballs" are expressed as
                    // a huge blast, and the bombardment drops lingering soul zones on the path.
                    desc: 'Enormous fireballs plus a barrage of lingering soul zones that scorch the track.',
                    effects: [
                        {
                            type: 'attackReplace',
                            index: 0,
                            attack: {
                                kind: 'lob',
                                cooldown: 1.5,
                                damage: 30,
                                pierce: 1,
                                damageType: 'fire',
                                range: null,
                                aoe: 120,
                                projectile: { sprite: 'fireball', speed: 320, lifetime: 3, motion: 'arc' },
                                status: { id: 'burn', dps: 16, duration: 3.5, damageType: 'fire' },
                                sfx: 'ghast_shoot',
                            },
                        },
                        { type: 'flag', flag: 'camoDetect' },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'zone',
                                cooldown: 2.4,
                                damage: 6,
                                damageType: 'magic',
                                zoneColor: 'rgba(150,200,255,0.32)',
                                zone: { radius: 58, duration: 4, tickRate: 0.5 },
                                sfx: 'fire_whoosh',
                            },
                        },
                    ],
                },
            ],
        },
    ],
};
