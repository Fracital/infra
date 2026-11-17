// Account session persistence via localStorage
// (docs/MULTIPLAYER_CONTRACTS.md Section 3.2). Guarded exactly like
// src/core/save.js so this module is import-safe -- and degrades to an
// always-logged-out no-op -- under node.

import { bus } from '../core/events.js';

const KEY_ACCOUNT = 'bd_account';

function _storage() {
    try {
        if (typeof localStorage === 'undefined' || localStorage === null) return null;
        return localStorage;
    } catch (e) {
        return null;
    }
}

function _read() {
    const ls = _storage();
    if (!ls) return null;
    try {
        const raw = ls.getItem(KEY_ACCOUNT);
        if (raw === null || raw === undefined) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function _write(value) {
    const ls = _storage();
    if (!ls) return;
    try {
        ls.setItem(KEY_ACCOUNT, JSON.stringify(value));
    } catch (e) {
        // quota exceeded / serialization failure -- persistence is best-effort
    }
}

function _remove() {
    const ls = _storage();
    if (!ls) return;
    try {
        ls.removeItem(KEY_ACCOUNT);
    } catch (e) {
        // ignore
    }
}

export const Session = {
    /** @returns {{token:string, playerId:string, name:string}|null} */
    current() {
        return _read();
    },

    /** Persist the account and notify listeners. */
    set(acc) {
        _write(acc);
        bus.emit('account:changed', { account: acc || null });
    },

    /** Log out: clear storage and notify listeners. */
    clear() {
        _remove();
        bus.emit('account:changed', { account: null });
    },

    /** @returns {boolean} true if a token is stored. */
    authed() {
        const acc = _read();
        return !!(acc && acc.token);
    },

    /** @returns {object} `{Authorization: 'Bearer <token>'}`, or `{}` if unauthenticated. */
    authHeader() {
        const acc = _read();
        if (acc && acc.token) return { Authorization: 'Bearer ' + acc.token };
        return {};
    },
};
