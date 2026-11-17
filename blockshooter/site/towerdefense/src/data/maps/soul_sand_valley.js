// Soul Sand Valley -- EXPERT, soul_sand biome. A cold blue-lit ossuary basin:
// the path threads a winding descent across soul sand and soul soil, wading past
// four lava seeps, while ancient bone piles (boulders), fossil ribs (ruined
// arches) and stalagmite spines litter the flats. Souls drift in the biome
// ambient. The whole valley is soul sand, so nearly the entire track sits inside
// a 0.85x slow field -- mobs crawl, but there is little room to build for it.
//
// Design (verified with tools/validate_map.js + scratchpad geometry):
//  - Single path, len ~3100px, waypoints 94-133px apart for smooth switchbacks.
//  - speedZones: 10 non-overlapping 0.85x soul-drag circles (r118, centers >236px
//    apart in world space) blanket ~76% of the track. They must NOT overlap:
//    mobs multiply every zone they touch, so overlap would compound to 0.72x.
//  - Lava seeps sit only on path-free cells (a center lake, a right pool, a top
//    seep and a bottom-left corner); lava tiles are mask-blocked, adding scarcity.
//  - Bone-like decor clusters off the path; blocking boulders keep builds sparse.

export default {
    id: 'soul_sand_valley',
    name: 'Soul Sand Valley',
    biome: 'soul_sand',
    difficulty: 'expert',
    desc: 'A mournful basin of soul sand drags everything to a crawl -- if you can find the ground to hold it.',
    paths: [
        {
            waypoints: [
                [-30, 130], [80, 150], [180, 130], [280, 170], [360, 250], [370, 350],
                [300, 420], [200, 460], [140, 540], [190, 620], [320, 650], [450, 620],
                [540, 540], [560, 440], [520, 350], [560, 260], [680, 220], [800, 250],
                [880, 330], [900, 440], [860, 540], [900, 630], [1020, 660], [1140, 620],
                [1200, 520], [1210, 410], [1180, 300], [1220, 200], [1310, 160],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'soul_sand',
            ',': 'soul_soil',
            'b': 'basalt',
            'L': 'lava',
        },
        rows: [
            '......,,....LLL...,,,.....bbb...',
            '...,,.......LLL.........,,bbb...',
            '.........bb.............,,bbb...',
            '...............,,,..............',
            '...............,,,..............',
            '...,,,..................,,,.....',
            'bbb.....................,,,.....',
            'bbb.,,,.........................',
            '..........,,...........LLLL.....',
            '..........,,...LLLL....LLLL.....',
            '..........,,...LLLL....LLLL.....',
            '..........,,...LLLL...,,,.......',
            '..........,,...LLLL.............',
            '...............,,,,.....bbb.....',
            '...............,,,,.............',
            '................................',
            'LL............,,,...............',
            'LL........,,,...................',
        ],
    },
    water: false,
    blockers: [
        { x: 1040, y: 560, r: 34 },
        { x: 700, y: 640, r: 30 },
        { x: 440, y: 400, r: 28 },
    ],
    decorations: [
        // Top-left bone field above the entry sweep.
        { type: 'boulder', x: 220, y: 60, seed: 11 },
        { type: 'boulder', x: 300, y: 60, seed: 12 },
        { type: 'stalagmite', x: 380, y: 60, seed: 13 },
        { type: 'ruined_arch', x: 260, y: 100, seed: 14 },
        { type: 'dead_bush', x: 340, y: 140, seed: 15 },
        { type: 'boulder', x: 460, y: 140, seed: 16 },
        // Top-right ossuary.
        { type: 'boulder', x: 940, y: 60, seed: 21 },
        { type: 'stalagmite', x: 1020, y: 60, seed: 22 },
        { type: 'dead_bush', x: 1100, y: 100, seed: 23 },
        { type: 'boulder', x: 1180, y: 60, seed: 24 },
        { type: 'ruined_arch', x: 1220, y: 140, seed: 25 },
        // Bone piles guarding the enclosed central build pocket.
        { type: 'boulder', x: 420, y: 380, seed: 31 },
        { type: 'stalagmite', x: 460, y: 420, seed: 32 },
        // Ribcage cluster over the central lava lake shoulder.
        { type: 'boulder', x: 660, y: 300, seed: 41 },
        { type: 'ruined_arch', x: 700, y: 340, seed: 42 },
        { type: 'stalagmite', x: 620, y: 340, seed: 43 },
        { type: 'glowstone_cluster', x: 740, y: 300, seed: 44 },
        // Right shelf, lit by fossil-glow.
        { type: 'boulder', x: 1020, y: 460, seed: 51 },
        { type: 'stalagmite', x: 980, y: 540, seed: 52 },
        { type: 'torch', x: 1060, y: 500, seed: 53 },
        { type: 'lantern', x: 1100, y: 460, seed: 54 },
        // Bottom-center graveyard.
        { type: 'boulder', x: 660, y: 660, seed: 61 },
        { type: 'ruined_arch', x: 740, y: 620, seed: 62 },
        { type: 'dead_bush', x: 580, y: 580, seed: 63 },
        { type: 'stalagmite', x: 700, y: 660, seed: 64 },
        { type: 'torch', x: 620, y: 620, seed: 65 },
        // Bottom-left corner by the lava seep.
        { type: 'dead_bush', x: 60, y: 620, seed: 71 },
        { type: 'boulder', x: 100, y: 660, seed: 72 },
    ],
    feature: null,
    portals: [],
    speedZones: [
        { x: 88, y: 148, r: 118, mult: 0.85 },
        { x: 328, y: 218, r: 118, mult: 0.85 },
        { x: 220, y: 452, r: 118, mult: 0.85 },
        { x: 389, y: 634, r: 118, mult: 0.85 },
        { x: 557, y: 455, r: 118, mult: 0.85 },
        { x: 672, y: 223, r: 118, mult: 0.85 },
        { x: 884, y: 354, r: 118, mult: 0.85 },
        { x: 890, y: 608, r: 118, mult: 0.85 },
        { x: 1136, y: 621, r: 118, mult: 0.85 },
        { x: 1200, y: 372, r: 118, mult: 0.85 },
    ],
    music: 'nether',
};
