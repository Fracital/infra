// Skeleton Sniper -- CONTRACTS Appendix A entry 5.
//
// A perched skeleton archer with map-covering range and slow, heavy shots. The
// shot is a true HITSCAN 'ray' -- an instant line to the target with no travel
// time, so it never tunnels the way a fast projectile would. 'pierce' becomes
// line-penetration (the bolt skewers mobs behind the first). Defaults to
// 'strong' targeting -- snipers pick the juiciest target. Three roles: raw
// single-target/anti-boss punch (P0), a rate-of-fire + squad-summon build (P1),
// and a marksman-support build that cripples, pays out, and de-camos (P2).

/** P0 t4+: extra TRUE damage against MOAB-class bosses (scales via stats). */
function bossBonus(ctx) {
    var m = ctx.mob;
    var f = m && m.def && m.def.flags;
    if (!f || !f.boss) return;
    var bonus = ctx.tower.stats.bossBonus || 0;
    if (bonus <= 0) return;
    m.takeDamage(bonus, 'true', ctx.tower, { armorPiercing: true });
    ctx.tower.damageDealt = (ctx.tower.damageDealt || 0) + bonus;
}

/** P2 t1+: every bolt hamstrings the target (slow scales via stats). */
function crippleOnHit(ctx) {
    var m = ctx.mob;
    if (!m || !m.addStatus) return;
    var power = (ctx.tower.stats.cripplePower != null) ? ctx.tower.stats.cripplePower : 0.65;
    var dur = (ctx.tower.stats.crippleDur != null) ? ctx.tower.stats.crippleDur : 1.5;
    m.addStatus({ id: 'slow', power: power, duration: dur });
}

/** P2 t3+: bounty payout on every kill (amount scales via stats). */
function cashOnKill(ctx) {
    var amt = ctx.tower.stats.killCash || 0;
    if (amt > 0 && ctx.game && ctx.game.economy) {
        ctx.game.economy.award(ctx.game, amt, ctx.mob.x, ctx.mob.y);
    }
}

/** P2 t5: bolts stun on hit (Warden's Bane). */
function stunOnHit(ctx) {
    var m = ctx.mob;
    if (!m || !m.addStatus) return;
    m.addStatus({ id: 'stun', duration: 0.5, source: ctx.tower });
}

/** P2 t5: permanently strip camo from any mob in the sniper's (map-wide) sight. */
function stripCamo(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var r = (t.stats.range || 0) * (t.stats.rangeMul || 1);
    if (r <= 0) return;
    var mobs = g.grid ? g.grid.queryCircle(t.x, t.y, r + 64) : (g.mobs || []);
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m || !m.alive || !m.modifiers || !m.modifiers.camo) continue;
        var reach = r + (m.radius || 0);
        var dx = m.x - t.x;
        var dy = m.y - t.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        m.modifiers.camo = false;
        if (g.fx && g.fx.spawn) g.fx.spawn('magic', m.x, m.y, { count: 3 });
        if (g.sfx) g.sfx.play('camo_reveal');
    }
}

export default {
    id: 'skeleton_sniper',
    name: 'Skeleton Sniper',
    category: 'military',
    cost: 350,
    desc: 'A perched archer that snipes the strongest target anywhere on the map.',
    placement: 'land',
    footprint: 16,
    defaultTargetMode: 'strong',
    base: {
        range: 1600,
        camoDetect: false,
        seesFlying: true,
        bossBonus: 0,
        cripplePower: 0.65,
        crippleDur: 1.5,
        killCash: 0,
        attacks: [
            {
                kind: 'ray',
                cooldown: 1.6,
                damage: 8,
                pierce: 1,
                damageType: 'sharp',
                range: null,
                width: 16,
                beamStyle: { color: '#e8ecff', width: 2, duration: 0.06 },
                sfx: 'bolt',
            },
        ],
    },
    paths: [
        {
            name: 'Heavy Bolts',
            upgrades: [
                {
                    name: 'Armor-Piercing Bolts',
                    cost: 245,
                    desc: 'Tungsten heads punch through armor and hit +3 harder.',
                    effects: [
                        { type: 'flag', flag: 'armorPiercing' },
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                    ],
                },
                {
                    name: 'Heavy Draw',
                    cost: 420,
                    desc: 'A heavier draw weight adds +5 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 5 },
                    ],
                },
                {
                    name: 'Penetrator Bolt',
                    cost: 1050,
                    desc: '+8 damage and the bolt skewers a second target behind the first.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 8 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 1 },
                    ],
                },
                {
                    name: 'Bane of Bosses',
                    cost: 3150,
                    desc: '+16 damage and a huge bonus that ignores boss defenses.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 16 },
                        { type: 'stat', target: 'bossBonus', set: 60 },
                        { type: 'behavior', hook: 'onHit', fn: bossBonus },
                    ],
                },
                {
                    name: 'Wither Bolt',
                    cost: 9800,
                    desc: 'A devastating single shot that inflicts a withering decay eating away the target over time.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 55 },
                        { type: 'stat', target: 'bossBonus', set: 200 },
                        { type: 'stat', target: 'attacks.0.status', set: { id: 'poison', dps: 22, duration: 5, damageType: 'poison' } },
                    ],
                },
            ],
        },
        {
            name: 'Quick Draw',
            upgrades: [
                {
                    name: 'Quick Draw',
                    cost: 245,
                    desc: 'A faster nock-and-loose cycle.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.82 },
                    ],
                },
                {
                    name: 'Fast Hands',
                    cost: 430,
                    desc: 'Even quicker between shots.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.8 },
                    ],
                },
                {
                    name: 'Rapid Nock',
                    cost: 1080,
                    desc: 'A blistering rate of fire for a sniper.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.78 },
                    ],
                },
                {
                    name: 'Bone Battalion',
                    cost: 3200,
                    desc: 'Raises a skeleton squad to fight alongside the sniper, and keeps firing faster.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'spawn',
                                cooldown: 8,
                                unit: 'skeleton_squad',
                                max: 2,
                                leashRange: 170,
                                sfx: 'bone',
                            },
                        },
                    ],
                },
                {
                    name: 'Skeleton Firing Line',
                    cost: 9500,
                    desc: 'A wide raking volley mows down a whole line of mobs at once, plus an ability that unleashes a frenzied barrage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.width', set: 46 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 4 },
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.6 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'firing_line',
                                name: 'Rapid Barrage',
                                desc: 'Triples this sniper\'s fire rate for 6 seconds.',
                                cooldown: 35,
                                use: function (ctx) {
                                    ctx.tower.addBuff({
                                        id: 'sniper_barrage',
                                        source: ctx.tower,
                                        dur: 6,
                                        mults: { attackSpeed: 3 },
                                        flags: {},
                                    });
                                    if (ctx.game.fx && ctx.game.fx.spawn) {
                                        ctx.game.fx.spawn('bone', ctx.tower.x, ctx.tower.y, { count: 10 });
                                    }
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Marksman Support',
            upgrades: [
                {
                    name: 'Crippling Shot',
                    cost: 245,
                    desc: 'Bolts hamstring the target, slowing it to 65% speed.',
                    effects: [
                        { type: 'stat', target: 'cripplePower', set: 0.65 },
                        { type: 'stat', target: 'crippleDur', set: 1.5 },
                        { type: 'behavior', hook: 'onHit', fn: crippleOnHit },
                    ],
                },
                {
                    name: 'Hamstring',
                    cost: 420,
                    desc: 'A crueler cripple, dropping targets to 50% speed for longer.',
                    effects: [
                        { type: 'stat', target: 'cripplePower', set: 0.5 },
                        { type: 'stat', target: 'crippleDur', set: 2.0 },
                    ],
                },
                {
                    name: 'Bounty Hunter',
                    cost: 1050,
                    desc: 'Marks targets for coin -- earn bonus cash on every kill.',
                    effects: [
                        { type: 'stat', target: 'killCash', set: 6 },
                        { type: 'behavior', hook: 'onKill', fn: cashOnKill },
                    ],
                },
                {
                    name: 'Deadshot',
                    cost: 3150,
                    desc: 'Brutal cripples (to 40% speed), bigger bounties, and +6 damage.',
                    effects: [
                        { type: 'stat', target: 'cripplePower', set: 0.4 },
                        { type: 'stat', target: 'killCash', set: 12 },
                        { type: 'stat', target: 'attacks.0.damage', add: 6 },
                    ],
                },
                {
                    name: 'Warden\'s Bane',
                    cost: 9200,
                    desc: 'Permanently strips camo from anything in sight and stuns every target it hits, with fat bounties and +12 damage.',
                    effects: [
                        { type: 'flag', flag: 'camoDetect' },
                        { type: 'stat', target: 'killCash', set: 25 },
                        { type: 'stat', target: 'attacks.0.damage', add: 12 },
                        { type: 'behavior', hook: 'onHit', fn: stunOnHit },
                        { type: 'behavior', hook: 'onTick', fn: stripCamo },
                    ],
                },
            ],
        },
    ],
};
