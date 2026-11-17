// Beach Cove -- beginner, beach biome. A diagonal sandy shoreline with a calm
// blue cove filling the lower-right. The trail enters top-left, drops onto the
// beach and runs just landward of the water (plenty of shore for a Guardian),
// hooks around a driftwood camp, then climbs the eastern dunes to exit right.
// No palms here -- dead bushes, driftwood boulders and a beach camp dress the sand.
export default {
    id: 'beach_cove',
    name: 'Beach Cove',
    biome: 'beach',
    difficulty: 'beginner',
    desc: 'A sun-bleached cove -- the trail runs the shoreline past a quiet blue bay.',
    paths: [
        {
            waypoints: [
                [-40, 120], [110, 150], [250, 120], [360, 170], [420, 270], [400, 380],
                [460, 470], [560, 540], [680, 520], [760, 440], [840, 400], [930, 450],
                [1000, 540], [1110, 530], [1180, 440], [1230, 330], [1295, 270],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'sand',
            ',': 'sandstone',
            'w': 'water',
            'W': 'water_deep',
        },
        rows: [
            ',...,.............,,..........,.',
            '...,,....,......,,............,.',
            '...,,....,.....,,.,.,...,...,...',
            ',.,,,,.......,,,,......,..,.....',
            '..,,,,......,,,,,,.....,.,,...,.',
            '...,,,......,,,.....,...........',
            '...,,,......,........,..........',
            '....,,......,...............,...',
            '....,,......,......,,.....,,,,..',
            '....,,........,.....,.......,...',
            '....,,..............,...........',
            '....,,,.............,.........,.',
            '....,,,.............,,,.........',
            '....,,,,.....................www',
            '....,,,.............wwwwwwwWWWWW',
            '...,,,.........wwwwwwwWWWWWWWWWW',
            '...,,,.....wwwwwwwWWWWWWWWWWWWWW',
            '........wwwwwwwWWWWWWWWWWWWWWWWW',
        ],
    },
    water: true,
    blockers: [],
    decorations: [
        // Top dune line above the entry sweep.
        { type: 'dead_bush', x: 122, y: 64, seed: 10 },
        { type: 'boulder', x: 103, y: 49, seed: 11 },
        { type: 'dead_bush', x: 178, y: 65, seed: 12 },
        { type: 'boulder', x: 209, y: 27, seed: 13 },
        { type: 'dead_bush', x: 147, y: 56, seed: 14 },
        // Driftwood camp in the cove's inner pocket.
        { type: 'campfire_decor', x: 648, y: 296, seed: 15 },
        { type: 'chest', x: 573, y: 273, seed: 16 },
        { type: 'chest', x: 574, y: 248, seed: 17 },
        { type: 'campfire_decor', x: 606, y: 328, seed: 18 },
        { type: 'boulder', x: 615, y: 365, seed: 19 },
        // Dry beach at the lower-left, scattered driftwood.
        { type: 'boulder', x: 193, y: 701, seed: 20 },
        { type: 'dead_bush', x: 206, y: 572, seed: 21 },
        { type: 'dead_bush', x: 215, y: 704, seed: 22 },
        { type: 'dead_bush', x: 159, y: 636, seed: 23 },
        { type: 'boulder', x: 267, y: 574, seed: 24 },
        // Eastern dunes past the exit rise.
        { type: 'dead_bush', x: 1148, y: 183, seed: 25 },
        { type: 'dead_bush', x: 1129, y: 218, seed: 26 },
        { type: 'dead_bush', x: 1100, y: 178, seed: 27 },
        { type: 'dead_bush', x: 1096, y: 107, seed: 28 },
        { type: 'boulder', x: 1062, y: 170, seed: 29 },
        // Sea pickles and coral bits along the wet sand.
        { type: 'sea_pickle', x: 903, y: 627, seed: 30 },
        { type: 'coral_fan', x: 865, y: 638, seed: 31 },
        { type: 'coral_fan', x: 812, y: 682, seed: 32 },
        { type: 'coral_fan', x: 871, y: 688, seed: 33 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
