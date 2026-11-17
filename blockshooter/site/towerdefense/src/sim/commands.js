// The single mutation choke point. Headless-safe.
//
// Every gameplay-mutating action is expressed as a COMMAND object {op, ...args}
// and applied through applyCommand(). In solo the runner applies commands
// immediately; in multiplayer the server validates (validateCommand), stamps a
// future tick, broadcasts, and every sim applies the SAME command at the SAME
// tick boundary -> identical state everywhere. encodeCmd/decodeCmd give the
// compact array form used on the wire and in logs.
//
// Wire quantization: placement x/y are quarter-pixel ints (qx = round(x*4),
// applied as qx/4) so two machines agree on the exact placement coordinate.

import { TARGET_MODES } from '../core/constants.js';
import { AbilityRuntime } from './abilities.js';
import { TOWERS } from '../data/towers/index.js';
import { HEROES } from '../data/heroes/index.js';

/** Frozen op-code map (contract Section 1.2 + Appendix W item 1). */
export const OP = Object.freeze({
    START: 0,
    PLACE: 1,
    UPGRADE: 2,
    SELL: 3,
    TARGET: 4,
    HEROLVL: 5,
    ABILITY: 6,
    SEND: 7,
    POINT: 8,
});

/** Resolve a tower/hero def from an id (used only for affordability pricing). */
function _resolveDef(idOrDef) {
    if (idOrDef && typeof idOrDef === 'object') return idOrDef;
    return TOWERS[idOrDef] || HEROES[idOrDef] || null;
}

/** Linear scan for a tower by uid (tower counts are small). */
function _towerByUid(game, uid) {
    const towers = game.towers;
    for (let i = 0; i < towers.length; i++) {
        if (towers[i].uid === uid) return towers[i];
    }
    return null;
}

/** slot -1 means solo / ownership bypass; otherwise the tower must be owned. */
function _ownsOrSolo(tower, slot) {
    return slot === -1 || slot == null || tower.ownerSlot === slot;
}

function _isNum(v) {
    return typeof v === 'number' && isFinite(v);
}

/**
 * Execute one command against a game. Unknown uid / invalid args return
 * {ok:false} and never throw or partially mutate (each underlying game mutator
 * runs its own guards before touching state). Finds towers by uid via a linear
 * scan.
 * @param {*} game
 * @param {{op:number}} cmd
 * @returns {{ok:boolean, reason?:string}}
 */
export function applyCommand(game, cmd) {
    if (!cmd || typeof cmd.op !== 'number') return { ok: false, reason: 'badcmd' };

    switch (cmd.op) {
        case OP.START: {
            const phase = game.state.phase;
            if (phase !== 'idle' && phase !== 'won') return { ok: false, reason: 'phase' };
            game.startRound();
            return { ok: true };
        }
        case OP.PLACE: {
            if (!_isNum(cmd.qx) || !_isNum(cmd.qy)) return { ok: false, reason: 'args' };
            const tower = game.placeTower(cmd.towerId, cmd.qx / 4, cmd.qy / 4);
            if (!tower) return { ok: false, reason: 'place' };
            tower.ownerSlot = cmd.slot;
            return { ok: true };
        }
        case OP.UPGRADE: {
            const t = _towerByUid(game, cmd.uid);
            if (!t) return { ok: false, reason: 'uid' };
            return game.buyUpgrade(t, cmd.path) ? { ok: true } : { ok: false, reason: 'upgrade' };
        }
        case OP.SELL: {
            const t = _towerByUid(game, cmd.uid);
            if (!t) return { ok: false, reason: 'uid' };
            game.sellTower(t);
            return { ok: true };
        }
        case OP.TARGET: {
            const t = _towerByUid(game, cmd.uid);
            if (!t) return { ok: false, reason: 'uid' };
            return game.setTargetMode(t, cmd.mode) ? { ok: true } : { ok: false, reason: 'mode' };
        }
        case OP.HEROLVL: {
            const t = _towerByUid(game, cmd.uid);
            if (!t) return { ok: false, reason: 'uid' };
            return game.buyHeroLevel(t) ? { ok: true } : { ok: false, reason: 'herolvl' };
        }
        case OP.ABILITY: {
            return AbilityRuntime.use(game, cmd.key) ? { ok: true } : { ok: false, reason: 'ability' };
        }
        case OP.POINT: {
            // Mortar retarget (anvil_catapult). Sim-affecting: the tower aims at
            // targetPoint, so this MUST flow through the log or MP would desync.
            if (!_isNum(cmd.qx) || !_isNum(cmd.qy)) return { ok: false, reason: 'args' };
            const t = _towerByUid(game, cmd.uid);
            if (!t) return { ok: false, reason: 'uid' };
            t.targetPoint = { x: cmd.qx / 4, y: cmd.qy / 4 };
            return { ok: true };
        }
        case OP.SEND: {
            // PVP send -- handled by pvpmatch, never against a plain Game.
            return { ok: false, reason: 'pvp' };
        }
        default:
            return { ok: false, reason: 'badcmd' };
    }
}

/**
 * Non-mutating pre-check used by the server before accepting a command. Returns
 * the same shape as applyCommand. Race-prone checks (notably cash) MAY be
 * returned conservatively as ok -- applyCommand's own rejection is the final,
 * deterministic word across all sims.
 * @param {*} game
 * @param {{op:number}} cmd
 * @param {number} slot owning slot, or -1 for solo / ownership bypass
 * @returns {{ok:boolean, reason?:string}}
 */
export function validateCommand(game, cmd, slot) {
    if (!cmd || typeof cmd.op !== 'number') return { ok: false, reason: 'badcmd' };

    switch (cmd.op) {
        case OP.START: {
            const phase = game.state.phase;
            if (phase !== 'idle' && phase !== 'won') return { ok: false, reason: 'phase' };
            return { ok: true };
        }
        case OP.PLACE: {
            if (!_isNum(cmd.qx) || !_isNum(cmd.qy)) return { ok: false, reason: 'args' };
            const def = _resolveDef(cmd.towerId);
            if (!def) return { ok: false, reason: 'bounds' };
            const x = cmd.qx / 4;
            const y = cmd.qy / 4;
            const can = game.canPlaceAt(def, x, y);
            if (!can.ok) return { ok: false, reason: can.reason };
            if (game.state.cash < game.priceFor(def, x, y)) return { ok: false, reason: 'cash' };
            return { ok: true };
        }
        case OP.UPGRADE: {
            const t = _towerByUid(game, cmd.uid);
            if (!t) return { ok: false, reason: 'uid' };
            if (!_ownsOrSolo(t, slot)) return { ok: false, reason: 'owner' };
            const can = t.canUpgrade(cmd.path);
            // Structural rejections are hard; cash is race-prone -> let it pass.
            if (!can.ok && can.reason !== 'cash') return { ok: false, reason: can.reason };
            return { ok: true };
        }
        case OP.SELL: {
            const t = _towerByUid(game, cmd.uid);
            if (!t) return { ok: false, reason: 'uid' };
            if (!_ownsOrSolo(t, slot)) return { ok: false, reason: 'owner' };
            return { ok: true };
        }
        case OP.TARGET: {
            const t = _towerByUid(game, cmd.uid);
            if (!t) return { ok: false, reason: 'uid' };
            if (!_ownsOrSolo(t, slot)) return { ok: false, reason: 'owner' };
            if (TARGET_MODES.indexOf(cmd.mode) === -1) return { ok: false, reason: 'mode' };
            return { ok: true };
        }
        case OP.HEROLVL: {
            const t = _towerByUid(game, cmd.uid);
            if (!t) return { ok: false, reason: 'uid' };
            if (!_ownsOrSolo(t, slot)) return { ok: false, reason: 'owner' };
            if (!t.isHero) return { ok: false, reason: 'nothero' };
            if (t.level >= 20) return { ok: false, reason: 'maxed' };
            return { ok: true };
        }
        case OP.ABILITY: {
            const list = AbilityRuntime.collect(game);
            for (let i = 0; i < list.length; i++) {
                if (list[i].key === cmd.key) {
                    return list[i].ready ? { ok: true } : { ok: false, reason: 'cooldown' };
                }
            }
            return { ok: false, reason: 'ability' };
        }
        case OP.POINT: {
            const t = _towerByUid(game, cmd.uid);
            if (!t) return { ok: false, reason: 'uid' };
            if (!_ownsOrSolo(t, slot)) return { ok: false, reason: 'owner' };
            return { ok: true };
        }
        case OP.SEND: {
            // Structural PVP send validation lives in pvpmatch; accept here.
            return { ok: true };
        }
        default:
            return { ok: false, reason: 'badcmd' };
    }
}

/**
 * Compact array form for the wire and logs. TARGET stores the mode as its index
 * into TARGET_MODES.
 * @param {{op:number}} cmd
 * @returns {Array|null}
 */
export function encodeCmd(cmd) {
    if (!cmd || typeof cmd.op !== 'number') return null;
    switch (cmd.op) {
        case OP.START:   return [OP.START];
        case OP.PLACE:   return [OP.PLACE, cmd.towerId, cmd.qx, cmd.qy, cmd.slot];
        case OP.UPGRADE: return [OP.UPGRADE, cmd.uid, cmd.path];
        case OP.SELL:    return [OP.SELL, cmd.uid];
        case OP.TARGET:  return [OP.TARGET, cmd.uid, TARGET_MODES.indexOf(cmd.mode)];
        case OP.HEROLVL: return [OP.HEROLVL, cmd.uid];
        case OP.ABILITY: return [OP.ABILITY, cmd.key];
        case OP.SEND:    return [OP.SEND, cmd.sendId];
        case OP.POINT:   return [OP.POINT, cmd.uid, cmd.qx, cmd.qy];
        default:         return null;
    }
}

/**
 * Inverse of encodeCmd.
 * @param {Array} arr
 * @returns {{op:number}|null}
 */
export function decodeCmd(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    switch (arr[0]) {
        case OP.START:   return { op: OP.START };
        case OP.PLACE:   return { op: OP.PLACE, towerId: arr[1], qx: arr[2], qy: arr[3], slot: arr[4] };
        case OP.UPGRADE: return { op: OP.UPGRADE, uid: arr[1], path: arr[2] };
        case OP.SELL:    return { op: OP.SELL, uid: arr[1] };
        case OP.TARGET:  return { op: OP.TARGET, uid: arr[1], mode: TARGET_MODES[arr[2]] };
        case OP.HEROLVL: return { op: OP.HEROLVL, uid: arr[1] };
        case OP.ABILITY: return { op: OP.ABILITY, key: arr[1] };
        case OP.SEND:    return { op: OP.SEND, sendId: arr[1] };
        case OP.POINT:   return { op: OP.POINT, uid: arr[1], qx: arr[2], qy: arr[3] };
        default:         return null;
    }
}
