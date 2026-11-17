// Plains Creek -- the REFERENCE map. Beginner, plains biome. A winding oak-dotted
// meadow split by a shallow creek that the S-curve path fords twice. Every other
// map copies this file's shape: a MapDef (CONTRACTS 5.4) is a set of waypoint
// polylines + an 18x32 terrain char grid (legend -> Textures tile names) +
// decorations placed OFF the path + build-zone flags.
//
// Layout invariants (verified, see docs/CONTRACTS Appendix C):
//  - Single path enters the left edge at x=-30 and exits the right edge at
//    x=1310 (both endpoints offscreen). Length ~2160px, waypoints 60-150px
//    apart for smooth curves.
//  - The creek is a contiguous water band flowing across the map (winding
//    between grid rows 6 and 9). The path passes over water at EXACTLY two
//    fords (~x=410 and ~x=1170) -- carved, they read as intentional crossings.
//  - Sand tiles line both creek banks; a water_deep channel runs down the
//    middle for depth. Grass/grass2 are mixed for a non-flat field.
//  - No decoration sits on the path or on a water tile (trees/well/hut cluster
//    off-path; flowers, a boulder, torches, and fence bits dress the village).

export default {
    id: 'plains_creek',
    name: 'Plains Creek',
    biome: 'plains',
    difficulty: 'beginner',
    desc: 'A lazy creek winds through an oak meadow. Mind the two fords.',
    paths: [
        {
            waypoints: [
                [-30, 240], [70, 260], [150, 210], [250, 235], [330, 195], [380, 235],
                [410, 320], [430, 425], [405, 520], [455, 610], [570, 650], [695, 645],
                [775, 570], [815, 475], [855, 555], [945, 630], [1055, 605], [1120, 510],
                [1150, 430], [1180, 325], [1210, 220], [1265, 210], [1310, 245],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'grass',
            ',': 'grass2',
            's': 'sand',
            'w': 'water',
            'W': 'water_deep',
        },
        rows: [
            '............................,...',
            '........................,.......',
            '....................,........,..',
            '................,........,......',
            '............,........,........,.',
            '........,........,.sssss..,.....',
            'sssssssss....,ssssswwwwwssssssss',
            'wwwwwwwwwssssswwwwwWWWwwwwwwwwww',
            'wwwwwwwwwwwwwwWWWWWssssswwwwwwww',
            'ssssssssswwWWWsssss,....ssssssss',
            '......,..sssss.,................',
            '..,........,....................',
            '.......,........................',
            '...,............................',
            '................................',
            '................................',
            '................................',
            '................................',
        ],
    },
    water: true,
    blockers: [],
    decorations: [
        // Top-left oak stand above the entry sweep.
        { type: 'oak_tree', x: 60, y: 120, seed: 11 },
        { type: 'oak_tree', x: 140, y: 95, seed: 12 },
        { type: 'oak_tree', x: 225, y: 110, seed: 13 },
        { type: 'flower_patch', x: 180, y: 150, seed: 14 },
        // Central oak grove on the meadow above the creek.
        { type: 'oak_tree', x: 455, y: 100, seed: 21 },
        { type: 'oak_tree', x: 525, y: 150, seed: 22 },
        { type: 'oak_tree', x: 610, y: 95, seed: 23 },
        { type: 'oak_tree', x: 500, y: 200, seed: 24 },
        { type: 'sunflower', x: 440, y: 165, seed: 25 },
        { type: 'oak_tree', x: 665, y: 120, seed: 26 },
        // Little creekside homestead: hut, fence, torches, a well.
        { type: 'village_hut', x: 775, y: 150, seed: 31 },
        { type: 'fence', x: 725, y: 180, seed: 32 },
        { type: 'fence', x: 775, y: 195, seed: 33 },
        { type: 'fence', x: 825, y: 180, seed: 34 },
        { type: 'torch', x: 735, y: 120, seed: 35 },
        { type: 'torch', x: 815, y: 120, seed: 36 },
        { type: 'well', x: 875, y: 165, seed: 37 },
        { type: 'flower_patch', x: 700, y: 205, seed: 38 },
        // Bottom-left grove tucked inside the path's belly.
        { type: 'oak_tree', x: 80, y: 560, seed: 41 },
        { type: 'boulder', x: 160, y: 640, seed: 42 },
        { type: 'oak_tree', x: 60, y: 690, seed: 43 },
        { type: 'flower_patch', x: 210, y: 600, seed: 44 },
        // Bottom-right corner past the exit rise.
        { type: 'oak_tree', x: 1210, y: 650, seed: 51 },
        { type: 'boulder', x: 1250, y: 590, seed: 52 },
        { type: 'oak_tree', x: 1150, y: 680, seed: 53 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
