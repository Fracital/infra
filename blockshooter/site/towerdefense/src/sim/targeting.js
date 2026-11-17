// Spatial grid + target acquisition. Headless-safe, dependency-free.
//
// The grid is a uniform hash of mob centers rebuilt once per sim tick by game.js.
// findTargets() is the single acquisition entry every attack uses so targeting
// modes behave identically across projectile / ray / beam / melee / etc.

export class SpatialGrid {
    constructor(cellSize = 80) {
        this.cell = cellSize;
        this.map = new Map();
    }

    _key(cx, cy) {
        return cx * 100000 + cy;
    }

    rebuild(mobs) {
        this.map.clear();
        if (!mobs) return;
        const inv = 1 / this.cell;
        for (let i = 0; i < mobs.length; i++) {
            const m = mobs[i];
            if (!m || !m.alive) continue;
            const cx = Math.floor(m.x * inv);
            const cy = Math.floor(m.y * inv);
            const key = this._key(cx, cy);
            let arr = this.map.get(key);
            if (!arr) { arr = []; this.map.set(key, arr); }
            arr.push(m);
        }
    }

    /** All mobs whose center lies within `r` of (x, y). */
    queryCircle(x, y, r) {
        const res = [];
        const inv = 1 / this.cell;
        const minx = Math.floor((x - r) * inv);
        const maxx = Math.floor((x + r) * inv);
        const miny = Math.floor((y - r) * inv);
        const maxy = Math.floor((y + r) * inv);
        const r2 = r * r;
        for (let cx = minx; cx <= maxx; cx++) {
            for (let cy = miny; cy <= maxy; cy++) {
                const arr = this.map.get(this._key(cx, cy));
                if (!arr) continue;
                for (let i = 0; i < arr.length; i++) {
                    const m = arr[i];
                    const dx = m.x - x;
                    const dy = m.y - y;
                    if (dx * dx + dy * dy <= r2) res.push(m);
                }
            }
        }
        return res;
    }
}

function pathProgress(m, game) {
    const paths = game && game.paths;
    const p = paths ? paths[m.pathIndex || 0] : null;
    const len = p && p.length ? p.length : 1;
    return (m.dist || 0) / len;
}

/**
 * Acquire targets within a circle, sorted per targeting mode.
 * @param {object} game
 * @param {number} x tower/query origin
 * @param {number} y
 * @param {number} range radius (measured to mob center)
 * @param {object} [opts] {mode, count, camoDetect, groundOnly, filter}
 * @returns {Array} up to `count` mobs, best first
 */
export function findTargets(game, x, y, range, opts = {}) {
    const mode = opts.mode || 'first';
    const count = opts.count || 1;
    const camoDetect = !!opts.camoDetect;
    const groundOnly = !!opts.groundOnly;
    const filter = opts.filter || null;

    const grid = game.grid;
    const cand = grid ? grid.queryCircle(x, y, range) : (game.mobs || []);
    const query = { camoDetect, seesFlying: true, groundOnly };
    const range2 = range * range;

    const inRange = [];
    for (let i = 0; i < cand.length; i++) {
        const m = cand[i];
        if (!m.alive) continue;
        const dx = m.x - x;
        const dy = m.y - y;
        if (dx * dx + dy * dy > range2) continue;
        if (m.isTargetableBy && !m.isTargetableBy(query)) continue;
        if (filter && !filter(m)) continue;
        inRange.push(m);
    }

    if (inRange.length > 1) inRange.sort(comparator(mode, x, y, game));
    if (count >= inRange.length) return inRange;
    inRange.length = count;
    return inRange;
}

function comparator(mode, x, y, game) {
    switch (mode) {
        case 'last':
            return (a, b) => {
                const d = pathProgress(a, game) - pathProgress(b, game);
                if (d !== 0) return d;
                return (a.spawnOrder || 0) - (b.spawnOrder || 0);
            };
        case 'strong':
            return (a, b) => {
                const d = (b.maxHp || 0) - (a.maxHp || 0);
                if (d !== 0) return d;
                return pathProgress(b, game) - pathProgress(a, game);
            };
        case 'weak':
            return (a, b) => {
                const d = (a.maxHp || 0) - (b.maxHp || 0);
                if (d !== 0) return d;
                return pathProgress(b, game) - pathProgress(a, game);
            };
        case 'close':
            return (a, b) => {
                const da = (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
                const db = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
                return da - db;
            };
        case 'first':
        default:
            return (a, b) => {
                const d = pathProgress(b, game) - pathProgress(a, game);
                if (d !== 0) return d;
                return (a.spawnOrder || 0) - (b.spawnOrder || 0);
            };
    }
}
