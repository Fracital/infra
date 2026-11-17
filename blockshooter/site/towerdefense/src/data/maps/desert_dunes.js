// Desert Dunes -- intermediate, desert biome. A long U-shaped caravan track:
// down the western dunes, along the sun-baked basin, and up the eastern rise to
// the exit. Rolling sandstone and red-sand dunes break up the flats, and dense
// cactus thickets (marked no-build) crowd the inner basin -- picking placements
// here actually costs you something. A ruined arch and a small camp mark the way.
export default {
    id: 'desert_dunes',
    name: 'Desert Dunes',
    biome: 'desert',
    difficulty: 'intermediate',
    desc: 'A long U through rolling dunes -- cactus thickets choke the good ground.',
    paths: [
        {
            waypoints: [
                [-30, 150], [130, 170], [210, 270], [250, 400], [250, 520], [320, 620],
                [460, 670], [640, 675], [820, 660], [950, 610], [1030, 500], [1050, 370],
                [1040, 250], [1080, 150], [1200, 120], [1310, 150],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'sand',
            ',': 'sandstone',
            'r': 'red_sand',
        },
        rows: [
            'rrrrrrrrrr.rrrrr,..........,,,rr',
            'rrrr.,.....rrrrr,...........,.r.',
            'rrr.........rrrr,...............',
            'rr..,,......rrrrr.,.............',
            'r.,,,,,,,....rrrr........r......',
            'r..,,,,,,....rrrr.,.....rrr.....',
            'r...............,.......rrr.....',
            'r..........,...,,,.....rrrr.....',
            'r..............,,,,,,..rrrrr..,,',
            'r...............,,....rrrrrrr,.,',
            'rr............,.......rrrrrrrr.,',
            '.....................,,rrrrrr..,',
            '.....................,,,rrrrr..,',
            '...,...........,.....,,,,rrrr...',
            '....,.........,.....,,,,,rrr....',
            '.,.,,,.,,.....,,,,,,,,,,,,.....r',
            '...,,,...,....,,,,,,,,,,,rr.,...',
            '...,,,...,....,,,,,,,,,,rrr.....',
        ],
    },
    water: false,
    blockers: [
        { x: 620, y: 300, r: 46 },
        { x: 720, y: 250, r: 42 },
        { x: 470, y: 360, r: 44 },
        { x: 560, y: 470, r: 44 },
        { x: 800, y: 430, r: 42 },
        { x: 380, y: 250, r: 40 },
    ],
    decorations: [
        // Cactus thickets choking the inner basin (no-build).
        { type: 'cactus', x: 591, y: 389, seed: 10 },
        { type: 'cactus', x: 596, y: 360, seed: 11 },
        { type: 'dead_bush', x: 755, y: 386, seed: 12 },
        { type: 'cactus', x: 521, y: 366, seed: 13 },
        { type: 'cactus', x: 633, y: 309, seed: 14 },
        { type: 'dead_bush', x: 477, y: 358, seed: 15 },
        { type: 'cactus', x: 788, y: 331, seed: 16 },
        { type: 'dead_bush', x: 534, y: 473, seed: 17 },
        // Western dune boulders and dead brush.
        { type: 'dead_bush', x: 121, y: 418, seed: 18 },
        { type: 'dead_bush', x: 138, y: 330, seed: 19 },
        { type: 'dead_bush', x: 159, y: 400, seed: 20 },
        { type: 'cactus', x: 103, y: 503, seed: 21 },
        { type: 'boulder', x: 158, y: 365, seed: 22 },
        // Eastern dune ruins -- an old arch and camp.
        { type: 'dead_bush', x: 1166, y: 396, seed: 23 },
        { type: 'ruined_arch', x: 1081, y: 421, seed: 24 },
        { type: 'chest', x: 1221, y: 319, seed: 25 },
        { type: 'chest', x: 1197, y: 490, seed: 26 },
        { type: 'boulder', x: 1085, y: 387, seed: 27 },
        // Scattered desert scrub across the flats.
        { type: 'dead_bush', x: 525, y: 100, seed: 28 },
        { type: 'boulder', x: 479, y: 46, seed: 29 },
        { type: 'boulder', x: 562, y: 78, seed: 30 },
        { type: 'cactus', x: 727, y: 172, seed: 31 },
        { type: 'boulder', x: 706, y: 207, seed: 32 },
        { type: 'cactus', x: 783, y: 78, seed: 33 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
