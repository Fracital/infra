// Brewing Stand -- part support, part artillery: hands out combat potions AND
// hurls flasks at the track (CONTRACTS Appendix A entry 17).
//
// Layout that keeps every crosspath legal: the base def carries TWO fixed
// attacks -- attacks[0] an 'aura' buff (Combat Brews) and attacks[1] a thrown
// 'lob' flask. No path ever adds an attack, so the indices never move:
//   P0 Combat Brews -- scales attacks[0] (the buff aura).
//   P1 Acid Flasks  -- scales attacks[1] and layers corrosion onto it.
//   P2 Volatile Mix -- scales attacks[1]'s blast radius and adds random effects.
// P1 and P2 touch disjoint fields of the flask (P1: status + acid DoT hook;
// P2: aoe + random-effect hook), so a flask can be BOTH acidic and explosive.
//
// Engine note on "strip armored": mobs.takeDamage() consults no armor-strip flag
// and the 'armored' flag is immutable, so acid cannot literally remove armor.
// Instead the flask is magic-typed (already bypassing the sharp-only armor rule)
// and the acid applies weakness (+damage taken) plus a poison DoT (also unbla-
// nkable by armor) -- functionally "melts armor". Deviation recorded in report.

/** Acid corrosion: a poison-typed DoT layered on top of the flask's weakness status. */
function acidDot(ctx) {
    var t = ctx.tower;
    var m = ctx.mob;
    if (!m || !m.addStatus) return;
    var dps = (t.stats && t.stats.acidDps) || 3;
    m.addStatus({ id: 'poison', dps: dps, duration: 3, damageType: 'poison', source: t });
}

/** Universal Solvent: extra true damage against fortified hides. */
function solventFortified(ctx) {
    var t = ctx.tower;
    var m = ctx.mob;
    if (m && m.modifiers && m.modifiers.fortified) {
        var d = m.takeDamage(30, 'true', t, {});
        if (d > 0) t.damageDealt = (t.damageDealt || 0) + d;
    }
}

/** Volatile Mix: each blast randomly afflicts hit mobs (intensity from stats.volatile). */
function volatileRandom(ctx) {
    var g = ctx.game;
    var m = ctx.mob;
    var t = ctx.tower;
    if (!m || !m.addStatus || !g.rng) return;
    var pow = (t.stats && t.stats.volatile) || 0;
    if (pow <= 0) return;
    var roll = g.rng.int(0, 3);
    if (roll === 0) m.addStatus({ id: 'slow', power: 0.6, duration: 2, source: t });
    else if (roll === 1) m.addStatus({ id: 'weakness', power: 1.3, duration: 3, source: t });
    else if (roll === 2) m.addStatus({ id: 'burn', dps: 3 * pow, duration: 3, damageType: 'fire', source: t });
    else m.addStatus({ id: 'poison', dps: 3 * pow, duration: 3, damageType: 'poison', source: t });
}

/** Direct area blast used by the Potion Barrage ability (no sim imports needed). */
function potionBlast(g, source, x, y, radius, damage) {
    var mobs = g.mobs;
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive) continue;
        var reach = radius + (m.radius || 0);
        var dx = m.x - x;
        var dy = m.y - y;
        if (dx * dx + dy * dy > reach * reach) continue;
        var d = m.takeDamage(damage, 'magic', source, {});
        if (d > 0) source.damageDealt = (source.damageDealt || 0) + d;
        if (m.alive && m.addStatus) m.addStatus({ id: 'weakness', power: 1.4, duration: 4, source: source });
    }
    if (g.fx) g.fx.explosion(x, y, radius, 'magic');
}

/** Big Blast Brew ability: rain potions on the six most-advanced mobs. */
function potionBarrageUse(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var live = [];
    for (var i = 0; i < g.mobs.length; i++) if (g.mobs[i].alive) live.push(g.mobs[i]);
    live.sort(function (a, b) { return (b.dist || 0) - (a.dist || 0); });
    var n = Math.min(6, live.length);
    for (var k = 0; k < n; k++) {
        var m = live[k];
        potionBlast(g, t, m.x, m.y, 90, 55);
    }
    if (g.sfx) g.sfx.play('explosion_medium');
    if (g.fx) g.fx.shake(0.45);
}

export default {
    id: 'brewing_stand',
    name: 'Brewing Stand',
    category: 'magic',
    cost: 550,
    desc: 'Brews buff potions for nearby towers and lobs splash flasks at the enemy.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 150,
        camoDetect: false,
        seesFlying: true,
        attacks: [
            {
                kind: 'aura',
                cooldown: 1,
                tick: 0.5,
                radius: 100,
                buffId: 'brew_strength',
                excludeSelf: true,
                buff: { mults: { damage: 1.12 }, flags: {} },
            },
            {
                kind: 'lob',
                cooldown: 1.8,
                damage: 2,
                pierce: 1,
                damageType: 'magic',
                range: 150,
                aoe: 22,
                projectile: { sprite: 'potion', speed: 340, lifetime: 2.4, motion: 'arc' },
                sfx: 'splash_potion',
            },
        ],
    },
    paths: [
        {
            name: 'Combat Brews',
            upgrades: [
                {
                    name: 'Strength Brew',
                    cost: 300,
                    desc: 'Nearby towers deal +18% damage, over a wider brewing range.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.buff.mults.damage', set: 1.18 },
                        { type: 'stat', target: 'attacks.0.radius', add: 20 },
                    ],
                },
                {
                    name: 'Potent Mixtures',
                    cost: 550,
                    desc: 'Boost the strength brew to +24% damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.buff.mults.damage', set: 1.24 },
                        { type: 'stat', target: 'attacks.0.radius', add: 20 },
                    ],
                },
                {
                    name: 'Master Brewer',
                    cost: 1500,
                    desc: '+30% damage and +8% attack speed to towers in range.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.buff.mults.damage', set: 1.3 },
                        { type: 'stat', target: 'attacks.0.buff.mults.attackSpeed', set: 1.08 },
                    ],
                },
                {
                    name: 'Lingering Potions',
                    cost: 4200,
                    desc: '+34% damage, +12% speed, and a far broader aura.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.buff.mults.damage', set: 1.34 },
                        { type: 'stat', target: 'attacks.0.buff.mults.attackSpeed', set: 1.12 },
                        { type: 'stat', target: 'attacks.0.radius', add: 30 },
                    ],
                },
                {
                    name: 'Netherite Elixir',
                    cost: 14000,
                    desc: '+42% damage, +18% speed, and a Brew Surge ability for a huge temporary boost.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.buff.mults.damage', set: 1.42 },
                        { type: 'stat', target: 'attacks.0.buff.mults.attackSpeed', set: 1.18 },
                        { type: 'stat', target: 'attacks.0.radius', add: 40 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'brew_surge',
                                name: 'Brew Surge',
                                desc: 'Floods nearby towers with +60% damage and +40% speed for 12s.',
                                cooldown: 55,
                                use: function (ctx) {
                                    var t = ctx.tower;
                                    var g = ctx.game;
                                    var r = ((t.stats.attacks[0] && t.stats.attacks[0].radius) || 100) * (t.stats.rangeMul || 1);
                                    var r2 = r * r;
                                    for (var i = 0; i < g.towers.length; i++) {
                                        var o = g.towers[i];
                                        if (o === t) continue;
                                        var dx = o.x - t.x;
                                        var dy = o.y - t.y;
                                        if (dx * dx + dy * dy > r2) continue;
                                        o.addBuff({ id: 'brew_surge', source: t, dur: 12, mults: { damage: 1.6, attackSpeed: 1.4 }, flags: {} });
                                    }
                                    if (g.fx) g.fx.spawn('splashPotion', t.x, t.y, { count: 12, color: '#d24bf0' });
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Acid Flasks',
            upgrades: [
                {
                    name: 'Acid Flask',
                    cost: 300,
                    desc: 'Flasks corrode: enemies hit take +25% damage and dissolve over time.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.damage', add: 3 },
                        { type: 'stat', target: 'attacks.1.status', set: { id: 'weakness', power: 1.25, duration: 4 } },
                        { type: 'stat', target: 'acidDps', set: 4 },
                        { type: 'behavior', hook: 'onHit', fn: acidDot },
                    ],
                },
                {
                    name: 'Corrosive Compound',
                    cost: 620,
                    desc: 'Stronger acid: +35% damage taken and a nastier dissolve.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.damage', add: 3 },
                        { type: 'stat', target: 'attacks.1.status', set: { id: 'weakness', power: 1.35, duration: 5 } },
                        { type: 'stat', target: 'acidDps', set: 7 },
                    ],
                },
                {
                    name: 'Vitriol',
                    cost: 1700,
                    desc: '+50% damage taken, heavy acid damage, and faster throws.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.status', set: { id: 'weakness', power: 1.5, duration: 6 } },
                        { type: 'stat', target: 'acidDps', set: 12 },
                        { type: 'stat', target: 'attacks.1.cooldown', mul: 0.85 },
                    ],
                },
                {
                    name: 'Hydrofluoric Brew',
                    cost: 4800,
                    desc: '+70% damage taken and searing acid that eats through anything.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.damage', add: 5 },
                        { type: 'stat', target: 'attacks.1.status', set: { id: 'weakness', power: 1.7, duration: 6 } },
                        { type: 'stat', target: 'acidDps', set: 18 },
                    ],
                },
                {
                    name: 'Universal Solvent',
                    cost: 16000,
                    desc: 'Doubles damage taken, melts everything, and rips extra true damage from fortified foes.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.damage', add: 8 },
                        { type: 'stat', target: 'attacks.1.status', set: { id: 'weakness', power: 2.0, duration: 7 } },
                        { type: 'stat', target: 'acidDps', set: 30 },
                        { type: 'behavior', hook: 'onHit', fn: solventFortified },
                    ],
                },
            ],
        },
        {
            name: 'Volatile Mix',
            upgrades: [
                {
                    name: 'Volatile Mix',
                    cost: 320,
                    desc: 'Flasks detonate in a wider, more damaging blast.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.aoe', add: 20 },
                        { type: 'stat', target: 'attacks.1.damage', add: 3 },
                    ],
                },
                {
                    name: 'Unstable Reagents',
                    cost: 640,
                    desc: 'Bigger blasts, thrown a little faster.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.aoe', add: 24 },
                        { type: 'stat', target: 'attacks.1.damage', add: 4 },
                        { type: 'stat', target: 'attacks.1.cooldown', mul: 0.9 },
                    ],
                },
                {
                    name: 'Chain Reaction',
                    cost: 1800,
                    desc: 'Blasts start afflicting hit mobs with a random potion effect.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.aoe', add: 30 },
                        { type: 'stat', target: 'attacks.1.damage', add: 6 },
                        { type: 'stat', target: 'volatile', set: 1 },
                        { type: 'behavior', hook: 'onHit', fn: volatileRandom },
                    ],
                },
                {
                    name: 'Meltdown',
                    cost: 5000,
                    desc: 'Enormous blasts with more potent random effects.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.aoe', add: 34 },
                        { type: 'stat', target: 'attacks.1.damage', add: 8 },
                        { type: 'stat', target: 'volatile', set: 2 },
                    ],
                },
                {
                    name: 'Big Blast Brew',
                    cost: 15000,
                    desc: 'Colossal blasts, chaotic effects, and a Potion Barrage ability.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.aoe', set: 95 },
                        { type: 'stat', target: 'attacks.1.damage', add: 12 },
                        { type: 'stat', target: 'volatile', set: 3 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'potion_barrage',
                                name: 'Potion Barrage',
                                desc: 'Rains huge potions on the six most-advanced enemies.',
                                cooldown: 45,
                                use: potionBarrageUse,
                            },
                        },
                    ],
                },
            ],
        },
    ],
};
