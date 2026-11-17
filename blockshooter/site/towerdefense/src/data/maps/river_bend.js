// River Bend -- beginner, river biome. A wide, deep river snakes down the centre
// of the map with a gentle bend, sand banks rimming every edge. The trail hugs
// the west bank, fords the river once at a shallow gravel crossing, then works
// the east bank to the exit. Water sits close to the path on both banks, so a
// Guardian has plenty of surface to work with. Lily pads float on the slack water.
export default {
    id: 'river_bend',
    name: 'River Bend',
    biome: 'river',
    difficulty: 'beginner',
    desc: 'A broad river snakes down the map -- build on either bank, or in the water.',
    paths: [
        {
            waypoints: [
                [-30, 240], [100, 270], [170, 360], [140, 470], [210, 580], [350, 620],
                [470, 580], [500, 470], [470, 380], [560, 340], [690, 360], [820, 360],
                [900, 430], [1010, 470], [1090, 380], [1140, 270], [1240, 240], [1310, 290],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'grass',
            ',': 'clay',
            's': 'sand',
            'w': 'water',
            'W': 'water_deep',
        },
        rows: [
            '.......,,.,sswwWWWwws.,...,.....',
            '......,.,,sswwWWWwwss,,.........',
            '.......,,sswwWWWwwss,.,...,.....',
            ',.......,swwWWWwwss,,.,.........',
            '........,swwWWwwss,,,,..........',
            ',......,,swwWWwwss,,.,,.........',
            '.......,,swwWWWwwss,,,,,,.......',
            '..,....,,sswwWWWwwsss,,,,,......',
            '......,,,,ssswwWWWwwsss,,,......',
            '.......,,,.,ssswwWWWwwss,,.,,...',
            '........,.,,,,sswwWWWwws,.......',
            '..........,,,,sswwWWWwws,,......',
            '.......,,.,.,sswwWWWwwss,,......',
            '.,........,,sswwWWWwwss,,,......',
            '..........,,swwWWWwwss,,,,...,..',
            '..........,.swwWWWwwss,,,.......',
            '..,.,..,..,,sswwWWWwws,,....,...',
            '.......,..,,,swwWWWwws,,........',
        ],
    },
    water: true,
    blockers: [],
    decorations: [
        // West-bank oak stand and boulders.
        { type: 'oak_tree', x: 255, y: 431, seed: 10 },
        { type: 'flower_patch', x: 330, y: 475, seed: 11 },
        { type: 'oak_tree', x: 275, y: 388, seed: 12 },
        { type: 'flower_patch', x: 352, y: 444, seed: 13 },
        { type: 'oak_tree', x: 276, y: 443, seed: 14 },
        { type: 'boulder', x: 293, y: 387, seed: 15 },
        // East-bank grove.
        { type: 'oak_tree', x: 1109, y: 578, seed: 16 },
        { type: 'oak_tree', x: 1062, y: 620, seed: 17 },
        { type: 'oak_tree', x: 1057, y: 507, seed: 18 },
        { type: 'oak_tree', x: 1050, y: 664, seed: 19 },
        { type: 'bee_nest', x: 1082, y: 538, seed: 20 },
        { type: 'boulder', x: 1157, y: 563, seed: 21 },
        // Bank-edge reeds and flowers.
        { type: 'flower_patch', x: 877, y: 88, seed: 22 },
        { type: 'bamboo', x: 805, y: 93, seed: 23 },
        { type: 'bamboo', x: 791, y: 145, seed: 24 },
        { type: 'oak_tree', x: 697, y: 145, seed: 25 },
        { type: 'oak_tree', x: 705, y: 209, seed: 26 },
        // Lily pads on the slack water.
        { type: 'lily_pad', x: 709, y: 542, seed: 27 },
        { type: 'lily_pad', x: 684, y: 646, seed: 28 },
        { type: 'lily_pad', x: 621, y: 583, seed: 29 },
        { type: 'lily_pad', x: 624, y: 512, seed: 30 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
