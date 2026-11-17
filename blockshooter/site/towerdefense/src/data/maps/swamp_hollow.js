// Swamp Hollow -- intermediate, swamp biome. A boggy hollow of grass2 hummocks,
// mud flats and stagnant water_deep pools under a heavy green haze. The mud-track
// path sucks at anything crossing it: three soft stretches (speedZones, 0.9x)
// bog mobs down right where your fire should concentrate. Lily pads dot the
// pools (Guardian-friendly water), a witch's hut squats in the south flat, and
// dead spruce + fat mushrooms crowd the drier hummocks.

export default {
    id: 'swamp_hollow',
    name: 'Swamp Hollow',
    biome: 'swamp',
    difficulty: 'intermediate',
    desc: 'A muddy hollow drags mobs to a crawl. Stack fire on the soft ground.',
    paths: [
        {
            waypoints: [
                [-30, 360], [110, 340], [210, 280], [300, 220], [380, 260],
                [430, 360], [420, 470], [500, 550], [620, 580], [730, 530],
                [790, 430], [860, 360], [970, 350], [1060, 420], [1110, 520],
                [1200, 590], [1310, 600],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'grass2',
            ',': 'mud',
            'c': 'clay',
            'w': 'water_deep',
        },
        rows: [
            '.....,.,..,......,ccccc........c',
            '......,,,,,,,,.,,,cccccc.......c',
            '.....,,,www,,,,,w,ccccc.........',
            '.....,,,www,,,,www,cccwwww......',
            '.....,,,ww,,,,,,ww,c,cwwwww.....',
            '.......,,....,,,,,,,,..wwww.....',
            '.................,,,.......ww...',
            '..........................wwww..',
            '..........................www...',
            '........ccc.......,,,...........',
            '........ccccc...,,,,,,..,.......',
            '....w.w.ccccc....,,,,,,,,,,.....',
            '...wwwww.cccc......,.,,,,,,,....',
            '...wwwww.............,,,,,,.....',
            '...wwww..,,,,.........,,,,,,,...',
            '.....ww.,,,,,..,.,...,,,,,,.....',
            '.........,,,,,,,,,,,.....,......',
            '..........,..,,,,,,,............',
        ],
    },
    water: true,
    blockers: [],
    decorations: [
        // Witch's hut brooding over the south flat.
        { type: 'witch_hut_decor', x: 300, y: 600, seed: 11 },
        { type: 'dead_bush', x: 240, y: 640, seed: 12 },
        { type: 'mushroom_red', x: 360, y: 600, seed: 13 },
        // Lily pads on the bottom-left pool.
        { type: 'lily_pad', x: 200, y: 540, seed: 21 },
        { type: 'lily_pad', x: 245, y: 555, seed: 22 },
        { type: 'lily_pad', x: 210, y: 505, seed: 23 },
        // Lily pads on the north-east pools.
        { type: 'lily_pad', x: 960, y: 175, seed: 24 },
        { type: 'lily_pad', x: 1000, y: 188, seed: 25 },
        { type: 'lily_pad', x: 1090, y: 300, seed: 26 },
        { type: 'lily_pad', x: 1112, y: 288, seed: 27 },
        // North-middle pool + hummock stand.
        { type: 'lily_pad', x: 650, y: 150, seed: 28 },
        { type: 'lily_pad', x: 682, y: 135, seed: 29 },
        { type: 'spruce_tree', x: 540, y: 92, seed: 31 },
        { type: 'spruce_tree', x: 820, y: 110, seed: 32 },
        { type: 'spruce_tree', x: 905, y: 172, seed: 33 },
        // Left approach hummocks.
        { type: 'spruce_tree', x: 62, y: 122, seed: 34 },
        { type: 'spruce_tree', x: 150, y: 155, seed: 35 },
        { type: 'spruce_tree', x: 82, y: 210, seed: 36 },
        { type: 'azalea', x: 200, y: 460, seed: 37 },
        // Central drier hummock inside the path loop.
        { type: 'giant_mushroom', x: 560, y: 430, seed: 41 },
        { type: 'mushroom_red', x: 605, y: 408, seed: 42 },
        { type: 'dead_bush', x: 520, y: 452, seed: 43 },
        { type: 'mushroom_brown', x: 640, y: 448, seed: 44 },
        // Right-side rises.
        { type: 'spruce_tree', x: 1155, y: 180, seed: 45 },
        { type: 'spruce_tree', x: 1235, y: 255, seed: 46 },
        { type: 'spruce_tree', x: 1055, y: 152, seed: 47 },
        { type: 'azalea', x: 880, y: 300, seed: 48 },
        // Bottom-right verge.
        { type: 'spruce_tree', x: 1150, y: 672, seed: 49 },
        { type: 'spruce_tree', x: 1050, y: 682, seed: 50 },
        { type: 'mushroom_brown', x: 700, y: 662, seed: 51 },
    ],
    feature: null,
    portals: [],
    speedZones: [
        { x: 430, y: 360, r: 78, mult: 0.9 },
        { x: 730, y: 530, r: 82, mult: 0.9 },
        { x: 1060, y: 420, r: 76, mult: 0.9 },
    ],
    music: 'overworld',
};
