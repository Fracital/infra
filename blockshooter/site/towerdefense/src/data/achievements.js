// Achievements. Headless-safe pure data + pure predicates.
//
// Each def: { id, name, desc, icon (single emoji, UI-only), check(profile) }.
// `check` reads the persisted profile shape from core/save.js defaultProfile():
//   profile.stats  -> { kills, cashEarned, towersPlaced, upgradesBought,
//                        roundsCleared, wins, gamesPlayed, highestRound,
//                        abilitiesUsed }
//   profile.medals -> map of '<mapId>:<difficulty>' -> true
// Checks are called on every stat update by gamescreen; they must be cheap,
// total (never throw on a fresh/partial profile), and return a strict boolean.

/**
 * The 10 beginner map ids (CONTRACTS Appendix C), hardcoded so the medal
 * achievement does not depend on importing the map registry.
 * @type {string[]}
 */
const BEGINNER_MAPS = [
    'plains_creek', 'oak_grove', 'sunflower_flats', 'birch_banks', 'village_lane',
    'pumpkin_patch', 'beach_cove', 'mushroom_meadow', 'cherry_orchard', 'river_bend',
];

/** Safe numeric stat read (fresh profiles start every stat at 0). */
function stat(profile, name) {
    const s = profile && profile.stats;
    const v = s ? s[name] : 0;
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** All medal keys ('<mapId>:<difficulty>') as an array. */
function medalKeys(profile) {
    const m = profile && profile.medals;
    return m && typeof m === 'object' ? Object.keys(m) : [];
}

/** Distinct map ids the player has earned any medal on. */
function medaledMapIds(profile) {
    const set = new Set();
    for (const key of medalKeys(profile)) {
        const idx = key.indexOf(':');
        set.add(idx >= 0 ? key.slice(0, idx) : key);
    }
    return set;
}

/**
 * Ordered achievement list (20). Order = display order in the achievements UI.
 * @type {{id:string,name:string,desc:string,icon:string,check:(profile:object)=>boolean}[]}
 */
export const ACHIEVEMENTS = [
    {
        id: 'first_blood', name: 'First Blood', icon: '\u{1F5E1}\u{FE0F}',
        desc: 'Defeat your first mob.',
        check: (p) => stat(p, 'kills') >= 1,
    },
    {
        id: 'pest_control', name: 'Pest Control', icon: '\u{1F41B}',
        desc: 'Defeat 1,000 mobs in total.',
        check: (p) => stat(p, 'kills') >= 1000,
    },
    {
        id: 'exterminator', name: 'Exterminator', icon: '\u{2620}\u{FE0F}',
        desc: 'Defeat 25,000 mobs in total.',
        check: (p) => stat(p, 'kills') >= 25000,
    },
    {
        id: 'block_party', name: 'Block Party', icon: '\u{1F9F1}',
        desc: 'Place 100 towers across all games.',
        check: (p) => stat(p, 'towersPlaced') >= 100,
    },
    {
        id: 'master_builder', name: 'Master Builder', icon: '\u{1F3F0}',
        desc: 'Place 1,000 towers across all games.',
        check: (p) => stat(p, 'towersPlaced') >= 1000,
    },
    {
        id: 'architect', name: 'Architect', icon: '\u{1F527}',
        desc: 'Purchase 250 tower upgrades.',
        check: (p) => stat(p, 'upgradesBought') >= 250,
    },
    {
        id: 'banker', name: 'Banker', icon: '\u{1F4B0}',
        desc: 'Earn 250,000 cash in total.',
        check: (p) => stat(p, 'cashEarned') >= 250000,
    },
    {
        id: 'deep_pockets', name: 'Deep Pockets', icon: '\u{1F48E}',
        desc: 'Earn 1,000,000 cash in total.',
        check: (p) => stat(p, 'cashEarned') >= 1000000,
    },
    {
        id: 'survivor', name: 'Survivor', icon: '\u{1F6E1}\u{FE0F}',
        desc: 'Clear 500 rounds across all games.',
        check: (p) => stat(p, 'roundsCleared') >= 500,
    },
    {
        id: 'long_haul', name: 'The Long Haul', icon: '\u{1F3C3}',
        desc: 'Clear 5,000 rounds across all games.',
        check: (p) => stat(p, 'roundsCleared') >= 5000,
    },
    {
        id: 'first_win', name: 'Victory Royale', icon: '\u{1F3C6}',
        desc: 'Win your first game.',
        check: (p) => stat(p, 'wins') >= 1,
    },
    {
        id: 'seasoned', name: 'Seasoned Defender', icon: '\u{1F396}\u{FE0F}',
        desc: 'Win 10 games.',
        check: (p) => stat(p, 'wins') >= 10,
    },
    {
        id: 'warlord', name: 'Warlord', icon: '\u{1F451}',
        desc: 'Win 50 games.',
        check: (p) => stat(p, 'wins') >= 50,
    },
    {
        id: 'persistent', name: 'No Quit In Him', icon: '\u{1F3AE}',
        desc: 'Play 100 games (win or lose).',
        check: (p) => stat(p, 'gamesPlayed') >= 100,
    },
    {
        id: 'dragon_slayer', name: 'Dragon Slayer', icon: '\u{1F409}',
        desc: 'Reach round 100.',
        check: (p) => stat(p, 'highestRound') >= 100,
    },
    {
        id: 'endless', name: 'Into the End', icon: '\u{1F30C}',
        desc: 'Reach round 120 in freeplay.',
        check: (p) => stat(p, 'highestRound') >= 120,
    },
    {
        id: 'ability_addict', name: 'Button Masher', icon: '\u{2728}',
        desc: 'Activate tower abilities 100 times.',
        check: (p) => stat(p, 'abilitiesUsed') >= 100,
    },
    {
        id: 'beginner_champ', name: 'Beginner Champion', icon: '\u{1F33B}',
        desc: 'Earn a medal on all 10 beginner maps.',
        check: (p) => {
            const ids = medaledMapIds(p);
            return BEGINNER_MAPS.every((id) => ids.has(id));
        },
    },
    {
        id: 'cartographer', name: 'Cartographer', icon: '\u{1F5FA}\u{FE0F}',
        desc: 'Earn a medal on 20 different maps.',
        check: (p) => medaledMapIds(p).size >= 20,
    },
    {
        id: 'ironclad_legend', name: 'Ironclad Legend', icon: '\u{1F525}',
        desc: 'Earn a medal on Ironclad difficulty.',
        check: (p) => medalKeys(p).some((key) => key.endsWith(':ironclad')),
    },
];
