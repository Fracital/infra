// Enchanter -- an enchanting table firing arcane bolts (CONTRACTS Appendix A #8).
//
// Base is a piercing magic bolt. The paths branch into raw arcane power (ending in
// a ramping Disintegrate beam), a Summoner line that fields allay familiars and
// finally buffs neighbours, and Necromancy that raises the slain as short-lived
// undead. P0 never adds an attack (its capstone replaces attacks[0] in place), so
// the Summoner's spawn attack is always attacks[1] -- keeping crosspath stat
// targets unambiguous.
//
// Necromancy and the Legion ability create real ally Units, so this file imports
// the sim's Unit. Data files may not touch gfx/audio/ui, but the sim is
// headless-safe, and units credit their kills back to this tower via dealHit.

import { Unit } from '../../sim/units.js';

/**
 * Necromancy: a killed mob has stats.necroChance to rise as raised_dead undead
 * that fight near where they fell (leashed to the death spot). Bosses never rise.
 */
function necroRaise(ctx) {
    var t = ctx.tower;
    var s = t.stats;
    if (!s.necroChance) return;
    var m = ctx.mob;
    if (m.def && m.def.flags && m.def.flags.boss) return;
    var g = ctx.game;
    if (s.necroChance < 1 && (!g.rng || !g.rng.chance(s.necroChance))) return;

    var n = Math.max(1, s.necroCount | 0);
    for (var i = 0; i < n; i++) {
        var jx = g.rng ? g.rng.range(-10, 10) : 0;
        var jy = g.rng ? g.rng.range(-10, 10) : 0;
        var u = new Unit(g, 'raised_dead', m.x + jx, m.y + jy, {
            leashX: m.x, leashY: m.y, leashRange: s.necroLeash || 150, source: t,
        });
        if (g.units) g.units.push(u);
    }
    if (g.fx && g.fx.spawn) g.fx.spawn('soul', m.x, m.y, { count: 6 });
    if (g.sfx) g.sfx.play('mob_pop');
}

/** Army of the Dead ability: tear open the veil and raise a ring of undead. */
function raiseLegion(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    var r = (t.stats.range || 160) * (t.stats.rangeMul || 1);
    for (var i = 0; i < 8; i++) {
        var a = (i / 8) * Math.PI * 2;
        var ox = t.x + Math.cos(a) * 40;
        var oy = t.y + Math.sin(a) * 40;
        var u = new Unit(g, 'raised_dead', ox, oy, {
            leashX: t.x, leashY: t.y, leashRange: Math.max(r, 200), source: t,
        });
        if (g.units) g.units.push(u);
    }
    if (g.fx) {
        if (g.fx.spawn) g.fx.spawn('soul', t.x, t.y, { count: 20 });
        g.fx.shockwave(t.x, t.y, 80);
    }
    if (g.sfx) g.sfx.play('wither_spawn');
}

export default {
    id: 'enchanter',
    name: 'Enchanter',
    category: 'magic',
    cost: 450,
    desc: 'An enchanting table that fires arcane bolts and bends the arcane to its will.',
    placement: 'land',
    footprint: 20,
    base: {
        range: 165,
        camoDetect: false,
        seesFlying: true,
        necroChance: 0,
        necroCount: 1,
        necroLeash: 150,
        attacks: [
            {
                kind: 'projectile',
                cooldown: 1.0,
                damage: 4,
                pierce: 2,
                damageType: 'magic',
                range: null,
                count: 1,
                spread: 0,
                aoe: 0,
                projectile: { sprite: 'magic', speed: 540, lifetime: 1.4, motion: 'straight', turnRate: 0 },
                sfx: 'zap',
            },
        ],
    },
    paths: [
        {
            name: 'Arcane Power',
            upgrades: [
                {
                    name: 'Sharpness Enchant',
                    cost: 280,
                    desc: '+3 arcane damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                    ],
                },
                {
                    name: 'Power Enchant',
                    cost: 460,
                    desc: '+4 damage and +2 pierce.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 4 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 2 },
                    ],
                },
                {
                    name: 'Arcane Infusion',
                    cost: 1250,
                    desc: '+6 damage and 25% faster casting.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 6 },
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.8 },
                    ],
                },
                {
                    name: 'Overcharged Bolts',
                    cost: 3300,
                    desc: '+10 damage, +2 pierce, faster bolts.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 10 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 2 },
                        { type: 'stat', target: 'attacks.0.projectile.speed', mul: 1.2 },
                    ],
                },
                {
                    name: 'Disintegrate',
                    cost: 12500,
                    desc: 'A sustained arcane beam that ramps up the longer it burns one target.',
                    effects: [
                        {
                            type: 'attackReplace',
                            index: 0,
                            attack: {
                                kind: 'beam',
                                cooldown: 0.1,
                                damage: 16,
                                pierce: 1,
                                damageType: 'magic',
                                range: null,
                                ramp: { rate: 0.045, max: 4.5 },
                                beamStyle: { color: '#c58bff', width: 5, duration: 0.12 },
                                sfx: 'laser',
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Summoner',
            upgrades: [
                {
                    name: 'Call Allay',
                    cost: 320,
                    desc: 'Summons an allay that seeks and zaps mobs (and sees camo).',
                    effects: [
                        { type: 'attackAdd', attack: { kind: 'spawn', unit: 'allay', max: 1, cooldown: 7, leashRange: 180 } },
                    ],
                },
                {
                    name: 'Twin Spirits',
                    cost: 480,
                    desc: 'Fields a second allay and re-summons faster.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.max', set: 2 },
                        { type: 'stat', target: 'attacks.1.cooldown', mul: 0.9 },
                    ],
                },
                {
                    name: 'Winged Choir',
                    cost: 1300,
                    desc: 'A trio of allays swarms the track.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.max', set: 3 },
                        { type: 'stat', target: 'attacks.1.cooldown', mul: 0.85 },
                    ],
                },
                {
                    name: 'Arcane Bond',
                    cost: 3100,
                    desc: 'Four allays, quicker re-summons, and +3 to the table\'s own bolts.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.max', set: 4 },
                        { type: 'stat', target: 'attacks.1.cooldown', mul: 0.85 },
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                    ],
                },
                {
                    name: 'Spirit Host',
                    cost: 13000,
                    desc: 'A tireless host of four allays that empower nearby towers (+25% damage, +10% speed).',
                    effects: [
                        { type: 'stat', target: 'attacks.1.cooldown', set: 3 },
                        { type: 'stat', target: 'attacks.0.damage', add: 5 },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'aura',
                                cooldown: 0.5,
                                range: null,
                                tick: 0.5,
                                excludeSelf: true,
                                buffId: 'spirit_host',
                                buff: { mults: { damage: 1.25, attackSpeed: 1.1 } },
                                auraFx: 'magic',
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Necromancy',
            upgrades: [
                {
                    name: 'Raise Dead',
                    cost: 300,
                    desc: 'Slain mobs have a 30% chance to rise as an undead ally.',
                    effects: [
                        { type: 'stat', target: 'necroChance', set: 0.3 },
                        { type: 'behavior', hook: 'onKill', fn: necroRaise },
                    ],
                },
                {
                    name: 'Grave Bond',
                    cost: 440,
                    desc: '45% raise chance and the risen roam farther.',
                    effects: [
                        { type: 'stat', target: 'necroChance', set: 0.45 },
                        { type: 'stat', target: 'necroLeash', set: 170 },
                    ],
                },
                {
                    name: 'Soul Harvest',
                    cost: 1300,
                    desc: '60% raise chance, and each raise fields two undead.',
                    effects: [
                        { type: 'stat', target: 'necroChance', set: 0.6 },
                        { type: 'stat', target: 'necroCount', set: 2 },
                    ],
                },
                {
                    name: 'Bone Legion',
                    cost: 3200,
                    desc: '80% raise chance across a wider battlefield.',
                    effects: [
                        { type: 'stat', target: 'necroChance', set: 0.8 },
                        { type: 'stat', target: 'necroLeash', set: 200 },
                    ],
                },
                {
                    name: 'Army of the Dead',
                    cost: 12500,
                    desc: 'Every kill raises three undead, plus the Raise the Legion ability.',
                    effects: [
                        { type: 'stat', target: 'necroChance', set: 1 },
                        { type: 'stat', target: 'necroCount', set: 3 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'raise_legion',
                                name: 'Raise the Legion',
                                desc: 'Instantly raise a ring of eight undead to storm the track.',
                                cooldown: 45,
                                use: raiseLegion,
                            },
                        },
                    ],
                },
            ],
        },
    ],
};
