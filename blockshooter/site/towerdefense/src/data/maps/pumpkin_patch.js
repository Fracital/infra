// Pumpkin Patch -- beginner, autumn biome. A harvest field of pumpkins and hay
// under falling leaves. The cart track coils inward like a snail shell, winding
// most of the way to the middle before darting straight back out the east gate,
// so towers set in the gaps between the coils cover several passes at once.
//
// Layout invariants (verified via tools/validate_map.js + local checks):
//  - Single path, ~3560px. Enters left at y~340, spirals CLOCKWISE inward (one
//    broad outer loop, then a tighter inner loop) to near the centre, then breaks
//    east across the coils and exits the right edge at x=1320,y=330. Crossing the
//    outer coil on the way out is intentional -- it reads as unwinding.
//  - The pockets between the coils and the four corners are the build spots;
//    pumpkins, hay bales and melons cluster there and around the rim.
//  - podzol + grass blotch the grass2 field; trodden dirt marks the coil centre.
//    No water (water: false) -- it is a dry autumn field.

export default {
    id: 'pumpkin_patch',
    name: 'Pumpkin Patch',
    biome: 'autumn',
    difficulty: 'beginner',
    desc: 'An autumn harvest field where the cart path coils in on itself before rolling out east.',
    paths: [
        {
            waypoints: [
                [-40, 340], [150, 352], [300, 308], [400, 210], [540, 146], [700, 134],
                [856, 184], [966, 300], [986, 426], [902, 536], [758, 602], [598, 608],
                [456, 556], [358, 448], [340, 334], [410, 264], [540, 234], [648, 288],
                [634, 394], [548, 424], [514, 352], [600, 330], [712, 322], [858, 322],
                [992, 324], [1150, 326], [1320, 330],
            ],
        },
    ],
    terrain: {
        legend: {
            ',': 'grass2',
            'p': 'podzol',
            '.': 'grass',
            'd': 'dirt',
        },
        rows: [
            'p,,pp,.,,,,,,,,,,pp,p,.p.,,pp,,p',
            '.p,pppp,,,,,,p,,.,,p,,.,p,,,p,,p',
            ',ppppppp.,.,,p,,p,,p,p.,p,,,,,p,',
            ',,ppppppp,p,,,p,,,,,p,.p,.,,p,p.',
            'p,,ppppp.ppp.p,,,p,,pp,,,,pp,,,,',
            ',,pp,,p,,.,p,,,,,,.,p,,,,.,,,p,p',
            ',.,,,,,p,p,p,p.p,,p,,..,p,p,,..,',
            ',pp,,pp,,,,p,,pd,d,,,p,,,,,,p,,,',
            ',,,p,.p,p,,ppdddddp,,,.ppp,,,pp,',
            ',p,p,,,,,,,,,dddddd,p,,,,p,p,,pp',
            ',,p,.,,.pp,p,p,,dd.,,pp,,p,p,p,.',
            ',,pppppp,,p,,,,,p,,,,pp,,,,,,,.,',
            ',,p,,p,,.,p,p,,,,,.,p,,,,,,,,,,,',
            ',,,pdd,ppp,.,pp,,,..pp,,,,ppp,p,',
            ',p,ddddp,.pp.,p,,ppp,p,.ppppppp,',
            ',,,,dp,,..p,,,,,,,,p,pp,,ppppppp',
            ',pp,,,p,,,p,p.,,,,pppp,,pp,ppp,,',
            ',,p,p,.p,,,.,p,,,pppp,,p,,p,,,pp',
        ],
    },
    water: false,
    blockers: [],
    decorations: [
        // North-west corner cluster.
        { type: 'pumpkin', x: 90, y: 120, seed: 11 },
        { type: 'pumpkin', x: 150, y: 90, seed: 12 },
        { type: 'pumpkin', x: 60, y: 200, seed: 13 },
        { type: 'hay_bale', x: 200, y: 140, seed: 14 },
        { type: 'oak_tree', x: 120, y: 60, seed: 15 },
        // West verge, outside the outer coil.
        { type: 'pumpkin', x: 70, y: 300, seed: 21 },
        { type: 'melon', x: 150, y: 300, seed: 22 },
        { type: 'pumpkin', x: 100, y: 420, seed: 23 },
        { type: 'pumpkin', x: 70, y: 520, seed: 24 },
        { type: 'hay_bale', x: 180, y: 560, seed: 25 },
        { type: 'pumpkin', x: 90, y: 640, seed: 26 },
        { type: 'oak_tree', x: 220, y: 660, seed: 27 },
        { type: 'dead_bush', x: 300, y: 700, seed: 28 },
        // South verge below the outer coil.
        { type: 'pumpkin', x: 500, y: 700, seed: 31 },
        { type: 'hay_bale', x: 640, y: 690, seed: 32 },
        { type: 'pumpkin', x: 780, y: 700, seed: 33 },
        { type: 'melon', x: 880, y: 675, seed: 34 },
        // South-east and east corners.
        { type: 'pumpkin', x: 1050, y: 600, seed: 41 },
        { type: 'hay_bale', x: 1150, y: 560, seed: 42 },
        { type: 'oak_tree', x: 1240, y: 640, seed: 43 },
        { type: 'pumpkin', x: 1240, y: 480, seed: 44 },
        { type: 'pumpkin', x: 1180, y: 410, seed: 45 },
        { type: 'chest', x: 1250, y: 400, seed: 46 },
        // North-east corner cluster.
        { type: 'pumpkin', x: 1100, y: 120, seed: 51 },
        { type: 'hay_bale', x: 1200, y: 180, seed: 52 },
        { type: 'oak_tree', x: 1050, y: 60, seed: 53 },
        { type: 'pumpkin', x: 1240, y: 260, seed: 54 },
        // Pockets tucked between the coils.
        { type: 'campfire_decor', x: 440, y: 360, seed: 61 },
        { type: 'pumpkin', x: 470, y: 300, seed: 62 },
        { type: 'sweet_berry', x: 700, y: 470, seed: 63 },
        { type: 'mushroom_brown', x: 820, y: 460, seed: 64 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
