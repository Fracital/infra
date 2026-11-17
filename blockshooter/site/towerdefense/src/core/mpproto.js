// Shared multiplayer protocol constants + pure helpers. Headless-safe: no
// browser globals, no side effects. Imported by BOTH the client net stack
// (src/net/) and the mp/ server so wire framing and validation never drift
// between the two processes.
//
// docs/MULTIPLAYER_CONTRACTS.md Section 2 is the binding contract this file
// implements.

/**
 * Protocol version. Bump on any breaking wire-shape change -- OR any sim-rules
 * change that alters checksums (v2: PVP send rules -- sent mobs no longer gate
 * rounds, round-scaled send hp, quarter bounty, retuned send table; v3:
 * serialized per-sender send streams, one lane per send group, queue depth 48;
 * v4: camo spiders 380g / unlock r9 -- the r6 camo rush dominated everything;
 * v5: boss-send hp scaling capped at x2 -- an uncapped late wither was a
 * banked win-button no defense could answer).
 * A stale cached client must be rejected at hello, not allowed to desync-loop.
 */
export const MP_PROTOCOL = 5;

/** Simulation tick rate. Matches src/core/constants.js SIM_DT (1/60). */
export const TICK_RATE = 60;

/** Server sends an unprompted `tick` sync message every N ticks (also on speed/pause edges). */
export const TICKS_PER_TICKSYNC = 120;

/** Accepted commands are stamped for execution at serverTick + this many ticks. */
// 8 ticks = 133ms from server-accept to execution. Combined with the client
// running CLIENT_LAG_TICKS behind, a local action lands in ~200ms real time --
// the visible remainder is covered by the client's pending-prediction layer.
export const CMD_LEAD_TICKS = 8;

/** Client sim target tick = estimated server tick minus this many ticks. */
export const CLIENT_LAG_TICKS = 4;

/** Clients report a state checksum every N ticks crossed. */
export const CHECKSUM_EVERY_TICKS = 600;

/** Shared field-length / room-size limits. */
export const LIMITS = Object.freeze({
    name: [3, 16],
    chatLen: 200,
    roomName: 24,
    maxPlayers: 4,
    maxSpectators: 8,
    partyCode: 6,
});

/**
 * Frozen string constants for every `t:` message type on the wire
 * (docs/MULTIPLAYER_CONTRACTS.md Section 5). `PING` is not explicitly
 * bulleted in Section 5's lists but is required by the heartbeat mechanism
 * described in Section 3.4 (server pings, client replies `pong`), so it is
 * included here too -- both sides need the same constant.
 */
export const MSG = Object.freeze({
    // client -> server
    HELLO: 'hello',
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    SPECTATE: 'spectate',
    LEAVE_ROOM: 'leave_room',
    READY: 'ready',
    CHECKSUM: 'checksum',
    VOTE_PAUSE: 'vote_pause',
    VOTE_SPEED: 'vote_speed',
    PVP_QUEUE: 'pvp_queue',
    RESYNC_REQ: 'resync_req',
    PONG: 'pong',
    // server -> client
    WELCOME: 'welcome',
    ERROR: 'error',
    ROOM_STATE: 'room_state',
    MATCH_START: 'match_start',
    TICK: 'tick',
    CHECKSUM_ACK: 'checksum_ack',
    RESYNC: 'resync',
    SYSTEM: 'system',
    MATCH_END: 'match_end',
    PVP_MATCHED: 'pvp_matched',
    CURSOR: 'cursor',
    PING: 'ping',
    // both directions (identical string either way)
    CMD: 'cmd',
    CHAT: 'chat',
});

/**
 * Quarter-pixel wire quantization for placement/cursor coordinates
 * (Section 1.2): `qx/qy` are ints, dequantize with `/4`.
 * @param {number} x
 * @param {number} y
 * @returns {{qx: number, qy: number}}
 */
export function quantXY(x, y) {
    return { qx: Math.round(x * 4), qy: Math.round(y * 4) };
}

const NAME_CHARS_RE = /^[A-Za-z0-9_\- ]*$/;
const NAME_HAS_ALNUM_RE = /[A-Za-z0-9]/;

/**
 * Validate a player/room display name: LIMITS.name[0]-LIMITS.name[1] chars of
 * [A-Za-z0-9_- ], no leading/trailing space, must contain at least one
 * letter or digit.
 * @param {*} s
 * @returns {boolean}
 */
export function validName(s) {
    if (typeof s !== 'string') return false;
    const [min, max] = LIMITS.name;
    if (s.length < min || s.length > max) return false;
    if (!NAME_CHARS_RE.test(s)) return false;
    if (s.charAt(0) === ' ' || s.charAt(s.length - 1) === ' ') return false;
    if (!NAME_HAS_ALNUM_RE.test(s)) return false;
    return true;
}
