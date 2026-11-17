// Ocean Monument -- advanced, ocean biome. An open sea broken only by prismarine
// monument islands; a single dark-prismarine causeway snakes a vertical serpentine
// across the water. Almost the whole board is water (water: true) so Guardians and
// other water towers dominate, while the two big monument islands are the scarce
// land footing for land towers -- placement is a land/water juggling act.
//
// Layout invariants:
//  - Causeway does three vertical sweeps (columns at x~200 / 600 / 1020) joined by
//    top/bottom runs; enters x=-40, exits x=1320, ~2670px.
//  - The two monument islands (gx7-12 and gx18-23) sit in the pockets BETWEEN the
//    sweeps, so the causeway threads past their shores -- land towers reach the
//    lane, open water flanks it for water towers.
//  - Sea lanterns glow at island cores; coral/sea-pickle/lily reefs dress the
//    shallows. No decoration sits within 30px of the causeway.

export default {
    id: 'ocean_monument',
    name: 'Ocean Monument',
    biome: 'ocean',
    difficulty: 'advanced',
    desc: 'A drowned monument in open sea. The islands are your only dry footing.',
    paths: [
        {
            waypoints: [
                [-40, 140], [180, 160], [220, 380], [180, 560], [320, 620],
                [520, 600], [600, 440], [560, 260], [640, 140], [860, 130],
                [980, 260], [1040, 440], [960, 580], [1080, 620], [1240, 580],
                [1320, 460],
            ],
        },
    ],
    terrain: {
        legend: {
            'W': 'water_deep',
            'w': 'water',
            'P': 'prismarine',
            'D': 'dark_prismarine',
            'L': 'sea_lantern',
        },
        rows: [
            'WWWWWWWWWWWWWwWWWWPPWWWWWWWWWWWW',
            'WWWWWWWWWWWwWWWwPPPWPWWWWWWWPDDw',
            'WWWWWWWWWWWWWWWWWWWwWWWwWWWPPDDW',
            'WWWWWwWWwWWWWWWWWWWWWWWWWWWWPPPW',
            'WWWWWWWWwWWWWWWWWWWWWWWWWwWWWWWW',
            'WWWWWWwWPWWPWWWWWWWWWWwwWWWWWWWW',
            'WWWWWWWWPPPPWwWWWWWWPPWWWWWwWWWW',
            'wWWWWWWPPDDPPWwWWWWPPPPPWWWwwWWW',
            'WPWWWWWWDLDDWWWWWWPDDLDWWWWWWPPw',
            'WLPWWWWPPDDPPWWWWWPDDDDPwwWWPPPP',
            'WPPWwwWWPPPPWwWWWWPPPPPPWWWWPPLP',
            'WWWwWwWWWPPWwWWWWWWPPwPWWWWWPPPP',
            'WwWwWWWWWWWWWWWWWWWWwWWWWWWWWWWw',
            'WWWWWwWWWWWWwWWWwWWwWWWWWWWWwWWW',
            'WPWWWWWWwWWWWWWWWWWWWWWWWWWWWWWW',
            'wDDPWWWwWwWwWWWWWWWWWwWWWWWWWWWW',
            'WDDPWWWWWWWWWWWWWWWwWwwWWWWWWwWW',
            'WPPWWWWWWWWWWWWWWWWWWWWWWWWWWWWw',
        ],
    },
    water: true,
    blockers: [],
    decorations: [
        // Left monument island -- ruined arches and a boulder core, reef shores.
        { type: 'ruined_arch', x: 340, y: 280, seed: 11 },
        { type: 'boulder', x: 420, y: 340, seed: 12 },
        { type: 'coral_fan', x: 300, y: 440, seed: 13 },
        { type: 'sea_pickle', x: 470, y: 420, seed: 14 },
        { type: 'lily_pad', x: 380, y: 468, seed: 15 },
        // Right monument island.
        { type: 'ruined_arch', x: 820, y: 320, seed: 21 },
        { type: 'boulder', x: 760, y: 410, seed: 22 },
        { type: 'coral_fan', x: 900, y: 440, seed: 23 },
        { type: 'sea_pickle', x: 740, y: 300, seed: 24 },
        { type: 'lily_pad', x: 860, y: 468, seed: 25 },
        // Top-left open-water reef.
        { type: 'coral_fan', x: 300, y: 120, seed: 31 },
        { type: 'lily_pad', x: 440, y: 120, seed: 32 },
        { type: 'sea_pickle', x: 380, y: 90, seed: 33 },
        // Bottom-center shallows.
        { type: 'coral_fan', x: 760, y: 660, seed: 34 },
        { type: 'sea_pickle', x: 840, y: 680, seed: 35 },
        { type: 'lily_pad', x: 700, y: 640, seed: 36 },
        // Right edge island.
        { type: 'boulder', x: 1180, y: 400, seed: 41 },
        { type: 'coral_fan', x: 1200, y: 470, seed: 42 },
        { type: 'sea_pickle', x: 1140, y: 360, seed: 43 },
        // Top-right corner reef.
        { type: 'lily_pad', x: 1120, y: 110, seed: 44 },
        { type: 'coral_fan', x: 1220, y: 120, seed: 45 },
        // Bottom-left corner island.
        { type: 'boulder', x: 90, y: 650, seed: 51 },
        { type: 'sea_pickle', x: 140, y: 680, seed: 52 },
        { type: 'coral_fan', x: 60, y: 620, seed: 53 },
        // Left edge reef.
        { type: 'sea_pickle', x: 60, y: 380, seed: 54 },
        { type: 'lily_pad', x: 40, y: 440, seed: 55 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
