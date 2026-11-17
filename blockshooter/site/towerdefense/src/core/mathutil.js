// Small math + formatting helpers. Headless-safe (pure functions, no globals
// beyond Math). Used everywhere -- keep allocation-free where it matters.

export const TAU = Math.PI * 2;

/** Clamp v into [a, b]. */
export function clamp(v, a, b) {
    return v < a ? a : (v > b ? b : v);
}

/** Linear interpolation. t is not clamped. */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Euclidean distance. */
export function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

/** Squared distance -- cheaper than dist() for range comparisons. */
export function dist2(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}

/** Angle (radians) from point 1 to point 2. */
export function angleTo(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

/** Unit vector at angle a scaled by len. */
export function vecFromAngle(a, len) {
    return { x: Math.cos(a) * len, y: Math.sin(a) * len };
}

/** Cubic ease-out, 0..1 -> 0..1. */
export function easeOutCubic(t) {
    const f = t - 1;
    return f * f * f + 1;
}

/** Quadratic ease-in-out, 0..1 -> 0..1. */
export function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Overshooting ease-out (settles above then back), 0..1 -> ~0..1. */
export function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const f = t - 1;
    return 1 + c3 * f * f * f + c1 * f * f;
}

// One-decimal magnitude with a trimmed trailing '.0' (e.g. 1.2, 15, 999).
function _fmtScaled(a) {
    const r = Math.round(a * 10) / 10;
    return Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1);
}

/**
 * Cash formatting: thousands grouped with commas up to a million, then a
 * compact 'm'/'b' suffix. 1234 -> '1,234'; 1200000 -> '1.2m'.
 * @param {number} n
 * @returns {string}
 */
export function formatCash(n) {
    if (!Number.isFinite(n)) return '0';
    n = Math.round(n);
    const neg = n < 0;
    const a = Math.abs(n);
    let out;
    if (a >= 1e9) out = _fmtScaled(a / 1e9) + 'b';
    else if (a >= 1e6) out = _fmtScaled(a / 1e6) + 'm';
    else out = String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return neg ? '-' + out : out;
}

/**
 * Compact number with k/m/b suffixes from a thousand up. 12500 -> '12.5k'.
 * @param {number} n
 * @returns {string}
 */
export function shortNum(n) {
    if (!Number.isFinite(n)) return '0';
    const neg = n < 0;
    const a = Math.abs(n);
    let out;
    if (a >= 1e9) out = _fmtScaled(a / 1e9) + 'b';
    else if (a >= 1e6) out = _fmtScaled(a / 1e6) + 'm';
    else if (a >= 1e3) out = _fmtScaled(a / 1e3) + 'k';
    else out = String(Math.round(a));
    return neg ? '-' + out : out;
}
