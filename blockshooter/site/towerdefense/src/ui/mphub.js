// Online hub -- screen 'mphub'. The home for everything networked: accounts,
// co-op room create/join, PVP (queue + private duels), the daily challenge,
// a public room browser, leaderboards, and personal stats. Also the owner of
// the cross-cutting online wiring that does NOT belong to any one screen:
//   - cloud saves (pull-on-login/boot, debounced push after local autosaves),
//   - solo/daily leaderboard submission on run:finished.
//
// docs/MULTIPLAYER_CONTRACTS.md Section 8 is the binding contract. Layout is
// a left nav rail (PLAY / BROWSER / RANKINGS / PROFILE) with one pane mounted
// at a time; the PLAY pane carries the daily banner and the two mode posters.
// This file self-registers with Screens on import and (in a browser) installs
// the online wiring once at import time -- main.js imports it at boot.
//
// Browser-only at call time, but IMPORT-SAFE under node: nothing here touches
// window/document/localStorage until a method runs, so the pure cloud/submission
// helpers below can be unit-tested headless (tests/hub_check.js). The lobby /
// match / gamescreen handoff targets (mplobby, game) are owned by agents B1/B2
// and are addressed only through Screens.show with the contracted params shape.

import { Screens } from './screens.js';
import { SFX } from '../audio/sfx.js';
import { toast } from './tooltips.js';
import { bus } from '../core/events.js';
import { Save } from '../core/save.js';

import { Session } from '../net/session.js';
import { Api } from '../net/api.js';
import { MpClient } from '../net/mpclient.js';
import { LIMITS, validName } from '../core/mpproto.js';

import { MAP_LIST } from '../data/maps/index.js';
import { showVersus } from './versus.js';
import { DIFFICULTIES } from '../data/difficulties.js';

// localStorage keys owned by core/save.js -- mirrored here (that module does not
// export them). Cloud save round-trips exactly these blobs.
const KEY_RUN = 'bd_run';
const KEY_PROFILE = 'bd_profile';
const KEY_SETTINGS = 'bd_settings';
const KEY_SYNCED = 'bd_cloud_synced';   // server updatedAt this device last reconciled with
const KEY_GUEST_NAME = 'bd_guest_name';

const CLOUD_PUSH_DEBOUNCE_MS = 10000;
const PLAY_DIFFICULTIES = ['easy', 'medium', 'hard', 'ironclad'];
// Toast glyphs are written as unicode escapes inline (u2601 cloud, u26A0 warn,
// u2705 check) so the source stays pure ASCII, matching the rest of the codebase.

// =====================================================================
// pure, headless-testable helpers (storage passed in explicitly)
// =====================================================================

function _parse(raw) {
    if (raw === null || raw === undefined) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}

/**
 * Read the three local save blobs from a storage-like object.
 * @param {{getItem:Function}} storage localStorage or a test double
 * @returns {{run:object|null, profile:object|null, settings:object|null}}
 */
export function cloudReadLocal(storage) {
    if (!storage || typeof storage.getItem !== 'function') return { run: null, profile: null, settings: null };
    return {
        run: _parse(storage.getItem(KEY_RUN)),
        profile: _parse(storage.getItem(KEY_PROFILE)),
        settings: _parse(storage.getItem(KEY_SETTINGS)),
    };
}

/**
 * Write a server save blob into local storage (only non-null fields). Does NOT
 * reload -- the caller decides when to reload.
 * @param {{setItem:Function}} storage
 * @param {{run?:object, profile?:object, settings?:object}} save
 * @returns {number} number of keys written
 */
export function cloudWriteLocal(storage, save) {
    if (!storage || typeof storage.setItem !== 'function' || !save) return 0;
    let n = 0;
    const put = (key, val) => {
        if (val === undefined || val === null) return;
        try { storage.setItem(key, JSON.stringify(val)); n++; } catch (e) { /* quota / serialize */ }
    };
    put(KEY_RUN, save.run);
    put(KEY_PROFILE, save.profile);
    put(KEY_SETTINGS, save.settings);
    return n;
}

/**
 * The local run snapshot timestamp (Section 9 schema `timestamp`), or 0.
 * @param {{getItem:Function}} storage
 * @returns {number}
 */
export function cloudLocalRunTs(storage) {
    const run = cloudReadLocal(storage).run;
    return (run && Number.isFinite(run.timestamp)) ? run.timestamp : 0;
}

/**
 * Is the server save strictly newer than local? (Section 8 pull rule.)
 * @param {number} localTs
 * @param {number} serverUpdatedAt
 * @returns {boolean}
 */
export function cloudServerIsNewer(localTs, serverUpdatedAt) {
    return Number(serverUpdatedAt || 0) > Number(localTs || 0);
}

/**
 * The server `updatedAt` this device last reconciled with (pushed or pulled).
 * The pull-offer must compare against THIS, not the local run's content
 * timestamp: our own debounced push always stamps the server ~10s after the
 * local autosave it mirrors, so content-time vs row-time comparison flags our
 * own save as "newer cloud" on every boot -- the endless "Cloud Save Found"
 * loop. Only a push from ANOTHER device moves updatedAt past this marker.
 * @param {{getItem:Function}} storage
 * @returns {number}
 */
export function cloudSyncedAt(storage) {
    if (!storage || typeof storage.getItem !== 'function') return 0;
    const v = Number(storage.getItem(KEY_SYNCED));
    return Number.isFinite(v) ? v : 0;
}

/**
 * Record the server `updatedAt` we just pushed or pulled.
 * @param {{setItem:Function}} storage
 * @param {number} updatedAt
 */
export function cloudMarkSynced(storage, updatedAt) {
    if (!storage || typeof storage.setItem !== 'function') return;
    if (!Number.isFinite(Number(updatedAt)) || Number(updatedAt) <= 0) return;
    try { storage.setItem(KEY_SYNCED, String(Number(updatedAt))); } catch (e) { /* quota */ }
}

/**
 * Build a POST /api/solo/result body from a run:finished payload. Returns null
 * when required fields are missing. The command log is included ONLY for a run
 * that was NOT resumed from a legacy snapshot (Appendix W item 10 -- a resumed
 * run has a partial log and is not verifiable).
 * @param {object} run
 * @returns {object|null}
 */
export function buildSoloResultPayload(run) {
    if (!run || typeof run.mapId !== 'string' || typeof run.difficulty !== 'string') return null;
    const out = {
        mapId: run.mapId,
        difficulty: run.difficulty,
        round: run.round | 0,
        victory: !!run.victory,
        livesLeft: run.livesLeft | 0,
        ticks: run.ticks | 0,
        seed: run.seed >>> 0,
    };
    if (run.modeFlags && typeof run.modeFlags === 'object') out.modeFlags = run.modeFlags;
    if (!run.resumedFromSnapshot && Array.isArray(run.log) && run.log.length > 0) out.log = run.log;
    return out;
}

/**
 * Build a POST /api/daily/submit body. Requires a day and a full (non-resumed)
 * log -- the server rejects daily submissions without a replayable log.
 * @param {object} run
 * @returns {object|null}
 */
export function buildDailySubmitPayload(run) {
    if (!run) return null;
    const day = (run.daily && typeof run.daily.day === 'string') ? run.daily.day
        : (typeof run.day === 'string' ? run.day : null);
    if (!day) return null;
    if (run.resumedFromSnapshot) return null;
    if (!Array.isArray(run.log) || run.log.length === 0) return null;
    return {
        day,
        round: run.round | 0,
        victory: !!run.victory,
        livesLeft: run.livesLeft | 0,
        ticks: run.ticks | 0,
        log: run.log,
    };
}

// =====================================================================
// browser-side online wiring (cloud save + submission)
// =====================================================================

function _isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function _localStorage() {
    try {
        if (typeof localStorage === 'undefined' || localStorage === null) return null;
        return localStorage;
    } catch (e) {
        return null;
    }
}

let _cloudLastSync = 0;
let _pushTimer = 0;

/** Debounced cloud push: 10s after the most recent local autosave (Section 8). */
function scheduleCloudPush() {
    if (!_isBrowser() || !Session.authed()) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
        _pushTimer = 0;
        cloudForcePush().catch(() => {});
    }, CLOUD_PUSH_DEBOUNCE_MS);
}

/**
 * Push the current local save blobs to the server now.
 * @returns {Promise<{ok:boolean}>}
 */
export async function cloudForcePush() {
    if (!Session.authed()) return { ok: false };
    const payload = cloudReadLocal(_localStorage());
    const res = await Api.putSave(payload);
    if (res && res.ok) {
        _cloudLastSync = Date.now();
        // Our push defines the new server updatedAt -- record it so the next
        // boot's pull-offer check knows this cloud state came from US.
        if (res.data && Number.isFinite(Number(res.data.updatedAt))) {
            cloudMarkSynced(_localStorage(), res.data.updatedAt);
        }
    }
    return res || { ok: false };
}

/**
 * Force-pull the cloud save over local, then reload. No-op (with a toast) when
 * there is no cloud save.
 * @returns {Promise<void>}
 */
export async function cloudForcePull() {
    if (!Session.authed()) { toast('Sign in first', '\u2601'); return; }
    const res = await Api.getSave();
    if (!res || !res.ok) { toast('Cloud unreachable', '\u26A0'); return; }
    const save = res.data && res.data.save;
    if (!save) { toast('No cloud save found', '\u2601'); return; }
    cloudWriteLocal(_localStorage(), save);
    cloudMarkSynced(_localStorage(), save.updatedAt);
    toast('Cloud save pulled -- reloading...', '\u2601');
    if (_isBrowser()) setTimeout(() => location.reload(), 800);
}

/** Status line for the settings Cloud row. */
export function cloudStatusText() {
    if (!Session.authed()) return 'Not signed in -- cloud save is off.';
    const acc = Session.current();
    const who = (acc && acc.name) ? acc.name : 'player';
    return 'Signed in as ' + who + (_cloudLastSync ? ' -- last synced this session.' : ' -- ready to sync.');
}

/**
 * Reconcile local vs cloud: pull-offer when the cloud is newer, otherwise back
 * up local. Runs on login and once on boot when already authed (Section 8).
 * @returns {Promise<void>}
 */
async function cloudSyncCheck() {
    if (!Session.authed()) return;
    const res = await Api.getSave();
    if (!res || !res.ok) return;   // offline / unauthorized -> stay silent
    const save = res.data && res.data.save;
    const ls = _localStorage();
    // Offer the pull ONLY when the cloud moved past what THIS device last
    // pushed/pulled (another device wrote it). Comparing against the local
    // run's content timestamp is wrong: our own debounced push stamps the
    // server ~10s later than the autosave it mirrors, which made every boot
    // re-offer our own save in an endless "Cloud Save Found" loop.
    const baseline = Math.max(cloudSyncedAt(ls), cloudLocalRunTs(ls));
    if (save && cloudServerIsNewer(baseline, save.updatedAt)) {
        _showPullModal(save);
        return;
    }
    // Cloud state is ours (or absent): make sure the marker reflects it, then
    // back local up if there is anything to back up.
    if (save) cloudMarkSynced(ls, save.updatedAt);
    const local = cloudReadLocal(ls);
    if (local.run || local.profile || local.settings) cloudForcePush().catch(() => {});
}

/** Modal offering to overwrite local progress with a newer cloud save. */
function _showPullModal(save) {
    if (!_isBrowser()) return;
    const host = document.getElementById('screen-root') || document.body;
    if (!host || host.querySelector('.mp-cloud-modal')) return;

    const overlay = el('div', 'mp-cloud-modal mc-overlay is-open anim-fade');
    const backdrop = el('div', 'ov-backdrop');
    overlay.appendChild(backdrop);
    const card = el('div', 'ov-card mp-cloud-card mc-panel anim-pop');
    card.appendChild(el('div', 'mp-cloud-title pixel-title', 'Cloud Save Found'));

    const when = save.updatedAt ? new Date(save.updatedAt).toLocaleString() : 'unknown';
    card.appendChild(el('div', 'mp-cloud-sub text-dim',
        'Your account has a newer save (updated ' + when + '). Pull it down? This overwrites the progress on this device.'));

    const row = el('div', 'mp-btn-row');
    const pull = el('button', 'mc-btn mc-btn-green mc-btn-small', 'Pull From Cloud');
    const keep = el('button', 'mc-btn mc-btn-small', 'Keep Local');
    row.appendChild(pull);
    row.appendChild(keep);
    card.appendChild(row);
    overlay.appendChild(card);

    const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
    onPress(pull, () => {
        cloudWriteLocal(_localStorage(), save);
        cloudMarkSynced(_localStorage(), save.updatedAt);
        toast('Cloud save pulled -- reloading...', '\u2601');
        close();
        setTimeout(() => location.reload(), 700);
    });
    onPress(keep, () => {
        close();
        // Keeping local means local wins -> push it up so the cloud matches
        // (the push response's updatedAt becomes the new synced marker).
        cloudForcePush().catch(() => {});
    });
    onPress(backdrop, close);
    host.appendChild(overlay);
    SFX.play('ui_open', { vol: 0.7 });
}

/**
 * Submit a finished solo/daily run to the leaderboards (fire-and-forget).
 * Guests and multiplayer runs are skipped silently.
 * @param {object} payload the run:finished bus payload (documented in Section 8)
 * @returns {Promise<void>}
 */
async function handleRunFinished(payload) {
    if (!payload) return;
    if (payload.mp || payload.mode === 'coop' || payload.mode === 'pvp') return;   // MP handled elsewhere
    if (!Session.authed()) return;   // guests: nothing persists

    const isDaily = !!(payload.daily || payload.day);
    if (isDaily) {
        const body = buildDailySubmitPayload(payload);
        if (!body) return;   // resumed / no log -> not verifiable
        const res = await Api.dailySubmit(body);
        const ok = res && res.ok && res.data && res.data.ok;
        toast(ok ? 'Daily result submitted' : 'Daily submit failed', ok ? '\u2705' : '\u26A0');
    } else {
        const body = buildSoloResultPayload(payload);
        if (!body) return;
        const res = await Api.soloResult(body);
        const ok = res && res.ok && res.data && res.data.ok;
        toast(ok ? 'Score submitted' : 'Score submit failed', ok ? '\u2705' : '\u26A0');
    }
}

// The game emits no global-bus autosave signal, so we intercept the shared Save
// mutators once to learn when a local autosave happened (Section 8 push trigger).
// This augments the runtime Save object; it does not edit core/save.js.
function installAutosaveHook() {
    if (!Save || Save.__cloudHooked) return;
    Save.__cloudHooked = true;
    for (const m of ['saveRun', 'saveProfile', 'saveSettings']) {
        const orig = Save[m];
        if (typeof orig !== 'function') continue;
        Save[m] = function hookedSave() {
            const r = orig.apply(this, arguments);
            try { scheduleCloudPush(); } catch (e) { /* never let sync break saving */ }
            return r;
        };
    }
}

let _wired = false;
function installHubWiring() {
    if (!_isBrowser() || _wired) return;
    _wired = true;
    installAutosaveHook();
    bus.on('run:finished', (p) => { handleRunFinished(p).catch(() => {}); });
    bus.on('account:changed', (p) => { if (p && p.account) cloudSyncCheck().catch(() => {}); });
    if (Session.authed()) {
        // Defer the boot reconcile until the first screen is up so the modal has
        // a host and does not fight the boot veil.
        bus.once('screen:shown', () => { cloudSyncCheck().catch(() => {}); });
    }
}

// =====================================================================
// small DOM helpers
// =====================================================================

/** @returns {HTMLElement} */
function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
}

// Actions fire on pointerdown, not click: a sibling card that re-renders on a
// timer must never swap the element out between mousedown and mouseup and eat
// the press (the documented click-eating trap in this codebase).
function onPress(node, fn) {
    node.addEventListener('pointerdown', (ev) => {
        if (ev.button != null && ev.button !== 0) return;
        ev.preventDefault();
        fn(ev);
    });
    node.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.35 }));
}

function mkInput(type, placeholder, maxLen) {
    const i = el('input', 'mp-input');
    i.type = type;
    i.placeholder = placeholder || '';
    if (maxLen) i.maxLength = maxLen;
    i.autocomplete = 'off';
    i.spellcheck = false;
    return i;
}

function mkSelect(options) {
    const s = el('select', 'mp-select');
    for (const o of options) {
        const opt = el('option', null, o.label);
        opt.value = o.value;
        s.appendChild(opt);
    }
    return s;
}

function fmtErr(code) {
    switch (code) {
        case 'taken': return 'That name is taken.';
        case 'invalid': return 'Name 3-16 chars (letters/digits/_-/space); password 6-64 chars.';
        case 'creds': return 'Wrong name or password.';
        case 'ratelimit': return 'Too many attempts -- try again later.';
        case 'network': return 'Server unreachable.';
        case 'notfound': return 'Not found.';
        case 'full': return 'That room is full.';
        default: return code ? ('Error: ' + code) : 'Something went wrong.';
    }
}

// ---- pixel icon glyphs (11x11 grids, painted to canvas -- keeps the hub in
// the same hand-drawn language as the rest of the game's UI) ----------------

const ICON_GRIDS = {
    play: [
        '...........',
        '...a.......',
        '...aa......',
        '...aca.....',
        '...acca....',
        '...accca...',
        '...acca....',
        '...aca.....',
        '...aa......',
        '...a.......',
        '...........',
    ],
    coop: [
        '.aaa...ccc.',
        '.aca...ccc.',
        '.aaa...ccc.',
        '...........',
        'aaaaa.ccccc',
        'aaaaa.ccccc',
        'aaaaa.ccccc',
        'aaaaa.ccccc',
        'b...b.b...b',
        'b...b.b...b',
        '...........',
    ],
    swords: [
        'aa.......cc',
        'aaa.....ccc',
        '.aaa...ccc.',
        '..aaa.ccc..',
        '...aaccc...',
        '....bbb....',
        '...ccbaa...',
        '..ccc.baa..',
        '.bcc...bab.',
        '.bb.....bb.',
        '...........',
    ],
    daily: [
        '..a.....a..',
        '.aaaaaaaaa.',
        '.abbbbbbba.',
        '.aaaaaaaaa.',
        '.a.......a.',
        '.a..c..c.a.',
        '.a...cc..a.',
        '.a...cc..a.',
        '.a..c..c.a.',
        '.aaaaaaaaa.',
        '...........',
    ],
    globe: [
        '...aaaaa...',
        '..ab.a.ba..',
        '.a...a...a.',
        'ab...a...ba',
        'aaaaaaaaaaa',
        'ab...a...ba',
        'a....a....a',
        '.a...a...a.',
        '..ab.a.ba..',
        '...aaaaa...',
        '...........',
    ],
    trophy: [
        'aaaaaaaaaaa',
        'a.aaaaaaa.a',
        'a.acccca..a',
        '.a.acca..a.',
        '..b.aa..b..',
        '....aa.....',
        '....aa.....',
        '.....a.....',
        '....aaa....',
        '..aaaaaaa..',
        '...........',
    ],
    head: [
        '...aaaaa...',
        '..aaaaaaa..',
        '..aacaca...',
        '..aaaaaaa..',
        '...aaaaa...',
        '.....a.....',
        '..aaaaaaa..',
        '.aaaaaaaaa.',
        'aaaaaaaaaaa',
        'aaaaaaaaaaa',
        '...........',
    ],
};

function mkIcon(name, color, shade, light) {
    const grid = ICON_GRIDS[name];
    const cell = 3;
    const c = document.createElement('canvas');
    c.width = 11 * cell;
    c.height = 11 * cell;
    c.className = 'mp-icon';
    if (!grid) return c;
    const ctx = c.getContext('2d');
    const colors = { a: color, b: shade || 'rgba(0,0,0,0.55)', c: light || '#ffffff' };
    for (let y = 0; y < grid.length; y++) {
        const row = grid[y];
        for (let x = 0; x < row.length; x++) {
            const ch = row[x];
            if (ch === '.') continue;
            ctx.fillStyle = colors[ch] || color;
            ctx.fillRect(x * cell, y * cell, cell, cell);
        }
    }
    return c;
}

// =====================================================================
// the hub screen
// =====================================================================

const NAV = [
    { id: 'play', label: 'PLAY', icon: 'play', color: '#17dd62' },
    { id: 'browser', label: 'BROWSER', icon: 'globe', color: '#4aa8ff' },
    { id: 'boards', label: 'RANKINGS', icon: 'trophy', color: '#fcdc5f' },
    { id: 'profile', label: 'PROFILE', icon: 'head', color: '#4aedd9' },
];

export const MpHub = {
    _root: null,
    _pane: null,
    _timers: [],
    _unsubs: [],
    _client: null,
    _connecting: null,
    _handedOver: false,
    _busyFlow: false,
    _tab: 'play',

    mount(rootEl, params) {
        this._root = rootEl;
        this._timers = [];
        this._unsubs = [];
        this._client = null;
        this._connecting = null;
        this._handedOver = false;
        this._busyFlow = false;
        this._tab = (params && params.focus === 'account') ? 'profile' : 'play';

        const container = el('div', 'mp-root anim-fade');

        // ---- header ----
        const header = el('div', 'mp-header');
        const back = el('button', 'mc-btn mc-btn-small mp-back', 'BACK');
        onPress(back, () => { SFX.play('ui_close'); Screens.show('menu'); });
        header.appendChild(back);
        header.appendChild(el('div', 'mp-title pixel-title', 'ONLINE'));
        const pill = el('div', 'mp-conn-pill', 'checking...');
        this._pill = pill;
        header.appendChild(pill);
        container.appendChild(header);

        // ---- rail + pane ----
        const main = el('div', 'mp-main');
        const rail = el('div', 'mp-rail');
        this._railBtns = {};
        for (const nav of NAV) {
            const btn = el('button', 'mp-nav');
            btn.appendChild(mkIcon(nav.icon, nav.color, 'rgba(0,0,0,0.5)', '#12101a'));
            btn.appendChild(el('span', 'mp-nav-label', nav.label));
            btn.style.setProperty('--nav-c', nav.color);
            onPress(btn, () => { if (this._tab !== nav.id) { SFX.play('ui_click', { vol: 0.5 }); this._renderTab(nav.id); } });
            rail.appendChild(btn);
            this._railBtns[nav.id] = btn;
        }
        const railFoot = el('div', 'mp-rail-foot');
        this._railFoot = railFoot;
        rail.appendChild(railFoot);
        main.appendChild(rail);

        const pane = el('div', 'mp-pane');
        this._pane = pane;
        main.appendChild(pane);
        container.appendChild(main);

        rootEl.appendChild(container);

        this._renderTab(this._tab);
        this._probeHealth();

        // Re-render the auth-sensitive pane when the account changes.
        this._unsubs.push(bus.on('account:changed', () => { this._renderTab(this._tab); }));

        // Esc returns to the menu.
        this._onKey = (ev) => { if (ev.key === 'Escape') { SFX.play('ui_close'); Screens.show('menu'); } };
        window.addEventListener('keydown', this._onKey);
    },

    unmount() {
        for (const t of this._timers) clearInterval(t);
        this._timers = [];
        for (const u of this._unsubs) { try { u(); } catch (e) { /* ignore */ } }
        this._unsubs = [];
        // Per-pane timers/subs (rooms poll, daily countdown, queue timer, room-
        // entry listeners) live in a separate set that _renderTab recycles --
        // tear them down too so nothing keeps ticking after the hub is gone.
        if (this._cardTimers) for (const t of this._cardTimers) clearInterval(t);
        this._cardTimers = [];
        if (this._cardUnsubs) for (const u of this._cardUnsubs) { try { u(); } catch (e) { /* ignore */ } }
        this._cardUnsubs = [];
        this._pill = null;
        if (this._onKey) { window.removeEventListener('keydown', this._onKey); this._onKey = null; }
        // Only close the socket if we still own it (a room handoff transfers it).
        if (this._client && !this._handedOver) { try { this._client.close(); } catch (e) { /* ignore */ } }
        this._client = null;
        this._connecting = null;
        this._root = null;
        this._pane = null;
    },

    // ---- tab switching -------------------------------------------------

    _renderTab(tab) {
        this._tab = tab;
        const pane = this._pane;
        if (!pane) return;
        // Recycle per-pane timers/subs (kept separate from the mount-level ones).
        if (this._cardTimers) for (const t of this._cardTimers) clearInterval(t);
        if (this._cardUnsubs) for (const u of this._cardUnsubs) { try { u(); } catch (e) { /* ignore */ } }
        this._cardTimers = [];
        this._cardUnsubs = [];
        pane.textContent = '';

        for (const id in this._railBtns) this._railBtns[id].classList.toggle('is-active', id === tab);
        this._renderRailFoot();

        if (tab === 'play') this._renderPlay(pane);
        else if (tab === 'browser') this._renderBrowser(pane);
        else if (tab === 'boards') this._renderBoards(pane);
        else this._renderProfile(pane);
    },

    _renderRailFoot() {
        const foot = this._railFoot;
        if (!foot) return;
        foot.textContent = '';
        if (Session.authed()) {
            const acc = Session.current();
            const chip = el('button', 'mp-rail-acc is-authed');
            chip.appendChild(el('span', 'mp-rail-dot'));
            chip.appendChild(el('span', 'mp-rail-name', (acc && acc.name) || 'Player'));
            onPress(chip, () => this._renderTab('profile'));
            foot.appendChild(chip);
        } else {
            const chip = el('button', 'mp-rail-acc');
            chip.appendChild(el('span', 'mp-rail-dot'));
            chip.appendChild(el('span', 'mp-rail-name', 'SIGN IN'));
            onPress(chip, () => this._renderTab('profile'));
            foot.appendChild(chip);
        }
    },

    _addCardTimer(id) { this._cardTimers.push(id); },

    _addCardUnsub(fn) { this._cardUnsubs.push(fn); },

    // ---- PLAY pane -------------------------------------------------------

    _renderPlay(pane) {
        pane.appendChild(this._dailyBanner());

        const row = el('div', 'mp-posters');
        row.appendChild(this._coopPoster());
        row.appendChild(this._battlesPoster());
        pane.appendChild(row);
    },

    _dailyBanner() {
        const banner = el('div', 'mp-daily-banner mc-panel');
        const left = el('div', 'mp-daily-left');
        left.appendChild(mkIcon('daily', '#fcdc5f', 'rgba(0,0,0,0.5)', '#fff3c0'));
        const mid = el('div', 'mp-daily-mid');
        const head = el('div', 'mp-daily-head');
        head.appendChild(el('span', 'mp-daily-label', 'DAILY CHALLENGE'));
        const countdown = el('span', 'mp-daily-timer', '');
        head.appendChild(countdown);
        mid.appendChild(head);
        const mapLine = el('div', 'mp-daily-map', 'Loading today\'s challenge...');
        mid.appendChild(mapLine);
        const meta = el('div', 'mp-daily-meta');
        mid.appendChild(meta);
        const right = el('div', 'mp-daily-right');
        const best = el('div', 'mp-daily-best text-dim', '');
        const playBtn = el('button', 'mc-btn mc-btn-gold mp-cta', 'PLAY DAILY');
        playBtn.disabled = true;
        right.appendChild(best);
        right.appendChild(playBtn);

        banner.appendChild(left);
        banner.appendChild(mid);
        banner.appendChild(right);

        let descriptor = null;
        let endsIn = 0;

        Api.dailyToday().then((res) => {
            if (!res || !res.ok || !res.data) { mapLine.textContent = 'Daily unavailable -- server unreachable.'; return; }
            descriptor = res.data;
            const map = MAP_LIST.find((m) => m.id === descriptor.mapId);
            mapLine.textContent = map ? (map.name || map.id) : descriptor.mapId;
            const diff = DIFFICULTIES[descriptor.difficulty];
            meta.appendChild(el('span', 'mp-badge', (diff && diff.name) || descriptor.difficulty));
            if (descriptor.modLabel && descriptor.modLabel !== 'None') {
                meta.appendChild(el('span', 'mp-badge mp-badge-mod', descriptor.modLabel));
            }
            endsIn = descriptor.endsInSec | 0;
            countdown.textContent = 'resets in ' + _fmtDuration(endsIn);
            playBtn.disabled = false;
            const tick = setInterval(() => {
                if (endsIn > 0) endsIn--;
                countdown.textContent = 'resets in ' + _fmtDuration(endsIn);
            }, 1000);
            this._addCardTimer(tick);

            // My standing today (quiet when signed out or unranked).
            Api.leaderboard({ board: 'daily', day: _utcDay(), limit: 25 }).then((lb) => {
                if (!lb || !lb.ok || !lb.data) return;
                const me = _myName();
                if (!me) return;
                const rows = lb.data.rows || [];
                const idx = rows.findIndex((r) => r.name === me);
                if (idx >= 0) best.textContent = 'Your rank today: #' + (idx + 1) + ' (R' + (rows[idx].round | 0) + ')';
            });
        });

        onPress(playBtn, () => {
            if (!descriptor) return;
            SFX.play('ui_click');
            Screens.show('game', { daily: descriptor });
        });
        return banner;
    },

    _coopPoster() {
        const card = el('div', 'mp-poster mp-poster-coop mc-panel');
        const band = el('div', 'mp-poster-band');
        band.appendChild(mkIcon('coop', '#0e2b16', 'rgba(0,0,0,0.35)', '#0e2b16'));
        const bandText = el('div', 'mp-poster-bandtext');
        bandText.appendChild(el('div', 'mp-poster-name', 'CO-OP'));
        bandText.appendChild(el('div', 'mp-poster-tag', 'Defend together -- up to 4 players'));
        band.appendChild(bandText);
        card.appendChild(band);

        const b = el('div', 'mp-poster-body');
        card.appendChild(b);

        const selRow = el('div', 'mp-sel-row');
        const mapSel = mkSelect(MAP_LIST.map((m) => ({ value: m.id, label: m.name || m.id })));
        const diffSel = mkSelect(PLAY_DIFFICULTIES
            .filter((d) => DIFFICULTIES[d])
            .map((d) => ({ value: d, label: DIFFICULTIES[d].name || d })));
        diffSel.value = 'medium';
        selRow.appendChild(_field('Map', mapSel));
        selRow.appendChild(_field('Difficulty', diffSel));
        b.appendChild(selRow);

        // Visibility + autostart as toggle chips instead of a select + checkbox.
        const chipRow = el('div', 'mp-chip-row');
        let visibility = 'public';
        const visChip = el('button', 'mp-chip is-on', 'PUBLIC');
        onPress(visChip, () => {
            visibility = (visibility === 'public') ? 'private' : 'public';
            visChip.textContent = visibility.toUpperCase();
            visChip.classList.toggle('is-on', visibility === 'public');
            SFX.play('ui_click', { vol: 0.4 });
        });
        let autoStart = false;
        const autoChip = el('button', 'mp-chip', 'AUTO-START');
        onPress(autoChip, () => {
            autoStart = !autoStart;
            autoChip.classList.toggle('is-on', autoStart);
            SFX.play('ui_click', { vol: 0.4 });
        });
        chipRow.appendChild(visChip);
        chipRow.appendChild(autoChip);
        b.appendChild(chipRow);

        const createBtn = el('button', 'mc-btn mc-btn-green mp-cta', 'CREATE PARTY');
        b.appendChild(createBtn);
        onPress(createBtn, () => this._createRoom({
            mode: 'coop',
            mapId: mapSel.value,
            difficulty: diffSel.value,
            visibility,
            autoStart,
        }, createBtn));

        b.appendChild(_orSep('or join a friend'));

        const codeInput = mkInput('text', 'CODE', LIMITS.partyCode);
        codeInput.classList.add('mp-code-input');
        codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
        const joinBtn = el('button', 'mc-btn mc-btn-small', 'JOIN');
        const joinRow = el('div', 'mp-join-row');
        joinRow.appendChild(codeInput);
        joinRow.appendChild(joinBtn);
        b.appendChild(joinRow);
        onPress(joinBtn, () => {
            const code = codeInput.value.trim().toUpperCase();
            if (code.length !== LIMITS.partyCode) { toast('Enter a ' + LIMITS.partyCode + '-character code', '\u26A0'); return; }
            this._joinRoom(code, joinBtn);
        });

        return card;
    },

    _battlesPoster() {
        const card = el('div', 'mp-poster mp-poster-pvp mc-panel');
        const band = el('div', 'mp-poster-band');
        band.appendChild(mkIcon('swords', '#3a2c04', 'rgba(0,0,0,0.35)', '#3a2c04'));
        const bandText = el('div', 'mp-poster-bandtext');
        bandText.appendChild(el('div', 'mp-poster-name', 'BATTLES 1v1'));
        bandText.appendChild(el('div', 'mp-poster-tag', 'Send mobs. Break their defense.'));
        band.appendChild(bandText);
        card.appendChild(band);

        const b = el('div', 'mp-poster-body');
        card.appendChild(b);

        const findBtn = el('button', 'mc-btn mc-btn-gold mp-cta', 'FIND MATCH');
        const status = el('div', 'mp-queue-status text-dim', 'Ranked matchmaking -- climb the ladder.');
        b.appendChild(findBtn);
        b.appendChild(status);

        let searching = false;
        let elapsed = 0;
        let timer = 0;
        const stop = () => {
            searching = false;
            if (timer) { clearInterval(timer); timer = 0; }
            findBtn.textContent = 'FIND MATCH';
            findBtn.classList.remove('is-searching');
        };
        onPress(findBtn, async () => {
            if (searching) {
                if (this._client) this._client.send({ t: 'pvp_queue', join: false });
                stop();
                status.textContent = 'Search cancelled.';
                return;
            }
            let client;
            try { client = await this._ensureConnected(); }
            catch (e) { status.textContent = 'Server unreachable.'; return; }

            searching = true;
            elapsed = 0;
            findBtn.textContent = 'CANCEL';
            findBtn.classList.add('is-searching');
            status.textContent = 'Searching for an opponent... 0s';
            timer = setInterval(() => { elapsed++; if (searching) status.textContent = 'Searching for an opponent... ' + elapsed + 's'; }, 1000);
            this._addCardTimer(timer);

            const offErr = client.on('error', (m) => {
                if (!searching) return;
                offErr();
                stop();
                status.textContent = (m && m.code === 'notfound') ? 'PVP matchmaking is unavailable.' : fmtErr(m && m.code);
            });
            // match_start is handled by the hub-level backstop listener installed
            // in _ensureConnected -- it hands the socket to the match flow even if
            // the user has switched panes while queued.
            this._addCardUnsub(offErr);
            client.send({ t: 'pvp_queue', join: true });
        });

        b.appendChild(_orSep('or practice vs AI'));

        // Practice vs a server-side bot -- instant match, never an empty queue.
        let botDiff = 'medium';
        const diffRow = el('div', 'mp-chip-row');
        const diffChips = {};
        for (const d of ['easy', 'medium', 'hard']) {
            const chip = el('button', 'mp-chip' + (d === botDiff ? ' is-on' : ''), d.toUpperCase());
            onPress(chip, () => {
                botDiff = d;
                for (const k in diffChips) diffChips[k].classList.toggle('is-on', k === d);
            });
            diffChips[d] = chip;
            diffRow.appendChild(chip);
        }
        b.appendChild(diffRow);
        const practiceBtn = el('button', 'mc-btn mc-btn-green mp-cta', 'PRACTICE VS AI');
        b.appendChild(practiceBtn);
        onPress(practiceBtn, () => this._startPractice(botDiff, practiceBtn));

        b.appendChild(_orSep('private duel'));

        // No map choice in PVP -- the server rolls a random arena for parity,
        // exactly like the ranked queue.
        const duelRow = el('div', 'mp-btn-row');
        const createBtn = el('button', 'mc-btn mc-btn-small', 'CREATE DUEL');
        duelRow.appendChild(createBtn);
        b.appendChild(duelRow);
        b.appendChild(el('div', 'mp-notice text-dim', 'Random arena, both boards identical. Winner takes the rating.'));
        onPress(createBtn, () => this._createRoom({
            mode: 'pvp_private',
            difficulty: 'medium',
            visibility: 'private',
            autoStart: false,
        }, createBtn));

        const codeInput = mkInput('text', 'CODE', LIMITS.partyCode);
        codeInput.classList.add('mp-code-input');
        codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
        const joinBtn = el('button', 'mc-btn mc-btn-small', 'JOIN');
        const joinRow = el('div', 'mp-join-row');
        joinRow.appendChild(codeInput);
        joinRow.appendChild(joinBtn);
        b.appendChild(joinRow);
        onPress(joinBtn, () => {
            const code = codeInput.value.trim().toUpperCase();
            if (code.length !== LIMITS.partyCode) { toast('Enter a ' + LIMITS.partyCode + '-character code', '\u26A0'); return; }
            this._joinRoom(code, joinBtn);
        });

        return card;
    },

    // ---- BROWSER pane ----------------------------------------------------

    _renderBrowser(pane) {
        const wrap = el('div', 'mp-browse mc-panel');
        const bar = el('div', 'mp-browse-bar');
        bar.appendChild(el('div', 'mp-browse-title', 'PUBLIC GAMES'));
        const count = el('div', 'mp-browse-count text-dim', '');
        bar.appendChild(count);
        wrap.appendChild(bar);

        const headRow = el('div', 'mp-room-row mp-room-head');
        headRow.appendChild(el('span', 'mp-rr-name', 'ROOM'));
        headRow.appendChild(el('span', 'mp-rr-mode', 'MODE'));
        headRow.appendChild(el('span', 'mp-rr-status', 'STATUS'));
        headRow.appendChild(el('span', 'mp-rr-players', 'PLAYERS'));
        headRow.appendChild(el('span', 'mp-rr-actions', ''));
        wrap.appendChild(headRow);

        const list = el('div', 'mp-rooms-list');
        wrap.appendChild(list);
        pane.appendChild(wrap);

        const rowsById = new Map();
        const setEmpty = (text) => {
            list.textContent = '';
            rowsById.clear();
            const e = el('div', 'mp-empty-state');
            e.appendChild(mkIcon('globe', '#4aa8ff', 'rgba(0,0,0,0.5)', '#bfe0ff'));
            e.appendChild(el('div', 'mp-empty-text', text));
            e.appendChild(el('div', 'mp-empty-sub text-dim', 'Create a public party from the PLAY tab and it will show up here.'));
            list.appendChild(e);
        };

        const refresh = async () => {
            const res = await Api.rooms();
            if (!res || !res.ok || !res.data) {
                if (!rowsById.size) setEmpty('Server unreachable.');
                count.textContent = '';
                return;
            }
            const rooms = res.data.rooms || [];
            count.textContent = rooms.length + ' room' + (rooms.length === 1 ? '' : 's') + ' -- refreshes every 5s';
            const seen = new Set();
            if (!rooms.length) { setEmpty('No public rooms right now.'); return; }
            if (list.querySelector('.mp-empty-state')) list.textContent = '';
            // Add / update rows without wiping the list (click-eating trap).
            for (const room of rooms) {
                seen.add(room.roomId);
                let entry = rowsById.get(room.roomId);
                if (!entry) {
                    entry = this._buildRoomRow(room);
                    rowsById.set(room.roomId, entry);
                    list.appendChild(entry.el);
                }
                entry.update(room);
            }
            for (const [id, entry] of rowsById) {
                if (!seen.has(id)) { if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el); rowsById.delete(id); }
            }
        };
        refresh();
        const timer = setInterval(refresh, 5000);
        this._addCardTimer(timer);
    },

    _buildRoomRow(room) {
        const rowEl = el('div', 'mp-room-row mc-slot');
        const map = MAP_LIST.find((m) => m.id === room.mapId);
        const nameCell = el('span', 'mp-rr-name');
        nameCell.appendChild(el('span', 'mp-room-name', room.name || (map ? map.name : room.mapId) || 'Room'));
        nameCell.appendChild(el('span', 'mp-room-map text-dim', map ? (map.name || map.id) : (room.mapId || '')));
        rowEl.appendChild(nameCell);
        const modeCell = el('span', 'mp-rr-mode');
        const modeBadge = el('span', 'mp-badge', '');
        modeCell.appendChild(modeBadge);
        rowEl.appendChild(modeCell);
        const statusCell = el('span', 'mp-rr-status', '');
        rowEl.appendChild(statusCell);
        const playersCell = el('span', 'mp-rr-players', '');
        rowEl.appendChild(playersCell);

        const actions = el('span', 'mp-rr-actions');
        const joinBtn = el('button', 'mc-btn mc-btn-green mc-btn-small', 'Join');
        joinBtn.style.display = 'none';
        onPress(joinBtn, () => { if (rowEl._code) this._joinRoom(rowEl._code, joinBtn); });
        actions.appendChild(joinBtn);
        const specBtn = el('button', 'mc-btn mc-btn-small', 'Spectate');
        onPress(specBtn, () => this._spectate(room.roomId, specBtn));
        actions.appendChild(specBtn);
        rowEl.appendChild(actions);

        const update = (r) => {
            const isPvp = r.mode === 'pvp' || r.mode === 'pvp_private';
            modeBadge.textContent = isPvp ? 'PVP' : 'CO-OP';
            modeBadge.classList.toggle('mp-badge-mod', isPvp);
            statusCell.textContent = (r.status === 'live') ? 'IN GAME' : (r.status === 'post') ? 'ENDED' : 'LOBBY';
            playersCell.textContent = (r.players | 0) + '/' + (r.maxPlayers | 0) +
                (r.spectators ? ' +' + r.spectators + ' watching' : '');
            // Joinable when the public feed exposes the room code and there is space.
            rowEl._code = r.code || null;
            const joinable = !!r.code && r.status === 'lobby' && (r.players | 0) < (r.maxPlayers | 0);
            joinBtn.style.display = joinable ? '' : 'none';
        };
        return { el: rowEl, update };
    },

    // ---- RANKINGS pane ----------------------------------------------------

    _renderBoards(pane) {
        const wrap = el('div', 'mp-boards mc-panel');
        const seg = el('div', 'mp-seg');
        const segBtns = {};
        for (const s of [['solo', 'SOLO'], ['pvp', 'PVP'], ['daily', 'DAILY']]) {
            const btn = el('button', 'mp-seg-btn', s[1]);
            onPress(btn, () => { if (board !== s[0]) { board = s[0]; SFX.play('ui_click', { vol: 0.4 }); render(); } });
            seg.appendChild(btn);
            segBtns[s[0]] = btn;
        }
        wrap.appendChild(seg);

        const controls = el('div', 'mp-lb-controls');
        wrap.appendChild(controls);
        const results = el('div', 'mp-lb-results');
        wrap.appendChild(results);
        pane.appendChild(wrap);

        let board = 'solo';
        const mapSel = mkSelect(MAP_LIST.map((m) => ({ value: m.id, label: m.name || m.id })));
        const diffSel = mkSelect(PLAY_DIFFICULTIES
            .filter((d) => DIFFICULTIES[d])
            .map((d) => ({ value: d, label: DIFFICULTIES[d].name || d })));
        diffSel.value = 'medium';
        const dayInput = mkInput('text', 'YYYY-MM-DD', 10);
        dayInput.value = _utcDay();

        const render = async () => {
            for (const id in segBtns) segBtns[id].classList.toggle('is-active', id === board);
            controls.textContent = '';
            if (board === 'solo') {
                controls.appendChild(_field('Map', mapSel));
                controls.appendChild(_field('Difficulty', diffSel));
            } else if (board === 'daily') {
                controls.appendChild(_field('Day', dayInput));
            }
            results.textContent = '';
            results.appendChild(el('div', 'mp-empty text-dim', 'Loading...'));

            let params;
            if (board === 'pvp') params = { board: 'pvp', limit: 25 };
            else if (board === 'daily') params = { board: 'daily', day: (dayInput.value.trim() || _utcDay()), limit: 25 };
            else params = { board: 'solo', mapId: mapSel.value, difficulty: diffSel.value, limit: 25 };

            const res = await Api.leaderboard(params);
            results.textContent = '';
            if (!res || !res.ok || !res.data) { results.appendChild(el('div', 'mp-empty text-dim', 'Server unreachable.')); return; }
            const rows = res.data.rows || [];
            if (!rows.length) { results.appendChild(el('div', 'mp-empty text-dim', 'No entries yet -- claim the top spot.')); return; }
            const me = _myName();
            rows.forEach((r, i) => {
                results.appendChild(board === 'pvp' ? _pvpRow(i + 1, r, me) : _scoreRow(i + 1, r, me));
            });
        };

        mapSel.addEventListener('change', render);
        diffSel.addEventListener('change', render);
        dayInput.addEventListener('change', render);
        render();
    },

    // ---- PROFILE pane ------------------------------------------------------

    _renderProfile(pane) {
        const wrap = el('div', 'mp-profile');

        if (!Session.authed()) {
            const card = el('div', 'mp-auth-card mc-panel');
            card.appendChild(el('div', 'mp-auth-title pixel-title', 'SIGN IN'));
            card.appendChild(el('div', 'mp-auth-sub text-dim',
                'One account for cloud saves, leaderboards, and your PVP rating.'));

            const name = mkInput('text', 'Name (3-16 chars)', LIMITS.name[1]);
            const pass = mkInput('password', 'Password (6-64 chars)', 64);
            card.appendChild(_field('Name', name));
            card.appendChild(_field('Password', pass));

            const msg = el('div', 'mp-msg', '');
            const setMsg = (text, isErr) => {
                msg.textContent = text || '';
                msg.className = 'mp-msg' + (text ? (isErr ? ' mp-msg-error' : ' mp-msg-ok') : '');
            };

            const row = el('div', 'mp-btn-row');
            const loginBtn = el('button', 'mc-btn mc-btn-green', 'LOG IN');
            const regBtn = el('button', 'mc-btn', 'REGISTER');
            row.appendChild(loginBtn);
            row.appendChild(regBtn);
            card.appendChild(row);
            card.appendChild(msg);

            const submit = async (kind) => {
                const nm = name.value.trim();
                const pw = pass.value;
                if (!validName(nm)) { setMsg('Name must be 3-16 chars (letters/digits/_-/space).', true); return; }
                if (pw.length < 6 || pw.length > 64) { setMsg('Password must be 6-64 characters.', true); return; }
                setMsg(kind === 'register' ? 'Creating account...' : 'Signing in...', false);
                loginBtn.disabled = true; regBtn.disabled = true;
                const res = kind === 'register' ? await Api.register(nm, pw) : await Api.login(nm, pw);
                loginBtn.disabled = false; regBtn.disabled = false;
                if (res && res.ok && res.data && res.data.token) {
                    Session.set({ token: res.data.token, playerId: res.data.playerId, name: res.data.name });
                    SFX.play('achievement', { vol: 0.7 });
                    // account:changed re-renders the pane and kicks the cloud sync.
                } else {
                    const code = (res && res.data && res.data.error) || 'network';
                    setMsg(fmtErr(code), true);
                    SFX.play('ui_error', { vol: 0.6 });
                }
            };
            onPress(loginBtn, () => submit('login'));
            onPress(regBtn, () => submit('register'));
            pass.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submit('login'); });

            // Optional guest display name (used for co-op/pvp without an account).
            const guestName = mkInput('text', 'Optional guest name', LIMITS.name[1]);
            const stored = _guestName();
            if (stored) guestName.value = stored;
            guestName.addEventListener('change', () => {
                const v = guestName.value.trim();
                const ls = _localStorage();
                if (ls) { try { if (v) ls.setItem(KEY_GUEST_NAME, v); else ls.removeItem(KEY_GUEST_NAME); } catch (e) { /* ignore */ } }
            });
            card.appendChild(_orSep('playing as a guest?'));
            card.appendChild(_field('Guest name', guestName));
            card.appendChild(el('div', 'mp-notice text-dim',
                'Guests can play co-op and PVP, but progress, cloud saves, and leaderboard entries need an account.'));
            wrap.appendChild(card);
            pane.appendChild(wrap);
            return;
        }

        const acc = Session.current();
        const idCard = el('div', 'mp-id-card mc-panel');
        const idRow = el('div', 'mp-id-row');
        idRow.appendChild(mkIcon('head', '#4aedd9', 'rgba(0,0,0,0.5)', '#12101a'));
        const idText = el('div', 'mp-id-text');
        idText.appendChild(el('div', 'mp-id-name', (acc && acc.name) || 'Player'));
        const rating = el('div', 'mp-id-sub text-dim', 'loading...');
        idText.appendChild(rating);
        idRow.appendChild(idText);
        const logout = el('button', 'mc-btn mc-btn-red mc-btn-small mp-id-logout', 'LOG OUT');
        onPress(logout, () => { SFX.play('ui_click'); Session.clear(); });
        idRow.appendChild(logout);
        idCard.appendChild(idRow);

        const grid = el('div', 'mp-stat-grid');
        idCard.appendChild(grid);
        grid.appendChild(el('div', 'mp-empty text-dim', 'Loading stats...'));

        const cloudRow = el('div', 'mp-cloud-row');
        cloudRow.appendChild(el('span', 'mp-cloud-status text-dim', cloudStatusText()));
        const pushBtn = el('button', 'mc-btn mc-btn-small', 'PUSH SAVE');
        const pullBtn = el('button', 'mc-btn mc-btn-small', 'PULL SAVE');
        onPress(pushBtn, async () => {
            const r = await cloudForcePush();
            toast(r && r.ok ? 'Save pushed to cloud' : 'Push failed', r && r.ok ? '\u2601' : '\u26A0');
        });
        onPress(pullBtn, () => { cloudForcePull(); });
        cloudRow.appendChild(pushBtn);
        cloudRow.appendChild(pullBtn);
        idCard.appendChild(cloudRow);

        wrap.appendChild(idCard);
        pane.appendChild(wrap);

        Api.me().then((res) => {
            grid.textContent = '';
            if (!res || !res.ok || !res.data) {
                rating.textContent = 'Stats unavailable offline.';
                grid.appendChild(el('div', 'mp-empty text-dim', 'Server unreachable.'));
                return;
            }
            const s = res.data.stats || {};
            const pvp = res.data.pvp || {};
            rating.textContent = 'PVP rating ' + (pvp.rating != null ? pvp.rating : 1000);
            grid.appendChild(_stat('Games', s.gamesPlayed || 0));
            grid.appendChild(_stat('Wins', s.wins || 0));
            grid.appendChild(_stat('Best Round', s.highestRound || 0));
            grid.appendChild(_stat('PVP Rating', pvp.rating != null ? pvp.rating : 1000));
            grid.appendChild(_stat('PVP W/L/D', (pvp.wins || 0) + '/' + (pvp.losses || 0) + '/' + (pvp.draws || 0)));
            grid.appendChild(_stat('Kills', s.kills || 0));
        });
    },

    // ---- networking helpers ------------------------------------------

    _probeHealth() {
        Api.health().then((res) => {
            if (!this._pill) return;
            if (res && res.ok && res.data && res.data.ok) {
                this._pill.textContent = 'Online';
                this._pill.classList.add('mp-conn-ok');
            } else {
                this._pill.textContent = 'Server unreachable';
                this._pill.classList.add('mp-conn-bad');
            }
        });
    },

    /**
     * Lazily open (or reuse) the single lobby MpClient. Rejects when the socket
     * cannot connect so callers can degrade to a "server unreachable" message.
     * Installs a hub-level match_start backstop so a queued PVP match is never
     * missed because the user switched panes.
     * @returns {Promise<MpClient>}
     */
    _ensureConnected() {
        if (this._client && this._client.readyState === 1) return Promise.resolve(this._client);
        if (this._connecting) return this._connecting;
        const client = _makeClient();
        this._connecting = client.connect().then((welcome) => {
            this._client = client;
            this._welcome = welcome;
            this._connecting = null;
            // Mount-scoped (not pane-scoped): survives tab switches.
            this._unsubs.push(client.on('match_start', (m) => this._handoff(client, null, m)));
            return client;
        }).catch((e) => {
            this._connecting = null;
            try { client.close(); } catch (err) { /* ignore */ }
            throw e;
        });
        return this._connecting;
    },

    // Practice vs AI: create a bot PVP room; it launches immediately and the
    // match_start backstop (installed in _ensureConnected) runs the versus ->
    // game handoff, so there is no lobby -- just like the ranked queue.
    async _startPractice(difficulty, btn) {
        if (this._busyFlow) return;
        this._busyFlow = true;
        if (btn) btn.disabled = true;
        const done = () => { this._busyFlow = false; if (btn) btn.disabled = false; };

        let client;
        try { client = await this._ensureConnected(); }
        catch (e) { toast('Server unreachable', '\u26A0'); done(); return; }

        const offErr = client.on('error', (m) => { offErr(); done(); toast(fmtErr(m && m.code), '\u26A0'); });
        this._addCardUnsub(offErr);
        SFX.play('ui_open', { vol: 0.7 });
        client.send({ t: 'create_room', mode: 'pvp_practice', bot: difficulty, visibility: 'private' });
        setTimeout(done, 2000);   // the handoff swaps screens; this just frees the button on error
    },

    async _createRoom(opts, btn) {
        if (this._busyFlow) return;
        this._busyFlow = true;
        if (btn) btn.disabled = true;
        const done = () => { this._busyFlow = false; if (btn) btn.disabled = false; };

        let client;
        try { client = await this._ensureConnected(); }
        catch (e) { toast('Server unreachable', '\u26A0'); done(); return; }

        this._awaitRoomEntry(client, done);
        client.send({
            t: 'create_room',
            mode: opts.mode,
            mapId: opts.mapId,
            difficulty: opts.difficulty,
            visibility: opts.visibility,
            autoStart: !!opts.autoStart,
        });
    },

    async _joinRoom(code, btn) {
        if (this._busyFlow) return;
        this._busyFlow = true;
        if (btn) btn.disabled = true;
        const done = () => { this._busyFlow = false; if (btn) btn.disabled = false; };

        let client;
        try { client = await this._ensureConnected(); }
        catch (e) { toast('Server unreachable', '\u26A0'); done(); return; }

        this._awaitRoomEntry(client, done);
        client.send({ t: 'join_room', code });
    },

    async _spectate(roomId, btn) {
        if (this._busyFlow) return;
        this._busyFlow = true;
        if (btn) btn.disabled = true;
        const done = () => { this._busyFlow = false; if (btn) btn.disabled = false; };

        let client;
        try { client = await this._ensureConnected(); }
        catch (e) { toast('Server unreachable', '\u26A0'); done(); return; }

        this._awaitRoomEntry(client, done);
        client.send({ t: 'spectate', roomId });
    },

    // Wait for the room to confirm entry. room_state means "in the lobby / room";
    // a preceding match_start (join-in-progress / live spectate) is captured and
    // forwarded so the handoff never loses it. An error re-enables the control.
    _awaitRoomEntry(client, done) {
        let matchStart = null;
        let settled = false;
        const cleanup = () => { offState(); offStart(); offErr(); if (timer) clearTimeout(timer); };
        const offStart = client.on('match_start', (m) => { matchStart = m; });
        const offState = client.on('room_state', (m) => {
            if (settled) return;
            settled = true;
            cleanup();
            done();
            this._handoff(client, m, matchStart);
        });
        const offErr = client.on('error', (m) => {
            if (settled) return;
            settled = true;
            cleanup();
            done();
            toast(fmtErr(m && m.code), '\u26A0');
            SFX.play('ui_error', { vol: 0.6 });
        });
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            done();
            toast('No response from server', '\u26A0');
        }, 10000);
        this._addCardUnsub(cleanup);
    },

    // Hand the connected client to the lobby (co-op / private PVP) or straight
    // into a started match (PVP quick-match, where there is no lobby). Ownership
    // of the socket transfers -- we must NOT close it on unmount.
    // Params shape per Section 8: {client, roomState}; matchStart is an extra the
    // lobby/match flow (B1) may consume for join-in-progress / pre-started games.
    _handoff(client, roomState, matchStart) {
        if (this._handedOver) return;   // dedupe: backstop + room-entry can both fire
        this._handedOver = true;
        SFX.play('ui_open', { vol: 0.7 });
        if (matchStart && !roomState) {
            // Pre-started match (PVP quick-match): no lobby -- but no jarring
            // snap either. Versus interstitial first, then the game.
            const ms = matchStart;
            const players = ms.players || [];
            const meP = players.find((pl) => pl.slot === ms.mySlot) || {};
            const oppP = players.find((pl) => pl.slot !== ms.mySlot) || {};
            const map = MAP_LIST.find((m) => m.id === ms.mapId);
            const oppRating = (ms.pvp && ms.pvp.opponent && typeof ms.pvp.opponent.rating === 'number')
                ? (ms.pvp.opponent.rating + ' ELO') : '';
            showVersus({
                meName: meP.name || _myName() || 'You',
                oppName: oppP.name || 'Opponent',
                oppRating,
                mapName: map ? (map.name || map.id) : ms.mapId,
                difficulty: (DIFFICULTIES[ms.difficulty] && DIFFICULTIES[ms.difficulty].name) || '',
            }, () => Screens.show('game', { mp: { client, matchStart: ms, code: ms.code || null } }));
            return;
        }
        Screens.show('mplobby', { client, roomState: roomState || null, matchStart: matchStart || null });
    },
};

// ---- shared row / field builders -------------------------------------

function _field(label, input) {
    const wrap = el('label', 'mp-field');
    wrap.appendChild(el('span', 'mp-field-label', label));
    wrap.appendChild(input);
    return wrap;
}

function _orSep(text) {
    const sep = el('div', 'mp-or');
    sep.appendChild(el('span', 'mp-or-line'));
    sep.appendChild(el('span', 'mp-or-text', text));
    sep.appendChild(el('span', 'mp-or-line'));
    return sep;
}

function _stat(label, value) {
    const cell = el('div', 'mp-stat');
    cell.appendChild(el('div', 'mp-stat-v', String(value)));
    cell.appendChild(el('div', 'mp-stat-l', label));
    return cell;
}

function _rankCell(rank) {
    const r = el('span', 'mp-lb-rank' + (rank <= 3 ? ' mp-lb-r' + rank : ''), rank <= 3 ? String(rank) : '#' + rank);
    return r;
}

function _scoreRow(rank, r, myName) {
    const row = el('div', 'mp-lb-row' + (myName && r.name === myName ? ' mp-lb-me' : ''));
    row.appendChild(_rankCell(rank));
    row.appendChild(el('span', 'mp-lb-name', r.name || '???'));
    const detail = (r.victory ? 'WIN R' : 'R') + (r.round | 0) +
        ' | ' + (r.livesLeft | 0) + ' lives | ' + _fmtDuration(Math.round((r.ticks | 0) / 60));
    row.appendChild(el('span', 'mp-lb-detail text-dim', detail));
    return row;
}

function _pvpRow(rank, r, myName) {
    const row = el('div', 'mp-lb-row' + (myName && r.name === myName ? ' mp-lb-me' : ''));
    row.appendChild(_rankCell(rank));
    row.appendChild(el('span', 'mp-lb-name', r.name || '???'));
    row.appendChild(el('span', 'mp-lb-detail text-dim',
        (r.rating != null ? r.rating : 1000) + ' | ' + (r.wins || 0) + 'W ' + (r.losses || 0) + 'L ' + (r.draws || 0) + 'D'));
    return row;
}

// ---- misc pure-ish utilities -----------------------------------------

function _makeClient() {
    const opts = {};
    if (!Session.authed()) {
        const gn = _guestName();
        if (gn) opts.name = gn;
    }
    return new MpClient(opts);
}

function _guestName() {
    const ls = _localStorage();
    if (!ls) return null;
    try {
        const v = ls.getItem(KEY_GUEST_NAME);
        return (v && validName(v)) ? v : null;
    } catch (e) {
        return null;
    }
}

function _myName() {
    const acc = Session.current();
    return acc && acc.name ? acc.name : null;
}

function _utcDay(nowMs) {
    return new Date(nowMs == null ? Date.now() : nowMs).toISOString().slice(0, 10);
}

function _fmtDuration(sec) {
    sec = Math.max(0, sec | 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
}

// Self-register + install the cross-cutting online wiring (browser only).
Screens.register('mphub', MpHub);
installHubWiring();
