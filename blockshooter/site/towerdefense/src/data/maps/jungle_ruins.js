// Jungle Ruins -- intermediate, jungle biome. An overgrown temple swallowed by
// canopy: the mossy-cobble track threads a tight double-S between toppled ruined
// arches and dense jungle trees, so open ground is scarce and every clear pocket
// is contested. Crumbled arches (blockers) wall off the obvious spots, a mossy
// courtyard floor shows through the undergrowth, and a small temple pool in the
// south-east gives water towers a toehold. Leaf ambient drifts down.

export default {
    id: 'jungle_ruins',
    name: 'Jungle Ruins',
    biome: 'jungle',
    difficulty: 'intermediate',
    desc: 'A tight temple track winds past toppled arches. Build room is precious.',
    paths: [
        {
            waypoints: [
                [-30, 250], [120, 240], [250, 200], [340, 130], [430, 110],
                [540, 160], [600, 260], [560, 370], [450, 430], [380, 530],
                [440, 620], [580, 660], [720, 640], [800, 550], [820, 440],
                [900, 370], [1020, 360], [1110, 440], [1140, 560], [1210, 640],
                [1310, 660],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'grass',
            ',': 'moss',
            'c': 'mossy_cobble',
            'w': 'water',
        },
        rows: [
            '....,,,.ccccc...................',
            '..,,,,,,cccc...................c',
            '..,,,,,..ccc..................cc',
            '...,,,,.....,,,,..............cc',
            ',,,..,...cc,,,,,,,,,..........cc',
            ',,,..,,,cccc,,,,,,,.............',
            ',,,.,,,,,cc,,,,,,,..............',
            '.,...,,,.c.,,,,,,...............',
            '.............,.............,,,,.',
            '..cccc....................,,,,,,',
            '..cccc...............c....,,,,,,',
            '..cwww.............ccccc....,,,.',
            '...www.............cccccwwww,,,,',
            '...ww...............ccc..www....',
            '......................c..wwww...',
            '.....,..........,,,.............',
            '.ccc,,,,,......,,,,,............',
            '.cccc,,,,......,,,,.............',
        ],
    },
    water: true,
    blockers: [
        // Toppled temple stone -- walls off the easy lines, keeps builds tight.
        { x: 500, y: 300, r: 34 },
        { x: 490, y: 560, r: 34 },
        { x: 940, y: 470, r: 34 },
        { x: 1050, y: 220, r: 30 },
        { x: 300, y: 300, r: 40 },
        { x: 650, y: 500, r: 38 },
        { x: 1000, y: 560, r: 40 },
    ],
    decorations: [
        // Toppled arches marking the old temple gates (blocker-backed).
        { type: 'ruined_arch', x: 500, y: 300, seed: 11 },
        { type: 'ruined_arch', x: 490, y: 560, seed: 12 },
        { type: 'ruined_arch', x: 940, y: 470, seed: 13 },
        { type: 'ruined_arch', x: 1050, y: 220, seed: 14 },
        { type: 'chest', x: 522, y: 332, seed: 15 },
        // West canopy wall.
        { type: 'jungle_tree', x: 80, y: 150, seed: 21 },
        { type: 'jungle_tree', x: 150, y: 90, seed: 22 },
        { type: 'jungle_tree', x: 200, y: 140, seed: 23 },
        { type: 'jungle_tree', x: 120, y: 320, seed: 24 },
        { type: 'jungle_tree', x: 90, y: 445, seed: 25 },
        { type: 'jungle_tree', x: 185, y: 470, seed: 26 },
        { type: 'bamboo', x: 250, y: 440, seed: 27 },
        // North ridge over the first hump.
        { type: 'jungle_tree', x: 300, y: 62, seed: 31 },
        { type: 'jungle_tree', x: 420, y: 48, seed: 32 },
        { type: 'jungle_tree', x: 545, y: 72, seed: 33 },
        { type: 'jungle_tree', x: 645, y: 120, seed: 34 },
        { type: 'sweet_berry', x: 630, y: 175, seed: 35 },
        { type: 'jungle_tree', x: 705, y: 225, seed: 36 },
        // North-east canopy.
        { type: 'jungle_tree', x: 760, y: 82, seed: 41 },
        { type: 'jungle_tree', x: 885, y: 92, seed: 42 },
        { type: 'jungle_tree', x: 1000, y: 122, seed: 43 },
        { type: 'jungle_tree', x: 1185, y: 140, seed: 44 },
        { type: 'jungle_tree', x: 1210, y: 300, seed: 45 },
        { type: 'azalea', x: 350, y: 302, seed: 46 },
        // South-east temple court + pool.
        { type: 'jungle_tree', x: 955, y: 468, seed: 51 },
        { type: 'jungle_tree', x: 1010, y: 512, seed: 52 },
        { type: 'bamboo', x: 700, y: 500, seed: 53 },
        { type: 'sweet_berry', x: 980, y: 640, seed: 54 },
        { type: 'azalea', x: 1150, y: 662, seed: 55 },
        { type: 'jungle_tree', x: 1250, y: 470, seed: 56 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
