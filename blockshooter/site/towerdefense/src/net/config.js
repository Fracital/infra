// Resolves API / WebSocket endpoints once at import
// (docs/MULTIPLAYER_CONTRACTS.md Section 3.1). Browser: dev (localhost) talks
// straight to the local mp server; anything else uses the same-origin
// reverse-proxy paths from Section 9. Node (no `location` global) degrades to
// the local dev target so headless tools/tests can import this without
// crashing.

function _resolve() {
    if (typeof location === 'undefined') {
        return { apiBase: 'http://localhost:8421/api', wsUrl: 'ws://localhost:8421/ws' };
    }

    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        return { apiBase: 'http://localhost:8421/api', wsUrl: 'ws://localhost:8421/ws' };
    }

    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return {
        apiBase: location.origin + '/towerdefense/api',
        wsUrl: wsProto + '//' + location.host + '/towerdefense/ws',
    };
}

export const NetConfig = _resolve();
