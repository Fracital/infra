// Sunflower Flats -- beginner, plains biome. A dry sunflower prairie the road
// rakes across in three long horizontal passes joined by two hairpin bends, a
// wide open-field zigzag. No water; the whole map is buildable terrace so the
// only real decisions are which sunflower bands to plant on.
//
// Layout invariants (verified via tools/validate_map.js + local checks):
//  - Single path, ~3550px. Enters left at y~145, sweeps right, hairpins down at
//    the east edge (x~1120), sweeps back left, hairpins down at the west edge
//    (x~115), sweeps right again and exits the east edge at x=1320,y=632.
//  - Two clear sunflower bands live between the passes (y~215..330 and y~445..535)
//    plus a farmstead on the top verge and scattered rows top and bottom.
//  - grass2 is blotched through the grass; a couple of trodden dirt scrapes mark
//    where herds have crossed. No water tiles (water: false).

export default {
    id: 'sunflower_flats',
    name: 'Sunflower Flats',
    biome: 'plains',
    difficulty: 'beginner',
    desc: 'A sun-baked prairie of nodding sunflowers, crossed by one long lazy zigzag.',
    paths: [
        {
            waypoints: [
                [-40, 145], [90, 146], [220, 150], [350, 153], [480, 152], [610, 152],
                [740, 158], [860, 172], [968, 196], [1055, 240], [1122, 300], [1120, 362],
                [1035, 396], [930, 392], [800, 388], [670, 386], [560, 386], [430, 388],
                [300, 404], [196, 424], [126, 482], [130, 548], [224, 584], [360, 588],
                [500, 590], [640, 590], [788, 586], [928, 582], [1060, 588], [1185, 606],
                [1320, 632],
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
            ',,.....,....,.,..,,,......,,....',
            '.,.....,.,..,,,..,,..,.,....,..,',
            '.,,...,,..,,........,,......,..,',
            '.,,,...,.,...,,.,.,.....,..,....',
            ',........,..,,,,,,,,.,....,....,',
            '...,,,.,,.,.,,,,,,,,......,...,,',
            ',...,..,,..,.,,,,,,..,,.........',
            '.....ddd,.....,.,..........,....',
            '..,.ddddd.,,,,,.,....,,.....,...',
            '..,..,dd.,.....,,......ddd,,....',
            '.,,..,,,,,,.,,.,.......dddd,...,',
            ',...,,,.....,,....,,,,.ddd,.,...',
            '.,.,,.......,,,,,,.,.,,.,.,.,...',
            ',..,..,....,,,,,,,,,.......,.,..',
            ',.,.........,,,,,,..,.......,.,.',
            '............,,..,,,.,..,...,..,.',
            '..,,,.........,..,.....,,.,,,.,.',
            ',.....,,.,....,.,.,,.....,.,....',
        ],
    },
    water: false,
    blockers: [],
    decorations: [
        // Upper sunflower band, between the first and second passes.
        { type: 'sunflower', x: 120, y: 250, seed: 11 },
        { type: 'sunflower', x: 180, y: 235, seed: 12 },
        { type: 'sunflower', x: 240, y: 265, seed: 13 },
        { type: 'sunflower', x: 300, y: 240, seed: 14 },
        { type: 'sunflower', x: 360, y: 270, seed: 15 },
        { type: 'sunflower', x: 430, y: 248, seed: 16 },
        { type: 'bee_nest', x: 470, y: 300, seed: 17 },
        { type: 'flower_patch', x: 540, y: 270, seed: 18 },
        { type: 'sunflower', x: 610, y: 250, seed: 19 },
        { type: 'sunflower', x: 680, y: 235, seed: 20 },
        { type: 'sunflower', x: 748, y: 268, seed: 21 },
        { type: 'beehive_decor', x: 820, y: 290, seed: 22 },
        { type: 'sunflower', x: 890, y: 255, seed: 23 },
        // Lower sunflower band, between the second and third passes.
        { type: 'hay_bale', x: 260, y: 500, seed: 31 },
        { type: 'hay_bale', x: 322, y: 505, seed: 32 },
        { type: 'sunflower', x: 420, y: 485, seed: 33 },
        { type: 'sunflower', x: 486, y: 510, seed: 34 },
        { type: 'sunflower', x: 552, y: 492, seed: 35 },
        { type: 'sunflower', x: 618, y: 510, seed: 36 },
        { type: 'sunflower', x: 684, y: 492, seed: 37 },
        { type: 'beehive_decor', x: 760, y: 505, seed: 38 },
        { type: 'oak_tree', x: 820, y: 500, seed: 39 },
        { type: 'oak_tree', x: 904, y: 475, seed: 40 },
        // Farmstead on the top verge above the first pass.
        { type: 'oak_tree', x: 200, y: 78, seed: 51 },
        { type: 'village_hut', x: 300, y: 92, seed: 52 },
        { type: 'fence', x: 372, y: 104, seed: 53 },
        { type: 'well', x: 440, y: 86, seed: 54 },
        { type: 'flower_patch', x: 96, y: 70, seed: 55 },
        { type: 'oak_tree', x: 44, y: 60, seed: 56 },
        { type: 'oak_tree', x: 1226, y: 120, seed: 57 },
        // Bottom verge below the third pass.
        { type: 'hay_bale', x: 300, y: 682, seed: 61 },
        { type: 'sunflower', x: 520, y: 682, seed: 62 },
        { type: 'oak_tree', x: 900, y: 684, seed: 63 },
        { type: 'flower_patch', x: 1110, y: 690, seed: 64 },
        { type: 'oak_tree', x: 1250, y: 660, seed: 65 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
