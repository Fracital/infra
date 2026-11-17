// Dragon's End -- EXPERT, the FINAL map. end biome. A long clockwise spiral winds
// down out of the void, tightening ring by ring until it reaches the heart of the
// island -- an obsidian-pillar ring crowned with end crystals -- then plunges
// straight down the central void chute and off the world. The closer to the
// centre, the less ground there is: the innermost rings are almost solid track,
// and the pillar ring eats what remains. This is the last stand.
//
// Design (verified with tools/validate_map.js + scratchpad geometry):
//  - Single spiral path, len ~3288px, ~2 turns, spacing 31-158px. Both endpoints
//    offscreen (top-centre entry, bottom-centre chute exit) as the validator
//    requires -- the "central exit" is the chute punching through the core, which
//    crosses two lower spiral arms (self-crossings are an intended map feature).
//  - Central end-stone platform (purpur core, hollow centre) sits under the ring.
//  - obsidian_pillar ring + end_crystal_decor encircle the core; six purpur-cored
//    islands ride the outer arms. Builds are scarcest at the centre by design.
//  - Void enforced with blocker discs (obsidian is engine-buildable) + blocking
//    pillars; decorations all >=52px off the lane.

export default {
    id: 'dragons_end',
    name: "Dragon's End",
    biome: 'end',
    difficulty: 'expert',
    desc: 'The final spiral. Mobs wind inward to the crystal ring and dive into the void at its heart. Hold the centre.',
    paths: [
        {
            waypoints: [
                [645, -58], [645, 72], [801, 96], [929, 151], [1013, 229], [1044, 318],
                [1020, 405], [948, 479], [839, 530], [711, 554], [581, 547], [467, 514],
                [384, 460], [340, 393], [340, 323], [380, 260], [453, 212], [546, 185],
                [645, 180], [737, 196], [809, 231], [854, 277], [867, 328], [849, 375],
                [806, 414], [746, 439], [678, 448], [614, 442], [561, 423], [525, 395],
                [511, 363], [517, 333], [539, 308], [572, 292], [610, 285], [645, 287],
                [645, 410], [655, 500], [653, 600], [645, 730],
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
            '######....############....######',
            '######.pp.############.pp.######',
            '######....############....######',
            '#############......#############',
            '#############.pppp.#############',
            '#############.p##p.#############',
            '####...######.pppp.######...####',
            '####.p.######......######.p.####',
            '####.p.##################.p.####',
            '####...##################...####',
            '##########....####....##########',
            '##########.pp.####.pp.##########',
            '##########....####....##########',
            '################################',
        ],
    },
    water: false,
    blockers: [
        { x: 60, y: 100, r: 120 },
        { x: 60, y: 330, r: 105 },
        { x: 60, y: 560, r: 110 },
        { x: 70, y: 680, r: 105 },
        { x: 1215, y: 100, r: 120 },
        { x: 1215, y: 330, r: 105 },
        { x: 1215, y: 560, r: 110 },
        { x: 1210, y: 680, r: 105 },
        { x: 250, y: 690, r: 110 },
        { x: 1010, y: 690, r: 120 },
        { x: 300, y: 120, r: 95 },
        { x: 985, y: 120, r: 95 },
    ],
    decorations: [
        // Obsidian-pillar ring + end crystals around the central exit.
        { type: 'obsidian_pillar', x: 460, y: 300, seed: 11 },
        { type: 'obsidian_pillar', x: 420, y: 340, seed: 12 },
        { type: 'obsidian_pillar', x: 460, y: 380, seed: 13 },
        { type: 'obsidian_pillar', x: 740, y: 300, seed: 14 },
        { type: 'obsidian_pillar', x: 780, y: 340, seed: 15 },
        { type: 'obsidian_pillar', x: 740, y: 380, seed: 16 },
        { type: 'end_crystal_decor', x: 700, y: 300, seed: 21 },
        { type: 'end_crystal_decor', x: 700, y: 380, seed: 22 },
        { type: 'end_crystal_decor', x: 460, y: 340, seed: 23 },
        { type: 'end_crystal_decor', x: 740, y: 340, seed: 24 },
        // Six outer islands riding the spiral arms.
        { type: 'end_pillar', x: 300, y: 180, seed: 31 },
        { type: 'chorus_plant', x: 260, y: 220, seed: 32 },
        { type: 'end_pillar', x: 900, y: 220, seed: 33 },
        { type: 'chorus_plant', x: 940, y: 260, seed: 34 },
        { type: 'end_pillar', x: 220, y: 460, seed: 35 },
        { type: 'chorus_plant', x: 180, y: 500, seed: 36 },
        { type: 'end_pillar', x: 1060, y: 460, seed: 37 },
        { type: 'chorus_plant', x: 1100, y: 500, seed: 38 },
        { type: 'end_pillar', x: 460, y: 620, seed: 41 },
        { type: 'chorus_plant', x: 420, y: 580, seed: 42 },
        { type: 'end_pillar', x: 780, y: 620, seed: 43 },
        { type: 'chorus_plant', x: 820, y: 660, seed: 44 },
        // Deep-void corners.
        { type: 'end_pillar', x: 60, y: 60, seed: 51 },
        { type: 'obsidian_pillar', x: 1220, y: 60, seed: 52 },
        { type: 'end_pillar', x: 60, y: 660, seed: 53 },
        { type: 'obsidian_pillar', x: 1220, y: 660, seed: 54 },
        { type: 'chorus_plant', x: 180, y: 340, seed: 55 },
        { type: 'chorus_plant', x: 1180, y: 340, seed: 56 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'end',
};
