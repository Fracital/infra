// Nether Wastes -- advanced, nether biome. A blasted netherrack plain pocked with
// three lava lakes (no-build; the terrain mask zeroes lava tiles). A single soul-
// soil trail serpentines through the SAFE ground between the lakes -- up over the
// central rise, back down -- so the lava lakes carve big holes out of the useful
// build area without ever crossing the trail. Ash drifts (biome ambient).
//
// Layout invariants:
//  - Lava lakes sit in the top-left (gx3-9), top-right (gx22-28) and bottom-centre
//    (gx11-19) pockets; every path waypoint AND segment stays on solid netherrack/
//    basalt/soul-soil, never on a lava tile.
//  - Single trail ~1900px: enters x=-40, humps up to the central rise, exits x=1320.
//  - netherrack base with soul-soil trails and basalt lake shores; glowstone veins
//    light two spots. Nether portals frame the entrance and exit; fungi + boulders
//    cluster on the safe corners, all >30px off the trail.

export default {
    id: 'nether_wastes',
    name: 'Nether Wastes',
    biome: 'nether',
    difficulty: 'advanced',
    desc: 'A soul-soil trail threads three lava lakes. Only the rock between builds.',
    paths: [
        {
            waypoints: [
                [-40, 280], [110, 300], [180, 420], [300, 470], [420, 400],
                [470, 250], [560, 170], [680, 200], [760, 300], [820, 440],
                [940, 480], [1060, 420], [1160, 320], [1320, 340],
            ],
        },
    ],
    terrain: {
        legend: {
            'n': 'netherrack',
            's': 'soul_soil',
            'b': 'basalt',
            'L': 'lava',
            'G': 'glowstone',
        },
        rows: [
            'nbnnnnbnbnnnsnnnnnnnsnnnnnnnnnsb',
            'nnnnbbbbbnnsnnnnnnbnnnsnbbbbbbnn',
            'nnnbbLLbLbsnnnnbnnnnnsnbLbLLLbnn',
            'nnbLLLLLLLbnnnsnnnnnnsbLLLLLLLbn',
            'nnbbLLLLLbbsnnbnnnnnnnbbLLLLLLbn',
            'snnbLLLLLbbsnsnnnnnbnsbLLLLLLLbn',
            'nnbnbbbbbnnnnssnnsssnnnbbLbLLbnn',
            'snnnnnnnnnnnnssssssnnnnsbbbbbsnn',
            'nnnnnGnnnnnbnsssssssnsnnbnssnnnn',
            'snnbnnnnnnnsnnnssnsnnnnnnnGnnsnn',
            'nnnbnnnsnnnnnnnnsnsnnnnnnbnsbnbb',
            'snsbnnnnsnnbnnbnnnnnsssbsnnnnnnn',
            'snnsnnnnnnbnnbbbbbbbnsnnnsnnnnns',
            'nnnnnsnnnnnnbbbbLLLbbnnnnnnnnnsn',
            'nnnnnnbnnsnbbLLLLLLLLbbnsnbnnnnb',
            'nnnnnnnnnnnbLLLLLLLLLbnsnnbnnnnn',
            'nsnnnnssnsnnbbLLLLLbbbbsssnnnnbn',
            'nnnnbbbnbnsnnbbbbbbbnsnbnnnnnnnn',
        ],
    },
    water: false,
    blockers: [],
    decorations: [
        // Portals frame the trail mouths.
        { type: 'nether_portal', x: 220, y: 640, seed: 11 },
        { type: 'nether_portal', x: 1040, y: 640, seed: 12 },
        { type: 'nether_portal', x: 600, y: 82, seed: 13 },
        // Bottom-left safe corner.
        { type: 'glowstone_cluster', x: 80, y: 560, seed: 21 },
        { type: 'boulder', x: 120, y: 600, seed: 22 },
        { type: 'crimson_fungus', x: 300, y: 660, seed: 23 },
        { type: 'warped_fungus', x: 340, y: 600, seed: 24 },
        // Bottom-right safe corner.
        { type: 'boulder', x: 980, y: 600, seed: 31 },
        { type: 'stalagmite', x: 900, y: 640, seed: 32 },
        { type: 'crimson_fungus', x: 1120, y: 660, seed: 33 },
        { type: 'glowstone_cluster', x: 1200, y: 560, seed: 34 },
        // Around the central rise (either side of the hump peak).
        { type: 'glowstone_cluster', x: 500, y: 110, seed: 41 },
        { type: 'warped_fungus', x: 640, y: 62, seed: 42 },
        { type: 'boulder', x: 720, y: 120, seed: 43 },
        // Left basalt shore.
        { type: 'crimson_fungus', x: 60, y: 160, seed: 44 },
        { type: 'boulder', x: 400, y: 120, seed: 45 },
        { type: 'boulder', x: 100, y: 360, seed: 46 },
        { type: 'crimson_fungus', x: 60, y: 420, seed: 47 },
        // Right basalt shore.
        { type: 'warped_fungus', x: 840, y: 160, seed: 51 },
        { type: 'glowstone_cluster', x: 860, y: 240, seed: 52 },
        { type: 'boulder', x: 1180, y: 240, seed: 53 },
        { type: 'stalagmite', x: 1240, y: 420, seed: 54 },
        { type: 'glowstone_cluster', x: 1280, y: 300, seed: 55 },
        // Lone spire between the humps.
        { type: 'stalagmite', x: 640, y: 360, seed: 56 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'nether',
};
