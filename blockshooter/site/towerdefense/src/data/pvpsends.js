// PVP send table (contract Section 7.2). Headless-safe pure data -- no imports.
//
// A "send" spends the sender's cash to push a burst of mobs onto the OPPONENT's
// board and (usually) raises the sender's own income (ecoDelta). Big late-game
// sends carry NEGATIVE ecoDelta -- a devastating attack at the cost of your own
// economy. Mob ids come from CONTRACTS.md Appendix B; unlock is the round the
// sender's board must have reached (currentRound >= unlock) before it is legal.
//
// Entry shape: { mobId, count, spacing, cost, ecoDelta, unlock, opts?, label }
//   count   -- how many mobs the send spawns on the opponent board
//   spacing -- ticks between successive spawns (0 = all at once, e.g. bosses)
//   cost    -- cash debited from the sender on acceptance
//   ecoDelta-- added to the sender's income after acceptance
//   unlock  -- minimum sender currentRound
//   opts    -- spawn modifiers passed straight through spawnMob (e.g. fortified)
//   label   -- display name for the send button UI

/** @typedef {{mobId:string, count:number, spacing:number, cost:number,
 *   ecoDelta:number, unlock:number, opts?:object, label:string}} PvpSendDef */

/**
 * The exact PVP send table (contract Section 7.2). Frozen: read-only data.
 *
 * Balance model (2026-07-15 pass -- the earlier deltas compounded into 50k
 * income by r30 and million-cash stalemates):
 *   - eco payback ~2 min for early sends (delta ~= cost/20), tapering to ~zero
 *     efficiency at the wither_skels tier -- eco is an EARLY game, not a
 *     money printer.
 *   - big bosses cost real money and BURN eco; they are finishers, not spam.
 *   - sent-mob hp scales with the sender's round (pvpmatch SEND_HP_RAMP) and
 *     kills of sent mobs pay quarter bounty, so pressure stays threatening
 *     and does not fund the defender.
 */
export const PVP_SENDS = Object.freeze({
    zombies:        Object.freeze({ mobId: 'zombie',          count: 4, spacing: 24, cost: 40,    ecoDelta: 2,    unlock: 1,  label: 'Zombies' }),
    babies:         Object.freeze({ mobId: 'baby_zombie',     count: 6, spacing: 12, cost: 60,    ecoDelta: 3,    unlock: 1,  label: 'Baby Zombies' }),
    skeletons:      Object.freeze({ mobId: 'skeleton',        count: 4, spacing: 24, cost: 100,   ecoDelta: 4,    unlock: 2,  label: 'Skeletons' }),
    spiders:        Object.freeze({ mobId: 'spider',          count: 4, spacing: 24, cost: 180,   ecoDelta: 6,    unlock: 4,  label: 'Spiders' }),
    // Camo unlocks at r9, not r6: a 280g camo pack on the round players have
    // ~3 towers forced a ~2000g specialized counter nobody can afford yet --
    // a dominant strategy against bots AND humans alike.
    camo_spiders:   Object.freeze({ mobId: 'cave_spider',     count: 4, spacing: 20, cost: 380,   ecoDelta: 7,    unlock: 9,  label: 'Cave Spiders' }),
    creepers:       Object.freeze({ mobId: 'creeper',         count: 3, spacing: 30, cost: 350,   ecoDelta: 8,    unlock: 7,  label: 'Creepers' }),
    slimes:         Object.freeze({ mobId: 'slime_big',       count: 3, spacing: 36, cost: 420,   ecoDelta: 9,    unlock: 9,  label: 'Big Slimes' }),
    phantoms:       Object.freeze({ mobId: 'phantom',         count: 4, spacing: 24, cost: 520,   ecoDelta: 10,   unlock: 11, label: 'Phantoms' }),
    witches:        Object.freeze({ mobId: 'witch',           count: 2, spacing: 48, cost: 650,   ecoDelta: 11,   unlock: 13, label: 'Witches' }),
    endermen:       Object.freeze({ mobId: 'enderman',        count: 3, spacing: 42, cost: 850,   ecoDelta: 12,   unlock: 15, label: 'Endermen' }),
    wither_skels:   Object.freeze({ mobId: 'wither_skeleton', count: 4, spacing: 30, cost: 1200,  ecoDelta: 12,   unlock: 18, label: 'Wither Skeletons' }),
    evokers:        Object.freeze({ mobId: 'evoker',          count: 2, spacing: 60, cost: 1600,  ecoDelta: 12,   unlock: 20, label: 'Evokers' }),
    ravager:        Object.freeze({ mobId: 'ravager',         count: 1, spacing: 0,  cost: 2400,  ecoDelta: 5,    unlock: 22, label: 'Ravager' }),
    ravager_f:      Object.freeze({ mobId: 'ravager',         count: 1, spacing: 0,  cost: 4200,  ecoDelta: 0,    unlock: 26, opts: Object.freeze({ fortified: true }), label: 'Fortified Ravager' }),
    elder_guardian: Object.freeze({ mobId: 'elder_guardian',  count: 1, spacing: 0,  cost: 7000,  ecoDelta: -10,  unlock: 30, label: 'Elder Guardian' }),
    warden:         Object.freeze({ mobId: 'warden',          count: 1, spacing: 0,  cost: 15000, ecoDelta: -60,  unlock: 36, label: 'Warden' }),
    wither:         Object.freeze({ mobId: 'wither',          count: 1, spacing: 0,  cost: 26000, ecoDelta: -120, unlock: 42, label: 'Wither' }),
    ender_dragon:   Object.freeze({ mobId: 'ender_dragon',    count: 1, spacing: 0,  cost: 70000, ecoDelta: -300, unlock: 50, label: 'Ender Dragon' }),
});

/** Send ids in table (display) order -- stable ordering for the send-button grid. */
export const PVP_SEND_IDS = Object.freeze([
    'zombies', 'babies', 'skeletons', 'spiders', 'camo_spiders', 'creepers',
    'slimes', 'phantoms', 'witches', 'endermen', 'wither_skels', 'evokers',
    'ravager', 'ravager_f', 'elder_guardian', 'warden', 'wither', 'ender_dragon',
]);
