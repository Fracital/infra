// Birch Banks -- beginner, birch biome. A U-shaped river cuts down the middle of
// a pale birch wood: two channels running south joined by a bend along the
// bottom. The trail fords the west channel, drops down the dry central spit, then
// fords the east channel and climbs away east. Plenty of water either side of the
// crossings for a Guardian to work.
//
// Layout invariants (verified via tools/validate_map.js + local checks):
//  - Single path, ~1805px. Enters left at y~300, loops up over a rise, fords the
//    WEST channel (~x=500), dips south down the spit to y~450 (staying north of
//    the bottom bend), fords the EAST channel (~x=778), then wanders the east
//    bank and exits the right edge at x=1320,y=326.
//  - River: west channel cols 11..13, east channel cols 18..20, bottom bend rows
//    12..14 -- a clean 'U'. Sand banks rim every water tile; a water_deep vein
//    runs down each channel. Lily pads float on the quiet bottom bend.
//  - Birch stands + bamboo cluster on the outer banks, never on a ford. grass2 and
//    moss dapple the birch-wood floor.

export default {
    id: 'birch_banks',
    name: 'Birch Banks',
    biome: 'birch',
    difficulty: 'beginner',
    desc: 'A birch wood split by a horseshoe river -- ford the west channel, then the east.',
    paths: [
        {
            waypoints: [
                [-40, 300], [100, 296], [186, 244], [250, 172], [318, 150], [374, 208],
                [402, 292], [442, 320], [500, 330], [556, 378], [598, 428], [642, 450],
                [690, 424], [732, 374], [778, 326], [820, 302], [878, 248], [956, 206],
                [1024, 232], [1078, 300], [1116, 372], [1150, 300], [1214, 346], [1268, 300],
                [1320, 326],
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
            'W': 'water_deep',
        },
        rows: [
            ',,m.....,.....,...,m.,,,.m..,...',
            'm.,m..m...........,..,,m........',
            '..m.m...,...,..........,,....m..',
            '...,......sssss..sssssm...,.,...',
            '..,.,m..,.swwws.mswwws.......m..',
            '.....,...mswWws..swWws..,,.,....',
            ',,.m......swWws.,swWws..,.....m.',
            '..,,.,.,..swWws.,swWws..,.......',
            ',,......,.swWwsm,swWws..,...,...',
            '.....,....swWws..swWws..,..m....',
            '........m.swWws,mswWws.,.,m..,..',
            '...,..m...swWwsssswWws,.......,,',
            '.......,,.swWwwwwwwWws,.,,......',
            '..,.m.....swWWWWWWWWws......,m..',
            '..m.,..,,.swwwwwwwwwws,...m,....',
            ',.,..,...,ssssssssssss.,.,..,.,.',
            '....m...,.,..,,..,..,..m...,..,.',
            '.........,....,....,...,....,...',
        ],
    },
    water: true,
    blockers: [],
    decorations: [
        // West bank birch stand.
        { type: 'birch_tree', x: 90, y: 420, seed: 11 },
        { type: 'birch_tree', x: 158, y: 472, seed: 12 },
        { type: 'birch_tree', x: 96, y: 562, seed: 13 },
        { type: 'boulder', x: 250, y: 650, seed: 14 },
        { type: 'birch_tree', x: 300, y: 566, seed: 15 },
        { type: 'flower_patch', x: 150, y: 384, seed: 16 },
        { type: 'birch_tree', x: 210, y: 624, seed: 17 },
        { type: 'mushroom_brown', x: 340, y: 470, seed: 18 },
        { type: 'birch_tree', x: 120, y: 92, seed: 19 },
        { type: 'birch_tree', x: 224, y: 82, seed: 20 },
        { type: 'sweet_berry', x: 336, y: 336, seed: 21 },
        // East bank birch stand.
        { type: 'birch_tree', x: 900, y: 470, seed: 31 },
        { type: 'birch_tree', x: 984, y: 520, seed: 32 },
        { type: 'birch_tree', x: 1082, y: 466, seed: 33 },
        { type: 'bee_nest', x: 940, y: 436, seed: 34 },
        { type: 'birch_tree', x: 1180, y: 540, seed: 35 },
        { type: 'birch_tree', x: 1052, y: 624, seed: 36 },
        { type: 'birch_tree', x: 1244, y: 648, seed: 37 },
        { type: 'flower_patch', x: 1140, y: 430, seed: 38 },
        { type: 'birch_tree', x: 1004, y: 110, seed: 39 },
        { type: 'birch_tree', x: 1150, y: 88, seed: 40 },
        { type: 'birch_tree', x: 1256, y: 150, seed: 41 },
        // Riverside detail -- bamboo on the top banks, lilies on the still bend.
        { type: 'bamboo', x: 470, y: 150, seed: 51 },
        { type: 'bamboo', x: 806, y: 146, seed: 52 },
        { type: 'azalea', x: 660, y: 176, seed: 53 },
        { type: 'lily_pad', x: 540, y: 560, seed: 54 },
        { type: 'lily_pad', x: 632, y: 576, seed: 55 },
        { type: 'lily_pad', x: 724, y: 556, seed: 56 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
