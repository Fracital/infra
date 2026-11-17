// Piglin Brute -- a gold-armored brawler that sweeps its axe in a melee arc
// (CONTRACTS Appendix A entry 12). Cheap, close-range primary. The engine gives
// melee towers a 'close' default target mode and treats attack.pierce as the
// number of mobs cleaved in the arc.
//
// Note: the game's unit roster (sim/units.js UNIT_TYPES) has no "piglin" ally,
// so the P2 t5 warband spawns dire_wolf brawlers as the closest persistent
// melee minion -- recorded as a deviation.

/**
 * P0 t4+ 'Executioner': after a non-lethal hit, instantly finish any non-boss
 * below the execute threshold (read from stats so t5 can widen it). True damage
 * so armor/immunities cannot save them.
 */
function executeLow(ctx) {
    var mob = ctx.mob;
    if (!mob || !mob.alive) return;
    if (mob.def && mob.def.flags && mob.def.flags.boss) return;
    var thr = (ctx.tower.stats && ctx.tower.stats.executeThreshold) || 0.15;
    if (mob.maxHp > 0 && mob.hp / mob.maxHp <= thr) {
        mob.takeDamage(mob.hp + 1, 'true', ctx.tower, {});
        if (ctx.game.fx) {
            ctx.game.fx.text(mob.x, mob.y - 14, 'EXECUTE', '#ffd54a');
            if (ctx.game.fx.spawn) ctx.game.fx.spawn('crit', mob.x, mob.y, { count: 8 });
        }
    }
}

/**
 * P1 'Battle Frenzy': each kill stacks attack speed. Stacks reset once the buff
 * lapses (a lull in combat) so the ramp only builds mid-fight. Per-stack value
 * and cap come from stats so higher tiers deepen the frenzy.
 */
function battleFrenzy(ctx) {
    var tower = ctx.tower;
    var per = (tower.stats && tower.stats.frenzyPer) || 0.05;
    var max = (tower.stats && tower.stats.frenzyMax) || 8;
    if (!tower.buffs.has('piglin_frenzy')) tower._frenzy = 0;   // reset after a lull
    tower._frenzy = Math.min(max, (tower._frenzy || 0) + 1);
    tower.addBuff({ id: 'piglin_frenzy', source: tower, dur: 3, mults: { attackSpeed: 1 + tower._frenzy * per } });
    if (ctx.game.fx && ctx.game.fx.spawn) ctx.game.fx.spawn('spark', tower.x, tower.y, { count: 3, color: '#ff5a2b' });
}

/** P1 t5 ability: a berserk rampage -- double speed and heavy bonus damage. */
function rampageUse(ctx) {
    ctx.tower.addBuff({ id: 'piglin_rampage', source: ctx.tower, dur: 6, mults: { attackSpeed: 2, damage: 1.6 } });
    if (ctx.game.fx) {
        ctx.game.fx.shake(0.3);
        if (ctx.game.fx.spawn) ctx.game.fx.spawn('flame', ctx.tower.x, ctx.tower.y, { count: 16, color: '#ff5a2b' });
    }
    if (ctx.game.sfx) ctx.game.sfx.play('melee_swing');
}

/** P2 'Bartering': every kill drops gold, amount scaling with the tier. */
function barterGold(ctx) {
    var amt = (ctx.tower.stats && ctx.tower.stats.barterGold) || 0;
    if (amt > 0) ctx.game.economy.award(ctx.game, amt, ctx.mob.x, ctx.mob.y);
}

export default {
    id: 'piglin_brute',
    name: 'Piglin Brute',
    category: 'primary',
    cost: 300,
    desc: 'A gold-armored brute that cleaves everything in axe reach.',
    placement: 'land',
    footprint: 17,
    base: {
        range: 78,
        camoDetect: false,
        seesFlying: false,
        executeThreshold: 0,
        frenzyPer: 0,
        frenzyMax: 0,
        barterGold: 0,
        attacks: [
            {
                kind: 'melee',
                cooldown: 0.85,
                damage: 8,
                pierce: 1,
                damageType: 'sharp',
                range: null,
                arc: 2.2,
                knockback: 0,
                sfx: 'melee_swing',
            },
        ],
    },
    paths: [
        {
            name: 'Golden Greataxe',
            upgrades: [
                {
                    name: 'Sharpened Edge',
                    cost: 190,
                    desc: 'A keener blade adds +4 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 4 },
                    ],
                },
                {
                    name: 'Heavy Head',
                    cost: 330,
                    desc: 'A weightier axe head hits for +6 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 6 },
                    ],
                },
                {
                    name: 'Gilded Bite',
                    cost: 950,
                    desc: '+10 damage and swings now knock mobs back.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 10 },
                        { type: 'stat', target: 'attacks.0.knockback', set: 22 },
                    ],
                },
                {
                    name: "Executioner's Axe",
                    cost: 2600,
                    desc: '+14 damage and instantly executes non-boss mobs below 15% health.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 14 },
                        { type: 'stat', target: 'executeThreshold', set: 0.15 },
                        { type: 'behavior', hook: 'onHit', fn: executeLow },
                    ],
                },
                {
                    name: 'Netherite Executioner',
                    cost: 8500,
                    desc: 'A massive armor-splitting cleave that executes anything under 25% health.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', set: 60 },
                        { type: 'stat', target: 'attacks.0.arc', set: 2.8 },
                        { type: 'stat', target: 'attacks.0.knockback', set: 40 },
                        { type: 'stat', target: 'executeThreshold', set: 0.25 },
                        { type: 'flag', flag: 'armorPiercing' },
                    ],
                },
            ],
        },
        {
            name: 'Battle Frenzy',
            upgrades: [
                {
                    name: 'Quick Swings',
                    cost: 220,
                    desc: '15% faster attacks.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
                    ],
                },
                {
                    name: 'Adrenaline',
                    cost: 360,
                    desc: 'Another 15% off the swing timer.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
                    ],
                },
                {
                    name: 'Rising Fury',
                    cost: 900,
                    desc: 'Each kill stacks up to +40% attack speed while the fight rages on.',
                    effects: [
                        { type: 'stat', target: 'frenzyPer', set: 0.05 },
                        { type: 'stat', target: 'frenzyMax', set: 8 },
                        { type: 'behavior', hook: 'onKill', fn: battleFrenzy },
                    ],
                },
                {
                    name: 'Berserker',
                    cost: 2400,
                    desc: 'Deeper frenzy (up to +84%) and 15% faster base swings.',
                    effects: [
                        { type: 'stat', target: 'frenzyPer', set: 0.07 },
                        { type: 'stat', target: 'frenzyMax', set: 12 },
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
                    ],
                },
                {
                    name: 'Blood Rage',
                    cost: 7500,
                    desc: 'A whirlwind that cleaves everything around it, plus a Rampage ability.',
                    effects: [
                        {
                            // Whirlwind: full-circle multi-hit. Bakes in high damage since the
                            // replace discards the path's own cooldown crosspath on attacks[0].
                            type: 'attackReplace',
                            index: 0,
                            attack: {
                                kind: 'melee',
                                cooldown: 0.5,
                                damage: 40,
                                pierce: 6,
                                damageType: 'sharp',
                                range: null,
                                arc: 6.283185,
                                knockback: 15,
                                sfx: 'melee_swing',
                            },
                        },
                        { type: 'stat', target: 'frenzyPer', set: 0.1 },
                        { type: 'stat', target: 'frenzyMax', set: 20 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'piglin_rampage',
                                name: 'Rampage',
                                desc: 'Doubles attack speed and adds +60% damage for 6 seconds.',
                                cooldown: 40,
                                use: rampageUse,
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Bartering',
            upgrades: [
                {
                    name: 'Gold Pouch',
                    cost: 180,
                    desc: 'Each kill drops 2 gold.',
                    effects: [
                        { type: 'stat', target: 'barterGold', set: 2 },
                        { type: 'behavior', hook: 'onKill', fn: barterGold },
                    ],
                },
                {
                    name: 'Haggler',
                    cost: 420,
                    desc: 'Kills now drop 4 gold each.',
                    effects: [
                        { type: 'stat', target: 'barterGold', set: 4 },
                    ],
                },
                {
                    name: 'Nether Gold Rush',
                    cost: 1000,
                    desc: '7 gold per kill, plus a steady trickle of income each round.',
                    effects: [
                        { type: 'stat', target: 'barterGold', set: 7 },
                        {
                            type: 'attackAdd',
                            attack: { kind: 'income', cooldown: 8, when: 'interval', interval: 8, amount: 40 },
                        },
                    ],
                },
                {
                    name: 'Bullion Trade',
                    cost: 2800,
                    desc: '12 gold per kill and a fatter income stream.',
                    effects: [
                        { type: 'stat', target: 'barterGold', set: 12 },
                        { type: 'stat', target: 'attacks.1.amount', set: 80 },
                    ],
                },
                {
                    name: 'Piglin Warband',
                    cost: 9000,
                    // No "piglin" unit exists in UNIT_TYPES; dire_wolf is the closest
                    // persistent melee brawler ally (deviation).
                    desc: 'Summons a warband of brawlers to hunt mobs and hauls in a fortune of gold.',
                    effects: [
                        { type: 'stat', target: 'barterGold', set: 25 },
                        { type: 'stat', target: 'attacks.1.amount', set: 160 },
                        {
                            type: 'attackAdd',
                            attack: { kind: 'spawn', unit: 'dire_wolf', max: 2, cooldown: 5 },
                        },
                    ],
                },
            ],
        },
    ],
};
