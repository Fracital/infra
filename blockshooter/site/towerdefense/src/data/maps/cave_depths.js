// Cave Depths -- advanced, cave biome. A stone cavern threaded by a single
// serpentine lane that doubles back on itself four times. Three still pools of
// deep water ('W', mask 2) sit right against the lane -- water: true, so the
// Guardian can be dropped into any of them and cover a fold of the track.
//
// Scarcity comes from the rock itself: stalagmites (solid decorations, they
// block their footprint) and a handful of author-placed blocker columns choke
// the pockets between folds, so the roomy-looking centre is mostly unbuildable
// spikes. Glowstone clusters are the only real light, salted along the pools
// and the pockets you actually want to build in.

export default {
    id: 'cave_depths',
    name: 'Cave Depths',
    biome: 'cave',
    difficulty: 'advanced',
    desc: 'A pillared cavern of stalagmites and still pools. Tight footing.',
    paths: [
        {
            waypoints: [
                [-40, 150], [120, 160], [230, 120], [320, 200], [300, 320],
                [210, 400], [230, 510], [360, 570], [510, 560], [600, 460],
                [560, 350], [650, 270], [800, 260], [900, 350], [880, 470],
                [980, 560], [1120, 560], [1200, 450], [1160, 330], [1240, 240],
                [1320, 230],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'stone',
            ',': 'deepslate',
            'c': 'cobble',
            'm': 'mossy_cobble',
            'W': 'water_deep',
            'g': 'glowstone',
        },
        rows: [
            'c.m....c...,.c..c....m.,.....,..',
            '.,m,.mc......,m.......c,..,,,,,,',
            ',...c...,......cc.c.g.m,.,c,,..c',
            'c.c.,mWWWWg..cc.......c,...,..c.',
            '..c.WWWWWWWg.,......,.,..,..c,..',
            '..cWWWWWWWW,.m...mm........c...c',
            ',.,cWWWWWWW........,......,c..c.',
            'cm.,WWWWWW...cc...,m...,m..cc...',
            '...mg.....,c..,..c...,,c,WW,.c..',
            'c,.m.,.m...c.....m....WWWWWgWmc.',
            '..m.,...cm....c.cc...WWWWWWWWW,.',
            ',.g...c.c..c.,m....c,WWWWWWWWW..',
            'm.,c...,..mm....c,,ccWWWWWWWWW,.',
            '.......,.....cWWW.....gWWWWW.,..',
            '...c.,.......WWWWW.,...m.W.cc...',
            '.m...c..,.,.WWWWWWW..,.,.c...m..',
            ',.,.,.,c,.,,WgWWWW.m..c,c.....,.',
            '..,......c.,,.WWWc.m..,.m.c.....',
        ],
    },
    water: true,
    blockers: [
        { x: 470, y: 380, r: 34 },
        { x: 1100, y: 430, r: 30 },
        { x: 700, y: 600, r: 32 },
    ],
    decorations: [
        // Cavern ceiling drip line along the top.
        { type: 'stalagmite', x: 90, y: 60, seed: 1 },
        { type: 'glowstone_cluster', x: 180, y: 55, seed: 2 },
        { type: 'stalagmite', x: 420, y: 70, seed: 3 },
        { type: 'boulder', x: 520, y: 55, seed: 4 },
        { type: 'stalagmite', x: 560, y: 80, seed: 5 },
        { type: 'glowstone_cluster', x: 700, y: 60, seed: 6 },
        { type: 'stalagmite', x: 950, y: 70, seed: 7 },
        { type: 'stalagmite', x: 1050, y: 55, seed: 8 },
        { type: 'glowstone_cluster', x: 1150, y: 60, seed: 9 },
        // Spikes and light around the west fold and its pool.
        { type: 'stalagmite', x: 420, y: 360, seed: 11 },
        { type: 'stalagmite', x: 380, y: 430, seed: 12 },
        { type: 'glowstone_cluster', x: 440, y: 300, seed: 13 },
        { type: 'glowstone_cluster', x: 250, y: 250, seed: 14 },
        { type: 'glowstone_cluster', x: 690, y: 620, seed: 15 },
        { type: 'glowstone_cluster', x: 1060, y: 400, seed: 16 },
        // Central stalagmite stand.
        { type: 'stalagmite', x: 740, y: 370, seed: 21 },
        { type: 'stalagmite', x: 790, y: 420, seed: 22 },
        { type: 'boulder', x: 720, y: 440, seed: 23 },
        { type: 'stalagmite', x: 800, y: 340, seed: 24 },
        // East fold pocket.
        { type: 'stalagmite', x: 1080, y: 430, seed: 31 },
        { type: 'stalagmite', x: 1120, y: 480, seed: 32 },
        { type: 'boulder', x: 1050, y: 480, seed: 33 },
        // Lower corners.
        { type: 'stalagmite', x: 90, y: 560, seed: 41 },
        { type: 'glowstone_cluster', x: 130, y: 640, seed: 42 },
        { type: 'boulder', x: 80, y: 470, seed: 43 },
        { type: 'stalagmite', x: 1050, y: 660, seed: 51 },
        { type: 'glowstone_cluster', x: 900, y: 660, seed: 52 },
    ],
    feature: null,
    portals: [],
    speedZones: [],
    music: 'overworld',
};
