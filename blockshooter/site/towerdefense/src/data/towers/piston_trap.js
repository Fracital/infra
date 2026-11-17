// Piston Trap (CONTRACTS.md Appendix A entry 18) -- $750 support track hazard.
//
// Not a shooter: it stamps spike-trap ZONES onto the track wherever the lead mob
// is, and those traps chew through anything that walks over them until their
// charges run out. Because the damage is delivered by a Zone, its hits fire the
// tower's onHit hooks (attacks.js dealHit), which is how the Launch path knocks
// mobs backward and the Orbital tier stuns -- all without touching the sim.
//
// P0 scales spike lethality/durability, P1 the production line (fire rate +
// stockpile + a dump ability), P2 turns the traps into pistons that fling mobs
// back down the path. launchPush lives as a custom stat so upgrades can scale the
// knockback while a single behavior reads the current value.

/** Netherite spikes punch clean through boss armor for flat true damage. */
function netheriteBossBonus(ctx) {
    var f = ctx.mob && ctx.mob.def && ctx.mob.def.flags;
    if (f && f.boss) ctx.mob.takeDamage(30, 'true', ctx.tower);
}

/** Launch pistons: fling a non-boss backward along the path by stats.launchPush. */
function launchPush(ctx) {
    var mob = ctx.mob;
    var f = mob.def && mob.def.flags;
    if (f && f.boss) return;                     // MOAB-class are knockback-immune
    var push = (ctx.tower.stats && ctx.tower.stats.launchPush) || 0;
    if (push <= 0) return;
    mob.dist = Math.max(0, mob.dist - push);
    var g = ctx.game;
    if (g.rng && g.rng.chance(0.3)) {
        g.sfx.play('piston');
        if (g.fx.spawn) g.fx.spawn('spark', mob.x, mob.y, { count: 5, color: '#c9c9c9' });
    }
}

/** Orbital piston: the launch slam also stuns (bosses resist per the status rules). */
function orbitalStun(ctx) {
    var f = ctx.mob.def && ctx.mob.def.flags;
    if (f && f.boss) {
        // Bosses ignore knockback, so give the slam some bite instead.
        ctx.mob.takeDamage(20, 'blunt', ctx.tower);
    }
    ctx.mob.addStatus({ id: 'stun', duration: 0.75, source: ctx.tower });
    if (ctx.game.fx) ctx.game.fx.shockwave(ctx.mob.x, ctx.mob.y, 26);
}

export default {
    id: 'piston_trap',
    name: 'Piston Trap',
    category: 'support',
    cost: 750,
    desc: 'Stamps spike traps onto the nearby track that shred whatever crosses them.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 120,
        camoDetect: false,
        seesFlying: true,
        launchPush: 0,                 // px of knockback added by the Launch path
        attacks: [
            {
                kind: 'zone',
                cooldown: 2.2,
                damage: 4,
                damageType: 'sharp',
                range: null,
                sfx: 'spike',
                zone: { radius: 30, duration: 9, tickRate: 0.5, charges: 6 },
            },
        ],
    },
    paths: [
        {
            name: 'Sharpened Spikes',
            upgrades: [
                {
                    name: 'Iron Spikes',
                    cost: 450,
                    desc: 'Harder points deal +3 damage per hit.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                    ],
                },
                {
                    name: 'Barbed Tips',
                    cost: 800,
                    desc: '+4 trap charges and +2 damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.zone.charges', add: 4 },
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                    ],
                },
                {
                    name: 'Diamond Spikes',
                    cost: 2200,
                    desc: '+6 damage and traps linger 4s longer.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 6 },
                        { type: 'stat', target: 'attacks.0.zone.duration', add: 4 },
                    ],
                },
                {
                    name: 'Piercing Barbs',
                    cost: 6200,
                    desc: 'Spikes ignore armor and deal +8 damage.',
                    effects: [
                        { type: 'flag', flag: 'armorPiercing' },
                        { type: 'stat', target: 'attacks.0.damage', add: 8 },
                    ],
                },
                {
                    name: 'Netherite Spikes',
                    cost: 19000,
                    desc: 'Permaspikes: +20 damage, 14 more charges, and +30 true damage to bosses.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 20 },
                        { type: 'stat', target: 'attacks.0.zone.charges', add: 14 },
                        { type: 'stat', target: 'attacks.0.zone.duration', add: 12 },
                        { type: 'behavior', hook: 'onHit', fn: netheriteBossBonus },
                    ],
                },
            ],
        },
        {
            name: 'Assembly Line',
            upgrades: [
                {
                    name: 'Faster Pistons',
                    cost: 420,
                    desc: 'Lay traps 25% faster.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.8 },
                    ],
                },
                {
                    name: 'Redstone Feed',
                    cost: 800,
                    desc: 'Faster still, and +3 charges per trap.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.78 },
                        { type: 'stat', target: 'attacks.0.zone.charges', add: 3 },
                    ],
                },
                {
                    name: 'Automated Loader',
                    cost: 2100,
                    desc: 'Even faster, and traps linger 3s longer.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.72 },
                        { type: 'stat', target: 'attacks.0.zone.duration', add: 3 },
                    ],
                },
                {
                    name: 'Double Assembly',
                    cost: 5600,
                    desc: 'A second piston arm lays an independent trap line.',
                    effects: [
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'zone',
                                cooldown: 2.0,
                                damage: 6,
                                damageType: 'sharp',
                                range: null,
                                sfx: 'spike',
                                zone: { radius: 30, duration: 9, tickRate: 0.5, charges: 6 },
                            },
                        },
                    ],
                },
                {
                    name: 'Spike Storm',
                    cost: 18500,
                    desc: 'Constant production, plus Spike Storm: 6s of quadrupled trap output.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.cooldown', set: 0.4 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'spike_storm',
                                name: 'Spike Storm',
                                desc: 'Overclocks the assembly line, carpeting the track in spikes for 6 seconds.',
                                cooldown: 45,
                                use: function (ctx) {
                                    ctx.tower.addBuff({
                                        id: 'piston_spike_storm',
                                        source: ctx.tower,
                                        dur: 6,
                                        mults: { attackSpeed: 4 },
                                        flags: {},
                                    });
                                    if (ctx.game.fx && ctx.game.fx.spawn) {
                                        ctx.game.fx.spawn('spark', ctx.tower.x, ctx.tower.y, { count: 20, color: '#ff3b30' });
                                    }
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Launch Pistons',
            upgrades: [
                {
                    name: 'Piston Push',
                    cost: 480,
                    desc: 'Traps fling non-boss mobs backward down the track.',
                    effects: [
                        { type: 'behavior', hook: 'onHit', fn: launchPush },
                        { type: 'stat', target: 'launchPush', set: 45 },
                    ],
                },
                {
                    name: 'Sticky Pistons',
                    cost: 820,
                    desc: 'Stronger launch (+40 knockback) and +2 damage.',
                    effects: [
                        { type: 'stat', target: 'launchPush', add: 40 },
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                    ],
                },
                {
                    name: 'Heavy Rams',
                    cost: 2100,
                    desc: '+60 knockback and +3 trap charges.',
                    effects: [
                        { type: 'stat', target: 'launchPush', add: 60 },
                        { type: 'stat', target: 'attacks.0.zone.charges', add: 3 },
                    ],
                },
                {
                    name: 'Blast Pistons',
                    cost: 5800,
                    desc: '+100 knockback and a wider launch pad.',
                    effects: [
                        { type: 'stat', target: 'launchPush', add: 100 },
                        { type: 'stat', target: 'attacks.0.zone.radius', add: 12 },
                    ],
                },
                {
                    name: 'Orbital Piston',
                    cost: 19500,
                    desc: 'Colossal +200 knockback that also stuns, plus +10 damage and 10 charges.',
                    effects: [
                        { type: 'stat', target: 'launchPush', add: 200 },
                        { type: 'behavior', hook: 'onHit', fn: orbitalStun },
                        { type: 'stat', target: 'attacks.0.damage', add: 10 },
                        { type: 'stat', target: 'attacks.0.zone.charges', add: 10 },
                    ],
                },
            ],
        },
    ],
};
