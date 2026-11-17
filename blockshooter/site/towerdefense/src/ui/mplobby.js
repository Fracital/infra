// Multiplayer room lobby (docs/MULTIPLAYER_CONTRACTS.md Section 8, owner B1).
//
// Screen id 'mplobby'. Entered from mphub (owner B3) with the persistent lobby
// MpClient and the room's current room_state. Shows the player list (ready
// states + colours), the click-to-copy room code, lobby chat, the host controls,
// a Ready toggle and Leave. On `match_start` it hands the socket + payload to the
// game screen (which constructs the MpMatch); on Leave it returns to mphub.
//
// Only the base design-system classes (mc-panel/mc-btn) are used for a usable
// baseline -- the lobby's cosmetic styling lives in B3's css/mp.css (per the
// Section 8 CSS ownership split); the 'mpl-' hooks below are for B3 to theme.

import { Screens } from './screens.js';
import { SFX } from '../audio/sfx.js';
import { toast } from './tooltips.js';
import { MSG, LIMITS } from '../core/mpproto.js';
import { MAPS } from '../data/maps/index.js';
import { showVersus } from './versus.js';
import { DIFFICULTIES } from '../data/difficulties.js';

const SLOT_COLORS = ['#33ADFF', '#59c93c', '#e8b23a', '#ff5540'];

function mk(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
}

function prettyMap(mapId) {
    const def = MAPS[mapId];
    return (def && def.name) || mapId || '?';
}

export const MpLobby = {
    mount(rootEl, params) {
        params = params || {};
        this._root = rootEl;
        this._client = params.client || null;
        this._room = params.roomState || null;
        this._selfName = (params.self && params.self.name) || params.selfName || null;
        this._unsubs = [];
        this._handoff = false;    // set when we hand the socket to the game screen
        this._ready = false;

        const container = mk('div', 'mpl-root anim-fade');
        this._container = container;

        // ---- header: code (click-copy) + map/difficulty ----
        const header = mk('div', 'mpl-header mc-panel');
        const codeWrap = mk('div', 'mpl-code');
        codeWrap.setAttribute('role', 'button');
        codeWrap.title = 'Click to copy room code';
        codeWrap.appendChild(mk('span', 'mpl-code-label', 'ROOM CODE'));
        this._codeVal = mk('span', 'mpl-code-val', (this._room && this._room.code) || '------');
        codeWrap.appendChild(this._codeVal);
        codeWrap.addEventListener('click', () => this._copyCode());
        header.appendChild(codeWrap);

        this._modeLabel = mk('div', 'mpl-mode', '');
        header.appendChild(this._modeLabel);
        container.appendChild(header);

        // ---- player list ----
        const listPanel = mk('div', 'mpl-players mc-panel');
        listPanel.appendChild(mk('div', 'mpl-players-title pixel-title', 'PLAYERS'));
        this._playerList = mk('div', 'mpl-player-list');
        listPanel.appendChild(this._playerList);
        container.appendChild(listPanel);

        // ---- host controls (visibility / autostart) ----
        this._hostPanel = mk('div', 'mpl-host mc-panel hidden');
        this._hostPanel.appendChild(mk('div', 'mpl-host-title', 'HOST CONTROLS'));
        const hostRow = mk('div', 'mpl-host-row');
        this._visBtn = mk('button', 'mc-btn mc-btn-small', 'VISIBILITY');
        this._visBtn.type = 'button';
        this._visBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._toggleVisibility(); });
        this._autoBtn = mk('button', 'mc-btn mc-btn-small', 'AUTO-START');
        this._autoBtn.type = 'button';
        this._autoBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._toggleAutostart(); });
        hostRow.appendChild(this._visBtn);
        hostRow.appendChild(this._autoBtn);
        this._hostPanel.appendChild(hostRow);
        container.appendChild(this._hostPanel);

        // ---- chat ----
        const chatPanel = mk('div', 'mpl-chat mc-panel');
        this._chatLog = mk('div', 'mpl-chat-log');
        chatPanel.appendChild(this._chatLog);
        const chatRow = mk('div', 'mpl-chat-row');
        this._chatInput = document.createElement('input');
        this._chatInput.type = 'text';
        this._chatInput.maxLength = LIMITS.chatLen;
        this._chatInput.className = 'mpl-chat-input';
        this._chatInput.placeholder = 'Chat...';
        this._chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { this._sendChat(); }
        });
        const chatSend = mk('button', 'mc-btn mc-btn-small', 'SEND');
        chatSend.type = 'button';
        chatSend.addEventListener('pointerdown', (e) => { e.preventDefault(); this._sendChat(); });
        chatRow.appendChild(this._chatInput);
        chatRow.appendChild(chatSend);
        chatPanel.appendChild(chatRow);
        container.appendChild(chatPanel);

        // ---- footer: ready + leave ----
        const footer = mk('div', 'mpl-footer');
        this._readyBtn = mk('button', 'mc-btn mc-btn-green mpl-ready', 'READY');
        this._readyBtn.type = 'button';
        this._readyBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._toggleReady(); });
        const leaveBtn = mk('button', 'mc-btn mc-btn-red', 'LEAVE');
        leaveBtn.type = 'button';
        leaveBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this._leave(); });
        footer.appendChild(this._readyBtn);
        footer.appendChild(leaveBtn);
        container.appendChild(footer);

        rootEl.appendChild(container);

        // ---- socket wiring ----
        this._wire();

        // A match that is ALREADY running (join-in-progress, live spectate,
        // quick-match races) arrives as params.matchStart -- only live frames
        // reach the listener in _wire, so consume the captured one here.
        if (params.matchStart) {
            this._onMatchStart(params.matchStart);
            return;
        }

        // Paint the initial state we were handed.
        if (this._room) this._applyRoomState(this._room);
    },

    _wire() {
        const c = this._client;
        if (!c || typeof c.on !== 'function') return;
        const on = (t, fn) => this._unsubs.push(c.on(t, fn));
        on(MSG.ROOM_STATE, (m) => this._applyRoomState(m));
        on(MSG.CHAT, (m) => this._appendChat(m.slot, m.name, m.text, false));
        on(MSG.SYSTEM, (m) => this._appendChat(-1, '', m.text, true));
        on(MSG.MATCH_START, (m) => this._onMatchStart(m));
        on(MSG.ERROR, (m) => { try { toast('Error: ' + (m.msg || m.code || 'unknown')); } catch (e) { /* ignore */ } });
        if (typeof c.onClose === 'function') {
            this._unsubs.push(c.onClose(() => {
                if (this._handoff) return;   // socket handed to the game screen
                try { toast('Disconnected from lobby'); } catch (e) { /* ignore */ }
                Screens.show('mphub');
            }));
        }
    },

    _mySlot() {
        if (!this._room || !this._selfName) return -1;
        for (const p of this._room.players || []) if (p.name === this._selfName) return p.slot;
        return -1;
    },

    _isHost() {
        const me = this._mySlot();
        return me >= 0 && this._room && this._room.hostSlot === me;
    },

    _applyRoomState(rs) {
        this._room = rs;
        this._codeVal.textContent = rs.code || '------';
        this._modeLabel.textContent = (rs.mode === 'pvp_private' ? 'PVP' : 'CO-OP') +
            ' -- ' + prettyMap(rs.mapId) + ' -- ' +
            ((DIFFICULTIES[rs.difficulty] && DIFFICULTIES[rs.difficulty].name) || rs.difficulty) +
            ' -- ' + (rs.visibility === 'private' ? 'Private' : 'Public') +
            (rs.autoStart ? ' -- Auto-start' : '');

        // Player list. room_state is infrequent (membership/ready edges), so a
        // full rebuild here is safe -- it is not on the per-frame 'cash' path.
        const mySlot = this._mySlot();
        this._playerList.textContent = '';
        for (const p of rs.players || []) {
            const row = mk('div', 'mpl-player mc-slot' + (p.slot === mySlot ? ' is-me' : ''));
            const dot = mk('span', 'mpl-player-dot');
            dot.style.background = p.color || SLOT_COLORS[p.slot % 4] || '#888';
            const name = mk('span', 'mpl-player-name', p.name + (p.slot === rs.hostSlot ? ' (host)' : ''));
            if (!p.connected) name.classList.add('is-offline');
            const status = mk('span', 'mpl-player-status', p.ready ? 'READY' : 'not ready');
            status.classList.toggle('is-ready', !!p.ready);
            row.appendChild(dot);
            row.appendChild(name);
            row.appendChild(status);

            // Host may kick other connected players (best-effort; see note below).
            if (this._isHost() && p.slot !== mySlot) {
                const kick = mk('button', 'mc-btn mc-btn-small mc-btn-red mpl-kick', 'KICK');
                kick.type = 'button';
                kick.addEventListener('pointerdown', (e) => { e.preventDefault(); this._kick(p.slot); });
                row.appendChild(kick);
            }
            this._playerList.appendChild(row);
        }

        // My ready reflects the server's authoritative flag.
        if (mySlot >= 0) {
            const me = (rs.players || []).find((p) => p.slot === mySlot);
            this._ready = !!(me && me.ready);
        }
        this._readyBtn.textContent = this._ready ? 'READY!' : 'READY';
        this._readyBtn.classList.toggle('is-ready', this._ready);

        this._hostPanel.classList.toggle('hidden', !this._isHost());
        this._visBtn.textContent = rs.visibility === 'private' ? 'MAKE PUBLIC' : 'MAKE PRIVATE';
        this._autoBtn.textContent = rs.autoStart ? 'AUTO-START: ON' : 'AUTO-START: OFF';
    },

    _appendChat(slot, name, text, system) {
        const line = mk('div', 'mpl-chat-line' + (system ? ' system' : ''));
        if (system) {
            line.textContent = text;
        } else {
            const nm = mk('span', 'mpl-chat-name', (name || '?') + ': ');
            nm.style.color = SLOT_COLORS[((slot % 4) + 4) % 4] || '#ccc';
            line.appendChild(nm);
            line.appendChild(document.createTextNode(text));
        }
        this._chatLog.appendChild(line);
        // Trim to the last 60 lines and keep it scrolled to the newest.
        while (this._chatLog.childNodes.length > 60) this._chatLog.removeChild(this._chatLog.firstChild);
        this._chatLog.scrollTop = this._chatLog.scrollHeight;
    },

    _sendChat() {
        const text = this._chatInput.value.trim();
        if (!text) return;
        this._chatInput.value = '';
        if (this._client) this._client.send({ t: MSG.CHAT, text: text.slice(0, LIMITS.chatLen) });
    },

    _toggleReady() {
        this._ready = !this._ready;
        if (this._client) this._client.send({ t: MSG.READY, ready: this._ready });
        SFX.play('ui_click');
        this._readyBtn.textContent = this._ready ? 'READY!' : 'READY';
        this._readyBtn.classList.toggle('is-ready', this._ready);
    },

    // NOTE: the v1 wire protocol (Section 5) has no room-mutation messages for
    // kick / visibility / autostart. These send best-effort frames the server
    // ignores unless A3 added handlers; the UI is provided per Section 8. See the
    // B1 report's deviation note.
    _kick(slot) {
        if (this._client) this._client.send({ t: 'kick', slot });
        SFX.play('ui_click');
    },

    _toggleVisibility() {
        const next = (this._room && this._room.visibility === 'private') ? 'public' : 'private';
        if (this._client) this._client.send({ t: 'set_visibility', visibility: next });
        SFX.play('ui_click');
    },

    _toggleAutostart() {
        const next = !(this._room && this._room.autoStart);
        if (this._client) this._client.send({ t: 'set_autostart', autoStart: next });
        SFX.play('ui_click');
    },

    _copyCode() {
        const code = (this._room && this._room.code) || '';
        if (!code) return;
        let copied = false;
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(code);
                copied = true;
            }
        } catch (e) { copied = false; }
        SFX.play('ui_click');
        try { toast(copied ? 'Copied ' + code : 'Room code: ' + code); } catch (e) { /* ignore */ }
    },

    _leave() {
        if (this._client) this._client.send({ t: MSG.LEAVE_ROOM });
        SFX.play('ui_close');
        Screens.show('mphub');
    },

    // match_start: hand the socket + payload to the game screen. Building matchCtx
    // and calling show() synchronously here means gamescreen's MpMatch subscribes
    // to the socket before the next frame -- no early cmd/tick broadcast is missed.
    _onMatchStart(m) {
        this._handoff = true;
        const matchCtx = {
            client: this._client,
            matchStart: m,
            code: this._room ? this._room.code : (m.code || null),
        };
        const isPvp = !!(m.modeFlags && m.modeFlags.pvp);
        if (!isPvp) {
            Screens.show('game', { mp: matchCtx });
            return;
        }
        // PVP duels get the same versus beat as queue matches.
        const players = m.players || [];
        const meP = players.find((pl) => pl.slot === m.mySlot) || {};
        const oppP = players.find((pl) => pl.slot !== m.mySlot) || {};
        const mapDef = MAPS[m.mapId];
        showVersus({
            meName: meP.name || this._selfName || 'You',
            oppName: oppP.name || 'Opponent',
            oppRating: (m.pvp && m.pvp.opponent && typeof m.pvp.opponent.rating === 'number') ? (m.pvp.opponent.rating + ' ELO') : '',
            mapName: mapDef ? (mapDef.name || m.mapId) : m.mapId,
            difficulty: (DIFFICULTIES[m.difficulty] && DIFFICULTIES[m.difficulty].name) || '',
        }, () => Screens.show('game', { mp: matchCtx }));
    },

    unmount() {
        for (const u of this._unsubs || []) { try { u(); } catch (e) { /* ignore */ } }
        this._unsubs = [];
        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
        // The socket belongs to mphub / the game flow; never close it here.
        this._client = null;
    },
};

Screens.register('mplobby', MpLobby);
