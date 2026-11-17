// Mineshaft Maze -- advanced, mineshaft biome. THREE separate tunnel drifts bore
// in from the left rockface and run east to their own exits, each with its own
// cross-cut switchbacks (parallel drifts joined by dog-legs, like a real mine).
// Mobs cycle the three tunnels. Build space is only the thin rock pillars BETWEEN
// the drifts plus the entrance/exit yards -- deliberately scarce for advanced.
//
// Layout invariants:
//  - Path A rides the top band (y 90..190), Path B the middle (y 310..430),
//    Path C the bottom (y 540..660); all three enter x=-40 and exit x=1320.
//  - Each drift is ~1550px; three drifts keep per-path length in the multi-path
//    1400-2400 window.
//  - Stone floor with cobble/gravel rubble veins; oak_plank staging platforms in
//    the two build pillars; mossy cobble damp band down the middle; deepslate
//    marks the rough rock rim/walls. No decoration sits within 30px of any drift.

export default {
    id: 'mineshaft_maze',
    name: 'Mineshaft Maze',
    biome: 'mineshaft',
    difficulty: 'advanced',
    desc: 'Three abandoned drifts bore east through the rock. Cover every mouth.',
    paths: [
        {
            waypoints: [
                [-40, 110], [200, 110], [260, 190], [470, 190], [530, 90],
                [750, 90], [810, 190], [1030, 190], [1090, 110], [1320, 110],
            ],
        },
        {
            waypoints: [
                [-40, 360], [180, 360], [240, 430], [460, 430], [520, 310],
                [740, 310], [800, 430], [1020, 430], [1080, 360], [1320, 360],
            ],
        },
        {
            waypoints: [
                [-40, 610], [200, 610], [260, 540], [470, 540], [530, 660],
                [750, 660], [810, 540], [1030, 540], [1090, 610], [1320, 610],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'stone',
            'c': 'cobble',
            'g': 'gravel',
            'p': 'oak_planks',
            'm': 'mossy_cobble',
            'd': 'deepslate',
        },
        rows: [
            'dddddd..dd.dcddd.ddddddgddc.dddd',
            'ddddddcccgg.g...c...c......g...d',
            'c...c.g.c..g.....ggc.g.c..g.cg..',
            'dc..c..c......gc.........c.c..gd',
            'd.c.cc.c.......gg..c..........cd',
            'pppp..ppppp....c.g....ppp..ppppd',
            'dpppc.ppppp...g.c...cpppp..ppppp',
            'd......gccg..........cc..cc..c..',
            'dg..g..c...c..g.....c.g.g....c.g',
            'd.........m..gg...c.mmmmg...c..c',
            'd........mmmmmm..cgmmmmmm..g...d',
            'c.....c..gmcmm....g.mmcm.c.gg.g.',
            '.....ppp..gg.p.p.p...ccppp.c...c',
            'g.g.gpp.p....ppppp....gp.gpp.c..',
            'd.gg......gc....c....cgg.......d',
            'd..cg..c..c.gg....cg.cgc...g.g..',
            'dg.g..gccc..c..gc....c...cdcdddd',
            '.g.dd..dd...ddc...gdd..ddddddddd',
        ],
    },
    water: false,
    blockers: [],
    decorations: [
        // Entrance yard along the top rock face (above drift A).
        { type: 'lantern', x: 210, y: 48, seed: 11 },
        { type: 'chest', x: 260, y: 52, seed: 12 },
        { type: 'minecart', x: 320, y: 50, seed: 13 },
        { type: 'rail', x: 380, y: 50, seed: 14 },
        { type: 'scaffolding', x: 440, y: 54, seed: 15 },
        // Left build pillar between drifts A and B.
        { type: 'mushroom_red', x: 60, y: 226, seed: 21 },
        { type: 'boulder', x: 100, y: 244, seed: 22 },
        { type: 'mushroom_brown', x: 150, y: 250, seed: 23 },
        // Center staging on the A/B pillar.
        { type: 'rail', x: 620, y: 200, seed: 24 },
        { type: 'scaffolding', x: 672, y: 200, seed: 25 },
        { type: 'minecart', x: 720, y: 204, seed: 26 },
        // Left build pillar between drifts B and C.
        { type: 'mushroom_brown', x: 60, y: 470, seed: 31 },
        { type: 'boulder', x: 104, y: 486, seed: 32 },
        { type: 'fence', x: 160, y: 490, seed: 33 },
        // Center staging on the B/C pillar.
        { type: 'anvil_decor', x: 612, y: 548, seed: 34 },
        { type: 'scaffolding', x: 662, y: 546, seed: 35 },
        { type: 'chest', x: 712, y: 550, seed: 36 },
        // Right build pillars / exit yards.
        { type: 'minecart', x: 1176, y: 236, seed: 41 },
        { type: 'rail', x: 1232, y: 240, seed: 42 },
        { type: 'boulder', x: 1128, y: 250, seed: 43 },
        { type: 'scaffolding', x: 1180, y: 486, seed: 44 },
        { type: 'lantern', x: 1232, y: 490, seed: 45 },
        { type: 'mushroom_brown', x: 1130, y: 470, seed: 46 },
        // Bottom rock face below drift C.
        { type: 'boulder', x: 300, y: 696, seed: 51 },
        { type: 'fence', x: 430, y: 696, seed: 52 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
