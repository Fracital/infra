// Mesa Canyon -- intermediate, mesa biome. A gravel trail threads three tight
// switchbacks down a red-sand canyon, boxed in by banded terracotta walls
// (blockers) that leave only narrow shelves to build on. The walls sit between
// the switchback legs, so each shelf overlooks two lanes at once -- prime real
// estate, and there is never enough of it. Cacti and sun-bleached boulders dot
// the shelves; dead bushes rattle in the dust.

export default {
    id: 'mesa_canyon',
    name: 'Mesa Canyon',
    biome: 'mesa',
    difficulty: 'intermediate',
    desc: 'Switchbacks knife down a walled canyon. Shelf space is the whole game.',
    paths: [
        {
            waypoints: [
                [150, -30], [168, 95], [380, 130], [640, 120], [900, 135],
                [1095, 175], [1135, 275], [900, 300], [640, 298], [380, 305],
                [195, 345], [175, 435], [360, 468], [640, 458], [930, 468],
                [1120, 505], [1150, 600], [1160, 760],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'red_sand',
            ',': 'terracotta',
            's': 'sand',
        },
        rows: [
            '..........sssss.,............sss',
            '...........sss,,,,..........ssss',
            '............,,,,,,,.........ssss',
            '...........,,,,,,...............',
            '...........sssss,,.....,........',
            '............ssss....,.,,,.....,.',
            '............s.s....,,,,,,,....,,',
            '....................,,,,,,...,,,',
            '...........,,.,,,,..,,,,,,,.,,,,',
            '.......,,.,,,,,,,,.,.,,,,,,,,,,,',
            '......,,,,,,,,,,,,.,,,,,,,,,.,,,',
            '......,,,,,,,,,,.,,,,,,,,,,.,..,',
            '...sss,,,.,,,,,....,,,,,,,,,....',
            '..sssss,..,,,.......,,,.,.,.....',
            '.sssss.......,,,,...,...........',
            '..ssss.....,.,,,,...............',
            '...ss.....,,,,,,,...............',
            '.........,,,,,.,................',
        ],
    },
    water: false,
    blockers: [
        // Terracotta canyon walls between the switchback legs -- gaps are shelves.
        { x: 250, y: 225, r: 34 },
        { x: 470, y: 228, r: 34 },
        { x: 720, y: 222, r: 34 },
        { x: 960, y: 232, r: 32 },
        { x: 300, y: 400, r: 34 },
        { x: 555, y: 400, r: 34 },
        { x: 800, y: 400, r: 34 },
        { x: 1050, y: 398, r: 32 },
        { x: 360, y: 560, r: 34 },
        { x: 630, y: 558, r: 34 },
        { x: 900, y: 560, r: 34 },
    ],
    decorations: [
        // Upper wall band (between leg 1 and leg 2).
        { type: 'cactus', x: 350, y: 218, seed: 11 },
        { type: 'dead_bush', x: 500, y: 232, seed: 12 },
        { type: 'cactus', x: 600, y: 224, seed: 13 },
        { type: 'boulder', x: 250, y: 225, seed: 14 },
        { type: 'dead_bush', x: 760, y: 228, seed: 15 },
        { type: 'cactus', x: 855, y: 216, seed: 16 },
        { type: 'boulder', x: 960, y: 232, seed: 17 },
        // Middle wall band (between leg 2 and leg 3).
        { type: 'cactus', x: 455, y: 400, seed: 21 },
        { type: 'dead_bush', x: 300, y: 410, seed: 22 },
        { type: 'boulder', x: 555, y: 400, seed: 23 },
        { type: 'cactus', x: 700, y: 405, seed: 24 },
        { type: 'dead_bush', x: 850, y: 402, seed: 25 },
        { type: 'cactus', x: 1000, y: 398, seed: 26 },
        // Lower wall band (between leg 3 and exit).
        { type: 'cactus', x: 455, y: 560, seed: 31 },
        { type: 'boulder', x: 630, y: 558, seed: 32 },
        { type: 'dead_bush', x: 720, y: 566, seed: 33 },
        { type: 'cactus', x: 900, y: 560, seed: 34 },
        // Canyon rims and corners.
        { type: 'cactus', x: 55, y: 130, seed: 41 },
        { type: 'cactus', x: 60, y: 300, seed: 42 },
        { type: 'dead_bush', x: 65, y: 470, seed: 43 },
        { type: 'boulder', x: 90, y: 660, seed: 44 },
        { type: 'cactus', x: 1210, y: 300, seed: 45 },
        { type: 'boulder', x: 1235, y: 250, seed: 46 },
        { type: 'cactus', x: 1225, y: 470, seed: 47 },
        { type: 'dead_bush', x: 1245, y: 150, seed: 48 },
        { type: 'cactus', x: 1210, y: 600, seed: 49 },
        { type: 'boulder', x: 980, y: 668, seed: 50 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
