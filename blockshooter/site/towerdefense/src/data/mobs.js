// Mob roster. Headless-safe pure data -- copied EXACTLY from CONTRACTS Appendix B.
//
// Each MobDef feeds sim/mobs.js. `special`/`specialParams` drive the scripted
// behaviors in Mob.update(); `children` are spawned by Mob.die() at the parent's
// path distance (bloons-style hierarchy). `deathSfx` is one of
// mob_death_small (fodder/flyers), mob_death_medium (illagers/heavies), or
// mob_death_boss. `tier` is a rough 1..10 menace scale used only for UI/codex.
//
// Flags: camo (needs camoDetect to target), armored (immune to 'sharp' unless
// armor-piercing), flying (immune to zone/melee unless hitsFlying), boss
// (MOAB-class: status durations x0.25, knockback-immune; warden also all-status
// immune -- handled in sim/statuses.js keyed on this flag/id).
//
// Damage-type immunities live in `immunities` (a damage-type array). Status
// immunities (e.g. warden) are NOT expressed here -- the sim treats boss +
// warden specially. So warden.immunities stays [] even though it is armored.

/** @typedef {{id:string,count:number}} ChildSpec */

export const MOBS = {
    silverfish: {
        id: 'silverfish', name: 'Silverfish', hp: 1, speed: 78, radius: 8, bounty: 1,
        tier: 1,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    zombie: {
        id: 'zombie', name: 'Zombie', hp: 2, speed: 54, radius: 11, bounty: 2,
        tier: 2,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'silverfish', count: 2 }],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    baby_zombie: {
        id: 'baby_zombie', name: 'Baby Zombie', hp: 1, speed: 130, radius: 8, bounty: 2,
        tier: 2,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    husk: {
        id: 'husk', name: 'Husk', hp: 3, speed: 50, radius: 11, bounty: 3,
        tier: 3,
        flags: { camo: false, armored: true, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'zombie', count: 1 }],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    zombie_villager: {
        id: 'zombie_villager', name: 'Zombie Villager', hp: 3, speed: 56, radius: 11, bounty: 3,
        tier: 3,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'zombie', count: 1 }],
        // Natural, modifier-independent regrow: the sim reads alwaysRegrow and
        // treats this mob as if it carried the 'regrow' modifier even in rounds
        // that don't apply one. special stays null; flags stay clean.
        alwaysRegrow: true,
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    skeleton: {
        id: 'skeleton', name: 'Skeleton', hp: 3, speed: 66, radius: 10, bounty: 3,
        tier: 3,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'zombie', count: 1 }],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    stray: {
        id: 'stray', name: 'Stray', hp: 3, speed: 62, radius: 10, bounty: 3,
        tier: 3,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: ['cold'],
        children: [{ id: 'skeleton', count: 1 }],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    spider: {
        id: 'spider', name: 'Spider', hp: 4, speed: 88, radius: 13, bounty: 4,
        tier: 4,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'skeleton', count: 1 }],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    cave_spider: {
        id: 'cave_spider', name: 'Cave Spider', hp: 3, speed: 92, radius: 10, bounty: 4,
        tier: 4,
        flags: { camo: true, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'spider', count: 1 }],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    creeper: {
        id: 'creeper', name: 'Creeper', hp: 6, speed: 72, radius: 11, bounty: 5,
        tier: 4,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'spider', count: 1 }],
        // Death "poof" is purely cosmetic (green burst + mob_pop layer) -- driven
        // by fx/deathSfx in Mob.die(), not a scripted special.
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    slime_big: {
        id: 'slime_big', name: 'Big Slime', hp: 8, speed: 45, radius: 16, bounty: 4,
        tier: 4,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'slime_med', count: 2 }],
        special: 'split_visual', specialParams: {},
        deathSfx: 'mob_death_small',
    },
    slime_med: {
        id: 'slime_med', name: 'Slime', hp: 4, speed: 55, radius: 12, bounty: 2,
        tier: 3,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'slime_small', count: 2 }],
        special: 'split_visual', specialParams: {},
        deathSfx: 'mob_death_small',
    },
    slime_small: {
        id: 'slime_small', name: 'Small Slime', hp: 2, speed: 70, radius: 8, bounty: 1,
        tier: 2,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    magma_cube_big: {
        id: 'magma_cube_big', name: 'Magma Cube', hp: 10, speed: 42, radius: 16, bounty: 5,
        tier: 5,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: ['fire'],
        children: [{ id: 'magma_cube_small', count: 3 }],
        special: 'split_visual', specialParams: {},
        deathSfx: 'mob_death_small',
    },
    magma_cube_small: {
        id: 'magma_cube_small', name: 'Magma Cube', hp: 3, speed: 60, radius: 9, bounty: 2,
        tier: 3,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: ['fire'],
        children: [],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    phantom: {
        id: 'phantom', name: 'Phantom', hp: 5, speed: 85, radius: 12, bounty: 5,
        tier: 5,
        flags: { camo: false, armored: false, flying: true, boss: false },
        immunities: [],
        children: [],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    blaze: {
        id: 'blaze', name: 'Blaze', hp: 7, speed: 70, radius: 12, bounty: 6,
        tier: 6,
        flags: { camo: false, armored: false, flying: true, boss: false },
        immunities: ['fire'],
        children: [],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    vex: {
        id: 'vex', name: 'Vex', hp: 4, speed: 95, radius: 9, bounty: 5,
        tier: 5,
        flags: { camo: true, armored: false, flying: true, boss: false },
        immunities: [],
        children: [],
        special: null, specialParams: {},
        deathSfx: 'mob_death_small',
    },
    witch: {
        id: 'witch', name: 'Witch', hp: 14, speed: 48, radius: 12, bounty: 8,
        tier: 6,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'zombie_villager', count: 2 }],
        // Emits a heal pulse: +3 hp/s to friendly mobs within 80px (never itself
        // beyond its own regen). Sim caps healed mobs at their maxHp.
        special: 'heal', specialParams: { radius: 80, healPerSec: 3 },
        deathSfx: 'mob_death_medium',
    },
    enderman: {
        id: 'enderman', name: 'Enderman', hp: 18, speed: 64, radius: 12, bounty: 10,
        tier: 7,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [],
        // Blinks +70px further down the path when it takes damage, at most once
        // every 2s (a mini teleport that skips would-be tower coverage).
        special: 'teleport', specialParams: { jump: 70, cooldown: 2 },
        deathSfx: 'mob_death_medium',
    },
    pillager: {
        id: 'pillager', name: 'Pillager', hp: 8, speed: 60, radius: 11, bounty: 5,
        tier: 5,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'skeleton', count: 2 }],
        special: null, specialParams: {},
        deathSfx: 'mob_death_medium',
    },
    vindicator: {
        id: 'vindicator', name: 'Vindicator', hp: 16, speed: 58, radius: 12, bounty: 8,
        tier: 6,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'pillager', count: 2 }],
        special: null, specialParams: {},
        deathSfx: 'mob_death_medium',
    },
    evoker: {
        id: 'evoker', name: 'Evoker', hp: 22, speed: 50, radius: 12, bounty: 12,
        tier: 7,
        flags: { camo: false, armored: false, flying: false, boss: false },
        immunities: [],
        children: [{ id: 'vindicator', count: 1 }],
        // Conjures a vex every 6s while alive, up to 6 of its own at once.
        special: 'spawn_vex', specialParams: { spawn: 'vex', interval: 6, max: 6 },
        deathSfx: 'mob_death_medium',
    },
    wither_skeleton: {
        id: 'wither_skeleton', name: 'Wither Skeleton', hp: 20, speed: 72, radius: 12, bounty: 10,
        tier: 7,
        flags: { camo: false, armored: true, flying: false, boss: false },
        immunities: ['fire'],
        children: [{ id: 'skeleton', count: 2 }],
        special: null, specialParams: {},
        deathSfx: 'mob_death_medium',
    },
    ravager: {
        id: 'ravager', name: 'Ravager', hp: 220, speed: 38, radius: 26, bounty: 40,
        tier: 10,
        flags: { camo: false, armored: false, flying: false, boss: true },
        immunities: [],
        children: [{ id: 'vindicator', count: 4 }],
        special: null, specialParams: {},
        deathSfx: 'mob_death_boss',
    },
    elder_guardian: {
        id: 'elder_guardian', name: 'Elder Guardian', hp: 750, speed: 26, radius: 34, bounty: 90,
        tier: 10,
        flags: { camo: false, armored: false, flying: false, boss: true },
        immunities: [],
        children: [{ id: 'ravager', count: 2 }],
        // Mining-fatigue aura: towers within 130px fire 15% slower while it is in
        // range (multiplies their attack speed by 0.85 -- Tower.stunnedUntil path).
        special: 'aura_fatigue', specialParams: { radius: 130, attackSpeedMul: 0.85 },
        deathSfx: 'mob_death_boss',
    },
    warden: {
        id: 'warden', name: 'Warden', hp: 2800, speed: 60, radius: 30, bounty: 250,
        tier: 10,
        // camo + armored, and immune to ALL statuses (freeze/stun/slow/burn/etc).
        // The status immunity is enforced in sim/statuses.js keyed on this mob;
        // immunities[] stays empty because it lists DAMAGE types, not statuses.
        flags: { camo: true, armored: true, flying: false, boss: true },
        immunities: [],
        children: [{ id: 'wither_skeleton', count: 6 }],
        special: null, specialParams: {},
        deathSfx: 'mob_death_boss',
    },
    wither: {
        id: 'wither', name: 'Wither', hp: 5000, speed: 22, radius: 40, bounty: 400,
        tier: 10,
        flags: { camo: false, armored: false, flying: false, boss: true },
        immunities: [],
        children: [{ id: 'ravager', count: 4 }],
        // Summons 2 wither skeletons every 8s while alive.
        special: 'spawn_wither_skeleton', specialParams: { spawn: 'wither_skeleton', count: 2, interval: 8 },
        deathSfx: 'mob_death_boss',
    },
    ender_dragon: {
        id: 'ender_dragon', name: 'Ender Dragon', hp: 22000, speed: 30, radius: 55, bounty: 1500,
        tier: 10,
        flags: { camo: false, armored: false, flying: false, boss: true },
        immunities: [],
        children: [{ id: 'warden', count: 2 }, { id: 'enderman', count: 8 }],
        // Enrage phases: x1.4 speed below 66% hp, x1.8 below 33% hp, with a roar
        // fx on each threshold crossing.
        special: 'dragon_phases',
        specialParams: {
            phases: [
                { below: 0.66, speedMul: 1.4 },
                { below: 0.33, speedMul: 1.8 },
            ],
            roar: true,
        },
        deathSfx: 'mob_death_boss',
    },
};

/**
 * Ordered mob id list -- MUST match CONTRACTS Appendix B order exactly (29 ids).
 * Codex and any ordered UI iterate this, not Object.keys(MOBS).
 * @type {string[]}
 */
export const MOB_IDS = [
    'silverfish', 'zombie', 'baby_zombie', 'husk', 'zombie_villager',
    'skeleton', 'stray', 'spider', 'cave_spider', 'creeper',
    'slime_big', 'slime_med', 'slime_small', 'magma_cube_big', 'magma_cube_small',
    'phantom', 'blaze', 'vex', 'witch', 'enderman',
    'pillager', 'vindicator', 'evoker', 'wither_skeleton', 'ravager',
    'elder_guardian', 'warden', 'wither', 'ender_dragon',
];
