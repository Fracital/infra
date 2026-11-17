// Taiga Falls -- intermediate, taiga biome. A snowmelt river runs bank to bank
// across the middle of a spruce forest; the trail fords it twice, dropping south
// over the first ford and climbing back north over the second in a long lazy S.
// The deep channel down the river centre is open water (Guardian country), snow
// dusts both banks, and spruce stands + boulders pack the open north field and
// the southern flat between the ford legs. Snow ambient falls the whole match.

export default {
    id: 'taiga_falls',
    name: 'Taiga Falls',
    biome: 'taiga',
    difficulty: 'intermediate',
    desc: 'A cold river cuts the forest in two. The trail fords it twice.',
    paths: [
        {
            waypoints: [
                [-30, 150], [110, 175], [230, 220], [315, 305], [352, 405],
                [382, 515], [458, 608], [618, 630], [768, 602], [868, 508],
                [930, 400], [960, 300], [1000, 235], [1075, 188], [1180, 172],
                [1310, 195],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'grass',
            ',': 'podzol',
            's': 'snow',
            'w': 'water',
            'W': 'water_deep',
        },
        rows: [
            '................................',
            '................................',
            '..........,.,,..................',
            '.........,,,,,,.......ss........',
            '.........,,,,,,......ssss.......',
            '..........,,,,,,....sssss.......',
            's...ss.s...s...s...s,,,,,,,.sss.',
            'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
            'wWWWWWwWWWWWwWWWWWwWWWWWwWWWWWwW',
            'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
            '.s.sssssss.s..s.s,ss,s,s,ss.ssss',
            '...,,,..........,,,,,,,,,,,.....',
            '...................,,,,,,,......',
            '...................,,,,,,.......',
            '........s.s........,.,,,.,......',
            '.....sssssss............,......s',
            '....ssssssss......,.,,,.,.....ss',
            '...sssssssss......,,,,,,,,......',
        ],
    },
    water: true,
    blockers: [],
    decorations: [
        // North bank, above the entry approach.
        { type: 'spruce_tree', x: 120, y: 92, seed: 11 },
        { type: 'spruce_tree', x: 55, y: 90, seed: 12 },
        { type: 'boulder', x: 205, y: 82, seed: 13 },
        // Open north field between the two fords.
        { type: 'spruce_tree', x: 430, y: 120, seed: 21 },
        { type: 'spruce_tree', x: 520, y: 90, seed: 22 },
        { type: 'spruce_tree', x: 615, y: 140, seed: 23 },
        { type: 'spruce_tree', x: 705, y: 100, seed: 24 },
        { type: 'spruce_tree', x: 800, y: 150, seed: 25 },
        { type: 'spruce_tree', x: 880, y: 108, seed: 26 },
        { type: 'boulder', x: 560, y: 185, seed: 27 },
        { type: 'campfire_decor', x: 655, y: 205, seed: 28 },
        { type: 'ice_spike', x: 760, y: 210, seed: 29 },
        { type: 'spruce_tree', x: 470, y: 225, seed: 30 },
        // North-east corner above the exit climb.
        { type: 'spruce_tree', x: 1120, y: 92, seed: 31 },
        { type: 'spruce_tree', x: 1210, y: 118, seed: 32 },
        { type: 'spruce_tree', x: 1050, y: 78, seed: 33 },
        { type: 'ice_spike', x: 1240, y: 92, seed: 34 },
        // South flat, inside the belly of the S.
        { type: 'spruce_tree', x: 130, y: 460, seed: 41 },
        { type: 'spruce_tree', x: 185, y: 560, seed: 42 },
        { type: 'spruce_tree', x: 90, y: 622, seed: 43 },
        { type: 'boulder', x: 255, y: 650, seed: 44 },
        { type: 'spruce_tree', x: 150, y: 688, seed: 45 },
        { type: 'spruce_tree', x: 605, y: 682, seed: 46 },
        { type: 'campfire_decor', x: 760, y: 662, seed: 47 },
        { type: 'spruce_tree', x: 905, y: 652, seed: 48 },
        { type: 'spruce_tree', x: 1060, y: 600, seed: 49 },
        { type: 'spruce_tree', x: 1170, y: 560, seed: 50 },
        { type: 'boulder', x: 1240, y: 640, seed: 51 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
