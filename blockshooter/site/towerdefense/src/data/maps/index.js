// Map registry. Filenames and ids are FIXED -- see docs/CONTRACTS.md Appendix C.

// Beginner
import plains_creek from './plains_creek.js';
import oak_grove from './oak_grove.js';
import sunflower_flats from './sunflower_flats.js';
import birch_banks from './birch_banks.js';
import village_lane from './village_lane.js';
import pumpkin_patch from './pumpkin_patch.js';
import beach_cove from './beach_cove.js';
import mushroom_meadow from './mushroom_meadow.js';
import cherry_orchard from './cherry_orchard.js';
import river_bend from './river_bend.js';
// Intermediate
import desert_dunes from './desert_dunes.js';
import savanna_ridge from './savanna_ridge.js';
import taiga_falls from './taiga_falls.js';
import swamp_hollow from './swamp_hollow.js';
import jungle_ruins from './jungle_ruins.js';
import mesa_canyon from './mesa_canyon.js';
import ice_spikes from './ice_spikes.js';
import coral_shores from './coral_shores.js';
// Advanced
import dark_forest from './dark_forest.js';
import cave_depths from './cave_depths.js';
import stronghold_halls from './stronghold_halls.js';
import mineshaft_maze from './mineshaft_maze.js';
import ocean_monument from './ocean_monument.js';
import deep_dark from './deep_dark.js';
import nether_wastes from './nether_wastes.js';
// Expert
import crimson_forest from './crimson_forest.js';
import soul_sand_valley from './soul_sand_valley.js';
import basalt_delta from './basalt_delta.js';
import end_islands from './end_islands.js';
import dragons_end from './dragons_end.js';

export const MAP_LIST = [
    plains_creek, oak_grove, sunflower_flats, birch_banks, village_lane,
    pumpkin_patch, beach_cove, mushroom_meadow, cherry_orchard, river_bend,
    desert_dunes, savanna_ridge, taiga_falls, swamp_hollow, jungle_ruins,
    mesa_canyon, ice_spikes, coral_shores,
    dark_forest, cave_depths, stronghold_halls, mineshaft_maze, ocean_monument,
    deep_dark, nether_wastes,
    crimson_forest, soul_sand_valley, basalt_delta, end_islands, dragons_end,
];

export const MAPS = Object.fromEntries(MAP_LIST.map((m) => [m.id, m]));
