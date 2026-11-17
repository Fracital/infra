// Persistence via localStorage. This is the one src/core module that touches a
// browser global, so every access is guarded: under node (or a browser that
// throws on storage access, e.g. privacy modes) it degrades to defaults / no-op
// and never throws.
//
// Loaded settings/profile are deep-merged OVER the defaults so that fields
// added in a later version are always present -- a stale saved blob can never
// surface an undefined field to the rest of the game.

const KEY_SETTINGS = 'bd_settings';
const KEY_PROFILE = 'bd_profile';
const KEY_RUN = 'bd_run';

function _storage() {
    try {
        if (typeof localStorage === 'undefined' || localStorage === null) return null;
        return localStorage;
    } catch (e) {
        return null;
    }
}

function _read(key) {
    const ls = _storage();
    if (!ls) return null;
    try {
        const raw = ls.getItem(key);
        if (raw === null || raw === undefined) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function _write(key, value) {
    const ls = _storage();
    if (!ls) return;
    try {
        ls.setItem(key, JSON.stringify(value));
    } catch (e) {
        // Quota exceeded / serialization failure -- persistence is best-effort.
    }
}

function _remove(key) {
    const ls = _storage();
    if (!ls) return;
    try {
        ls.removeItem(key);
    } catch (e) {
        // ignore
    }
}

function _isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Return a new object: `base` supplies the shape/defaults, `over` wins where it
// provides a value. Plain objects merge recursively; keys present only in
// `over` (e.g. saved medal ids the defaults don't enumerate) are preserved.
// Type mismatches from a corrupted blob fall back to the default.
function _deepMerge(base, over) {
    if (!_isPlainObject(base)) {
        return over === undefined ? base : over;
    }
    const out = {};
    for (const k in base) {
        out[k] = _deepMerge(base[k], _isPlainObject(over) ? over[k] : undefined);
    }
    if (_isPlainObject(over)) {
        for (const k in over) {
            if (!(k in base)) out[k] = over[k];
        }
    }
    return out;
}

export const Save = {
    /** @returns {object} fresh default settings. */
    defaultSettings() {
        return {
            master: 0.8,
            music: 0.6,
            sfx: 0.9,
            particles: 'high',
            shake: true,
            damageNumbers: true,
            autoStart: false,
            showFps: false,
        };
    },

    loadSettings() {
        return _deepMerge(this.defaultSettings(), _read(KEY_SETTINGS));
    },

    saveSettings(s) {
        // Merge over defaults before persisting so the stored blob is always
        // complete regardless of what the caller passed.
        _write(KEY_SETTINGS, _deepMerge(this.defaultSettings(), s));
    },

    /** @returns {object} fresh default profile (stats zeroed). */
    defaultProfile() {
        return {
            medals: {},
            achievements: {},
            stats: {
                kills: 0,
                cashEarned: 0,
                towersPlaced: 0,
                upgradesBought: 0,
                roundsCleared: 0,
                wins: 0,
                gamesPlayed: 0,
                highestRound: 0,
                abilitiesUsed: 0,
            },
            seenTowers: {},
        };
    },

    loadProfile() {
        return _deepMerge(this.defaultProfile(), _read(KEY_PROFILE));
    },

    saveProfile(p) {
        _write(KEY_PROFILE, _deepMerge(this.defaultProfile(), p));
    },

    /** Persist a between-rounds run snapshot (Section 9 schema). */
    saveRun(runSnapshot) {
        _write(KEY_RUN, runSnapshot);
    },

    /** @returns {object|null} the saved run, or null if none. */
    loadRun() {
        return _read(KEY_RUN);
    },

    clearRun() {
        _remove(KEY_RUN);
    },
};
