// Steve -- the melee warrior hero (CONTRACTS Appendix D).
//
// A diamond-sword bruiser who wades into the track and cleaves everything in a
// widening arc. HeroTower folds each level's effects cumulatively on top of
// `base` (heroes.js), so the level table below is a steady climb -- every level
// is a real stat bump -- with signature beats at 5 (whirlwind sweep), 8 (cleave
// chains to a second mob), 13 (seismic slow on every swing) and 16 (leaps to
// strike fliers). Abilities land at 3 (Smite) and 10 (Diamond Gear); level 20
// grants a warcry that empowers every melee tower on the field.
//
// Behaviors reach the world only through ctx (mob.takeDamage / game.fx / game.rng)
// so this data file stays headless-safe and import-free, exactly like the
// dispenser reference.

/** L3 Smite: call down lightning on the toughest mob and blast everything near it. */
function steveSmite(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var mobs = g.mobs;
    if (!mobs || !mobs.length) return;
    var best = null;
    var bestHp = -1;
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive) continue;
        if (m.maxHp > bestHp) { bestHp = m.maxHp; best = m; }
    }
    if (!best) return;
    var radius = (t.stats && t.stats.smiteRadius) || 95;
    var dmg = (t.stats && t.stats.smiteDamage) || 45;
    for (var j = 0; j < mobs.length; j++) {
        var o = mobs[j];
        if (!o.alive) continue;
        var dx = o.x - best.x;
        var dy = o.y - best.y;
        var reach = radius + (o.radius || 0);
        if (dx * dx + dy * dy > reach * reach) continue;
        var dealt = o.takeDamage(dmg, 'magic', t, { armorPiercing: true });
        t.damageDealt = (t.damageDealt || 0) + dealt;
    }
    if (g.fx) {
        g.fx.lightning([[best.x, best.y - 280], [best.x, best.y]]);
        g.fx.explosion(best.x, best.y, radius, 'tnt');
        g.fx.shake(0.5);
        g.fx.spawn('spark', best.x, best.y, { count: 20, color: '#fff2a8' });
    }
    if (g.sfx) g.sfx.play('explosion_medium');
}

/** L8 Cleave: a sword hit splashes half its damage onto the nearest other mob. */
function steveCleave(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var src = ctx.mob;
    if (!src) return;
    var mobs = g.mobs;
    var best = null;
    var bestD = 90 * 90;
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive || m === src) continue;
        var dx = m.x - src.x;
        var dy = m.y - src.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = m; }
    }
    if (!best) return;
    var dmg = Math.max(2, (ctx.damageDealt || 0) * 0.5);
    var ap = !!(t.stats && t.stats.armorPiercing);
    var dealt = best.takeDamage(dmg, 'sharp', t, { armorPiercing: ap });
    t.damageDealt = (t.damageDealt || 0) + dealt;
    if (g.fx) g.fx.spawn('spark', best.x, best.y, { count: 5, color: '#dfe7ff' });
}

/** L13 Seismic Smash: every swing sends a shock through the ground, slowing the crowd. */
function steveQuake(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var range = (t.stats && t.stats.range) || 110;
    var r2 = range * range;
    var mobs = g.mobs;
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive) continue;
        var dx = m.x - t.x;
        var dy = m.y - t.y;
        if (dx * dx + dy * dy > r2) continue;
        if (m.addStatus) m.addStatus({ id: 'slow', power: 0.65, duration: 0.6, damageType: 'blunt' });
    }
    if (g.fx) g.fx.shockwave(t.x, t.y, range * 0.8);
}

/** L20 Rallying Cry: refresh a small damage buff on every melee tower (Steve included). */
function steveValor(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    t._valorT = (t._valorT || 0) + ctx.dt;
    if (t._valorT < 0.5) return;
    t._valorT = 0;
    var towers = g.towers;
    for (var i = 0; i < towers.length; i++) {
        var tw = towers[i];
        if (!tw || !tw.stats || !tw.stats.attacks) continue;
        var isMelee = false;
        for (var k = 0; k < tw.stats.attacks.length; k++) {
            var a = tw.stats.attacks[k];
            if (a && a.kind === 'melee') { isMelee = true; break; }
        }
        if (!isMelee) continue;
        tw.addBuff({ id: 'steve_valor', source: t, dur: 0.8, mults: { damage: 1.2 }, flags: {} });
    }
}

export default {
    id: 'steve',
    name: 'Steve',
    category: 'primary',
    cost: 350,
    isHero: true,
    desc: 'A sword-swinging survivor who cleaves the horde in a widening arc.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 108,
        camoDetect: false,
        seesFlying: true,
        smiteDamage: 45,
        smiteRadius: 95,
        attacks: [
            {
                kind: 'melee',
                cooldown: 1.0,
                damage: 3,
                pierce: 2,
                damageType: 'sharp',
                arc: Math.PI * 0.8,
                knockback: 10,
                sfx: 'melee_swing',
            },
        ],
    },
    paths: [],
    levels: [
        {
            level: 2,
            desc: 'Sturdier swings: +2 sword damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 2 },
            ],
        },
        {
            level: 3,
            desc: 'Smite (ability): call lightning onto the toughest mob, blasting all nearby. Reach grows.',
            effects: [
                { type: 'stat', target: 'range', add: 8 },
                {
                    type: 'ability',
                    ability: {
                        id: 'steve_smite',
                        name: 'Smite',
                        desc: 'Strike the strongest enemy with lightning for heavy area damage.',
                        cooldown: 20,
                        use: steveSmite,
                    },
                },
            ],
        },
        {
            level: 4,
            desc: 'Honed edge: +2 damage and slightly faster swings.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 2 },
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.95 },
            ],
        },
        {
            level: 5,
            desc: 'Whirlwind: swings become a full 360 sweep that carves +2 more enemies. +1 damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.arc', set: Math.PI * 2 },
                { type: 'stat', target: 'attacks.0.pierce', add: 2 },
                { type: 'stat', target: 'attacks.0.damage', add: 1 },
            ],
        },
        {
            level: 6,
            desc: 'Brute strength: +3 damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 3 },
            ],
        },
        {
            level: 7,
            desc: 'Quick footwork: faster swings and +8 reach.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.9 },
                { type: 'stat', target: 'range', add: 8 },
            ],
        },
        {
            level: 8,
            desc: 'Cleave: hits splash half their damage to the nearest other mob. +2 targets.',
            effects: [
                { type: 'stat', target: 'attacks.0.pierce', add: 2 },
                { type: 'behavior', hook: 'onHit', fn: steveCleave },
            ],
        },
        {
            level: 9,
            desc: 'Momentum: +4 damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 4 },
            ],
        },
        {
            level: 10,
            desc: 'Diamond Gear (ability): gear up for 2.5x damage and +15% range for 15s. Swings tighten.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.92 },
                {
                    type: 'ability',
                    ability: {
                        id: 'steve_diamond_gear',
                        name: 'Diamond Gear',
                        desc: 'Suit up: 2.5x damage and +15% range for 15 seconds.',
                        cooldown: 40,
                        use: function (ctx) {
                            ctx.tower.addBuff({
                                id: 'steve_diamond_gear',
                                source: ctx.tower,
                                dur: 15,
                                mults: { damage: 2.5, range: 1.15 },
                                flags: {},
                            });
                            if (ctx.game.fx) {
                                ctx.game.fx.spawn('spark', ctx.tower.x, ctx.tower.y, { count: 22, color: '#4aedd9' });
                                ctx.game.fx.spawn('crit', ctx.tower.x, ctx.tower.y, { count: 8 });
                            }
                            if (ctx.game.sfx) ctx.game.sfx.play('golem_slam');
                        },
                    },
                },
            ],
        },
        {
            level: 11,
            desc: 'Heavy blade: +5 damage and +10 reach.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 5 },
                { type: 'stat', target: 'range', add: 10 },
            ],
        },
        {
            level: 12,
            desc: 'Battle rhythm: faster swings.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.9 },
            ],
        },
        {
            level: 13,
            desc: 'Seismic Smash: every swing quakes the ground, slowing all nearby mobs. Smite hits harder.',
            effects: [
                { type: 'stat', target: 'smiteDamage', add: 30 },
                { type: 'stat', target: 'attacks.0.damage', add: 3 },
                { type: 'behavior', hook: 'onFire', fn: steveQuake },
            ],
        },
        {
            level: 14,
            desc: 'Relentless: +6 damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 6 },
            ],
        },
        {
            level: 15,
            desc: 'Blur of steel: faster swings and +2 targets.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.88 },
                { type: 'stat', target: 'attacks.0.pierce', add: 2 },
            ],
        },
        {
            level: 16,
            desc: 'Leaping Strike: Steve now smashes fliers out of the air. +8 damage, +14 reach.',
            effects: [
                { type: 'flag', flag: 'hitsFlying' },
                { type: 'stat', target: 'attacks.0.damage', add: 8 },
                { type: 'stat', target: 'range', add: 14 },
            ],
        },
        {
            level: 17,
            desc: 'Crushing blows: +8 damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 8 },
            ],
        },
        {
            level: 18,
            desc: 'Flurry: swings even faster.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
            ],
        },
        {
            level: 19,
            desc: 'Executioner: +10 damage and +3 targets.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 10 },
                { type: 'stat', target: 'attacks.0.pierce', add: 3 },
            ],
        },
        {
            level: 20,
            desc: 'Rallying Cry (passive): every melee tower on the map deals +20% damage. +12 damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 12 },
                { type: 'behavior', hook: 'onTick', fn: steveValor },
            ],
        },
    ],
};
