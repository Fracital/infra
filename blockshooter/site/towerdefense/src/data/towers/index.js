// Tower registry. Filenames and ids are FIXED -- see docs/CONTRACTS.md Appendix A.
import dispenser from './dispenser.js';
import snow_golem from './snow_golem.js';
import tnt_cannon from './tnt_cannon.js';
import blaze_tower from './blaze_tower.js';
import skeleton_sniper from './skeleton_sniper.js';
import trident_sentry from './trident_sentry.js';
import witch_hut from './witch_hut.js';
import enchanter from './enchanter.js';
import guardian from './guardian.js';
import ghast from './ghast.js';
import end_crystal from './end_crystal.js';
import piglin_brute from './piglin_brute.js';
import iron_golem from './iron_golem.js';
import wolf_den from './wolf_den.js';
import crop_farm from './crop_farm.js';
import beacon from './beacon.js';
import brewing_stand from './brewing_stand.js';
import piston_trap from './piston_trap.js';
import lightning_rod from './lightning_rod.js';
import anvil_catapult from './anvil_catapult.js';

export const TOWER_LIST = [
    dispenser, snow_golem, tnt_cannon, blaze_tower, skeleton_sniper,
    trident_sentry, witch_hut, enchanter, guardian, ghast,
    end_crystal, piglin_brute, iron_golem, wolf_den, crop_farm,
    beacon, brewing_stand, piston_trap, lightning_rod, anvil_catapult,
];

export const TOWERS = Object.fromEntries(TOWER_LIST.map((t) => [t.id, t]));
