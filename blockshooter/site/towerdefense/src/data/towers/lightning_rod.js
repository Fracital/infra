// Lightning Rod (CONTRACTS.md Appendix A entry 19) -- $900 magic chain lightning.
//
// A copper rod that arcs a bolt through a cluster of mobs (attacks.js fireChain).
// P0 grows the arc (more jumps, longer reach, less falloff), P1 makes the rod
// ramp up damage the longer it fires (Storm Charge), P2 turns each arc into a
// stun and caps out with a map-wide storm ability.
//
// Storm Charge is stored as an INSTANCE field (tower.stormCharge) rather than in
// stats, because it is live combat state, not a purchased number. The per-stack
// gain and cap ARE stats so upgrades can scale them. The ramp is expressed as a
// self-buff (damageMul) refreshed on every fire; when the rod goes quiet the buff
// lapses and the onTick hook zeroes the charge -- classic BTD ramp-and-decay.

/** Storm Charge: each shot adds a stack (up to the cap) and refreshes a damage buff. */
function rampBuild(ctx) {
    var t = ctx.tower;
    var s = t.stats || {};
    var per = s.stormPerStack || 0;
    if (per <= 0) return;                         // ramp not purchased yet
    var cap = s.stormCap || 0;
    if (t.stormCharge == null) t.stormCharge = 0;
    if (t.stormCharge < cap) t.stormCharge++;
    t.addBuff({
        id: 'storm_charge',
        source: t,
        dur: 3,                                   // lapses if the rod stops firing
        mults: { damage: 1 + t.stormCharge * per },
        flags: {},
    });
}

/** When the storm buff has lapsed (idle rod), reset the accumulated charge. */
function rampDecay(ctx) {
    var t = ctx.tower;
    if (t.stormCharge && !t.buffs.has('storm_charge')) t.stormCharge = 0;
}

/** Superconductor: every arced mob is briefly stunned (bosses resist automatically). */
function chainStun(ctx) {
    var dur = (ctx.tower.stats && ctx.tower.stats.stunDur) || 0;
    if (dur <= 0) return;
    ctx.mob.addStatus({ id: 'stun', duration: dur, source: ctx.tower });
}

/** Mjolnir Protocol: while active, hammer every mob on the map on a fixed cadence. */
function mjolnirTick(ctx) {
    var t = ctx.tower;
    var g = ctx.game;
    if (!t._mjolnirUntil || g.time >= t._mjolnirUntil) return;
    t._mjolnirAccum = (t._mjolnirAccum || 0) + ctx.dt;
    while (t._mjolnirAccum >= 0.4) {
        t._mjolnirAccum -= 0.4;
        var mobs = g.mobs;
        var n = mobs.length;                      // snapshot: children spawned by kills wait a strike
        var firstX = 0, firstY = 0, struck = 0;
        for (var i = 0; i < n; i++) {
            var m = mobs[i];
            if (!m || !m.alive) continue;
            if (struck === 0) { firstX = m.x; firstY = m.y; }
            m.takeDamage(8, 'magic', t);
            if (m.alive) m.addStatus({ id: 'stun', duration: 0.5, source: t });
            struck++;
        }
        if (g.fx && struck > 0) {
            g.fx.lightning([[t.x, t.y], [firstX, firstY]]);
            if (g.rng && g.rng.chance(0.35)) g.fx.shake(0.4);
        }
    }
}

export default {
    id: 'lightning_rod',
    name: 'Lightning Rod',
    category: 'magic',
    cost: 900,
    desc: 'Arcs chain lightning through packed mobs, leaping from target to target.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 150,
        camoDetect: false,
        seesFlying: true,
        stormPerStack: 0,              // damage gained per Storm Charge stack (P1)
        stormCap: 0,                   // max Storm Charge stacks (P1)
        stunDur: 0,                    // chain-stun seconds (P2)
        attacks: [
            {
                kind: 'chain',
                cooldown: 1.1,
                damage: 4,
                damageType: 'magic',
                range: null,
                jumps: 3,
                jumpRange: 110,
                falloff: 0.8,
                sfx: 'chain_zap',
            },
        ],
    },
    paths: [
        {
            name: 'Long Arc',
            upgrades: [
                {
                    name: 'Copper Coils',
                    cost: 550,
                    desc: '+2 jumps and longer reach between targets.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.jumps', add: 2 },
                        { type: 'stat', target: 'attacks.0.jumpRange', add: 20 },
                    ],
                },
                {
                    name: 'Grounded Rod',
                    cost: 1100,
                    desc: 'Much longer arcs and +2 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.jumpRange', add: 40 },
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                    ],
                },
                {
                    name: 'Arc Extender',
                    cost: 2600,
                    desc: '+3 jumps and even longer reach.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.jumps', add: 3 },
                        { type: 'stat', target: 'attacks.0.jumpRange', add: 30 },
                    ],
                },
                {
                    name: 'Superchain',
                    cost: 7500,
                    desc: '+4 jumps, +4 damage, and the arc barely weakens as it leaps.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.jumps', add: 4 },
                        { type: 'stat', target: 'attacks.0.falloff', set: 0.92 },
                        { type: 'stat', target: 'attacks.0.damage', add: 4 },
                    ],
                },
                {
                    name: 'Grand Conductor',
                    cost: 24000,
                    desc: '16 jumps with zero falloff -- one bolt for a whole line.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.jumps', set: 16 },
                        { type: 'stat', target: 'attacks.0.falloff', set: 1.0 },
                        { type: 'stat', target: 'attacks.0.jumpRange', add: 40 },
                        { type: 'stat', target: 'attacks.0.damage', add: 6 },
                    ],
                },
            ],
        },
        {
            name: 'Storm Charge',
            upgrades: [
                {
                    name: 'Static Buildup',
                    cost: 520,
                    desc: 'Damage ramps up the longer the rod keeps firing.',
                    effects: [
                        { type: 'behavior', hook: 'onFire', fn: rampBuild },
                        { type: 'behavior', hook: 'onTick', fn: rampDecay },
                        { type: 'stat', target: 'stormPerStack', set: 0.05 },
                        { type: 'stat', target: 'stormCap', set: 6 },
                    ],
                },
                {
                    name: 'Charged Capacitors',
                    cost: 1000,
                    desc: 'Holds +6 more charge and ramps a little harder.',
                    effects: [
                        { type: 'stat', target: 'stormCap', add: 6 },
                        { type: 'stat', target: 'stormPerStack', add: 0.02 },
                    ],
                },
                {
                    name: 'Voltage Regulator',
                    cost: 2500,
                    desc: 'Sharper ramp per stack and +3 base damage.',
                    effects: [
                        { type: 'stat', target: 'stormPerStack', add: 0.03 },
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                    ],
                },
                {
                    name: 'Overcharge Core',
                    cost: 7200,
                    desc: 'Holds +10 more charge and ramps harder still.',
                    effects: [
                        { type: 'stat', target: 'stormCap', add: 10 },
                        { type: 'stat', target: 'stormPerStack', add: 0.03 },
                    ],
                },
                {
                    name: 'Tempest',
                    cost: 23000,
                    desc: 'A permanent storm hurls extra bolts at the field, and the ramp goes further.',
                    effects: [
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'chain',
                                cooldown: 0.5,
                                damage: 8,
                                damageType: 'magic',
                                range: null,
                                jumps: 6,
                                jumpRange: 130,
                                falloff: 0.9,
                                sfx: 'zap',
                            },
                        },
                        { type: 'stat', target: 'stormCap', add: 12 },
                        { type: 'stat', target: 'stormPerStack', add: 0.05 },
                    ],
                },
            ],
        },
        {
            name: 'Superconductor',
            upgrades: [
                {
                    name: 'Conductive Core',
                    cost: 550,
                    desc: 'Each arced mob is briefly stunned.',
                    effects: [
                        { type: 'behavior', hook: 'onHit', fn: chainStun },
                        { type: 'stat', target: 'stunDur', set: 0.4 },
                    ],
                },
                {
                    name: 'Iron Grounding',
                    cost: 1050,
                    desc: 'Longer stun and +2 damage.',
                    effects: [
                        { type: 'stat', target: 'stunDur', add: 0.3 },
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                    ],
                },
                {
                    name: 'Tesla Array',
                    cost: 2500,
                    desc: 'Longer stun and longer arcs.',
                    effects: [
                        { type: 'stat', target: 'stunDur', add: 0.4 },
                        { type: 'stat', target: 'attacks.0.jumpRange', add: 30 },
                    ],
                },
                {
                    name: 'Paralysis Field',
                    cost: 7000,
                    desc: 'Longer stun and +3 jumps to lock down whole packs.',
                    effects: [
                        { type: 'stat', target: 'stunDur', add: 0.5 },
                        { type: 'stat', target: 'attacks.0.jumps', add: 3 },
                    ],
                },
                {
                    name: 'Mjolnir Protocol',
                    cost: 24000,
                    desc: 'Longer stun, plus a 6s map-wide storm that strikes every mob.',
                    effects: [
                        { type: 'stat', target: 'stunDur', add: 0.6 },
                        { type: 'behavior', hook: 'onTick', fn: mjolnirTick },
                        {
                            type: 'ability',
                            ability: {
                                id: 'mjolnir_protocol',
                                name: 'Mjolnir Protocol',
                                desc: 'Calls down a storm that batters and stuns every mob on the map for 6 seconds.',
                                cooldown: 60,
                                use: function (ctx) {
                                    ctx.tower._mjolnirUntil = ctx.game.time + 6;
                                    ctx.tower._mjolnirAccum = 0;
                                    if (ctx.game.fx) {
                                        ctx.game.fx.flash('#bfe3ff', 0.3);
                                        ctx.game.fx.shake(0.6);
                                    }
                                    ctx.game.sfx.play('zap');
                                },
                            },
                        },
                    ],
                },
            ],
        },
    ],
};
