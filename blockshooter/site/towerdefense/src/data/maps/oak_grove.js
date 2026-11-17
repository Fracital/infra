// Oak Grove -- beginner, forest biome. A broad oak-ringed clearing where the
// track loops almost the whole way around an oval before slipping back out the
// west edge, leaving a wide-open interior meadow to build in. A small spring-fed
// pond sits just inside the west bend so a Guardian has water to sit in.
//
// Layout invariants (verified via tools/validate_map.js + local checks):
//  - Single path, ~2700px. Enters the left edge at x=-40,y=380, runs clockwise
//    around a big oval (top at y~108, right at x~1066, bottom at y~634) and
//    exits the left edge again lower down at y~502 -- the two western tails leave
//    an obvious notch, reading as a loop rather than a closed ring.
//  - Interior center (x~450..900, y~200..540) is far from the track: the generous
//    beginner build field. Oaks cluster there plus in every corner off the loop.
//  - Pond (grass cols 8..11, rows 9..11) is sand-rimmed water just right of the
//    western bend; lily pads dress it, no blocking decoration sits on it.
//  - moss + grass2 are mixed through the grass for a shaded-forest floor.

export default {
    id: 'oak_grove',
    name: 'Oak Grove',
    biome: 'forest',
    difficulty: 'beginner',
    desc: 'The old road rings a sunlit oak clearing before ducking back into the trees.',
    paths: [
        {
            waypoints: [
                [-40, 380], [70, 366], [160, 322], [225, 232], [320, 168], [440, 128],
                [560, 108], [680, 112], [800, 134], [905, 188], [985, 262], [1045, 350],
                [1066, 432], [1018, 520], [928, 585], [820, 620], [700, 634], [576, 628],
                [456, 600], [352, 548], [272, 470], [232, 392], [214, 468], [176, 500],
                [70, 500], [-40, 502],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'grass',
            ',': 'grass2',
            'm': 'moss',
            's': 'sand',
            'w': 'water',
        },
        rows: [
            ',,..,.m.,,,m....m..m...,..m.....',
            '.m.m,.,.,,,....,...,.,.....m,...',
            ',mmmmmmm..,m..m...,,.,,.,,,...,.',
            '...mmm,.......m.......,.........',
            '....m.,,,,,..,.,.,,.......,...m.',
            'm,,.m..m.,,..m,......m....,,,,,.',
            ',,m.,,...,....,....m,....,.,....',
            '....m....,...,,...,m,....,..,,m,',
            '.m,..m..ssm,...,.,.,,.,....mm.m,',
            '..,....sswwss,...mm.....m.,...,.',
            '.m....,swwwws.,.,...mmm......m..',
            ',m,,,,.sswwss.,....,...,.m,..m..',
            ',,m.,,,,.sss..,,.m.m...,..,...,.',
            '.,m,,..m,..,......,,..,.,.......',
            '....,.m........,mm........,mm,..',
            '...,.....m...m..,......,,mmmmm..',
            '.,,.,..mm..,,...m.,..m....mmmm.,',
            '.,...,m..,.,,,.,..mm....m,,,,.m.',
        ],
    },
    water: true,
    blockers: [],
    decorations: [
        // North-west entry stand.
        { type: 'oak_tree', x: 70, y: 120, seed: 11 },
        { type: 'oak_tree', x: 132, y: 84, seed: 12 },
        { type: 'boulder', x: 44, y: 196, seed: 13 },
        { type: 'flower_patch', x: 150, y: 150, seed: 14 },
        // Treeline across the top, above the oval crown.
        { type: 'oak_tree', x: 402, y: 58, seed: 21 },
        { type: 'oak_tree', x: 520, y: 50, seed: 22 },
        { type: 'dark_oak_tree', x: 900, y: 66, seed: 23 },
        { type: 'oak_tree', x: 1000, y: 52, seed: 24 },
        { type: 'oak_tree', x: 1180, y: 118, seed: 25 },
        { type: 'bee_nest', x: 1116, y: 80, seed: 26 },
        // Central grove on the open meadow inside the loop.
        { type: 'oak_tree', x: 600, y: 300, seed: 31 },
        { type: 'oak_tree', x: 664, y: 268, seed: 32 },
        { type: 'oak_tree', x: 728, y: 300, seed: 33 },
        { type: 'oak_tree', x: 642, y: 362, seed: 34 },
        { type: 'dark_oak_tree', x: 706, y: 414, seed: 35 },
        { type: 'oak_tree', x: 560, y: 410, seed: 36 },
        { type: 'mushroom_red', x: 612, y: 446, seed: 37 },
        { type: 'mushroom_brown', x: 690, y: 456, seed: 38 },
        { type: 'flower_patch', x: 764, y: 362, seed: 39 },
        { type: 'campfire_decor', x: 648, y: 470, seed: 40 },
        { type: 'oak_tree', x: 846, y: 300, seed: 41 },
        { type: 'birch_tree', x: 904, y: 346, seed: 42 },
        { type: 'azalea', x: 862, y: 420, seed: 43 },
        { type: 'sweet_berry', x: 540, y: 300, seed: 44 },
        // The pond, tucked inside the western bend.
        { type: 'lily_pad', x: 432, y: 432, seed: 51 },
        { type: 'lily_pad', x: 384, y: 404, seed: 52 },
        { type: 'azalea', x: 506, y: 470, seed: 53 },
        // Far corners past the exit rise.
        { type: 'oak_tree', x: 1206, y: 562, seed: 61 },
        { type: 'boulder', x: 1244, y: 642, seed: 62 },
        { type: 'oak_tree', x: 70, y: 652, seed: 63 },
        { type: 'mushroom_red', x: 132, y: 600, seed: 64 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
