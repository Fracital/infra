// Savanna Ridge -- intermediate, savanna biome. A dusty acacia ridge the trail
// climbs in three switchback traverses, descending east to west and back as it
// works down the slope. Dry grass2 with scuffed dirt patches and greener
// hollows; acacia stands and boulders cluster in the flat shelves between the
// switchback legs, which is exactly where the build room is -- generous but
// framed, so you commit a line of towers to each traverse.

export default {
    id: 'savanna_ridge',
    name: 'Savanna Ridge',
    biome: 'savanna',
    difficulty: 'intermediate',
    desc: 'Three switchback traverses climb a dusty acacia ridge. Cover each leg.',
    paths: [
        {
            waypoints: [
                [-30, 95], [160, 115], [400, 145], [640, 160], [860, 150],
                [1020, 135], [1120, 205], [1090, 300], [860, 335], [600, 355],
                [360, 350], [190, 330], [115, 395], [150, 485], [390, 515],
                [650, 525], [900, 515], [1080, 505], [1180, 555], [1310, 595],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'grass2',
            ',': 'dirt',
            ':': 'grass',
        },
        rows: [
            '....:::::.,,.............:::::.:',
            '...::::::,,,,...........::::::::',
            '....::::.,,,,,,,,,........::::..',
            '.........,,,,,,,,.........:.::..',
            '............,,,,,,..............',
            '.......,,,,,,,,,,,..............',
            '........,,,,...,................',
            '.:::::..,,,.....................',
            '.::::::.:::::.......,,..........',
            '.:::::::::::,,....,,,,,,........',
            '..::::::::::,,,....,,,,.......::',
            '..:,,,::,,,,,,,....,,,,......:::',
            '...,,,,,,,,,,,,............,,:::',
            '.,,.:::::,,,,.............,,,,,.',
            ',,,,:::::,.,.,.............,,,..',
            ',,,,,::::........,.........,.,..',
            ',,,,,,:.:......,,,,,,...........',
            ',,,,,,........,,,,,,,,..........',
        ],
    },
    water: false,
    blockers: [],
    decorations: [
        // Top-left shoulder above the entry sweep.
        { type: 'acacia_tree', x: 90, y: 40, seed: 11 },
        { type: 'boulder', x: 205, y: 48, seed: 12 },
        { type: 'dead_bush', x: 300, y: 55, seed: 13 },
        // Upper shelf between traverse 1 and traverse 2 -- the widest build band.
        { type: 'acacia_tree', x: 300, y: 245, seed: 21 },
        { type: 'acacia_tree', x: 395, y: 255, seed: 22 },
        { type: 'acacia_tree', x: 480, y: 235, seed: 23 },
        { type: 'dead_bush', x: 345, y: 272, seed: 24 },
        { type: 'boulder', x: 575, y: 250, seed: 25 },
        { type: 'acacia_tree', x: 660, y: 248, seed: 26 },
        { type: 'flower_patch', x: 745, y: 258, seed: 27 },
        { type: 'acacia_tree', x: 855, y: 240, seed: 28 },
        { type: 'dead_bush', x: 925, y: 255, seed: 29 },
        // Middle shelf between traverse 2 and traverse 3.
        { type: 'acacia_tree', x: 305, y: 432, seed: 31 },
        { type: 'acacia_tree', x: 430, y: 438, seed: 32 },
        { type: 'boulder', x: 560, y: 440, seed: 33 },
        { type: 'dead_bush', x: 630, y: 452, seed: 34 },
        { type: 'acacia_tree', x: 705, y: 435, seed: 35 },
        { type: 'hay_bale', x: 860, y: 440, seed: 36 },
        { type: 'acacia_tree', x: 960, y: 432, seed: 37 },
        // Lower-left hollow, tucked below the last traverse.
        { type: 'acacia_tree', x: 155, y: 600, seed: 41 },
        { type: 'acacia_tree', x: 255, y: 650, seed: 42 },
        { type: 'boulder', x: 120, y: 688, seed: 43 },
        { type: 'flower_patch', x: 350, y: 632, seed: 44 },
        { type: 'dead_bush', x: 445, y: 660, seed: 45 },
        { type: 'acacia_tree', x: 560, y: 660, seed: 46 },
        { type: 'acacia_tree', x: 710, y: 648, seed: 47 },
        { type: 'boulder', x: 640, y: 690, seed: 48 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
