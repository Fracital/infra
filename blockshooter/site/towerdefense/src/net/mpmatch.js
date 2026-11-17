// Client-side multiplayer match driver (docs/MULTIPLAYER_CONTRACTS.md Section 4).
//
// One MpMatch drives one live multiplayer match on the client. It owns the local
// sim core (a MatchRunner for co-op, or a PvpMatch for Battles), chases the
// authoritative server tick, round-trips every mutating action through the
// server (no optimistic apply), reports state checksums at fixed boundaries,
// rebuilds via chunked replay on resync, and reconnects with backoff on drop.
//
// Headless-safe by construction: it touches no DOM/canvas. The only browser
// surface is the injected MpClient's WebSocket. gamescreen (owner B1) mounts the
// visuals around this driver; mplobby/mphub construct it on `match_start`.
//
// Deterministic-lockstep discipline (Section 0/4): the local sim NEVER applies a
// command directly. Gate methods emit `{t:'cmd'}`; the command mutates the sim
// only when the server's scheduled broadcast comes back and is applied at its
// authoritative tick boundary. This is what keeps every client + the server
// byte-identical.

import { MpClient } from './mpclient.js';
import { MatchRunner } from '../sim/runner.js';
import { OP, encodeCmd, decodeCmd, validateCommand } from '../sim/commands.js';
import { MAPS } from '../data/maps/index.js';
import {
    MSG,
    CLIENT_LAG_TICKS,
    CHECKSUM_EVERY_TICKS,
    quantXY,
} from '../core/mpproto.js';

// Tick-chase catch-up policy (Section 4).
// There is deliberately NO "too far behind -> full resync" trigger: local state
// is still VALID when merely behind, and veil catch-up from the current tick
// costs O(gap) while a full-log replay costs O(whole match) with a moving
// target -- on a slow client that trade is an unrecoverable resync loop (the
// 150-elder-guardian incident). Full-log resync is reserved for actual state
// divergence (checksum mismatch), where local state really is worthless.
const CATCHUP_NORMAL = 30;          // steps/frame in the common case
const CATCHUP_VEIL = 240;           // steps/frame while grinding a big gap
const BEHIND_VEIL = 1800;           // > this many ticks behind -> show the veil

const CURSOR_THROTTLE_MS = 100;     // Section 4: at most every 100 ms
const RESYNC_CHUNK = 2000;          // max ticks resimulated per macrotask on resync
const CHAT_BUFFER = 50;             // Section 4: buffer last 50 chat lines
const RECONNECT_BACKOFF = [1000, 2000, 4000, 8000, 15000];   // Section 4: 1/2/4/8/15 s

// Slot colours mirror mp/cooproom.js PLAYER_COLORS so client + server agree.
const SLOT_COLORS = ['#33ADFF', '#59c93c', '#e8b23a', '#ff5540'];

function _now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function _defer(fn) {
    // A macrotask so the tab (and its render loop) breathes between resync chunks.
    if (typeof setTimeout === 'function') setTimeout(fn, 0);
    else fn();
}

function _slotColor(slot) {
    return SLOT_COLORS[((slot % SLOT_COLORS.length) + SLOT_COLORS.length) % SLOT_COLORS.length] || '#33ADFF';
}

function _maxTick(log) {
    let m = 0;
    for (let i = 0; i < log.length; i++) if (log[i][0] > m) m = log[i][0];
    return m;
}

function _resolveMap(mapId) {
    return MAPS[mapId] || MAPS.plains_creek || MAPS[Object.keys(MAPS)[0]];
}

export class MpMatch {
    /**
     * @param {object} cfg
     * @param {MpClient} cfg.client connected MpClient carrying the lobby socket
     * @param {object} cfg.matchStart the `match_start` payload
     * @param {string} [cfg.code] room code (needed to rejoin on reconnect)
     * @param {object} [cfg.hooks] optional gamescreen callbacks (see below)
     * @param {function():MpClient} [cfg.makeClient] factory for reconnect sockets
     */
    constructor({ client, matchStart, code, hooks = {}, makeClient = null } = {}) {
        const ms = matchStart || {};

        this.client = client || null;
        this.code = code || ms.code || null;
        this.hooks = hooks || {};
        this._makeClient = makeClient || null;

        this.mapId = ms.mapId;
        this.difficulty = ms.difficulty || 'medium';
        this.seed = ms.seed;
        this.modeFlags = ms.modeFlags || {};
        this.mySlot = (typeof ms.mySlot === 'number') ? ms.mySlot : -1;
        this.isSpectator = this.mySlot < 0;
        this.isPvp = !!this.modeFlags.pvp;
        this.players = ms.players || [];
        this.hostSlot = (typeof ms.hostSlot === 'number') ? ms.hostSlot : -1;
        this.roomStatus = 'live';

        // Live UI-facing state (gamescreen polls these each frame).
        this.peers = new Map();     // slot -> {name, color, cursor:{x,y,ts}|null, connected}
        this.chat = [];             // {slot, name, text, ts, system?}
        this.status = 'live';       // 'live'|'reconnecting'|'resyncing'|'ended'|'dead'
        this.paused = false;
        this.speed = 1;
        this.myReady = false;
        this.ended = null;          // match_end result once the match is over
        this.resyncProgress = 0;

        // Verification counters (read by tests).
        this.acks = 0;
        this.badAcks = 0;

        this._core = null;          // MatchRunner (co-op) or PvpMatch (pvp)
        this._ownGame = null;       // the board this client renders (own slot)
        this._pendingCmds = null;   // cmd msgs that arrived before the core existed
        this._lastChecksumTick = 0;
        this._lastCursorSent = 0;
        this._lastCursor = null;
        this._resyncing = false;
        this._catchupVeil = false;
        this._catchupPct = 0;
        this._reconnectAttempt = 0;
        this._reconnectTimer = null;
        this._disposed = false;
        this._handoff = false;
        this._statusListeners = new Set();
        this._unsubs = [];
        this._closeUnsub = null;
        this._connOpts = this._connOptsFrom(client);

        this._initPeers();

        // Subscribe FIRST so no cmd/tick frame is missed between now and the core
        // being ready (relevant for the async PVP path).
        this._subscribe(client);

        // Seed the tick estimator from match_start.serverTick: the MpClient was
        // created back in the lobby, so its estimator's last-arrival timestamp is
        // stale -- without this, the very first update() would read a wildly-ahead
        // "server tick" and needlessly trigger a resync grind. A real `tick`
        // message refines it moments later.
        if (client && typeof client._ingest === 'function') {
            client._ingest({ t: MSG.TICK, tick: ms.serverTick || 0, speed: 1, paused: false });
        }

        this.gate = this._makeGate();

        if (this.isPvp) {
            this._buildPromise = this._buildPvpCore(ms);
        } else {
            this._buildCoopCore(ms);
            this._flushPending();
            this._buildPromise = Promise.resolve();
        }
    }

    // ---------------------------------------------------------------- core

    _buildCoopCore(ms) {
        const mapDef = _resolveMap(ms.mapId);
        const runner = new MatchRunner({
            mapDef,
            difficulty: this.difficulty,
            seed: this.seed,
            modeFlags: this.modeFlags,
            headless: false,
        });
        // Join-in-progress: replay the whole startLog headless, then fast-forward
        // to the server's tick, so the handed-over game is already in lockstep.
        const startLog = ms.startLog || [];
        if (startLog.length) {
            runner.log = startLog.map((r) => r.slice());
            runner._applied = 0;
            const target = Math.max(ms.serverTick || 0, _maxTick(startLog));
            if (target > 0) runner.stepTo(target);
        }
        this._core = runner;
        this._ownGame = runner.game;
        this._seedChecksumCursor();
    }

    async _buildPvpCore(ms) {
        const mapDef = _resolveMap(ms.mapId);
        let PvpMatch;
        try {
            const mod = await import('../sim/pvpmatch.js');
            PvpMatch = mod.PvpMatch || (mod.default && mod.default.PvpMatch);
        } catch (e) {
            // B2's PvpMatch is not present -> this client cannot run the battle.
            this._setStatus('dead');
            return;
        }
        if (this._disposed || !PvpMatch) { if (!PvpMatch) this._setStatus('dead'); return; }

        const core = new PvpMatch({ mapDef, seed: this.seed, difficulty: this.difficulty });
        const startLog = ms.startLog || [];
        for (let i = 0; i < startLog.length; i++) {
            const row = startLog[i];
            const cmd = decodeCmd(row.slice(2));
            if (cmd) { try { core.schedule(row[0], row[1], cmd); } catch (e) { /* ignore */ } }
        }
        const target = Math.max(ms.serverTick || 0, _maxTick(startLog));
        if (target > 0) core.stepTo(target);

        this._core = core;
        this._ownGame = (typeof core.gameFor === 'function') ? core.gameFor(this.mySlot) : core.game;
        this._seedChecksumCursor();
        this._flushPending();
        if (this.hooks.onCoreReady) { try { this.hooks.onCoreReady(this); } catch (e) { /* ignore */ } }
    }

    _seedChecksumCursor() {
        this._lastChecksumTick = Math.floor(this._coreTick() / CHECKSUM_EVERY_TICKS) * CHECKSUM_EVERY_TICKS;
    }

    _flushPending() {
        if (!this._pendingCmds || !this._core) return;
        const pending = this._pendingCmds;
        this._pendingCmds = null;
        for (let i = 0; i < pending.length; i++) this._applyCmdMsg(pending[i]);
    }

    // Unified accessors so the rest of the driver treats co-op + pvp cores alike.
    _coreTick() {
        if (!this._core) return 0;
        return this.isPvp ? this._core.tick : this._core.game.tick;
    }

    _coreChecksum() {
        if (!this._core) return 0;
        return this.isPvp ? this._core.checksum() : this._core.game.checksum();
    }

    /** The Game this client renders (its own board). Null until a pvp core loads. */
    get game() { return this._ownGame; }

    /** Current authoritative sim tick reached locally. */
    get tick() { return this._coreTick(); }

    /** The underlying core (MatchRunner or PvpMatch). */
    get core() { return this._core; }

    /** PVP: the opponent board Game (or null in co-op / before load). */
    oppGame(slot) {
        if (!this.isPvp || !this._core || typeof this._core.oppGame !== 'function') return null;
        return this._core.oppGame(slot != null ? slot : this.mySlot);
    }

    /** PVP: the PvpMatch instance (or null in co-op). */
    get pvp() { return this.isPvp ? this._core : null; }

    /** Resolves once the core is constructed (immediate for co-op). */
    whenReady() { return this._buildPromise; }

    // -------------------------------------------------------------- stepping

    /**
     * Chase the authoritative tick. Call once per render frame. Steps the local
     * sim toward `estimatedServerTick - CLIENT_LAG_TICKS` under the Section 4
     * catch-up caps, reporting checksums at every boundary crossed.
     * @param {number} [nowMs] performance.now()-domain timestamp (test seam)
     */
    update(nowMs) {
        if (this._disposed || !this._core) return;
        if (this.status === 'reconnecting' || this.status === 'dead') return;
        if (this._resyncing) return;   // a chunked replay owns the core right now

        const now = (typeof nowMs === 'number') ? nowMs : _now();
        const est = this.client ? this.client.estimatedTick(now) : this._coreTick();
        const safeTarget = Math.floor(est - CLIENT_LAG_TICKS);
        const cur = this._coreTick();
        const behind = safeTarget - cur;

        if (behind <= 0) { this._catchupVeil = false; return; }

        let cap = CATCHUP_NORMAL;
        if (behind > BEHIND_VEIL) {
            cap = CATCHUP_VEIL;
            this._catchupVeil = true;
            this._catchupPct = safeTarget > 0 ? Math.min(1, cur / safeTarget) : 0;
        } else {
            this._catchupVeil = false;
        }

        const stepTarget = Math.min(safeTarget, cur + cap);
        this._stepToWithChecksums(stepTarget);
    }

    _stepToWithChecksums(target) {
        const core = this._core;
        let cur = this._coreTick();
        while (cur < target) {
            const nextBoundary = (Math.floor(cur / CHECKSUM_EVERY_TICKS) + 1) * CHECKSUM_EVERY_TICKS;
            const stepTarget = Math.min(nextBoundary, target);
            const before = cur;
            core.stepTo(stepTarget);
            cur = this._coreTick();
            // A finished match (PvpMatch sets .result and refuses to advance)
            // must NEVER wedge this loop -- that froze the page on victory.
            if (cur === before) break;
            // Compute-and-queue the checksum AT the boundary (not later), so it is
            // taken against the exact same state the server hashed.
            if (cur === nextBoundary && cur > this._lastChecksumTick) {
                this._lastChecksumTick = cur;
                this._send({ t: MSG.CHECKSUM, tick: cur, hash: this._coreChecksum() });
            }
        }
    }

    // ----------------------------------------------------------------- gate

    // The gate every UI mutation goes through (Section 1.4). Each method emits a
    // `cmd` and returns a best-effort local pre-check so the UI can give instant
    // feedback -- but nothing mutates the sim here; the server's broadcast does.
    _makeGate() {
        return {
            place: (towerId, x, y) => {
                const q = quantXY(x, y);
                return this._sendCmd({ op: OP.PLACE, towerId, qx: q.qx, qy: q.qy, slot: this.mySlot });
            },
            upgrade: (uid, path) => this._sendCmd({ op: OP.UPGRADE, uid, path }),
            sell: (uid) => this._sendCmd({ op: OP.SELL, uid }),
            target: (uid, mode) => this._sendCmd({ op: OP.TARGET, uid, mode }),
            heroLvl: (uid) => this._sendCmd({ op: OP.HEROLVL, uid }),
            ability: (key) => this._sendCmd({ op: OP.ABILITY, key }),
            point: (uid, x, y) => {
                const q = quantXY(x, y);
                return this._sendCmd({ op: OP.POINT, uid, qx: q.qx, qy: q.qy });
            },
            // PVP send button.
            send: (sendId) => this._sendCmd({ op: OP.SEND, sendId }),
            // Co-op START is server-authoritative: the button is a ready toggle.
            start: () => this._doStart(),
        };
    }

    _sendCmd(cmd) {
        if (this.isSpectator) return { ok: false, reason: 'spectator' };
        const enc = encodeCmd(cmd);
        if (!enc) return { ok: false, reason: 'badcmd' };

        // Local pre-check: purely advisory UI feedback. The authoritative sim is
        // the server's; its broadcast is what actually applies the command.
        let pre = { ok: true };
        if (this._ownGame && cmd.op !== OP.SEND) {
            try { pre = validateCommand(this._ownGame, cmd, this.mySlot); } catch (e) { pre = { ok: true }; }
        }

        this._send({ t: MSG.CMD, c: enc });
        return pre;
    }

    _doStart() {
        if (this.isSpectator) return { ok: false, reason: 'spectator' };
        if (this.isPvp) return { ok: false, reason: 'pvp-auto' };   // pvp rounds auto-fire
        this.setReady(!this.myReady);
        return { ok: true };
    }

    /** Toggle/set the co-op ready vote (also advances rounds mid-match). */
    setReady(ready) {
        if (this.isSpectator) return;
        this.myReady = !!ready;
        this._send({ t: MSG.READY, ready: this.myReady });
    }

    /** Cast a pause vote (any player's vote pauses; any resume resumes). */
    votePause(paused) {
        if (this.isSpectator) return;
        this._send({ t: MSG.VOTE_PAUSE, paused: !!paused });
    }

    /** Cast a speed vote (1 or 3). */
    voteSpeed(mult) {
        if (this.isSpectator) return;
        this._send({ t: MSG.VOTE_SPEED, speed: mult === 3 ? 3 : 1 });
    }

    /** Broadcast a chat line. */
    sendChat(text) {
        if (typeof text !== 'string') return;
        if (!text.trim()) return;
        this._send({ t: MSG.CHAT, text: text.slice(0, 200) });
    }

    /** Relay the local cursor (quarter-px, throttled to CURSOR_THROTTLE_MS). */
    sendCursor(x, y) {
        if (this.isSpectator) return;
        const now = _now();
        if (now - this._lastCursorSent < CURSOR_THROTTLE_MS) return;
        const q = quantXY(x, y);
        if (this._lastCursor && this._lastCursor.qx === q.qx && this._lastCursor.qy === q.qy) return;
        this._lastCursor = q;
        this._lastCursorSent = now;
        this._send({ t: MSG.CURSOR, qx: q.qx, qy: q.qy });
    }

    /** Ask the server for a full-log resync. */
    requestResync() {
        if (this._resyncing) return;
        this._send({ t: MSG.RESYNC_REQ });
    }

    _send(obj) {
        if (this.client) this.client.send(obj);
    }

    // ------------------------------------------------------------ ready votes

    /** @returns {{ready:number, total:number}} connected-player ready tally. */
    readyVotes() {
        let ready = 0;
        let total = 0;
        for (const p of this.players) {
            if (p.connected === false) continue;
            total++;
            if (p.ready) ready++;
        }
        return { ready, total };
    }

    // ---------------------------------------------------------------- veil

    isVeilActive() { return this._resyncing || this._catchupVeil; }
    veilPct() { return this._resyncing ? this.resyncProgress : this._catchupPct; }
    veilLabel() { return this._resyncing ? 'Resyncing' : 'Catching up'; }

    // ------------------------------------------------------------- listeners

    _subscribe(client) {
        if (!client || typeof client.on !== 'function') return;
        const on = (t, fn) => { this._unsubs.push(client.on(t, fn)); };
        on(MSG.CMD, (m) => this._onCmd(m));
        on(MSG.TICK, (m) => this._onTickMsg(m));
        on(MSG.CHECKSUM_ACK, (m) => this._onChecksumAck(m));
        on(MSG.RESYNC, (m) => this._onResync(m));
        on(MSG.CHAT, (m) => this._onChat(m));
        on(MSG.SYSTEM, (m) => this._onSystem(m));
        on(MSG.CURSOR, (m) => this._onCursor(m));
        on(MSG.ROOM_STATE, (m) => this._onRoomState(m));
        on(MSG.MATCH_END, (m) => this._onMatchEnd(m));
        on(MSG.MATCH_START, (m) => this._onMatchStartAgain(m));
        if (typeof client.onClose === 'function') {
            this._closeUnsub = client.onClose(() => this._onClose());
        }
    }

    _teardownClient() {
        for (const u of this._unsubs) { try { u(); } catch (e) { /* ignore */ } }
        this._unsubs = [];
        if (this._closeUnsub) { try { this._closeUnsub(); } catch (e) { /* ignore */ } this._closeUnsub = null; }
    }

    _onCmd(m) {
        if (!m || !Array.isArray(m.c)) return;
        if (!this._core) { (this._pendingCmds = this._pendingCmds || []).push(m); return; }
        this._applyCmdMsg(m);
    }

    _applyCmdMsg(m) {
        const cmd = decodeCmd(m.c);
        if (!cmd) return;
        // The server stamp is authoritative; do NOT re-validate. schedule() appends
        // the future-tick row and it applies at that boundary in stepTo.
        try { this._core.schedule(m.tick, m.slot, cmd); } catch (e) { /* ignore */ }
    }

    _onTickMsg(m) {
        this.speed = m.speed || 1;
        this.paused = !!m.paused;
        // Estimator arithmetic itself is maintained by MpClient._ingest.
    }

    _onChecksumAck(m) {
        this.acks++;
        if (m && m.ok === false) this.badAcks++;
        if (this.hooks.onChecksumAck) { try { this.hooks.onChecksumAck(m); } catch (e) { /* ignore */ } }
    }

    async _onResync(m) {
        if (this._resyncing || this._disposed) return;
        this._resyncing = true;
        this._setStatus('resyncing');
        this.resyncProgress = 0;

        const cfg = m.cfg || {};
        const mapDef = _resolveMap(cfg.mapId || this.mapId);
        const log = (m.log || []).map((r) => r.slice());
        const target = Math.max(m.serverTick || 0, _maxTick(log));
        const seed = (typeof m.seed === 'number') ? m.seed : this.seed;
        const modeFlags = cfg.modeFlags || this.modeFlags;
        const difficulty = cfg.difficulty || this.difficulty;

        try {
            const fresh = this.isPvp
                ? await this._chunkedReplayPvp({ mapDef, difficulty, seed, log, untilTick: target })
                : await this._chunkedReplayCoop({ mapDef, difficulty, seed, modeFlags, log, untilTick: target });
            if (this._disposed) return;
            if (fresh) {
                this._core = fresh.core;
                this._ownGame = fresh.game;
                this._seedChecksumCursor();
                if (this.hooks.onSwapGame) { try { this.hooks.onSwapGame(this._ownGame); } catch (e) { /* ignore */ } }
            }
        } catch (e) {
            // Keep the old core; a later resync (or the 2-mismatch auto-resync) retries.
        } finally {
            this.resyncProgress = 1;
            this._resyncing = false;
            if (this.status === 'resyncing') this._setStatus('live');
        }
    }

    _chunkedReplayCoop({ mapDef, difficulty, seed, modeFlags, log, untilTick }) {
        return new Promise((resolve, reject) => {
            let runner;
            try {
                runner = new MatchRunner({ mapDef, difficulty, seed, modeFlags, headless: false });
                runner.log = (log || []).map((r) => r.slice());
                runner._applied = 0;
            } catch (e) { reject(e); return; }

            const target = untilTick || 0;
            const step = () => {
                if (this._disposed) { resolve({ core: runner, game: runner.game }); return; }
                const next = Math.min(runner.game.tick + RESYNC_CHUNK, target);
                try { runner.stepTo(next); } catch (e) { reject(e); return; }
                this.resyncProgress = target > 0 ? Math.min(1, runner.game.tick / target) : 1;
                if (runner.game.tick >= target) { resolve({ core: runner, game: runner.game }); return; }
                _defer(step);
            };
            step();
        });
    }

    async _chunkedReplayPvp({ mapDef, difficulty, seed, log, untilTick }) {
        let PvpMatch;
        try {
            const mod = await import('../sim/pvpmatch.js');
            PvpMatch = mod.PvpMatch || (mod.default && mod.default.PvpMatch);
        } catch (e) { throw e; }
        if (!PvpMatch) throw new Error('pvpmatch unavailable');

        const core = new PvpMatch({ mapDef, seed, difficulty });
        for (let i = 0; i < (log || []).length; i++) {
            const row = log[i];
            const cmd = decodeCmd(row.slice(2));
            if (cmd) { try { core.schedule(row[0], row[1], cmd); } catch (e) { /* ignore */ } }
        }
        return await new Promise((resolve, reject) => {
            const target = untilTick || 0;
            const step = () => {
                if (this._disposed) { resolve(this._pvpResult(core)); return; }
                const next = Math.min(core.tick + RESYNC_CHUNK, target);
                try { core.stepTo(next); } catch (e) { reject(e); return; }
                this.resyncProgress = target > 0 ? Math.min(1, core.tick / target) : 1;
                if (core.tick >= target) { resolve(this._pvpResult(core)); return; }
                _defer(step);
            };
            step();
        });
    }

    _pvpResult(core) {
        const game = (typeof core.gameFor === 'function') ? core.gameFor(this.mySlot) : core.game;
        return { core, game };
    }

    _onChat(m) {
        const entry = { slot: m.slot, name: m.name, text: m.text, ts: _now() };
        this._pushChat(entry);
    }

    _onSystem(m) {
        this._pushChat({ slot: -1, name: '', text: m.text, ts: _now(), system: true });
    }

    _pushChat(entry) {
        this.chat.push(entry);
        if (this.chat.length > CHAT_BUFFER) this.chat.shift();
        if (this.hooks.onChat) { try { this.hooks.onChat(entry); } catch (e) { /* ignore */ } }
    }

    _onCursor(m) {
        if (m.slot === this.mySlot) return;
        let peer = this.peers.get(m.slot);
        if (!peer) {
            peer = { name: 'Player ' + (m.slot + 1), color: _slotColor(m.slot), cursor: null, connected: true };
            this.peers.set(m.slot, peer);
        }
        peer.cursor = { x: m.qx / 4, y: m.qy / 4, ts: _now() };
    }

    _onRoomState(m) {
        this.players = m.players || [];
        this.hostSlot = (typeof m.hostSlot === 'number') ? m.hostSlot : this.hostSlot;
        this.roomStatus = m.status || this.roomStatus;
        for (const p of this.players) {
            if (p.slot === this.mySlot) { this.myReady = !!p.ready; continue; }
            let peer = this.peers.get(p.slot);
            if (!peer) {
                peer = { name: p.name, color: p.color || _slotColor(p.slot), cursor: null, connected: !!p.connected };
                this.peers.set(p.slot, peer);
            } else {
                peer.name = p.name || peer.name;
                peer.color = p.color || peer.color;
                peer.connected = !!p.connected;
            }
        }
        if (this.hooks.onRoomState) { try { this.hooks.onRoomState(m); } catch (e) { /* ignore */ } }
    }

    _onMatchEnd(m) {
        this.ended = (m && m.result) || null;
        this._setStatus('ended');
        if (this.hooks.onMatchEnd) { try { this.hooks.onMatchEnd(this.ended); } catch (e) { /* ignore */ } }
    }

    // A fresh match_start only reaches an existing MpMatch after a reconnect
    // (the initial one is consumed by the lobby before this object exists).
    // Treat it as a resync from the handed-over startLog.
    _onMatchStartAgain(m) {
        if (!m || this._disposed) return;
        if (typeof m.mySlot === 'number') {
            this.mySlot = m.mySlot;
            this.isSpectator = this.mySlot < 0;
        }
        this._onResync({
            seed: m.seed,
            cfg: { mapId: m.mapId, difficulty: m.difficulty, modeFlags: m.modeFlags },
            log: m.startLog || [],
            serverTick: m.serverTick || 0,
        });
    }

    // ----------------------------------------------------------- reconnect

    _onClose() {
        if (this._disposed || this._handoff) return;
        if (this.status === 'ended') return;
        this._setStatus('reconnecting');
        this._scheduleReconnect();
    }

    _scheduleReconnect() {
        if (this._disposed) return;
        if (!this._makeClient && !this._connOpts) { this._setStatus('dead'); return; }
        if (this._reconnectAttempt >= RECONNECT_BACKOFF.length) { this._setStatus('dead'); return; }
        const delay = RECONNECT_BACKOFF[this._reconnectAttempt++];
        this._reconnectTimer = setTimeout(() => this._attemptReconnect(), delay);
        if (this._reconnectTimer && typeof this._reconnectTimer.unref === 'function') this._reconnectTimer.unref();
    }

    async _attemptReconnect() {
        if (this._disposed) return;
        let client;
        try {
            client = this._makeClient ? this._makeClient() : new MpClient(this._connOpts);
            await client.connect();
        } catch (e) {
            this._scheduleReconnect();
            return;
        }
        if (this._disposed) { try { client.close(); } catch (e) { /* ignore */ } return; }

        this._teardownClient();
        this.client = client;
        this._connOpts = this._connOptsFrom(client);
        this._subscribe(client);
        this._reconnectAttempt = 0;
        this._setStatus('live');
        // Rejoin the room; the server treats a matching identity as join-in-progress
        // and replies with a fresh match_start (-> _onMatchStartAgain resyncs us).
        if (this.code) client.send({ t: MSG.JOIN_ROOM, code: this.code });
    }

    _connOptsFrom(client) {
        if (!client) return null;
        return { url: client._url, name: client._name, token: client._token };
    }

    // -------------------------------------------------------------- status

    /**
     * Register a connection-status listener. Fires immediately with the current
     * status and on every change ('live'|'reconnecting'|'resyncing'|'ended'|'dead').
     * @param {function(string)} fn
     * @returns {function()} unsubscribe
     */
    onStatus(fn) {
        this._statusListeners.add(fn);
        try { fn(this.status); } catch (e) { /* ignore */ }
        return () => this._statusListeners.delete(fn);
    }

    _setStatus(st) {
        if (this.status === st) return;
        this.status = st;
        for (const fn of [...this._statusListeners]) { try { fn(st); } catch (e) { /* ignore */ } }
        if (this.hooks.onStatus) { try { this.hooks.onStatus(st); } catch (e) { /* ignore */ } }
    }

    // -------------------------------------------------------------- peers

    _initPeers() {
        for (const p of this.players) {
            if (p.slot === this.mySlot) continue;
            this.peers.set(p.slot, {
                name: p.name,
                color: p.color || _slotColor(p.slot),
                cursor: null,
                connected: p.connected !== false,
            });
        }
    }

    // ------------------------------------------------------------- teardown

    /** Send a leave and close the socket (quitting the match entirely). */
    leave() {
        this._send({ t: MSG.LEAVE_ROOM });
        this.closeClient();
    }

    /** Mark that the socket is being handed back to a lobby (do not close it). */
    handoff() {
        this._handoff = true;
    }

    closeClient() {
        if (this.client) { try { this.client.close(); } catch (e) { /* ignore */ } }
    }

    /** Detach all listeners + timers. Does NOT close the socket (owner decides). */
    dispose() {
        this._disposed = true;
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
        this._teardownClient();
        this._statusListeners.clear();
    }
}
