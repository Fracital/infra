// Tinkerer -- the engineer hero (CONTRACTS Appendix D).
//
// A redstone engineer who deploys auto-turrets around herself and plinks with a
// crossbow between builds. Turret hits credit the Tinkerer (units set their
// source to the summoning tower), so her damage buffs and onHit behaviors ride
// along on every turret bolt. The level curve bumps the crossbow every level and
// pushes the two engineering signatures -- turret COUNT and turret POWER -- at the
// beats: 5 (2nd turret), 8 (power + 3rd turret), 13 (4th turret + power) and 16
// (5th turret + power). Abilities land at 3 (Overclock) and 10 (TNT Drone Swarm);
// level 20 gives every turret flaming rounds. Headless-safe, import-free.
//
// Turret POWER is delivered as a self-refreshing damage buff the turrets inherit
// through their shared source, since a unit's raw damage lives in the engine's
// UNIT_TYPES and can't be edited from a data file.

/** L2+ turret power: keep a standing damage buff up (turrets share the Tinkerer's source). */
function tinkererPower(ctx) {
    var t = ctx.tower;
    var mul = (t.stats && t.stats.turretPower) || 1;
    if (mul <= 1) return;
    t._tpT = (t._tpT || 0) + ctx.dt;
    if (t._tpT < 0.25) return;
    t._tpT = 0;
    t.addBuff({ id: 'tinkerer_power', source: t, dur: 0.6, mults: { damage: mul }, flags: {} });
}

/** L20 flame rounds: every hit (turret or crossbow) chars the target with fire + burn. */
function tinkererFlame(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var m = ctx.mob;
    if (!m) return;
    var dealt = m.takeDamage(4, 'fire', t, {});
    t.damageDealt = (t.damageDealt || 0) + dealt;
    if (m.addStatus) m.addStatus({ id: 'burn', power: 6, duration: 2, damageType: 'fire' });
    if (g.fx && g.rng && g.rng.chance(0.4)) g.fx.spawn('flame', m.x, m.y, { count: 3 });
}

/** L3 Overclock: supercharge the highest-invested nearby tower to 2x attack speed for 8s. */
function tinkererOverclock(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var best = null;
    var bestInv = -1;
    var range = 300;
    var r2 = range * range;
    var towers = g.towers;
    for (var i = 0; i < towers.length; i++) {
        var tw = towers[i];
        if (!tw || tw === t) continue;
        var dx = tw.x - t.x;
        var dy = tw.y - t.y;
        if (dx * dx + dy * dy > r2) continue;
        var inv = tw.totalInvested || 0;
        if (inv > bestInv) { bestInv = inv; best = tw; }
    }
    if (!best) best = t;
    best.addBuff({ id: 'tinkerer_overclock', source: t, dur: 8, mults: { attackSpeed: 2 }, flags: {} });
    if (g.fx) {
        g.fx.spawn('spark', best.x, best.y, { count: 16, color: '#ffdd66' });
        g.fx.beam(t.x, t.y, best.x, best.y, { color: '#ffdd66', width: 3, duration: 0.2 });
    }
    if (g.sfx) g.sfx.play('piston');
}

/** L10 TNT Drone Swarm: six explosive strikes rain down on the toughest mobs. */
function tinkererDroneSwarm(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var mobs = (g.mobs || []).filter(function (m) { return m.alive; });
    mobs.sort(function (a, b) { return (b.maxHp || 0) - (a.maxHp || 0); });
    var n = Math.min(6, mobs.length);
    var radius = 62;
    var dmg = 42;
    for (var i = 0; i < n; i++) {
        var tgt = mobs[i];
        var all = g.mobs;
        for (var j = 0; j < all.length; j++) {
            var o = all[j];
            if (!o.alive) continue;
            var dx = o.x - tgt.x;
            var dy = o.y - tgt.y;
            var reach = radius + (o.radius || 0);
            if (dx * dx + dy * dy > reach * reach) continue;
            var dealt = o.takeDamage(dmg, 'explosive', t, {});
            t.damageDealt = (t.damageDealt || 0) + dealt;
        }
        if (g.fx) g.fx.explosion(tgt.x, tgt.y, radius, 'tnt');
    }
    if (g.fx) g.fx.shake(0.5);
    if (g.sfx) g.sfx.play('explosion_medium');
}

export default {
    id: 'tinkerer',
    name: 'Tinkerer',
    category: 'military',
    cost: 450,
    isHero: true,
    desc: 'A redstone engineer who deploys auto-turrets and plinks with a crossbow.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 160,
        camoDetect: false,
        seesFlying: true,
        turretPower: 1,
        attacks: [
            {
                kind: 'spawn',
                unit: 'auto_turret',
                max: 1,
                cooldown: 11,
                sfx: 'piston',
            },
            {
                kind: 'projectile',
                cooldown: 0.8,
                damage: 3,
                pierce: 1,
                damageType: 'sharp',
                range: null,
                count: 1,
                spread: 0,
                aoe: 0,
                projectile: { sprite: 'arrow', speed: 820, lifetime: 1.2, motion: 'straight', turnRate: 0 },
                sfx: 'bolt',
            },
        ],
    },
    paths: [],
    levels: [
        {
            level: 2,
            desc: 'Overclocked build: turrets can be pushed past stock power. +1 crossbow damage.',
            effects: [
                { type: 'stat', target: 'attacks.1.damage', add: 1 },
                { type: 'behavior', hook: 'onTick', fn: tinkererPower },
            ],
        },
        {
            level: 3,
            desc: 'Overclock (ability): the strongest nearby tower fires at 2x speed for 8s. Faster builds.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.92 },
                {
                    type: 'ability',
                    ability: {
                        id: 'tinkerer_overclock',
                        name: 'Overclock',
                        desc: 'Double the attack speed of the highest-value nearby tower for 8 seconds.',
                        cooldown: 25,
                        use: tinkererOverclock,
                    },
                },
            ],
        },
        {
            level: 4,
            desc: 'Precision bolts: +1 crossbow damage and +8 range.',
            effects: [
                { type: 'stat', target: 'attacks.1.damage', add: 1 },
                { type: 'stat', target: 'range', add: 8 },
            ],
        },
        {
            level: 5,
            desc: 'Second Turret: deploy up to 2 auto-turrets. Faster crossbow.',
            effects: [
                { type: 'stat', target: 'attacks.0.max', add: 1 },
                { type: 'stat', target: 'attacks.1.cooldown', mul: 0.94 },
            ],
        },
        {
            level: 6,
            desc: 'Tuned servos: turrets hit 25% harder. +2 crossbow damage.',
            effects: [
                { type: 'stat', target: 'turretPower', add: 0.25 },
                { type: 'stat', target: 'attacks.1.damage', add: 2 },
            ],
        },
        {
            level: 7,
            desc: 'Assembly line: turrets deploy faster. +8 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.9 },
                { type: 'stat', target: 'range', add: 8 },
            ],
        },
        {
            level: 8,
            desc: 'Third Turret + heavy loads: deploy up to 3, turrets hit 60% harder. +2 crossbow damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.max', add: 1 },
                { type: 'stat', target: 'turretPower', add: 0.35 },
                { type: 'stat', target: 'attacks.1.damage', add: 2 },
            ],
        },
        {
            level: 9,
            desc: 'Machined bolts: +2 crossbow damage and +8 range.',
            effects: [
                { type: 'stat', target: 'attacks.1.damage', add: 2 },
                { type: 'stat', target: 'range', add: 8 },
            ],
        },
        {
            level: 10,
            desc: 'TNT Drone Swarm (ability): six explosive strikes hammer the toughest mobs. Faster crossbow.',
            effects: [
                { type: 'stat', target: 'attacks.1.cooldown', mul: 0.92 },
                {
                    type: 'ability',
                    ability: {
                        id: 'tinkerer_drone_swarm',
                        name: 'TNT Drone Swarm',
                        desc: 'Send out a swarm of TNT drones that detonate on the strongest enemies.',
                        cooldown: 35,
                        use: tinkererDroneSwarm,
                    },
                },
            ],
        },
        {
            level: 11,
            desc: 'Reinforced barrels: turrets hit 90% harder. +2 crossbow damage.',
            effects: [
                { type: 'stat', target: 'turretPower', add: 0.3 },
                { type: 'stat', target: 'attacks.1.damage', add: 2 },
            ],
        },
        {
            level: 12,
            desc: 'Streamlined shop: turrets deploy faster. +10 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.88 },
                { type: 'stat', target: 'range', add: 10 },
            ],
        },
        {
            level: 13,
            desc: 'Fourth Turret: deploy up to 4, turrets hit 120% harder. +3 crossbow damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.max', add: 1 },
                { type: 'stat', target: 'turretPower', add: 0.3 },
                { type: 'stat', target: 'attacks.1.damage', add: 3 },
            ],
        },
        {
            level: 14,
            desc: 'Custom limbs: +3 crossbow damage and +10 range.',
            effects: [
                { type: 'stat', target: 'attacks.1.damage', add: 3 },
                { type: 'stat', target: 'range', add: 10 },
            ],
        },
        {
            level: 15,
            desc: 'Rapid fabrication: turrets deploy faster and hit 150% harder.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.86 },
                { type: 'stat', target: 'turretPower', add: 0.3 },
            ],
        },
        {
            level: 16,
            desc: 'Fifth Turret + overdrive: deploy up to 5, turrets hit 200% harder. +3 crossbow damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.max', add: 1 },
                { type: 'stat', target: 'turretPower', add: 0.5 },
                { type: 'stat', target: 'attacks.1.damage', add: 3 },
            ],
        },
        {
            level: 17,
            desc: 'Master gunsmith: +4 crossbow damage and +12 range.',
            effects: [
                { type: 'stat', target: 'attacks.1.damage', add: 4 },
                { type: 'stat', target: 'range', add: 12 },
            ],
        },
        {
            level: 18,
            desc: 'Perfect tolerances: turrets deploy and the crossbow fires faster.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
                { type: 'stat', target: 'attacks.1.cooldown', mul: 0.9 },
            ],
        },
        {
            level: 19,
            desc: 'Heavy ordnance: +5 crossbow damage, turrets hit 240% harder.',
            effects: [
                { type: 'stat', target: 'attacks.1.damage', add: 5 },
                { type: 'stat', target: 'turretPower', add: 0.4 },
            ],
        },
        {
            level: 20,
            desc: 'Flame Rounds (passive): every turret and crossbow hit ignites the target. Turrets hit 300% harder, +6 crossbow damage.',
            effects: [
                { type: 'stat', target: 'attacks.1.damage', add: 6 },
                { type: 'stat', target: 'turretPower', add: 0.6 },
                { type: 'behavior', hook: 'onHit', fn: tinkererFlame },
            ],
        },
    ],
};
