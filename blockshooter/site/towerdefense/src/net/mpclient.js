// WebSocket client for one multiplayer connection attempt
// (docs/MULTIPLAYER_CONTRACTS.md Section 3.4). Reconnection policy belongs to
// the match driver (src/net/mpmatch.js, owner B1) -- this class is just the
// wire: connect/hello handshake, typed dispatch, heartbeat reply, tick
// estimator. Construct a new MpClient per connection attempt.

import { NetConfig } from './config.js';
import { Session } from './session.js';
import { MP_PROTOCOL, TICK_RATE, MSG } from '../core/mpproto.js';

const WS_OPEN = 1;
const WS_CLOSED = 3;
const CONNECT_TIMEOUT_MS = 8000;

function _now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
    return Date.now();
}

export class MpClient {
    /**
     * @param {object} [opts]
     * @param {string} [opts.url] websocket url; defaults to NetConfig.wsUrl
     * @param {string} [opts.name] display name sent in `hello` (guests need this; logged-in name comes from the account)
     * @param {string} [opts.token] auth token sent in `hello`; defaults to Session.current().token
     */
    constructor(opts = {}) {
        this._url = opts.url || NetConfig.wsUrl;
        this._name = opts.name;
        this._token = opts.token;
        this._ws = null;

        this._listeners = new Map();   // type -> Set(fn)
        this._wildcard = new Set();
        this._closeListeners = new Set();

        // Tick estimator state (Section 3.4): last `tick` sync message plus
        // the wall-clock time it arrived at.
        this._lastTick = 0;
        this._lastSpeed = 1;
        this._lastPaused = false;
        this._lastArrival = _now();
    }

    /** @returns {number} underlying WebSocket.readyState (CLOSED=3 if never connected). */
    get readyState() {
        return this._ws ? this._ws.readyState : WS_CLOSED;
    }

    /**
     * Open the socket, send `hello`, and wait for `welcome`.
     * @returns {Promise<object>} the welcome payload
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (typeof WebSocket === 'undefined') {
                reject(new Error('WebSocket unavailable in this environment'));
                return;
            }

            let ws;
            try {
                ws = new WebSocket(this._url);
            } catch (e) {
                reject(e);
                return;
            }
            this._ws = ws;

            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                try { ws.close(); } catch (e) { /* already closing */ }
                reject(new Error('mp connect timeout'));
            }, CONNECT_TIMEOUT_MS);

            ws.onopen = () => {
                const hello = { t: MSG.HELLO, proto: MP_PROTOCOL };
                const stored = Session.current();
                const token = this._token || (stored && stored.token);
                if (token) hello.token = token;
                if (this._name) hello.name = this._name;
                this.send(hello);
            };

            ws.onmessage = (ev) => {
                const msg = this._parse(ev.data);
                if (!msg) return;

                this._ingest(msg);
                this._dispatch(msg);

                if (!settled) {
                    if (msg.t === MSG.WELCOME) {
                        settled = true;
                        clearTimeout(timer);
                        resolve(msg);
                    } else if (msg.t === MSG.ERROR) {
                        settled = true;
                        clearTimeout(timer);
                        const err = new Error(msg.msg || 'mp error');
                        err.code = msg.code;
                        reject(err);
                    }
                }
            };

            ws.onerror = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(new Error('mp socket error'));
            };

            ws.onclose = () => {
                clearTimeout(timer);
                if (!settled) {
                    settled = true;
                    reject(new Error('mp socket closed before welcome'));
                }
                for (const fn of [...this._closeListeners]) {
                    try { fn(); } catch (e) { /* isolate listener errors */ }
                }
            };
        });
    }

    /** JSON-encode and send. No-op if the socket is not open. */
    send(obj) {
        if (!this._ws || this._ws.readyState !== WS_OPEN) return;
        try {
            this._ws.send(JSON.stringify(obj));
        } catch (e) {
            // socket may be mid-close -- drop silently
        }
    }

    close() {
        if (this._ws) {
            try { this._ws.close(); } catch (e) { /* already closed */ }
        }
    }

    /**
     * Subscribe to messages of `type` (or '*' for every message).
     * @param {string} type
     * @param {function(object)} fn
     * @returns {function()} unsubscribe
     */
    on(type, fn) {
        if (type === '*') {
            this._wildcard.add(fn);
            return () => this._wildcard.delete(fn);
        }
        let set = this._listeners.get(type);
        if (!set) { set = new Set(); this._listeners.set(type, set); }
        set.add(fn);
        return () => { const s = this._listeners.get(type); if (s) s.delete(fn); };
    }

    /**
     * Subscribe to socket close (fires once per connection, after any close
     * reason -- normal, error, or reject-before-welcome).
     * @returns {function()} unsubscribe
     */
    onClose(fn) {
        this._closeListeners.add(fn);
        return () => this._closeListeners.delete(fn);
    }

    /**
     * Estimate the server's current sim tick from the last `tick` sync
     * message plus elapsed wall time. Frozen (does not advance) while paused;
     * clamps to the last known tick if `nowMs` is before the last arrival
     * (clock skew / stale caller).
     * @param {number} nowMs performance.now()-domain timestamp
     * @returns {number}
     */
    estimatedTick(nowMs) {
        const speed = this._lastPaused ? 0 : this._lastSpeed;
        const elapsedSec = Math.max(0, (nowMs - this._lastArrival) / 1000);
        return this._lastTick + elapsedSec * TICK_RATE * speed;
    }

    _parse(raw) {
        try {
            const msg = JSON.parse(raw);
            return (msg && typeof msg.t === 'string') ? msg : null;
        } catch (e) {
            return null;
        }
    }

    // nowMs is an injectable seam for the tick-estimator unit tests; real
    // traffic always uses the live clock (default param).
    _ingest(msg, nowMs = _now()) {
        if (msg.t === MSG.TICK) {
            this._lastTick = msg.tick;
            this._lastSpeed = msg.speed;
            this._lastPaused = !!msg.paused;
            this._lastArrival = nowMs;
        } else if (msg.t === MSG.PING) {
            this.send({ t: MSG.PONG });
        }
    }

    _dispatch(msg) {
        const set = this._listeners.get(msg.t);
        if (set) for (const fn of [...set]) { try { fn(msg); } catch (e) { /* isolate listener errors */ } }
        for (const fn of [...this._wildcard]) { try { fn(msg); } catch (e) { /* isolate listener errors */ } }
    }
}
