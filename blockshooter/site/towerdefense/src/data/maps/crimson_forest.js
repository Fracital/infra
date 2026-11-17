// Crimson Forest -- expert, crimson biome. A dense crimson-nylium fungal wood where
// TWO trails cross clean at the centre: one runs upper-left -> lower-right, the other
// lower-left -> upper-right, and both share the exact centre point (640,360) on an
// open soul-soil clearing so the crossing reads as a tidy X, not a smear. Mobs cycle
// the two trails. Giant fungi choke the four corner triangles, lava pools bite two
// corners -- build room is brutally tight, as an expert map should be.
//
// Layout invariants:
//  - Both paths pass through (640,360); near the centre they sit ~60px apart then
//    meet, so the causeways stay distinct into a crisp crossroads.
//  - Every waypoint/segment avoids the bottom-left (gx1-4) and top-right (gx27-30)
//    lava pools -- checked against the terrain grid.
//  - crimson-nylium base with netherrack veins, warped-nylium pockets, a central
//    soul-soil clearing (kept decoration-free at the crossing), basalt lake shores.
//  - Fungi/mushroom clusters pack the TOP and BOTTOM triangles; the LEFT and RIGHT
//    lanes carry only sparse blockers so a little building is still possible. All
//    decorations sit >30px off both trails.

export default {
    id: 'crimson_forest',
    name: 'Crimson Forest',
    biome: 'crimson',
    difficulty: 'expert',
    desc: 'Two fungal trails cross at the heart of the wood. Hold the crossroads.',
    paths: [
        {
            waypoints: [
                [-40, 160], [120, 220], [280, 210], [430, 300], [560, 320],
                [640, 360], [760, 410], [900, 430], [1050, 510], [1200, 520],
                [1320, 580],
            ],
        },
        {
            waypoints: [
                [-40, 540], [120, 480], [280, 470], [430, 400], [560, 380],
                [640, 360], [760, 320], [900, 290], [1050, 230], [1200, 220],
                [1320, 190],
            ],
        },
    ],
    terrain: {
        legend: {
            'r': 'crimson_nylium',
            'n': 'netherrack',
            'w': 'warped_nylium',
            'W': 'warped_nylium',
            's': 'soul_soil',
            'L': 'lava',
            'b': 'basalt',
            'G': 'glowstone',
        },
        rows: [
            'rrrrrnrrrnrrwwrrrrrrnrrrrrrrrrrr',
            'rrrrrrrrrwrrrrrrrrrnrrrrrrrbbbbr',
            'rrrWWWrnrrrnrrnrrrrrrrrrrrbbbbbb',
            'rrWWWWWrrrrnrrrGrnrnrrrrrrbLLLLb',
            'rrWWWWWnwnrrrrwrrrnrnwwnrnbbLLbb',
            'rrrWrWrrrrrrrrnwrrrrrrrrrrrbbbbr',
            'rrrrrrrrrwnrnrrrrrrrrrrrrrrrrrrr',
            'rwnrrnrnrrrrrnssnsswrrwrrrnrnrrr',
            'nrrrrrrrnwrrrsssssssrrnrrrnrrrnr',
            'rrrnwrrrnrrrrsssssssrrrrrrnnnrrr',
            'rrrwnrwrrrrrnrsssrsrrnrrnrrwrnwr',
            'rrrrrrrwrrrrrrrrrrrrrrrrrWWrWrrn',
            'rrrrrrrrrrrrrrrnrrrrrrnrWWWWWrrr',
            'rbbbbbrwrnrrrrnrrrrrrrrrWWWWWWrr',
            'bbLLLbbrnrrrrrnwGrrrrrrrrWWWWWrr',
            'bLLLLbbrrrrrrrrrwrrwrrrrrWWWWrnr',
            'bbLLLbbrrrrrrrnrwrrrnrrrrwrrnrrr',
            'rbbbbbwrrrrrrrrrrrrnnrrrrrrrnrrn',
        ],
    },
    water: false,
    blockers: [],
    decorations: [
        // Landmark portals mark the crossing's north and south.
        { type: 'nether_portal', x: 620, y: 60, seed: 10 },
        { type: 'nether_portal', x: 620, y: 660, seed: 11 },
        // Top triangle -- packed fungal canopy above the X.
        { type: 'crimson_fungus', x: 200, y: 90, seed: 21 },
        { type: 'crimson_fungus', x: 300, y: 130, seed: 22 },
        { type: 'crimson_fungus', x: 380, y: 110, seed: 23 },
        { type: 'warped_fungus', x: 460, y: 150, seed: 24 },
        { type: 'giant_mushroom', x: 560, y: 120, seed: 25 },
        { type: 'crimson_fungus', x: 700, y: 110, seed: 26 },
        { type: 'crimson_fungus', x: 780, y: 140, seed: 27 },
        { type: 'warped_fungus', x: 860, y: 160, seed: 28 },
        { type: 'giant_mushroom', x: 950, y: 190, seed: 29 },
        // Bottom triangle -- packed canopy below the X.
        { type: 'crimson_fungus', x: 300, y: 600, seed: 31 },
        { type: 'warped_fungus', x: 380, y: 640, seed: 32 },
        { type: 'giant_mushroom', x: 480, y: 620, seed: 33 },
        { type: 'crimson_fungus', x: 560, y: 660, seed: 34 },
        { type: 'crimson_fungus', x: 700, y: 620, seed: 35 },
        { type: 'warped_fungus', x: 780, y: 600, seed: 36 },
        { type: 'giant_mushroom', x: 860, y: 560, seed: 37 },
        { type: 'crimson_fungus', x: 950, y: 600, seed: 38 },
        // Left lane -- sparse, so a couple of tower spots survive.
        { type: 'crimson_fungus', x: 180, y: 350, seed: 41 },
        { type: 'boulder', x: 300, y: 350, seed: 42 },
        { type: 'warped_fungus', x: 120, y: 320, seed: 43 },
        { type: 'glowstone_cluster', x: 240, y: 430, seed: 44 },
        { type: 'crimson_fungus', x: 200, y: 560, seed: 45 },
        // Right lane -- sparse blockers.
        { type: 'crimson_fungus', x: 1050, y: 370, seed: 51 },
        { type: 'boulder', x: 1150, y: 380, seed: 52 },
        { type: 'stalagmite', x: 1250, y: 360, seed: 53 },
        { type: 'crimson_fungus', x: 1020, y: 300, seed: 54 },
        { type: 'glowstone_cluster', x: 980, y: 340, seed: 55 },
        { type: 'crimson_fungus', x: 1050, y: 150, seed: 56 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'nether',
};
