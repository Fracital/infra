// Cherry Orchard -- beginner, cherry biome. Rows of blossoming cherry trees on
// tilled dirt plots, petals drifting on the breeze. The gravel path traces a
// broad figure-S: down past the west orchard, back across the middle, and up
// through the east rows. Bees, azaleas and lanterns dress the grove edges.
export default {
    id: 'cherry_orchard',
    name: 'Cherry Orchard',
    biome: 'cherry',
    difficulty: 'beginner',
    desc: 'Pink petals drift over a tidy orchard as the path loops a lazy figure-S.',
    paths: [
        {
            waypoints: [
                [-30, 120], [120, 150], [260, 140], [380, 200], [430, 320], [360, 430],
                [240, 500], [230, 600], [340, 660], [500, 660], [620, 590], [650, 470],
                [720, 380], [860, 360], [980, 420], [1030, 540], [1140, 600], [1260, 560],
                [1310, 470],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'grass',
            ',': 'grass2',
            'd': 'dirt',
        },
        rows: [
            '.,.,,,,,,,,,..,,,.......,...,,,,',
            '....,,,..,.,....,...........,,,,',
            '...d,..,.d.....d.....d.....d,,,,',
            ',...,..............,,.......,,,,',
            '..,d,,...d...,.d....,d.,...d,,,.',
            ',,,d,....d.....d....,d.....d....',
            ',,,,,...........................',
            ',,,d,....d.....d.....d..,.,d....',
            ',,,d,....d..,,,d,....d.,,,.d.,..',
            ',,,,,........,,,,,...,..,.......',
            ',..d.....d....,d,,...d.....d....',
            '.,.d.....d.....d,,,..d.,...d....',
            '.......,,.,....,,,,.............',
            '...d...,,d.....d,,,.,d....,d....',
            '...d...,,d.....d,,...d...,.d....',
            '.......,,.......,,......,,,,,,,,',
            '......,,,.......,......,,,,,,,,,',
            '...,...................,,,,,,,,,',
        ],
    },
    water: false,
    blockers: [],
    decorations: [
        // West orchard rows inside the upper S-curve.
        { type: 'flower_patch', x: 264, y: 320, seed: 10 },
        { type: 'flower_patch', x: 229, y: 402, seed: 11 },
        { type: 'cherry_tree', x: 160, y: 300, seed: 12 },
        { type: 'flower_patch', x: 111, y: 349, seed: 13 },
        { type: 'flower_patch', x: 236, y: 371, seed: 14 },
        { type: 'cherry_tree', x: 147, y: 421, seed: 15 },
        // Lower-left grove in the belly of the bend.
        { type: 'flower_patch', x: 101, y: 544, seed: 16 },
        { type: 'cherry_tree', x: 83, y: 561, seed: 17 },
        { type: 'cherry_tree', x: 33, y: 628, seed: 18 },
        { type: 'cherry_tree', x: 182, y: 554, seed: 19 },
        { type: 'flower_patch', x: 191, y: 538, seed: 20 },
        // East orchard rows above the exit.
        { type: 'cherry_tree', x: 917, y: 248, seed: 21 },
        { type: 'cherry_tree', x: 826, y: 291, seed: 22 },
        { type: 'flower_patch', x: 941, y: 209, seed: 23 },
        { type: 'cherry_tree', x: 874, y: 309, seed: 24 },
        { type: 'cherry_tree', x: 1004, y: 193, seed: 25 },
        { type: 'cherry_tree', x: 761, y: 190, seed: 26 },
        // Blossom-edge detail: azaleas, bees, lanterns.
        { type: 'azalea', x: 1125, y: 269, seed: 27 },
        { type: 'lantern', x: 1179, y: 237, seed: 28 },
        { type: 'lantern', x: 1100, y: 337, seed: 29 },
        { type: 'azalea', x: 1046, y: 364, seed: 30 },
        { type: 'flower_patch', x: 1053, y: 239, seed: 31 },
        { type: 'bee_nest', x: 1045, y: 338, seed: 32 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
