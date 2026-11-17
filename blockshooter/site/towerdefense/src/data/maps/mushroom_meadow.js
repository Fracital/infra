// Mushroom Meadow -- beginner, mushroom biome. A soft mycelium field dappled
// with grass, drifting spores in the air. The trail wanders in lazy S-bends
// between three stands of towering giant mushrooms; little red and brown caps
// speckle the open ground. Generous building room between the mushroom groves.
export default {
    id: 'mushroom_meadow',
    name: 'Mushroom Meadow',
    biome: 'mushroom',
    difficulty: 'beginner',
    desc: 'A hazy mycelium field where giant mushrooms lean over a winding trail.',
    paths: [
        {
            waypoints: [
                [-30, 360], [90, 340], [180, 260], [240, 180], [340, 150], [440, 200],
                [490, 300], [440, 400], [350, 470], [380, 560], [490, 610], [610, 600],
                [690, 520], [660, 420], [720, 330], [840, 300], [930, 360], [960, 470],
                [1060, 540], [1180, 520], [1250, 430], [1310, 360],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'mycelium',
            ',': 'grass2',
        },
        rows: [
            '.,,,,,.........,,,,,,..,.,......',
            '..,,,,..,.,....,,,,,,,.,...,....',
            '...,,,,,.,.,.,.,,,,,,,,...,.,.,.',
            '...,,,,.......,,,,,,,,,,,.......',
            '..,,,,,.,...,,,,,,,,,,,,,,......',
            '...,,,.....,,,,,,,,,,,,,,,...,..',
            '......,....,,,,,.,,,,,,,,,......',
            ',,........,,,,,.....,,,,,..,....',
            ',,........,,,,........,,,...,..,',
            ',,,.,......,,,.........,,,......',
            ',,..........,..,,..........,....',
            '.,,,,,,,,.,.,,.,,,..............',
            '.,,,,,,,,......,,,.,.,.....,,,..',
            '..,,,,,,,,.....,,,..,......,,,..',
            '...,,,,,,,......,,.....,..,,,,..',
            '....,,,,,,...,..........,,,,,,,,',
            '......,,,,..........,,,,,,,,.,,,',
            '.......,,.......,......,,,,..,,,',
        ],
    },
    water: false,
    blockers: [],
    decorations: [
        // North-west giant mushroom grove.
        { type: 'boulder', x: 182, y: 514, seed: 10 },
        { type: 'giant_mushroom', x: 240, y: 549, seed: 11 },
        { type: 'boulder', x: 58, y: 498, seed: 12 },
        { type: 'giant_mushroom', x: 229, y: 510, seed: 13 },
        { type: 'giant_mushroom', x: 255, y: 510, seed: 14 },
        { type: 'giant_mushroom', x: 158, y: 437, seed: 15 },
        // Central grove tucked in the S-bend belly.
        { type: 'mushroom_red', x: 632, y: 391, seed: 16 },
        { type: 'giant_mushroom', x: 555, y: 427, seed: 17 },
        { type: 'mushroom_red', x: 502, y: 434, seed: 18 },
        { type: 'giant_mushroom', x: 585, y: 447, seed: 19 },
        { type: 'giant_mushroom', x: 560, y: 403, seed: 20 },
        { type: 'giant_mushroom', x: 544, y: 448, seed: 21 },
        // Eastern grove above the exit.
        { type: 'giant_mushroom', x: 1017, y: 217, seed: 22 },
        { type: 'giant_mushroom', x: 1035, y: 263, seed: 23 },
        { type: 'giant_mushroom', x: 1111, y: 299, seed: 24 },
        { type: 'giant_mushroom', x: 1001, y: 229, seed: 25 },
        { type: 'giant_mushroom', x: 1069, y: 204, seed: 26 },
        { type: 'boulder', x: 1015, y: 274, seed: 27 },
        // Little caps and flowers scattered on the mycelium.
        { type: 'mushroom_brown', x: 224, y: 645, seed: 28 },
        { type: 'mushroom_red', x: 268, y: 599, seed: 29 },
        { type: 'mushroom_red', x: 376, y: 694, seed: 30 },
        { type: 'mushroom_red', x: 54, y: 646, seed: 31 },
        { type: 'flower_patch', x: 72, y: 677, seed: 32 },
        { type: 'flower_patch', x: 108, y: 633, seed: 33 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
