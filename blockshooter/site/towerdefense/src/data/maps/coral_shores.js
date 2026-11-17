// Coral Shores -- intermediate, coral biome. A half-water map: a sand shelf
// across the top is the only dry ground, and a warm turquoise lagoon fills the
// bottom two-thirds with a deep central channel. The path enters on the sand,
// dives down along the west shoreline and out across the shallows -- so most of
// its run has open water within a stone's throw, which is exactly where the
// Guardian wants to sit. Coral fans and sea pickles dress the shore and reef.
//
// water: true -- every 'w'/'W' tile is a water build zone (mask 2). The deep
// channel ('W') gives the Guardian its home; the shallows around the sandy
// point and the SE flat give it plenty of legal footing near the lane.

export default {
    id: 'coral_shores',
    name: 'Coral Shores',
    biome: 'coral',
    difficulty: 'intermediate',
    desc: 'Half sand, half lagoon. The deep channel is Guardian country.',
    paths: [
        {
            waypoints: [
                [-40, 90], [120, 110], [240, 90], [360, 130], [470, 190],
                [430, 300], [360, 400], [400, 470], [520, 500], [640, 470],
                [720, 380], [700, 270], [780, 190], [900, 150], [1030, 200],
                [1080, 320], [1140, 430], [1200, 520], [1260, 600], [1320, 640],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'sand',
            ',': 'coral_pink',
            's': 'sandstone',
            'w': 'water',
            'W': 'water_deep',
        },
        rows: [
            '......,....................,....',
            '.............,....,..,..........',
            '..,.....,,,........,,......,.,..',
            '..................,..,...,......',
            '...,....ss.sss,ssss,ss...,......',
            '..ssss,sssssswswssssss,wsssssss.',
            'sssswwwwwwwwwwwwwwwwwwwwww,sws,s',
            'ssswwwwwwwwwwwwwwwwwwwwwwssswwws',
            'swwwwwwwwwwwwwwwwwwwwwwwssssswww',
            'wwwwwwwwwsssswwwwwwWWWWwW,sswwww',
            'wwwwwwwwsssssswWWWWWWWWWWWWWWwww',
            'wwwwwwwsss,sssWWWWWWWWWWWWWWWWWw',
            'wwwwwwWss,,ss,WWWWWWWWWWWWWWWWWW',
            'wwwWWWWWW,ssWWWWWWWWWWWWWWWWWWWW',
            'wwWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
            'sWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
            'ssWWWWWWWWWWWwwwWWWWWWWWWWWWWWss',
            'wswWWWWWWWWWs,s,w,WWsWWswWsssssw',
        ],
    },
    water: true,
    blockers: [],
    decorations: [
        // Dry sand shelf along the top -- the land build zone.
        { type: 'boulder', x: 60, y: 45, seed: 1 },
        { type: 'coral_fan', x: 160, y: 50, seed: 2 },
        { type: 'sea_pickle', x: 300, y: 48, seed: 3 },
        { type: 'coral_fan', x: 430, y: 58, seed: 4 },
        { type: 'boulder', x: 560, y: 45, seed: 5 },
        { type: 'sea_pickle', x: 660, y: 58, seed: 6 },
        { type: 'coral_fan', x: 830, y: 50, seed: 7 },
        { type: 'boulder', x: 970, y: 46, seed: 8 },
        { type: 'coral_fan', x: 1130, y: 55, seed: 9 },
        { type: 'sea_pickle', x: 1230, y: 62, seed: 10 },
        // West shoreline reef, tucked outside the descending lane.
        { type: 'coral_fan', x: 180, y: 240, seed: 21 },
        { type: 'sea_pickle', x: 240, y: 330, seed: 22 },
        { type: 'coral_fan', x: 210, y: 430, seed: 23 },
        { type: 'boulder', x: 120, y: 300, seed: 24 },
        // The sandy point that juts into the lagoon.
        { type: 'boulder', x: 340, y: 480, seed: 31 },
        { type: 'sea_pickle', x: 300, y: 545, seed: 32 },
        // South-east lagoon flat -- coral gardens in the shallows.
        { type: 'coral_fan', x: 900, y: 450, seed: 41 },
        { type: 'sea_pickle', x: 980, y: 500, seed: 42 },
        { type: 'coral_fan', x: 1000, y: 585, seed: 43 },
        { type: 'sea_pickle', x: 880, y: 550, seed: 44 },
        { type: 'coral_fan', x: 950, y: 625, seed: 45 },
        // Quiet south-west corner.
        { type: 'coral_fan', x: 90, y: 560, seed: 51 },
        { type: 'sea_pickle', x: 150, y: 640, seed: 52 },
        { type: 'boulder', x: 60, y: 470, seed: 53 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
