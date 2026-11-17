// Round design. Headless-safe pure data + pure functions.
//
// ROUNDS[i] is round (i + 1). A round is { groups: RoundGroup[] } where each
// group spawns `count` of `mob`, `spacing` seconds apart, starting `delay`
// seconds after the round begins. `delay` lets one round contain several beats
// (waves within the round). `modifiers` (subset of camo/regrow/fortified) apply
// to every mob in the group; `pathIndex` (omitted here -> null) lets waves.js
// cycle paths on multi-path maps.
//
// Pacing follows CONTRACTS Appendix E:
//   armored intro r15 (husk), camo intro r18 (cave_spider), flying intro r27
//   (phantom), regrow rush r30, fortified modifier r50+, camo+fortified combos
//   r70+. Bosses land EXACTLY: r40 ravager, r60 elder guardian, r80 wither,
//   r90 warden, r100 ender dragon. Rounds 41-99 stay threatening: counts climb
//   and bosses recur (r66 double ravager, r85 elder pair, r95 wither x2, r98
//   warden x3, r99 kitchen sink).
//
// Balancing note: hp does NOT scale until r80 (see hpMultiplier); pre-80 threat
// comes from counts, modifiers, boss bodies and multi-beat timing. From r81 on
// hpMultiplier compounds, so late counts grow only modestly.

/** @typedef {{mob:string,count:number,spacing:number,delay:number,modifiers?:string[],pathIndex?:number}} RoundGroup */

/**
 * Build a spawn group. Keeps the round table terse and readable.
 * @param {string} mob mob id (must exist in MOBS)
 * @param {number} count how many to spawn
 * @param {number} spacing seconds between spawns
 * @param {{delay?:number,modifiers?:string[],pathIndex?:number}} [extra]
 * @returns {RoundGroup}
 */
function g(mob, count, spacing, extra) {
    const grp = { mob, count, spacing, delay: 0 };
    if (extra) {
        if (typeof extra.delay === 'number') grp.delay = extra.delay;
        if (extra.modifiers) grp.modifiers = extra.modifiers;
        if (typeof extra.pathIndex === 'number') grp.pathIndex = extra.pathIndex;
    }
    return grp;
}

/** Assemble a round from its groups. */
function round(...groups) {
    return { groups };
}

// Modifier shorthands (kept as fresh literals per group by g()).
const FORT = ['fortified'];
const REGROW = ['regrow'];
const CAMO = ['camo'];
const CAMO_FORT = ['camo', 'fortified'];

/**
 * The 100 hand-designed campaign rounds.
 * @type {{groups:RoundGroup[]}[]}
 */
export const ROUNDS = [
    // --- r1-10: gentle intro, teach the basics ---
    /* r1  */ round(g('silverfish', 18, 0.9)),
    /* r2  */ round(g('silverfish', 12, 0.8), g('zombie', 6, 0.9, { delay: 2 })),
    /* r3  */ round(g('zombie', 10, 0.7), g('silverfish', 8, 0.5, { delay: 3 })),
    /* r4  */ round(g('zombie', 10, 0.6), g('baby_zombie', 8, 0.35, { delay: 4 })),
    /* r5  */ round(g('spider', 5, 0.9), g('zombie', 10, 0.5, { delay: 1.5 })),
    /* r6  */ round(g('skeleton', 12, 0.55), g('spider', 4, 0.8, { delay: 3 })),
    /* r7  */ round(g('baby_zombie', 24, 0.25), g('zombie', 14, 0.4, { delay: 2 })),
    /* r8  */ round(g('creeper', 6, 1.0), g('spider', 6, 0.6, { delay: 2 })),
    /* r9  */ round(g('stray', 8, 0.6), g('skeleton', 8, 0.5, { delay: 1 }), g('creeper', 4, 0.9, { delay: 4 })),
    /* r10 */ round(g('zombie', 14, 0.4), g('spider', 8, 0.55, { delay: 2 }), g('creeper', 6, 0.8, { delay: 4 }), g('baby_zombie', 16, 0.22, { delay: 6 })),

    // --- r11-20: slimes, first armored (husk), first camo (cave_spider), witch escort ---
    /* r11 */ round(g('slime_med', 10, 0.6), g('skeleton', 10, 0.45, { delay: 1.5 })),
    /* r12 */ round(g('slime_big', 6, 0.9), g('slime_med', 10, 0.5, { delay: 3 })),
    /* r13 */ round(g('magma_cube_big', 7, 0.9), g('spider', 8, 0.55, { delay: 2 })),
    /* r14 */ round(g('spider', 20, 0.35), g('spider', 12, 0.25, { delay: 4 })),
    /* r15 */ round(g('husk', 12, 0.55), g('zombie', 12, 0.4, { delay: 2 })),
    /* r16 */ round(g('husk', 10, 0.55), g('skeleton', 12, 0.4, { delay: 1 }), g('creeper', 6, 0.9, { delay: 4 })),
    /* r17 */ round(g('pillager', 10, 0.6), g('skeleton', 10, 0.45, { delay: 2 })),
    /* r18 */ round(g('cave_spider', 6, 0.9), g('spider', 8, 0.5, { delay: 2 })),
    /* r19 */ round(g('cave_spider', 10, 0.45), g('husk', 10, 0.5, { delay: 2 }), g('baby_zombie', 14, 0.22, { delay: 4 })),
    /* r20 */ round(g('witch', 4, 1.4), g('zombie', 16, 0.35, { delay: 1 }), g('pillager', 8, 0.5, { delay: 5 })),

    // --- r21-30: illagers, magma, first camo modifier, flyers, regrow rush ---
    /* r21 */ round(g('vindicator', 6, 0.8), g('pillager', 10, 0.5, { delay: 2 })),
    /* r22 */ round(g('magma_cube_big', 12, 0.6), g('magma_cube_small', 20, 0.25, { delay: 3 })),
    /* r23 */ round(g('creeper', 12, 0.55), g('husk', 14, 0.45, { delay: 2 })),
    /* r24 */ round(g('cave_spider', 10, 0.55), g('zombie', 16, 0.35, { delay: 3, modifiers: CAMO })),
    /* r25 */ round(g('vindicator', 6, 0.8), g('pillager', 10, 0.5, { delay: 2 }), g('witch', 3, 1.4, { delay: 5 })),
    /* r26 */ round(g('slime_big', 8, 0.7), g('magma_cube_big', 8, 0.7, { delay: 2 }), g('slime_med', 12, 0.35, { delay: 4 })),
    /* r27 */ round(g('phantom', 16, 0.5), g('skeleton', 12, 0.4, { delay: 2 })),
    /* r28 */ round(g('phantom', 14, 0.45), g('vex', 12, 0.45, { delay: 2 }), g('spider', 16, 0.3, { delay: 4 })),
    /* r29 */ round(g('zombie_villager', 14, 0.5), g('husk', 16, 0.4, { delay: 2 })),
    /* r30 */ round(g('zombie_villager', 20, 0.3), g('skeleton', 18, 0.3, { delay: 2, modifiers: REGROW }), g('spider', 10, 0.4, { delay: 5, modifiers: REGROW })),

    // --- r31-40: endermen, blazes, wither skeletons, dense mix -> RAVAGER ---
    /* r31 */ round(g('enderman', 10, 0.8), g('zombie_villager', 16, 0.3, { delay: 2 })),
    /* r32 */ round(g('vindicator', 8, 0.65), g('cave_spider', 12, 0.45, { delay: 2 })),
    /* r33 */ round(g('blaze', 18, 0.5), g('phantom', 14, 0.4, { delay: 2 })),
    /* r34 */ round(g('magma_cube_big', 14, 0.5), g('blaze', 16, 0.4, { delay: 2 }), g('magma_cube_small', 20, 0.2, { delay: 4 })),
    /* r35 */ round(g('evoker', 5, 1.2), g('vindicator', 8, 0.6, { delay: 2 })),
    /* r36 */ round(g('wither_skeleton', 10, 0.7), g('skeleton', 12, 0.4, { delay: 2 })),
    /* r37 */ round(g('enderman', 10, 0.7), g('cave_spider', 12, 0.4, { delay: 2 }), g('vex', 12, 0.4, { delay: 5 })),
    /* r38 */ round(g('husk', 16, 0.35), g('wither_skeleton', 10, 0.5, { delay: 2 }), g('blaze', 12, 0.35, { delay: 4 }), g('baby_zombie', 24, 0.15, { delay: 6 })),
    /* r39 */ round(g('vindicator', 8, 0.6), g('cave_spider', 12, 0.4, { delay: 2 }), g('enderman', 7, 0.8, { delay: 4 })),
    /* r40 */ round(g('ravager', 1, 0), g('vindicator', 8, 0.6, { delay: 3 }), g('wither_skeleton', 8, 0.5, { delay: 6 })),

    // --- r41-50: enderman packs, evokers -> fortified begins ---
    /* r41 */ round(g('wither_skeleton', 20, 0.4), g('pillager', 16, 0.3, { delay: 3 })),
    /* r42 */ round(g('enderman', 20, 0.5), g('vindicator', 16, 0.35, { delay: 3 })),
    /* r43 */ round(g('evoker', 10, 0.9), g('vex', 20, 0.3, { delay: 2 })),
    /* r44 */ round(g('cave_spider', 24, 0.3), g('vex', 18, 0.35, { delay: 2 }), g('zombie', 16, 0.3, { delay: 4, modifiers: CAMO })),
    /* r45 */ round(g('vindicator', 18, 0.35), g('wither_skeleton', 20, 0.3, { delay: 2 }), g('blaze', 12, 0.35, { delay: 4 })),
    /* r46 */ round(g('enderman', 18, 0.45), g('zombie_villager', 18, 0.3, { delay: 3, modifiers: REGROW })),
    /* r47 */ round(g('magma_cube_big', 16, 0.45), g('wither_skeleton', 20, 0.3, { delay: 2 }), g('magma_cube_small', 24, 0.2, { delay: 4 })),
    /* r48 */ round(g('evoker', 14, 0.8), g('vindicator', 18, 0.3, { delay: 2 }), g('enderman', 16, 0.4, { delay: 5 })),
    /* r49 */ round(g('cave_spider', 22, 0.3), g('wither_skeleton', 20, 0.3, { delay: 2 }), g('vex', 18, 0.3, { delay: 4 })),
    /* r50 */ round(g('husk', 20, 0.4, { modifiers: FORT }), g('wither_skeleton', 18, 0.35, { delay: 3, modifiers: FORT }), g('vindicator', 16, 0.3, { delay: 6 })),

    // --- r51-60: fortified mixes, evoker army -> ELDER GUARDIAN ---
    /* r51 */ round(g('vindicator', 18, 0.4, { modifiers: FORT }), g('pillager', 20, 0.3, { delay: 2 })),
    /* r52 */ round(g('enderman', 20, 0.4), g('husk', 18, 0.35, { delay: 3, modifiers: FORT })),
    /* r53 */ round(g('blaze', 24, 0.35), g('magma_cube_big', 16, 0.4, { delay: 2 }), g('magma_cube_small', 28, 0.15, { delay: 4 })),
    /* r54 */ round(g('cave_spider', 22, 0.3), g('zombie_villager', 20, 0.3, { delay: 2, modifiers: REGROW }), g('vex', 18, 0.3, { delay: 4 })),
    /* r55 */ round(g('evoker', 18, 0.7), g('vindicator', 24, 0.3, { delay: 3 }), g('vex', 20, 0.25, { delay: 6 })),
    /* r56 */ round(g('wither_skeleton', 24, 0.3, { modifiers: FORT }), g('husk', 18, 0.3, { delay: 3, modifiers: FORT })),
    /* r57 */ round(g('enderman', 26, 0.35), g('vindicator', 20, 0.3, { delay: 3 })),
    /* r58 */ round(g('phantom', 24, 0.3), g('blaze', 20, 0.3, { delay: 2 }), g('vex', 20, 0.3, { delay: 4 })),
    /* r59 */ round(g('vindicator', 20, 0.3, { modifiers: FORT }), g('cave_spider', 22, 0.25, { delay: 2 }), g('wither_skeleton', 18, 0.3, { delay: 4, modifiers: FORT }), g('evoker', 16, 0.6, { delay: 6 })),
    /* r60 */ round(g('elder_guardian', 1, 0), g('ravager', 2, 3, { delay: 4 }), g('wither_skeleton', 24, 0.25, { delay: 8 })),

    // --- r61-70: double ravager, magma flood -> fortified camo mix ---
    /* r61 */ round(g('ravager', 2, 6), g('vindicator', 24, 0.3, { delay: 2 })),
    /* r62 */ round(g('vindicator', 24, 0.3, { modifiers: FORT }), g('evoker', 16, 0.5, { delay: 3 })),
    /* r63 */ round(g('magma_cube_big', 24, 0.35), g('magma_cube_small', 40, 0.12, { delay: 3 }), g('blaze', 20, 0.3, { delay: 6 })),
    /* r64 */ round(g('cave_spider', 26, 0.25), g('wither_skeleton', 22, 0.3, { delay: 2, modifiers: FORT }), g('vex', 20, 0.3, { delay: 4 })),
    /* r65 */ round(g('enderman', 24, 0.35), g('evoker', 16, 0.5, { delay: 3 }), g('vindicator', 24, 0.25, { delay: 6 })),
    /* r66 */ round(g('ravager', 2, 2), g('wither_skeleton', 20, 0.3, { delay: 3, modifiers: FORT }), g('enderman', 20, 0.3, { delay: 6 })),
    /* r67 */ round(g('zombie_villager', 22, 0.3, { modifiers: REGROW }), g('husk', 22, 0.3, { delay: 2, modifiers: FORT }), g('wither_skeleton', 18, 0.3, { delay: 4, modifiers: FORT })),
    /* r68 */ round(g('phantom', 24, 0.3, { modifiers: FORT }), g('blaze', 22, 0.3, { delay: 2 }), g('vex', 22, 0.3, { delay: 4 })),
    /* r69 */ round(g('vindicator', 24, 0.25, { modifiers: FORT }), g('wither_skeleton', 24, 0.25, { delay: 2 }), g('evoker', 16, 0.5, { delay: 4 }), g('cave_spider', 24, 0.2, { delay: 6 })),
    /* r70 */ round(g('cave_spider', 24, 0.3, { modifiers: FORT }), g('wither_skeleton', 20, 0.3, { delay: 3, modifiers: CAMO_FORT }), g('vindicator', 20, 0.3, { delay: 6, modifiers: FORT })),

    // --- r71-80: camo+fortified nightmares, wither skeleton rush -> WITHER ---
    /* r71 */ round(g('vindicator', 24, 0.3, { modifiers: CAMO_FORT }), g('enderman', 24, 0.3, { delay: 2 })),
    /* r72 */ round(g('ravager', 1, 0), g('evoker', 16, 0.5, { delay: 2 }), g('vex', 24, 0.25, { delay: 4 })),
    /* r73 */ round(g('magma_cube_big', 24, 0.35, { modifiers: FORT }), g('blaze', 24, 0.3, { delay: 2 }), g('magma_cube_small', 40, 0.12, { delay: 4 })),
    /* r74 */ round(g('cave_spider', 28, 0.25, { modifiers: FORT }), g('vex', 24, 0.25, { delay: 2, modifiers: FORT }), g('zombie', 24, 0.25, { delay: 4, modifiers: CAMO_FORT })),
    /* r75 */ round(g('wither_skeleton', 40, 0.2, { modifiers: FORT }), g('husk', 24, 0.25, { delay: 3, modifiers: FORT }), g('ravager', 2, 4, { delay: 6 })),
    /* r76 */ round(g('enderman', 28, 0.3), g('evoker', 18, 0.4, { delay: 2 }), g('vindicator', 24, 0.25, { delay: 4, modifiers: FORT })),
    /* r77 */ round(g('ravager', 3, 3), g('wither_skeleton', 24, 0.25, { delay: 3 })),
    /* r78 */ round(g('phantom', 28, 0.25, { modifiers: FORT }), g('vex', 26, 0.25, { delay: 2, modifiers: FORT }), g('blaze', 24, 0.25, { delay: 4 })),
    /* r79 */ round(g('ravager', 3, 4), g('evoker', 20, 0.4, { delay: 3 }), g('cave_spider', 28, 0.2, { delay: 6, modifiers: FORT })),
    /* r80 */ round(g('wither', 1, 0), g('ravager', 4, 2, { delay: 5 }), g('wither_skeleton', 30, 0.2, { delay: 10, modifiers: FORT })),

    // --- r81-90: hp now scaling; elder pair, ravager flood -> WARDEN ---
    /* r81 */ round(g('ravager', 3, 4), g('vindicator', 28, 0.25, { delay: 2, modifiers: FORT })),
    /* r82 */ round(g('evoker', 24, 0.4), g('enderman', 28, 0.25, { delay: 3 }), g('vex', 24, 0.2, { delay: 6, modifiers: FORT })),
    /* r83 */ round(g('magma_cube_big', 28, 0.3, { modifiers: FORT }), g('blaze', 28, 0.25, { delay: 2, modifiers: FORT }), g('magma_cube_small', 44, 0.1, { delay: 4 })),
    /* r84 */ round(g('cave_spider', 30, 0.2, { modifiers: FORT }), g('wither_skeleton', 28, 0.22, { delay: 2, modifiers: CAMO_FORT }), g('ravager', 3, 4, { delay: 5 })),
    /* r85 */ round(g('elder_guardian', 2, 4), g('wither_skeleton', 30, 0.2, { delay: 5, modifiers: FORT }), g('evoker', 24, 0.35, { delay: 9 })),
    /* r86 */ round(g('ravager', 4, 3), g('vindicator', 30, 0.22, { delay: 3, modifiers: FORT })),
    /* r87 */ round(g('phantom', 32, 0.2, { modifiers: FORT }), g('vex', 30, 0.2, { delay: 2, modifiers: FORT }), g('blaze', 28, 0.2, { delay: 4, modifiers: FORT })),
    /* r88 */ round(g('ravager', 6, 2), g('wither_skeleton', 30, 0.2, { delay: 3, modifiers: FORT }), g('enderman', 28, 0.2, { delay: 6 })),
    /* r89 */ round(g('ravager', 4, 3), g('evoker', 28, 0.35, { delay: 3 }), g('cave_spider', 30, 0.18, { delay: 6, modifiers: FORT })),
    /* r90 */ round(g('warden', 1, 0), g('ravager', 3, 3, { delay: 4 }), g('wither_skeleton', 30, 0.2, { delay: 8, modifiers: CAMO_FORT })),

    // --- r91-100: everything escalates -> ENDER DRAGON finale ---
    /* r91 */ round(g('ravager', 4, 3), g('vindicator', 30, 0.2, { delay: 3, modifiers: CAMO_FORT })),
    /* r92 */ round(g('elder_guardian', 2, 5), g('evoker', 28, 0.3, { delay: 4 }), g('enderman', 30, 0.2, { delay: 8 })),
    /* r93 */ round(g('warden', 1, 0), g('evoker', 30, 0.3, { delay: 3 }), g('vex', 30, 0.18, { delay: 6, modifiers: FORT })),
    /* r94 */ round(g('ravager', 6, 2), g('wither_skeleton', 32, 0.18, { delay: 3, modifiers: CAMO_FORT }), g('blaze', 30, 0.18, { delay: 6, modifiers: FORT })),
    /* r95 */ round(g('wither', 2, 4), g('ravager', 4, 2, { delay: 5 }), g('wither_skeleton', 30, 0.18, { delay: 9, modifiers: FORT })),
    /* r96 */ round(g('elder_guardian', 3, 4), g('enderman', 32, 0.2, { delay: 4 }), g('evoker', 30, 0.28, { delay: 8 })),
    /* r97 */ round(g('ravager', 8, 1.5), g('vindicator', 32, 0.18, { delay: 3, modifiers: CAMO_FORT }), g('vex', 30, 0.16, { delay: 6, modifiers: FORT })),
    /* r98 */ round(g('warden', 3, 4), g('ravager', 6, 2, { delay: 5 }), g('wither_skeleton', 34, 0.16, { delay: 10, modifiers: CAMO_FORT })),
    /* r99 */ round(
        g('wither', 2, 5),
        g('elder_guardian', 2, 5, { delay: 3 }),
        g('ravager', 8, 1.5, { delay: 6 }),
        g('evoker', 30, 0.25, { delay: 9 }),
        g('cave_spider', 34, 0.15, { delay: 12, modifiers: FORT }),
        g('vex', 30, 0.15, { delay: 15, modifiers: FORT }),
    ),
    /* r100 */ round(
        g('ender_dragon', 1, 0),
        g('warden', 2, 4, { delay: 6 }),
        g('ravager', 4, 2, { delay: 12 }),
        g('wither_skeleton', 40, 0.15, { delay: 16, modifiers: CAMO_FORT }),
        g('evoker', 30, 0.25, { delay: 20 }),
    ),
];

// Pool of late-game bodies freeplay draws its fodder from.
const FREEPLAY_FODDER = [
    'wither_skeleton', 'enderman', 'evoker', 'vindicator', 'cave_spider',
    'blaze', 'vex', 'phantom', 'magma_cube_big',
];
// Bosses rotated into freeplay every 5th round.
const FREEPLAY_BOSSES = ['ravager', 'elder_guardian', 'wither', 'warden'];

/**
 * Procedural endless rounds beyond 100. Fully deterministic: every choice is
 * derived from integer arithmetic on the round number (no Math.random -- this
 * module is headless-safe and the sim reproduces rounds from the round index
 * alone). Counts grow with distance past 100; a rotating boss lands every 5th
 * round, and a couple of ravagers keep the off-rounds honest. hpMultiplier()
 * layers additional scaling on top.
 * @param {number} roundNum round index (> 100)
 * @returns {{groups:RoundGroup[]}}
 */
export function freeplay(roundNum) {
    const r = Math.max(101, Math.floor(roundNum));
    const step = r - 100;                 // 1, 2, 3, ...
    // Counts grow with the round but CAP so deep freeplay stays simulable
    // forever -- past the cap, difficulty keeps ramping via hpMultiplier()
    // (the BTD model: eventually the exponential HP curve beats you, the
    // round itself never breaks).
    const base = Math.min(500, 30 + step * 2);
    const camo = (r % 2) === 0;           // alternate camo pressure
    const mods = camo ? CAMO_FORT.slice() : FORT.slice();

    const a = FREEPLAY_FODDER[r % FREEPLAY_FODDER.length];
    const b = FREEPLAY_FODDER[(r * 3 + 1) % FREEPLAY_FODDER.length];
    const c = FREEPLAY_FODDER[(r * 7 + 2) % FREEPLAY_FODDER.length];

    const groups = [
        g(a, base, 0.18, { modifiers: FORT.slice() }),
        g(b, Math.min(600, base + step), 0.16, { delay: 3, modifiers: mods }),
        g(c, Math.min(600, Math.floor(base * 0.8) + step), 0.16, { delay: 6, modifiers: FORT.slice() }),
    ];

    if (r % 5 === 0) {
        const boss = FREEPLAY_BOSSES[Math.floor(r / 5) % FREEPLAY_BOSSES.length];
        const bossCount = Math.min(24, 1 + Math.floor(step / 8));
        groups.push(g(boss, bossCount, 3, { delay: 2, modifiers: FORT.slice() }));
    } else {
        const ravCount = Math.min(40, 1 + Math.floor(step / 6));
        groups.push(g('ravager', ravCount, 3, { delay: 4, modifiers: FORT.slice() }));
    }

    // Trailing escort swarm.
    groups.push(g('wither_skeleton', Math.min(700, base + step * 2), 0.14, {
        delay: 8,
        modifiers: camo ? CAMO_FORT.slice() : FORT.slice(),
    }));

    return { groups };
}

/**
 * Global hp multiplier for a round. Flat 1 through round 80, then compounds at
 * 2.2%/round (r100 ~1.55, r120 ~2.4, r140 ~3.7). Non-decreasing everywhere.
 * @param {number} roundNum
 * @returns {number}
 */
export function hpMultiplier(roundNum) {
    if (roundNum <= 80) return 1;
    // Exponent cap keeps the multiplier finite for ANY round number:
    // 1.022^30000 ~ 3.7e283, safely under float64 max. Without it the pow
    // overflows to Infinity around round ~32,700 -> unkillable mobs.
    return Math.pow(1.022, Math.min(30000, roundNum - 80));
}

/**
 * End-of-round cash bonus (before farm income): 100 + round.
 * @param {number} roundNum
 * @returns {number}
 */
export function roundCash(roundNum) {
    return 100 + roundNum;
}
