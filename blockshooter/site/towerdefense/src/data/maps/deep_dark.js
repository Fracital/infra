// Deep Dark -- advanced, deep_dark biome, feature 'darkness'. A pitch-black ancient
// city: the gamescreen drapes the board in near-total black with sight only around
// towers, the path mouths, and the hero. A single sculk drift winds the full board
// so every tower earns its little pool of light. Glowstone clusters are the only
// fixed lamps -- placing near them buys visibility as well as coverage.
//
// Layout invariants:
//  - One long serpentine (~2570px): down the left, across the bottom, up the
//    centre, over the top, down the right, exit east. Enters x=-40, exits x=1320.
//  - Sculk floor over deepslate; deepslate-tile slabs mark the ruined city rooms
//    (the main build pockets); moss creeps at centre; rare glowstone veins and
//    obsidian chunks. Decoration light-sources cluster on the buildable rooms,
//    all kept >30px off the drift.

export default {
    id: 'deep_dark',
    name: 'Deep Dark',
    biome: 'deep_dark',
    difficulty: 'advanced',
    desc: 'A blind sculk city. You only see what your towers light up. Tread soft.',
    paths: [
        {
            waypoints: [
                [-40, 120], [150, 150], [110, 300], [180, 470], [300, 600],
                [470, 640], [600, 560], [660, 400], [600, 250], [660, 140],
                [840, 110], [1000, 160], [1090, 300], [1030, 460], [1120, 590],
                [1258, 622], [1320, 560],
            ],
        },
    ],
    terrain: {
        legend: {
            'k': 'sculk',
            'd': 'deepslate',
            't': 'deepslate_tiles',
            'm': 'moss',
            'o': 'obsidian',
            'G': 'glowstone',
        },
        rows: [
            'kkkkkkkkkkkokkkkkkkkkkkkkkkkkkkk',
            'kkkdkkkkdokddkkkkkdodkkkdkkkkkkk',
            'kkkkkddkdddkkdkkddkkkkkddkdkkkdk',
            'kkodkkttktkttkkkkkkkkkkkdkddkokk',
            'kkkkkkkttGtttkkkkkkttttttkkkkkkk',
            'kkkkkktttttttokkdokttttGttokkkkk',
            'kkkddkkdkkkkkkkkkkkkttttttdkkkkk',
            'kdkkdkkkkkkkkkdkkokkkkkkdkkkkddk',
            'dddkkkkkdkkkkkkkdkkkkkkkkkokkddd',
            'dddkdokkkkdkkkmmmkkkkkkkkkkddddd',
            'kddkdkkkkdkkommmmmmkkkdkkdkkkddk',
            'kkdkkkttttkkkkmmmmmkkkkdkdkkkdkk',
            'kkkktttGtttkkkmmkkkdkktkttktkkkk',
            'kkkkkktttttkdkdkkdkkktttGtttkkkk',
            'kdkdkkkkkkkkdkkdkkkkdktkdtttdkkd',
            'kkdkkdkkkdkkkddkkkkkkkokkdkkdkkk',
            'kkkkdkkdkkkkkkkkkkkkkkkkkkkdkkkk',
            'kkkkkkkkdkkkkddkkkkkkkkdkdkkdkkk',
        ],
    },
    water: false,
    blockers: [],
    decorations: [
        // Central ruined rooms -- lamps and loot in the belly of the serpentine.
        { type: 'glowstone_cluster', x: 340, y: 300, seed: 11 },
        { type: 'stalagmite', x: 420, y: 360, seed: 12 },
        { type: 'boulder', x: 300, y: 440, seed: 13 },
        { type: 'chest', x: 470, y: 300, seed: 14 },
        { type: 'glowstone_cluster', x: 380, y: 480, seed: 15 },
        { type: 'shulker_box', x: 260, y: 360, seed: 16 },
        // Top-centre gallery.
        { type: 'glowstone_cluster', x: 360, y: 160, seed: 21 },
        { type: 'stalagmite', x: 280, y: 180, seed: 22 },
        { type: 'boulder', x: 500, y: 150, seed: 23 },
        // Right-centre rooms.
        { type: 'glowstone_cluster', x: 840, y: 240, seed: 31 },
        { type: 'stalagmite', x: 900, y: 340, seed: 32 },
        { type: 'boulder', x: 780, y: 300, seed: 33 },
        { type: 'chest', x: 940, y: 240, seed: 34 },
        { type: 'ruined_arch', x: 820, y: 460, seed: 35 },
        { type: 'glowstone_cluster', x: 900, y: 500, seed: 36 },
        { type: 'shulker_box', x: 760, y: 420, seed: 37 },
        // Top-right lit chamber.
        { type: 'glowstone_cluster', x: 880, y: 200, seed: 41 },
        { type: 'chest', x: 960, y: 210, seed: 42 },
        // Far-right pocket.
        { type: 'glowstone_cluster', x: 1200, y: 300, seed: 43 },
        { type: 'stalagmite', x: 1240, y: 420, seed: 44 },
        { type: 'boulder', x: 1180, y: 220, seed: 45 },
        // Lower pockets.
        { type: 'shulker_box', x: 530, y: 500, seed: 51 },
        { type: 'glowstone_cluster', x: 920, y: 560, seed: 52 },
        { type: 'chest', x: 980, y: 570, seed: 53 },
    ],
    feature: 'darkness',
    portals: [],
    speedZones: [],
    music: 'end',
};
