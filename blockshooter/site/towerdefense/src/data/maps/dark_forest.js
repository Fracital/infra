// Dark Forest -- advanced, dark_forest biome. A black-canopy roofed forest:
// feature 'darkness' means the gamescreen drops a heavy overlay and only your
// towers, the two lane mouths, and a hero cut holes of vision in it. You are
// fighting half-blind, so every tower's range circle is also its lamp.
//
// The lane is a long double-S that folds back on itself twice, and the pockets
// between the folds are packed with dark oak thickets, giant mushrooms and
// boulders -- build room is genuinely scarce here, so committing a spot means
// giving up the sightline it would have covered. Scattered lanterns and a
// campfire are the only diegetic light; everything else is podzol and moss.

export default {
    id: 'dark_forest',
    name: 'Dark Forest',
    biome: 'dark_forest',
    difficulty: 'advanced',
    desc: 'Pitch-black under the canopy. Your towers are the only light.',
    paths: [
        {
            waypoints: [
                [-40, 110], [130, 130], [280, 110], [420, 170], [470, 300],
                [400, 420], [260, 470], [180, 570], [300, 630], [470, 610],
                [590, 520], [620, 390], [560, 270], [660, 190], [820, 180],
                [950, 250], [1000, 380], [930, 500], [980, 610], [1140, 610],
                [1240, 510], [1200, 380], [1270, 270], [1320, 250],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'podzol',
            ',': 'moss',
            'd': 'dirt',
        },
        rows: [
            '....,dd......,........,..d.,.d..',
            '.....,,,.,.d,.d.,.,..,.d,,.....,',
            '....,,d,,d..,..d......d.........',
            '.,.,,,,,,,,d..d.,...,.d....,..d.',
            ',.,,d,d,,,d...,...,d.....d,d..d,',
            'd..d,,,,,,,..,.,.....d,,,,,,....',
            '...,,,,,,,,...d.....,.,,,,d,,,.,',
            ',,..d,.d.d.,......,,.,,d,,,,,,,.',
            '.,.,.,,..,..,..d....,d,,,,,d,,..',
            '....,d,.d.d..,,...,..,d,,,,,,,,.',
            '.d.d,..........,,,d..,,,,,,,,.,.',
            '..d........,.,d.,..,..,d,,,...,.',
            '.,.,.,..d.,,,,,,,d.....,...,,...',
            '.,.......,,,,,,,,,..,.,.d.d....,',
            '....,,,d.,,,,,,,d,,..d.,d..d....',
            '.,.......,,,,,,,,,..,,..d,...d..',
            '.,..,..d...,,,,,,,..,.,,.,...,..',
            '...d......,.,.,.,.....d.........',
        ],
    },
    water: false,
    blockers: [
        { x: 250, y: 250, r: 34 },
        { x: 840, y: 350, r: 34 },
        { x: 1180, y: 660, r: 30 },
    ],
    decorations: [
        // Top-left thicket over the entry.
        { type: 'dark_oak_tree', x: 60, y: 70, seed: 1 },
        { type: 'dark_oak_tree', x: 130, y: 55, seed: 2 },
        { type: 'dark_oak_tree', x: 210, y: 70, seed: 3 },
        { type: 'mushroom_red', x: 150, y: 85, seed: 4 },
        // Belly of the first left fold.
        { type: 'dark_oak_tree', x: 330, y: 330, seed: 11 },
        { type: 'dark_oak_tree', x: 380, y: 380, seed: 12 },
        { type: 'giant_mushroom', x: 300, y: 400, seed: 13 },
        { type: 'mushroom_brown', x: 350, y: 290, seed: 14 },
        { type: 'dark_oak_tree', x: 280, y: 360, seed: 15 },
        // Central island between the folds.
        { type: 'dark_oak_tree', x: 720, y: 340, seed: 21 },
        { type: 'dark_oak_tree', x: 780, y: 400, seed: 22 },
        { type: 'spruce_tree', x: 700, y: 430, seed: 23 },
        { type: 'mushroom_red', x: 760, y: 300, seed: 24 },
        // Right-hand pocket inside the far fold.
        { type: 'dark_oak_tree', x: 1100, y: 380, seed: 31 },
        { type: 'dark_oak_tree', x: 1130, y: 450, seed: 32 },
        { type: 'giant_mushroom', x: 1080, y: 470, seed: 33 },
        { type: 'mushroom_brown', x: 1150, y: 340, seed: 34 },
        { type: 'boulder', x: 1060, y: 420, seed: 35 },
        // Undergrowth along the bottom edge.
        { type: 'dark_oak_tree', x: 380, y: 680, seed: 41 },
        { type: 'mushroom_red', x: 440, y: 690, seed: 42 },
        { type: 'dark_oak_tree', x: 1050, y: 680, seed: 43 },
        { type: 'mushroom_brown', x: 1100, y: 690, seed: 44 },
        { type: 'spruce_tree', x: 900, y: 680, seed: 45 },
        // Diegetic light + ground cover.
        { type: 'lantern', x: 500, y: 250, seed: 51 },
        { type: 'campfire_decor', x: 780, y: 470, seed: 52 },
        { type: 'lantern', x: 1150, y: 250, seed: 53 },
        { type: 'azalea', x: 200, y: 250, seed: 61 },
        { type: 'mushroom_red', x: 600, y: 630, seed: 62 },
    ],
    feature: 'darkness',
    portals: [],
    speedZones: [],
    music: 'overworld',
};
