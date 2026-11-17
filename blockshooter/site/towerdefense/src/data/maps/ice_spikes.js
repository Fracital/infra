// Ice Spikes -- intermediate, ice biome. A frozen switchback across a glacier
// field studded with ice spikes. The gimmick reads on the ground: the path
// crosses four sheets of black ice (speedZones mult 1.15) where mobs SLIDE
// FORWARD, compressing the pack and punishing anyone who spaced their towers
// for normal footing. Snow is the buildable land; the frozen ponds are just
// slick decoration (packed ice is still solid ground you can build on).
//
// Layout: enters left, sweeps along the top glacier shelf, hooks down the
// right into a middle return leg, then a tight lower switchback out the bottom
// right. Ice spikes and spruce cluster on the open snow between the legs.

export default {
    id: 'ice_spikes',
    name: 'Ice Spikes',
    biome: 'ice',
    difficulty: 'intermediate',
    desc: 'Black ice speeds the horde forward. Lead your shots -- they slide.',
    paths: [
        {
            waypoints: [
                [-40, 120], [120, 130], [300, 110], [500, 140], [700, 120],
                [900, 150], [1050, 220], [1030, 330], [880, 360], [680, 340],
                [480, 360], [300, 350], [200, 420], [230, 520], [380, 560],
                [560, 540], [740, 560], [900, 545], [1050, 560], [1150, 630],
                [1320, 660],
            ],
        },
    ],
    terrain: {
        legend: {
            '.': 'snow',
            ',': 'ice',
            'i': 'packed_ice',
        },
        rows: [
            '.,...................,..........',
            '.........,,,i,.,,.....,.....,...',
            '.......,,iiiiii,,...,,.......,..',
            '...,..,,iii,iiii,..,..,.,.......',
            '......,i,iiiiiii,.........,,....',
            '....,.,iii,i,iii,...,.....,.....',
            '.,.,,ii,iiii,i,,.,..,,....,....,',
            '..,iii,i,,,,,,.................,',
            '..,i,,,i,........,......,....,..',
            '..,iiiii,.....,.......,...,...,.',
            '.,.,iii,..,..........,,,,...,...',
            '....,..,..........,,iiiiii,,,,..',
            '....,.,......,..,,iiiiiiiii,.,.,',
            '......,.,.......,iii,ii,iiii,,..',
            '....,..,.......,.,ii,iiiii,,..,.',
            '...,...,,..,......,,iiiii,,.,...',
            '..........,..,......,,,,,.,.,...',
            '.....,,......,.,.....,...,,.....',
        ],
    },
    water: false,
    blockers: [],
    decorations: [
        // Top glacier shelf -- a ridge of ice spikes above the entry sweep.
        { type: 'ice_spike', x: 90, y: 55, seed: 1 },
        { type: 'ice_spike', x: 150, y: 40, seed: 2 },
        { type: 'ice_spike', x: 210, y: 62, seed: 3 },
        { type: 'ice_spike', x: 400, y: 45, seed: 4 },
        { type: 'ice_spike', x: 460, y: 66, seed: 5 },
        { type: 'boulder', x: 620, y: 50, seed: 6 },
        { type: 'ice_spike', x: 800, y: 45, seed: 7 },
        { type: 'spruce_tree', x: 980, y: 55, seed: 8 },
        // Middle snowfield between the top shelf and the return leg.
        { type: 'ice_spike', x: 420, y: 250, seed: 11 },
        { type: 'ice_spike', x: 500, y: 230, seed: 12 },
        { type: 'boulder', x: 620, y: 262, seed: 13 },
        { type: 'ice_spike', x: 760, y: 250, seed: 14 },
        { type: 'spruce_tree', x: 840, y: 230, seed: 15 },
        { type: 'dead_bush', x: 300, y: 250, seed: 16 },
        // Lower snow band between the return leg and the exit sweep.
        { type: 'ice_spike', x: 520, y: 450, seed: 21 },
        { type: 'boulder', x: 640, y: 470, seed: 22 },
        { type: 'ice_spike', x: 760, y: 450, seed: 23 },
        { type: 'spruce_tree', x: 840, y: 462, seed: 24 },
        { type: 'dead_bush', x: 1000, y: 470, seed: 25 },
        // Frozen belly tucked inside the lower switchback.
        { type: 'ice_spike', x: 90, y: 470, seed: 31 },
        { type: 'boulder', x: 130, y: 612, seed: 32 },
        { type: 'ice_spike', x: 90, y: 645, seed: 33 },
        // Right-hand slope past the descent.
        { type: 'spruce_tree', x: 1180, y: 300, seed: 41 },
        { type: 'ice_spike', x: 1230, y: 400, seed: 42 },
        { type: 'boulder', x: 1150, y: 462, seed: 43 },
        { type: 'ice_spike', x: 1250, y: 560, seed: 51 },
    ],
    feature: null,
    portals: [],
    speedZones: [
        { x: 460, y: 150, r: 120, mult: 1.15 },
        { x: 700, y: 345, r: 110, mult: 1.15 },
        { x: 220, y: 380, r: 120, mult: 1.15 },
        { x: 900, y: 545, r: 130, mult: 1.15 },
    ],
    music: 'overworld',
};
