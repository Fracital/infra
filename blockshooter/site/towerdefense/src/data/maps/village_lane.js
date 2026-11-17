// Village Lane -- beginner, village biome. TWO roads enter from the west edge,
// one from the north-west, one from the south-west, and merge at the village
// square before running east together down a shared lane. Waves cycle between the
// two spawns, so both approaches need covering where they braid into one.
//
// Layout invariants (verified via tools/validate_map.js + local checks):
//  - Path 0 enters top-left (x=-40,y=110), Path 1 enters bottom-left (x=-40,y=616);
//    both converge on the square at (620,360) and then share an IDENTICAL trunk
//    east to the exit (x=1320,y=360) so they read as one merged lane. ~1540px and
//    ~1470px -- both inside the multi-path budget.
//  - The square is a cobbled patch (grid cols 13..17, rows 4..7). Huts, a bell,
//    hay bales, wells and lanterns ring the merge and the shared trunk, all clear
//    of both roads. Farmland plots (crop fields) sit in each corner.
//  - A rimmed pond (grid cols ~23..27, rows 10..11) lies just south of the trunk
//    for water towers; lily pads float on it, nothing blocking sits on the water.

export default {
    id: 'village_lane',
    name: 'Village Lane',
    biome: 'village',
    difficulty: 'beginner',
    desc: 'Two cart roads meet at the village square and share one lane out the east gate.',
    paths: [
        {
            waypoints: [
                [-40, 110], [110, 122], [214, 176], [270, 262], [258, 356], [316, 322],
                [420, 322], [520, 350], [620, 360], [730, 352], [864, 356], [1010, 360],
                [1160, 360], [1320, 360],
            ],
        },
        {
            waypoints: [
                [-40, 616], [116, 606], [232, 556], [318, 470], [356, 386], [430, 408],
                [524, 380], [620, 360], [730, 352], [864, 356], [1010, 360], [1160, 360],
                [1320, 360],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'grass',
            ',': 'grass2',
            'f': 'farmland',
            'c': 'cobble',
            's': 'sand',
            'w': 'water',
        },
        rows: [
            ',..,....,........,..............',
            '......,,............,...........',
            '..fffff.,..,.......,.ffffff,....',
            '..fffff...........,..ffffff,.,..',
            ',.fffff.,..,,.cc.c...ffffff..,..',
            '.......,,.....ccccc...,....,....',
            '......,.......ccccc..,.,..,....,',
            '...........,.,ccc....,.....,...,',
            '..,....,....,.......,,....,....,',
            '.,.,......,......,.,...sssss...,',
            '.,,.....,........,....swwwwss,,.',
            ',.,....,...,..,.......ssswwws..,',
            '........................sss....,',
            '..,..,.,...,.,.....,.....fffff..',
            ',,fffff.,.........,...,..fffff.,',
            '..fffff,..,,,....,.,.....fffff..',
            '..fffff.....,.........,.,,.,....',
            '....,...,..,.......,...,..,.....',
        ],
    },
    water: true,
    blockers: [],
    decorations: [
        // Village square, north side of the merge and shared trunk.
        { type: 'village_hut', x: 700, y: 300, seed: 11 },
        { type: 'bell', x: 782, y: 300, seed: 12 },
        { type: 'hay_bale', x: 850, y: 300, seed: 13 },
        { type: 'lantern', x: 920, y: 290, seed: 14 },
        { type: 'village_hut', x: 980, y: 300, seed: 15 },
        // Village square, south side.
        { type: 'well', x: 700, y: 430, seed: 21 },
        { type: 'hay_bale', x: 780, y: 440, seed: 22 },
        { type: 'fence', x: 850, y: 440, seed: 23 },
        { type: 'anvil_decor', x: 916, y: 440, seed: 24 },
        { type: 'village_hut', x: 660, y: 450, seed: 25 },
        // North-west crop plot by the top road.
        { type: 'hay_bale', x: 140, y: 90, seed: 31 },
        { type: 'sweet_berry', x: 200, y: 120, seed: 32 },
        { type: 'fence', x: 240, y: 90, seed: 33 },
        // South-west crop plot by the bottom road.
        { type: 'hay_bale', x: 160, y: 650, seed: 41 },
        { type: 'sweet_berry', x: 200, y: 650, seed: 42 },
        { type: 'fence', x: 96, y: 560, seed: 43 },
        // North-east crop plot.
        { type: 'hay_bale', x: 900, y: 120, seed: 51 },
        { type: 'fence', x: 980, y: 110, seed: 52 },
        { type: 'sweet_berry', x: 1040, y: 150, seed: 53 },
        { type: 'well', x: 1120, y: 130, seed: 54 },
        // South-east crop plot.
        { type: 'hay_bale', x: 1050, y: 580, seed: 61 },
        { type: 'fence', x: 1120, y: 600, seed: 62 },
        { type: 'oak_tree', x: 1200, y: 560, seed: 63 },
        // The wedge of common between the two western roads.
        { type: 'village_hut', x: 120, y: 380, seed: 71 },
        { type: 'lantern', x: 180, y: 360, seed: 72 },
        { type: 'flower_patch', x: 470, y: 470, seed: 73 },
        // The village pond.
        { type: 'lily_pad', x: 980, y: 440, seed: 81 },
        { type: 'lily_pad', x: 1040, y: 455, seed: 82 },
        { type: 'bamboo', x: 1140, y: 500, seed: 83 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
