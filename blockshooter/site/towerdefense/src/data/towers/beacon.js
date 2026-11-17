// Beacon -- a buff pyramid that empowers every tower standing in its light
// (CONTRACTS Appendix A entry 16).
//
// The beacon never damages anything; its base attack is an 'aura' whose buff is
// reapplied to nearby towers each tick (attacks.js fireAura). The three paths
// each write a DIFFERENT slice of that buff or of the tower's own stats, so any
// legal crosspath composes cleanly:
//   P0 Beam of Power -- buff.mults.damage / .attackSpeed
//   P1 Logistics     -- stats.discountAura (read by game.priceFor) + buff.mults.range
//   P2 Vigilance     -- buff.flags.camoDetect + stats.range (widens the field) and,
//                       from t3, a second aura attack that strips the camo modifier
//                       off mobs in range (a permanent, passive decloak).
// No sim imports; abilities reach cash/mobs through ctx.game.

/** Wrath of the Beacon: double the damage of every tower in range for 10s. */
function empowerUse(ctx) {
    var t = ctx.tower;
    var g = ctx.game;
    var r = (t.stats.range || 130) * (t.stats.rangeMul || 1);
    var r2 = r * r;
    for (var i = 0; i < g.towers.length; i++) {
        var o = g.towers[i];
        if (o === t) continue;
        var dx = o.x - t.x;
        var dy = o.y - t.y;
        if (dx * dx + dy * dy > r2) continue;
        o.addBuff({ id: 'beacon_empower', source: t, dur: 10, mults: { damage: 2 }, flags: {} });
    }
    if (g.fx) {
        g.fx.spawn('magic', t.x, t.y, { count: 20, color: '#fcdc5f' });
        g.fx.shockwave(t.x, t.y, r);
    }
}

/** Grand Bazaar: a flat trade dividend paid at the end of every round. */
function bazaarPayout(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var pay = 200 + (ctx.round || 0) * 6;
    g.economy.award(g, pay, t.x, t.y);
    if (g.sfx) g.sfx.play('coin');
}

/**
 * Vigilance passive: strip the camo modifier off any mob inside the beacon's
 * field. Runs as the onFire of a dedicated aura attack (added at P2 t3), so it
 * pulses on the aura's own schedule. Radius follows the tower's range.
 */
function revealCamo(ctx) {
    var t = ctx.tower;
    var g = ctx.game;
    var atk = ctx.atk;
    var r = ((atk && atk.radius) || t.stats.range || 130) * (t.stats.rangeMul || 1);
    var r2 = r * r;
    var mobs = g.grid ? g.grid.queryCircle(t.x, t.y, r + 64) : (g.mobs || []);
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive || !m.modifiers || !m.modifiers.camo) continue;
        var dx = m.x - t.x;
        var dy = m.y - t.y;
        if (dx * dx + dy * dy > r2) continue;
        m.modifiers.camo = false;
        if (g.fx) g.fx.spawn('portal', m.x, m.y, { count: 2 });
    }
}

/** All-Seeing Beacon: a map-wide sonar pulse that decloaks every camo mob at once. */
function sonarUse(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var mobs = g.mobs || [];
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (m.alive && m.modifiers && m.modifiers.camo) m.modifiers.camo = false;
    }
    if (g.sfx) g.sfx.play('camo_reveal');
    if (g.fx) {
        g.fx.flash('#4aedd9', 0.18);
        g.fx.shockwave(t.x, t.y, 420);
    }
}

export default {
    id: 'beacon',
    name: 'Beacon',
    category: 'support',
    cost: 1100,
    desc: 'A beam of power that strengthens every tower bathed in its light.',
    placement: 'land',
    footprint: 22,
    base: {
        range: 130,
        camoDetect: false,
        seesFlying: true,
        attacks: [
            {
                kind: 'aura',
                cooldown: 1,
                tick: 0.5,
                buffId: 'beacon_field',
                excludeSelf: true,
                buff: { mults: { damage: 1.1 }, flags: {} },
            },
        ],
    },
    paths: [
        {
            name: 'Beam of Power',
            upgrades: [
                {
                    name: 'Focused Beam',
                    cost: 700,
                    desc: 'Towers in the beam deal +16% damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.buff.mults.damage', set: 1.16 },
                    ],
                },
                {
                    name: 'Amplified Beam',
                    cost: 1100,
                    desc: 'Boost the damage aura to +22%.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.buff.mults.damage', set: 1.22 },
                    ],
                },
                {
                    name: 'Power Conduit',
                    cost: 3200,
                    desc: 'Boost the damage aura to +30%.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.buff.mults.damage', set: 1.3 },
                    ],
                },
                {
                    name: 'Overcharged Core',
                    cost: 9000,
                    desc: '+36% damage and +8% attack speed to towers in range.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.buff.mults.damage', set: 1.36 },
                        { type: 'stat', target: 'attacks.0.buff.mults.attackSpeed', set: 1.08 },
                    ],
                },
                {
                    name: 'Wrath of the Beacon',
                    cost: 28000,
                    desc: '+40% damage, +15% speed, and an ability that doubles nearby damage for 10s.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.buff.mults.damage', set: 1.4 },
                        { type: 'stat', target: 'attacks.0.buff.mults.attackSpeed', set: 1.15 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'beacon_wrath',
                                name: 'Empower',
                                desc: 'Doubles the damage of every tower in range for 10 seconds.',
                                cooldown: 60,
                                use: empowerUse,
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Logistics',
            upgrades: [
                {
                    name: 'Supply Lines',
                    cost: 700,
                    desc: 'Towers placed in range cost 8% less and gain +8% range.',
                    effects: [
                        { type: 'stat', target: 'discountAura', set: { radius: 130, mul: 0.92 } },
                        { type: 'stat', target: 'attacks.0.buff.mults.range', set: 1.08 },
                    ],
                },
                {
                    name: 'Trade Routes',
                    cost: 1150,
                    desc: 'Deepen the discount to 12% and grant +14% range.',
                    effects: [
                        { type: 'stat', target: 'discountAura', set: { radius: 145, mul: 0.88 } },
                        { type: 'stat', target: 'attacks.0.buff.mults.range', set: 1.14 },
                    ],
                },
                {
                    name: 'Logistics Network',
                    cost: 3400,
                    desc: '17% cheaper towers and +20% range across a wider field.',
                    effects: [
                        { type: 'stat', target: 'discountAura', set: { radius: 160, mul: 0.83 } },
                        { type: 'stat', target: 'attacks.0.buff.mults.range', set: 1.2 },
                    ],
                },
                {
                    name: 'Merchant Guild',
                    cost: 9500,
                    desc: '22% cheaper towers and +26% range.',
                    effects: [
                        { type: 'stat', target: 'discountAura', set: { radius: 180, mul: 0.78 } },
                        { type: 'stat', target: 'attacks.0.buff.mults.range', set: 1.26 },
                    ],
                },
                {
                    name: 'Grand Bazaar',
                    cost: 30000,
                    desc: '30% cheaper towers, +35% range, and a fat cash dividend every round.',
                    effects: [
                        { type: 'stat', target: 'discountAura', set: { radius: 210, mul: 0.7 } },
                        { type: 'stat', target: 'attacks.0.buff.mults.range', set: 1.35 },
                        { type: 'behavior', hook: 'onRoundEnd', fn: bazaarPayout },
                    ],
                },
            ],
        },
        {
            name: 'Vigilance',
            upgrades: [
                {
                    name: 'Watchtower',
                    cost: 750,
                    desc: 'Towers in the beam gain camo detection.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.buff.flags.camoDetect', set: true },
                        { type: 'flag', flag: 'camoDetect' },
                    ],
                },
                {
                    name: 'Spotter Network',
                    cost: 1200,
                    desc: 'Widen the vigilant field by 15%.',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.15 },
                    ],
                },
                {
                    name: 'Revealing Light',
                    cost: 3400,
                    desc: 'The beacon\'s light permanently strips camo off any mob in range.',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.1 },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'aura',
                                cooldown: 1,
                                tick: 0.5,
                                camoStrip: true,
                                onFire: revealCamo,
                            },
                        },
                    ],
                },
                {
                    name: 'Sentinel Array',
                    cost: 9500,
                    desc: 'An even wider field with faster, sweeping decloak pulses.',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.12 },
                        { type: 'stat', target: 'attacks.1.tick', set: 0.3 },
                    ],
                },
                {
                    name: 'All-Seeing Beacon',
                    cost: 30000,
                    desc: 'A vast field, plus a sonar pulse that decloaks every camo mob on the map.',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.15 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'beacon_sonar',
                                name: 'Sonar Pulse',
                                desc: 'Instantly strips camo from every mob on the field.',
                                cooldown: 45,
                                use: sonarUse,
                            },
                        },
                    ],
                },
            ],
        },
    ],
};
