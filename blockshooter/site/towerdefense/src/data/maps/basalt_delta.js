// Basalt Delta -- EXPERT, basalt biome, feature 'portals'. Grey basalt flats
// veined with netherrack and split by glowing lava, embers raining in the
// ambient. TWO nether portals let mobs skip whole detours: the track dives into
// a U-shaped basalt gorge, and a portal at the gorge mouth spits the mob out the
// far side, bypassing ~340px of path. It happens twice. You get one clean window
// to hit them before each portal -- or watch a third of the lane vanish.
//
// Design (verified with tools/validate_map.js + scratchpad geometry):
//  - Single path, polyline len ~3014px; after both skips effective travel is
//    ~2325px (skipA 336px, skipB 353px) -- a real gimmick, not a map-eater.
//  - Portal math is distance-along-the-polyline: fromDist/toDist are arc lengths
//    computed from the waypoints; x1,y1/x2,y2 are the exact on-path vanish/appear
//    points so the teleport streak lands true. The nether_portal DECORATIONS sit
//    ~44px off the lane (validator forbids decor within 30px of the path) at all
//    four portal mouths.
//  - Basalt columns (blocking boulders/stalagmites + a few blocker discs) and
//    lava fields keep build ground scarce.

export default {
    id: 'basalt_delta',
    name: 'Basalt Delta',
    biome: 'basalt',
    difficulty: 'expert',
    desc: 'Twin nether portals swallow the lane and spit mobs out past your guns. Cover the gorge mouths -- fast.',
    paths: [
        {
            waypoints: [
                [-30, 140], [80, 150], [190, 140], [290, 165], [380, 150], [408, 235],
                [470, 285], [548, 262], [566, 178], [655, 180], [745, 205], [830, 180],
                [860, 268], [928, 318], [1008, 296], [1028, 206], [1085, 300], [1120, 410],
                [1088, 522], [1005, 592], [890, 616], [775, 592], [705, 505], [742, 410],
                [840, 372], [948, 392], [1030, 460], [1078, 565], [1130, 660], [1235, 692],
                [1310, 652],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'basalt',
            ',': 'netherrack',
            'm': 'magma',
            'L': 'lava',
        },
        rows: [
            '.....,,,..................LLLL..',
            '............,,,...........LLLL..',
            '...mm...............,,,,........',
            '..................,,,,..........',
            '.....................,,,........',
            ',,,.............................',
            ',,,..mm.........................',
            '....,,,.........................',
            '...LLLLLL.....,,,...............',
            '...LLLLLL.......................',
            '...LLLLLL.mmm...................',
            '...,,,,LL.......................',
            '...LLLLLL.mmm...................',
            '........,,,,....................',
            'LLLLLLL.........................',
            'LLLLLLL.........................',
            'LLLLLLL...,,,,..................',
            'LLLLLLL............mmm..........',
        ],
    },
    water: false,
    blockers: [
        { x: 140, y: 260, r: 30 },
        { x: 220, y: 300, r: 28 },
        { x: 1220, y: 420, r: 30 },
        { x: 560, y: 580, r: 28 },
        { x: 940, y: 660, r: 30 },
        { x: 300, y: 460, r: 26 },
    ],
    decorations: [
        // Portal frames at the four gorge mouths (off-lane per the 30px rule).
        { type: 'nether_portal', x: 424, y: 150, seed: 81 },
        { type: 'nether_portal', x: 580, y: 140, seed: 82 },
        { type: 'nether_portal', x: 874, y: 180, seed: 83 },
        { type: 'nether_portal', x: 984, y: 206, seed: 84 },
        // Basalt columns along the top ridge.
        { type: 'boulder', x: 460, y: 60, seed: 11 },
        { type: 'stalagmite', x: 620, y: 60, seed: 12 },
        { type: 'boulder', x: 780, y: 100, seed: 13 },
        // West basalt stand over the lava lake.
        { type: 'stalagmite', x: 140, y: 260, seed: 21 },
        { type: 'boulder', x: 220, y: 300, seed: 22 },
        { type: 'stalagmite', x: 100, y: 380, seed: 23 },
        { type: 'boulder', x: 300, y: 460, seed: 24 },
        { type: 'stalagmite', x: 220, y: 540, seed: 25 },
        { type: 'glowstone_cluster', x: 140, y: 460, seed: 26 },
        // Central columns between the gorges.
        { type: 'boulder', x: 500, y: 420, seed: 31 },
        { type: 'stalagmite', x: 580, y: 340, seed: 32 },
        { type: 'lantern', x: 340, y: 300, seed: 33 },
        { type: 'torch', x: 260, y: 380, seed: 34 },
        // East ridge columns.
        { type: 'stalagmite', x: 1180, y: 340, seed: 41 },
        { type: 'boulder', x: 1220, y: 420, seed: 42 },
        { type: 'stalagmite', x: 1260, y: 300, seed: 43 },
        // Southern delta.
        { type: 'boulder', x: 660, y: 620, seed: 51 },
        { type: 'stalagmite', x: 560, y: 580, seed: 52 },
        { type: 'glowstone_cluster', x: 460, y: 620, seed: 53 },
        { type: 'boulder', x: 940, y: 660, seed: 61 },
        { type: 'stalagmite', x: 1020, y: 660, seed: 62 },
        { type: 'lantern', x: 780, y: 660, seed: 63 },
        // Ember-lit island inside the lower loop.
        { type: 'glowstone_cluster', x: 900, y: 460, seed: 71 },
        { type: 'torch', x: 820, y: 500, seed: 72 },
    ],
    feature: 'portals',
    portals: [
        { pathIndex: 0, fromDist: 415, toDist: 752, x1: 380, y1: 150, x2: 566, y2: 178 },
        { pathIndex: 0, fromDist: 1023, toDist: 1375, x1: 830, y1: 180, x2: 1028, y2: 206 },
    ],
    speedZones: [],
    music: 'nether',
};
