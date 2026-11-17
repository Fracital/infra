// Settings overlay. Browser-only.
//
// Live-applies on every change: persists via Save.saveSettings and broadcasts
// bus 'settings:changed' so audio/particles/renderer react immediately. Includes
// a two-step "Reset save data" that wipes every bd_* localStorage key.

import { Save } from '../core/save.js';
import { bus } from '../core/events.js';
import { SFX } from '../audio/sfx.js';
import { toast } from './tooltips.js';
import { Session } from '../net/session.js';
import { cloudForcePush, cloudForcePull, cloudStatusText } from './mphub.js';

const QUALITIES = ['low', 'medium', 'high'];

/**
 * Open the settings overlay as a child of `parentEl`.
 * @param {HTMLElement} parentEl
 */
export function openSettings(parentEl) {
    const host = parentEl ||
        (typeof document !== 'undefined' && document.getElementById('screen-root'));
    if (!host) return;

    const s = Save.loadSettings();

    const ov = document.createElement('div');
    ov.className = 'mc-overlay settings-overlay is-open anim-fade';

    const backdrop = document.createElement('div');
    backdrop.className = 'ov-backdrop';
    ov.appendChild(backdrop);

    const card = document.createElement('div');
    card.className = 'ov-card settings-card mc-panel anim-pop';
    ov.appendChild(card);

    const title = document.createElement('div');
    title.className = 'ov-title pixel-title';
    title.textContent = 'Settings';
    card.appendChild(title);

    const body = document.createElement('div');
    body.className = 'settings-body';
    card.appendChild(body);

    const apply = () => {
        Save.saveSettings(s);
        bus.emit('settings:changed', s);
    };

    // ---- volume sliders ----
    const volGroup = _group(body, 'Audio');
    _slider(volGroup, 'Master Volume', s.master, (v) => { s.master = v; apply(); });
    _slider(volGroup, 'Music', s.music, (v) => { s.music = v; apply(); });
    _slider(volGroup, 'Sound FX', s.sfx, (v) => { s.sfx = v; apply(); SFX.play('ui_hover', { vol: 0.6 }); });

    // ---- graphics ----
    const gfxGroup = _group(body, 'Graphics');
    _select(gfxGroup, 'Particle Quality', QUALITIES,
        ['Low', 'Medium', 'High'], s.particles, (v) => { s.particles = v; apply(); });
    const shakeToggle = _toggle(gfxGroup, 'Screen Shake', s.shake, (v) => { s.shake = v; apply(); });
    const fpsToggle = _toggle(gfxGroup, 'Show FPS', s.showFps, (v) => { s.showFps = v; apply(); });

    // ---- gameplay ----
    const gpGroup = _group(body, 'Gameplay');
    const dmgToggle = _toggle(gpGroup, 'Damage Numbers', s.damageNumbers, (v) => { s.damageNumbers = v; apply(); });
    const autoToggle = _toggle(gpGroup, 'Auto-Start Rounds', s.autoStart, (v) => { s.autoStart = v; apply(); });

    // ---- save transfer (move progress between machines / to the website) ----
    const xferGroup = _group(body, 'Save Data');
    const xferText = document.createElement('textarea');
    xferText.className = 'settings-xfer-text';
    xferText.placeholder = 'Export puts your save code here (and on the clipboard). Paste a code and hit Import to load it.';
    xferText.spellcheck = false;
    const xferRow = document.createElement('div');
    xferRow.className = 'settings-row settings-xfer';
    const expBtn = document.createElement('button');
    expBtn.type = 'button';
    expBtn.className = 'mc-btn mc-btn-small';
    expBtn.textContent = 'Export Save';
    expBtn.addEventListener('click', () => {
        const code = _exportCode();
        if (!code) { toast('Nothing to export yet', '\u{1F4E6}'); return; }
        xferText.value = code;
        xferText.focus();
        xferText.select();
        SFX.play('ui_click', { vol: 0.6 });
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(
                () => toast('Save code copied to clipboard', '\u{1F4CB}'),
                () => toast('Copy the code from the box below', '\u{1F4CB}')
            );
        } else {
            toast('Copy the code from the box below', '\u{1F4CB}');
        }
    });
    const impBtn = document.createElement('button');
    impBtn.type = 'button';
    impBtn.className = 'mc-btn mc-btn-green mc-btn-small';
    impBtn.textContent = 'Import Save';
    impBtn.addEventListener('click', () => {
        const code = xferText.value.trim();
        if (!code) { xferText.focus(); toast('Paste a save code first', '\u{1F4E5}'); return; }
        try {
            _importCode(code);
            toast('Save imported -- reloading...', '\u{2705}');
            SFX.play('achievement', { vol: 0.8 });
            setTimeout(() => location.reload(), 900);
        } catch (e) {
            toast('That save code is not valid', '\u{26A0}');
            SFX.play('ui_error', { vol: 0.6 });
        }
    });
    xferRow.appendChild(expBtn);
    xferRow.appendChild(impBtn);
    xferGroup.appendChild(xferRow);
    xferGroup.appendChild(xferText);

    // ---- cloud sync (account-backed save transfer, owner B3) ----
    const cloud = document.createElement('div');
    cloud.className = 'settings-cloud';
    const cloudStatus = document.createElement('div');
    cloudStatus.className = 'settings-cloud-status';
    cloudStatus.textContent = cloudStatusText();
    const cloudRow = document.createElement('div');
    cloudRow.className = 'settings-cloud-row';
    const pushBtn = document.createElement('button');
    pushBtn.type = 'button';
    pushBtn.className = 'mc-btn mc-btn-small';
    pushBtn.textContent = 'Push to Cloud';
    const pullBtn = document.createElement('button');
    pullBtn.type = 'button';
    pullBtn.className = 'mc-btn mc-btn-small';
    pullBtn.textContent = 'Pull from Cloud';
    if (!Session.authed()) { pushBtn.disabled = true; pullBtn.disabled = true; }
    pushBtn.addEventListener('click', () => {
        SFX.play('ui_click', { vol: 0.6 });
        cloudStatus.textContent = 'Pushing...';
        cloudForcePush().then((res) => {
            const ok = res && res.ok;
            cloudStatus.textContent = ok ? 'Pushed to cloud.' : 'Push failed (server unreachable).';
            toast(ok ? 'Save pushed to cloud' : 'Cloud push failed', ok ? '\u2601' : '\u26A0');
        });
    });
    pullBtn.addEventListener('click', () => {
        SFX.play('ui_click', { vol: 0.6 });
        cloudForcePull();   // shows its own toast + reloads on success
    });
    cloudRow.appendChild(pushBtn);
    cloudRow.appendChild(pullBtn);
    cloud.appendChild(cloudStatus);
    cloud.appendChild(cloudRow);
    xferGroup.appendChild(cloud);

    // ---- danger zone ----
    const dz = document.createElement('div');
    dz.className = 'settings-danger';
    const reset = document.createElement('button');
    reset.className = 'mc-btn mc-btn-red mc-btn-small';
    reset.type = 'button';
    reset.textContent = 'Reset Save Data';
    let armed = false;
    let armTimer = 0;
    reset.addEventListener('click', () => {
        if (!armed) {
            armed = true;
            reset.classList.add('armed');
            reset.textContent = 'Confirm Reset?';
            SFX.play('ui_click', { vol: 0.7 });
            if (armTimer) clearTimeout(armTimer);
            armTimer = setTimeout(() => {
                armed = false;
                reset.classList.remove('armed');
                reset.textContent = 'Reset Save Data';
            }, 3000);
            return;
        }
        if (armTimer) { clearTimeout(armTimer); armTimer = 0; }
        armed = false;
        reset.classList.remove('armed');
        reset.textContent = 'Reset Save Data';
        _wipeSaves();
        // Re-seed the live object with defaults, refresh every control, apply.
        const d = Save.defaultSettings();
        for (const k in d) s[k] = d[k];
        shakeToggle.set(s.shake);
        fpsToggle.set(s.showFps);
        dmgToggle.set(s.damageNumbers);
        autoToggle.set(s.autoStart);
        _refreshSliders(body, s);
        _refreshSelect(body, s.particles);
        apply();
        toast('Save data reset', '\u{1F5D1}');
        SFX.play('ui_error', { vol: 0.6 });
    });
    dz.appendChild(reset);
    card.appendChild(dz);

    // ---- close ----
    const close = document.createElement('button');
    close.className = 'ov-close mc-btn mc-btn-small';
    close.type = 'button';
    close.textContent = 'Close';
    card.appendChild(close);

    let onKey = null;
    const dismiss = () => {
        SFX.play('ui_close', { vol: 0.7 });
        if (onKey) document.removeEventListener('keydown', onKey, true);
        if (ov.parentNode) ov.parentNode.removeChild(ov);
    };
    close.addEventListener('click', dismiss);
    backdrop.addEventListener('click', dismiss);

    // Esc closes settings only -- capture + stopPropagation so a host Esc handler
    // (pause toggle) does not also fire underneath us.
    onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); dismiss(); }
    };
    document.addEventListener('keydown', onKey, true);

    host.appendChild(ov);
    SFX.play('ui_open', { vol: 0.7 });
}

// ---------------- control builders ----------------

function _group(parent, title) {
    const g = document.createElement('div');
    g.className = 'settings-group';
    const h = document.createElement('div');
    h.className = 'settings-group-title';
    h.textContent = title;
    g.appendChild(h);
    parent.appendChild(g);
    return g;
}

function _slider(parent, label, value, onChange) {
    const row = document.createElement('label');
    row.className = 'settings-row settings-slider';
    const l = document.createElement('span');
    l.className = 'settings-label';
    l.textContent = label;
    const val = document.createElement('span');
    val.className = 'settings-val';
    val.textContent = Math.round(value * 100) + '%';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    input.value = String(value);
    input.dataset.setting = label;
    input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        val.textContent = Math.round(v * 100) + '%';
        onChange(v);
    });
    row.appendChild(l);
    row.appendChild(input);
    row.appendChild(val);
    parent.appendChild(row);
    return row;
}

function _select(parent, label, values, labels, current, onChange) {
    const row = document.createElement('label');
    row.className = 'settings-row';
    const l = document.createElement('span');
    l.className = 'settings-label';
    l.textContent = label;
    const sel = document.createElement('select');
    sel.className = 'settings-select';
    for (let i = 0; i < values.length; i++) {
        const opt = document.createElement('option');
        opt.value = values[i];
        opt.textContent = labels[i];
        if (values[i] === current) opt.selected = true;
        sel.appendChild(opt);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    row.appendChild(l);
    row.appendChild(sel);
    parent.appendChild(row);
    return row;
}

function _toggle(parent, label, value, onChange) {
    const row = document.createElement('div');
    row.className = 'settings-row settings-toggle-row';
    const l = document.createElement('span');
    l.className = 'settings-label';
    l.textContent = label;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-toggle';
    const paint = (v) => {
        btn.classList.toggle('on', !!v);
        btn.textContent = v ? 'ON' : 'OFF';
    };
    paint(value);
    let state = value;
    btn.addEventListener('click', () => {
        state = !state;
        paint(state);
        SFX.play('ui_click', { vol: 0.5 });
        onChange(state);
    });
    row.appendChild(l);
    row.appendChild(btn);
    parent.appendChild(row);
    return { row, set: (v) => { state = v; paint(v); } };
}

function _refreshSliders(body, s) {
    const map = { 'Master Volume': s.master, 'Music': s.music, 'Sound FX': s.sfx };
    const inputs = body.querySelectorAll('input[type="range"]');
    inputs.forEach((input) => {
        const key = input.dataset.setting;
        if (key in map) {
            input.value = String(map[key]);
            const val = input.parentNode.querySelector('.settings-val');
            if (val) val.textContent = Math.round(map[key] * 100) + '%';
        }
    });
}

function _refreshSelect(body, particles) {
    const sel = body.querySelector('.settings-select');
    if (sel) sel.value = particles;
}

const XFER_KEYS = ['bd_settings', 'bd_profile', 'bd_run'];
const XFER_MAGIC = 'BDSAVE1.';

/** Bundle every bd_* save key into a portable base64 code. */
function _exportCode() {
    const data = {};
    let any = false;
    for (const k of XFER_KEYS) {
        const v = localStorage.getItem(k);
        if (v != null) { data[k] = v; any = true; }
    }
    if (!any) return '';
    return XFER_MAGIC + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

/** Validate and apply a save code produced by _exportCode. Throws on garbage. */
function _importCode(code) {
    if (code.slice(0, XFER_MAGIC.length) !== XFER_MAGIC) throw new Error('bad magic');
    const json = decodeURIComponent(escape(atob(code.slice(XFER_MAGIC.length))));
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad shape');
    const entries = Object.entries(data).filter(([k]) => XFER_KEYS.includes(k));
    if (entries.length === 0) throw new Error('no save keys');
    for (const [, v] of entries) JSON.parse(v);   // every value must itself be valid JSON
    for (const [k, v] of entries) localStorage.setItem(k, v);
}

function _wipeSaves() {
    try {
        if (typeof localStorage === 'undefined' || !localStorage) return;
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf('bd_') === 0) keys.push(k);
        }
        for (const k of keys) localStorage.removeItem(k);
    } catch (e) {
        // storage unavailable (private mode) -- nothing to wipe.
    }
}
