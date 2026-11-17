// Thin fetch wrapper against the mp/ HTTP API
// (docs/MULTIPLAYER_CONTRACTS.md Section 6.2). Every method resolves
// {ok, status, data} and NEVER rejects -- callers never need try/catch.

import { NetConfig } from './config.js';
import { Session } from './session.js';

function _hasFetch() {
    return typeof fetch === 'function';
}

async function _request(method, path, { body, query } = {}) {
    if (!_hasFetch()) return { ok: false, status: 0, data: { error: 'network' } };

    let url = NetConfig.apiBase + path;
    if (query) {
        const qs = new URLSearchParams();
        for (const k in query) {
            const v = query[k];
            if (v !== undefined && v !== null) qs.set(k, v);
        }
        const s = qs.toString();
        if (s) url += '?' + s;
    }

    const headers = Object.assign({}, Session.authHeader());
    let payload;
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }

    let res;
    try {
        res = await fetch(url, { method, headers, body: payload });
    } catch (e) {
        return { ok: false, status: 0, data: { error: 'network' } };
    }

    let data = null;
    try {
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
    } catch (e) {
        data = null;
    }

    // A 401 with a stored token means the token is dead (expired/revoked) --
    // drop the session so the UI falls back to logged-out state.
    if (res.status === 401 && Session.current() && Session.current().token) {
        Session.clear();
    }

    return { ok: res.ok, status: res.status, data };
}

export const Api = {
    register(name, pass) {
        return _request('POST', '/register', { body: { name, pass } });
    },
    login(name, pass) {
        return _request('POST', '/login', { body: { name, pass } });
    },
    me() {
        return _request('GET', '/me');
    },
    putSave(blob) {
        return _request('PUT', '/save', { body: blob });
    },
    getSave() {
        return _request('GET', '/save');
    },
    soloResult(payload) {
        return _request('POST', '/solo/result', { body: payload });
    },
    leaderboard(params) {
        return _request('GET', '/leaderboard', { query: params });
    },
    dailyToday() {
        return _request('GET', '/daily/today');
    },
    dailySubmit(payload) {
        return _request('POST', '/daily/submit', { body: payload });
    },
    rooms() {
        return _request('GET', '/rooms');
    },
    health() {
        return _request('GET', '/health');
    },
};
