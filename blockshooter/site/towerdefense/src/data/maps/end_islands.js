// End Islands -- EXPERT, end biome. A scatter of end-stone shards adrift in the
// void: the obsidian path bridges island to island over black nothing, souls
// drifting past. Purpur-cored islands are the only solid ground, so build space
// is brutally tight -- chorus plants, end pillars and end crystals crowd what
// little footing remains.
//
// IMPORTANT engine note: terrain.js only mask-blocks lava/magma; obsidian is
// mask-buildable. So the void is NOT made unbuildable by the obsidian char alone
// -- it is enforced with blocker discs over the deep-void expanses PLUS blocking
// decorations (end/obsidian pillars, end crystals). The obsidian terrain char is
// purely the visual void. Buildable ground is thereby limited to the end-stone
// islands and a few path-side slivers.
//
// Design (verified with tools/validate_map.js):
//  - Single path, len ~2741px, waypoints 76-126px apart winding island to island.
//  - Seven small end-stone islands (purpur cores) placed against path bends.
//  - Decorations all >=52px off the lane (guaranteed off-path per validator).

export default {
    id: 'end_islands',
    name: 'End Islands',
    biome: 'end',
    difficulty: 'expert',
    desc: 'Floating shards over the void. There is almost nowhere to build -- choose every island with intent.',
    paths: [
        {
            waypoints: [
                [-30, 300], [80, 300], [180, 260], [260, 300], [320, 380], [300, 470],
                [230, 530], [160, 590], [200, 660], [320, 680], [440, 640], [520, 560],
                [560, 470], [540, 380], [600, 320], [700, 300], [800, 340], [860, 420],
                [840, 520], [780, 600], [860, 660], [980, 660], [1080, 600], [1120, 500],
                [1100, 400], [1150, 310], [1240, 260], [1310, 230],
            ],
        },
    ],
    terrain: {
        legend: {
            '#': 'obsidian',
            '.': 'end_stone',
            'p': 'purpur',
        },
        rows: [
            '################################',
            '################################',
            '################################',
            '################################',
            '################################',
            '################################',
            '################################',
            '#....########.....###.....######',
            '#.pp.########.ppp.###.ppp.######',
            '#....########.....###.....######',
            '##########################....##',
            '#############....#########.pp.##',
            '#############.pp.#########.pp.##',
            '####....#####....#########....##',
            '####.pp.########################',
            '####....########################',
            '##########.ppp.#################',
            '##########.....#################',
        ],
    },
    water: false,
    blockers: [
        { x: 150, y: 90, r: 140 },
        { x: 430, y: 90, r: 140 },
        { x: 700, y: 100, r: 140 },
        { x: 970, y: 100, r: 140 },
        { x: 1195, y: 110, r: 130 },
        { x: 60, y: 470, r: 120 },
        { x: 70, y: 660, r: 125 },
        { x: 900, y: 700, r: 140 },
        { x: 1140, y: 690, r: 120 },
        { x: 1250, y: 430, r: 115 },
        { x: 860, y: 540, r: 120 },
        { x: 760, y: 360, r: 95 },
        { x: 1120, y: 250, r: 110 },
        { x: 300, y: 700, r: 105 },
    ],
    decorations: [
        // Void ceiling: a row of pillars and crystals hanging over the top.
        { type: 'end_pillar', x: 140, y: 80, seed: 11 },
        { type: 'obsidian_pillar', x: 340, y: 60, seed: 12 },
        { type: 'end_pillar', x: 540, y: 100, seed: 13 },
        { type: 'end_crystal_decor', x: 760, y: 60, seed: 14 },
        { type: 'obsidian_pillar', x: 980, y: 80, seed: 15 },
        { type: 'end_pillar', x: 1180, y: 60, seed: 16 },
        { type: 'chorus_plant', x: 440, y: 140, seed: 17 },
        { type: 'end_crystal_decor', x: 880, y: 140, seed: 18 },
        // Left void.
        { type: 'end_pillar', x: 60, y: 180, seed: 21 },
        { type: 'obsidian_pillar', x: 60, y: 460, seed: 22 },
        { type: 'chorus_plant', x: 100, y: 540, seed: 23 },
        // Central void between islands.
        { type: 'obsidian_pillar', x: 420, y: 300, seed: 31 },
        { type: 'end_pillar', x: 500, y: 340, seed: 32 },
        { type: 'end_crystal_decor', x: 700, y: 460, seed: 33 },
        { type: 'chorus_plant', x: 660, y: 420, seed: 34 },
        { type: 'obsidian_pillar', x: 980, y: 300, seed: 35 },
        { type: 'end_pillar', x: 940, y: 460, seed: 36 },
        // Right void.
        { type: 'end_pillar', x: 1220, y: 340, seed: 41 },
        { type: 'obsidian_pillar', x: 1260, y: 460, seed: 42 },
        { type: 'chorus_plant', x: 1180, y: 580, seed: 43 },
        { type: 'end_crystal_decor', x: 1220, y: 620, seed: 44 },
        // Lower void.
        { type: 'obsidian_pillar', x: 60, y: 620, seed: 51 },
        { type: 'end_pillar', x: 300, y: 620, seed: 52 },
        { type: 'chorus_plant', x: 460, y: 700, seed: 53 },
        { type: 'end_pillar', x: 780, y: 700, seed: 54 },
        { type: 'obsidian_pillar', x: 1060, y: 700, seed: 55 },
        { type: 'shulker_box', x: 660, y: 540, seed: 56 },
        // Island dressing.
        { type: 'shulker_box', x: 140, y: 340, seed: 61 },
        { type: 'chorus_plant', x: 180, y: 500, seed: 62 },
        { type: 'shulker_box', x: 940, y: 420, seed: 63 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'end',
};
