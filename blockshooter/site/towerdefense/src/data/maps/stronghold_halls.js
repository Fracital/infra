// Stronghold Halls -- advanced, stronghold biome. TWO lanes cut through a
// brick-and-deepslate maze: the upper hall squares its way along the top third,
// the lower hall mirrors it along the bottom, and a deepslate spine wall (with
// two gaps) splits the middle so you can't just carpet the centre. Every wall
// you see in the grid ('#') is backed by a blocker circle, and stub walls jut
// into each corridor pocket -- so the buildable ground is the narrow brick
// shelves between a lane and a wall. Torches light the corridors.
//
// Two paths, no pathIndex on the rounds -> the wave manager alternates groups
// between the halls. Length ~2060px each (multi-path band 1400-2400).

export default {
    id: 'stronghold_halls',
    name: 'Stronghold Halls',
    biome: 'stronghold',
    difficulty: 'advanced',
    desc: 'Two corridors, one wall maze. Build on the shelves between.',
    paths: [
        {
            waypoints: [
                [-40, 110], [200, 110], [200, 250], [420, 250], [420, 110],
                [640, 110], [640, 250], [860, 250], [860, 110], [1080, 110],
                [1080, 250], [1320, 250],
            ],
        },
        {
            waypoints: [
                [-40, 610], [200, 610], [200, 470], [420, 470], [420, 610],
                [640, 610], [640, 470], [860, 470], [860, 610], [1080, 610],
                [1080, 470], [1320, 470],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'stone_bricks',
            ',': 'cracked_bricks',
            '#': 'deepslate',
            'c': 'cobble',
        },
        rows: [
            '...........c,...,.,........,....',
            '...,.,.....,..,c.c.....,.c,....,',
            '.,.,..,,,,.........,.c....,.....',
            '.,....,....,,........,.......c.,',
            ',..,..,###....,..###..,......c..',
            '...,..c###c,,....###,..c.,....,.',
            '.,.........c....................',
            '..,,........c.c..........c......',
            '.######,.#############..#######.',
            '.######,.#############..#######.',
            '....,,.,....c......,..,......,..',
            '..,.,c...,.,,......,.....,...,..',
            '.......###,,.....###...,.....c,.',
            '..,...c###..,....###,,,...c.....',
            'c.,.....,..,.........,...,,.c...',
            '....,...,.c.,.....,...,...,,....',
            '.,....,...,......,....,.........',
            ',............c.,.......c.c......',
        ],
    },
    water: false,
    blockers: [
        // Central spine wall (rows 8-9), gaps at x~300-360 and x~880-960.
        { x: 80, y: 360, r: 30 },
        { x: 160, y: 360, r: 30 },
        { x: 240, y: 360, r: 30 },
        { x: 400, y: 360, r: 28 },
        { x: 480, y: 360, r: 28 },
        { x: 560, y: 360, r: 28 },
        { x: 640, y: 360, r: 28 },
        { x: 720, y: 360, r: 28 },
        { x: 800, y: 360, r: 28 },
        { x: 860, y: 360, r: 28 },
        { x: 1000, y: 360, r: 28 },
        { x: 1080, y: 360, r: 28 },
        { x: 1160, y: 360, r: 28 },
        { x: 1220, y: 360, r: 28 },
        // Stub walls jutting into the corridor pockets.
        { x: 320, y: 190, r: 34 },
        { x: 740, y: 190, r: 34 },
        { x: 320, y: 530, r: 34 },
        { x: 740, y: 530, r: 34 },
    ],
    decorations: [
        // Upper-left gatehouse.
        { type: 'torch', x: 60, y: 70, seed: 1 },
        { type: 'chest', x: 120, y: 60, seed: 2 },
        { type: 'anvil_decor', x: 175, y: 68, seed: 3 },
        // First upper pocket.
        { type: 'ruined_arch', x: 320, y: 150, seed: 4 },
        { type: 'torch', x: 250, y: 175, seed: 5 },
        { type: 'torch', x: 380, y: 185, seed: 6 },
        // Second upper pocket.
        { type: 'boulder', x: 740, y: 150, seed: 7 },
        { type: 'torch', x: 690, y: 180, seed: 8 },
        { type: 'torch', x: 790, y: 180, seed: 9 },
        // Third upper pocket + exit hall.
        { type: 'minecart', x: 970, y: 190, seed: 10 },
        { type: 'rail', x: 1015, y: 195, seed: 11 },
        { type: 'end_pillar', x: 1200, y: 185, seed: 12 },
        // Spine-wall gaps.
        { type: 'torch', x: 300, y: 345, seed: 13 },
        { type: 'chest', x: 900, y: 350, seed: 14 },
        { type: 'torch', x: 860, y: 345, seed: 15 },
        // First lower pocket.
        { type: 'ruined_arch', x: 320, y: 530, seed: 16 },
        { type: 'torch', x: 250, y: 510, seed: 17 },
        { type: 'torch', x: 385, y: 510, seed: 18 },
        // Second lower pocket.
        { type: 'boulder', x: 740, y: 530, seed: 19 },
        { type: 'torch', x: 690, y: 510, seed: 20 },
        { type: 'torch', x: 790, y: 510, seed: 21 },
        // Third lower pocket + lower-left gatehouse.
        { type: 'minecart', x: 1000, y: 540, seed: 22 },
        { type: 'rail', x: 1040, y: 545, seed: 23 },
        { type: 'chest', x: 120, y: 560, seed: 24 },
        { type: 'anvil_decor', x: 160, y: 560, seed: 25 },
        { type: 'torch', x: 60, y: 545, seed: 26 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
