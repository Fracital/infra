// Terrain baking: turns a MapDef (char-grid + waypoints + decorations) into a
// single pre-rendered 1280x720 ground canvas plus the placement mask the sim
// consults. Browser-only (canvas): the sim never imports this -- gamescreen
// bakes once on match start and hands game.mask the result.

import { W, H, TILE, GRID_W, GRID_H } from '../core/constants.js';
import { Textures } from './textures.js';
import { drawDecoration, decorationBlocksPlacement } from './decorations.js';
import { BIOMES } from './palette.js';

// Path geometry: half-width of the walked lane. 1.3 tiles -> ~52px wide band,
// so the perpendicular reach from the centreline is ~26px. Kept as one number
// so carve tiles, the mask, and the rendered stroke stay in lockstep.
const PATH_HALF = 26;
const PATH_WIDTH = 52;

// ---------------------------------------------------------------------------
// deterministic hashing (no Math.random -- bakes must be reproducible so a
// thumbnail and its in-game terrain look identical)
// ---------------------------------------------------------------------------

/** Stable 2D hash -> float [0,1). Handles negative coords (offscreen paths). */
function hash2(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
}

// ---------------------------------------------------------------------------
// lazy scratch canvases -- created inside functions, never at module top level,
// so importing this file under node (syntax tooling) never touches the DOM.
// ---------------------------------------------------------------------------

let _fallbackTile = null;
function fallbackTile() {
    if (_fallbackTile) return _fallbackTile;
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const cc = c.getContext('2d');
    cc.fillStyle = '#6f6f6f';
    cc.fillRect(0, 0, 16, 16);
    cc.fillStyle = '#585858';
    for (let y = 0; y < 16; y += 4) {
        for (let x = 0; x < 16; x += 4) {
            if (((x + y) / 4) % 2 === 0) cc.fillRect(x, y, 4, 4);
        }
    }
    _fallbackTile = c;
    return c;
}

/** Textures.tile with a hard guarantee it never throws mid-bake. */
function safeTile(name) {
    if (name) {
        try {
            if (Textures && typeof Textures.tile === 'function') return Textures.tile(name);
        } catch (e) {
            // unknown tile name -- fall through to the debug fallback below
        }
    }
    return fallbackTile();
}

let _sampCtx = null;
const _avgCache = new Map();
/** Average RGB of a tile, used only for edge-blend + path-trim tinting. */
function avgColor(name) {
    const key = name || '__fallback__';
    const hit = _avgCache.get(key);
    if (hit) return hit;
    if (!_sampCtx) {
        const c = document.createElement('canvas');
        c.width = 4;
        c.height = 4;
        _sampCtx = c.getContext('2d');
    }
    _sampCtx.clearRect(0, 0, 4, 4);
    _sampCtx.imageSmoothingEnabled = true;
    _sampCtx.drawImage(safeTile(name), 0, 0, 4, 4);
    const d = _sampCtx.getImageData(0, 0, 4, 4).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < 16; i++) {
        r += d[i * 4];
        g += d[i * 4 + 1];
        b += d[i * 4 + 2];
    }
    const c = { r: (r / 16) | 0, g: (g / 16) | 0, b: (b / 16) | 0 };
    _avgCache.set(key, c);
    return c;
}

function rgbaOf(c, a) {
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
}

// ---------------------------------------------------------------------------
// terrain-grid helpers
// ---------------------------------------------------------------------------

function tileNameAt(mapDef, gx, gy) {
    const terr = mapDef && mapDef.terrain;
    if (!terr || !terr.rows || !terr.legend) return null;
    const row = terr.rows[gy];
    if (typeof row !== 'string') return null;
    const ch = row[gx];
    if (ch === undefined) return null;
    const name = terr.legend[ch];
    return name === undefined ? null : name;
}

function buildNameGrid(mapDef) {
    const grid = new Array(GRID_H);
    for (let gy = 0; gy < GRID_H; gy++) {
        const row = new Array(GRID_W);
        for (let gx = 0; gx < GRID_W; gx++) row[gx] = tileNameAt(mapDef, gx, gy);
        grid[gy] = row;
    }
    return grid;
}

function isWater(name) {
    return name === 'water' || name === 'water_deep';
}

function isLavaTerrain(name) {
    return name === 'lava' || name === 'magma';
}

// ---------------------------------------------------------------------------
// path math
// ---------------------------------------------------------------------------

function pointSegDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const ex = px - qx;
    const ey = py - qy;
    return ex * ex + ey * ey;
}

function nearAnyPath(mapDef, px, py, r) {
    const r2 = r * r;
    const paths = mapDef.paths || [];
    for (let pi = 0; pi < paths.length; pi++) {
        const wp = paths[pi] && paths[pi].waypoints;
        if (!wp || wp.length < 2) continue;
        for (let i = 1; i < wp.length; i++) {
            if (pointSegDist2(px, py, wp[i - 1][0], wp[i - 1][1], wp[i][0], wp[i][1]) <= r2) return true;
        }
    }
    return false;
}

function markTilesNear(set, x, y, r) {
    const gx0 = Math.max(0, Math.floor((x - r) / TILE));
    const gx1 = Math.min(GRID_W - 1, Math.floor((x + r) / TILE));
    const gy0 = Math.max(0, Math.floor((y - r) / TILE));
    const gy1 = Math.min(GRID_H - 1, Math.floor((y + r) / TILE));
    const r2 = r * r;
    for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
            const cx = gx * TILE + TILE / 2;
            const cy = gy * TILE + TILE / 2;
            const dx = cx - x;
            const dy = cy - y;
            if (dx * dx + dy * dy <= r2) set.add(gx + ',' + gy);
        }
    }
}

/**
 * All grid cells covered by any path polyline, ~1.3 tiles wide.
 * @param {object} mapDef
 * @returns {Set<string>} set of 'gx,gy' cell keys
 */
export function carvePathTiles(mapDef) {
    const set = new Set();
    const paths = (mapDef && mapDef.paths) || [];
    for (let pi = 0; pi < paths.length; pi++) {
        const wp = paths[pi] && paths[pi].waypoints;
        if (!wp || wp.length < 2) continue;
        for (let i = 1; i < wp.length; i++) {
            const ax = wp[i - 1][0];
            const ay = wp[i - 1][1];
            const bx = wp[i][0];
            const by = wp[i][1];
            const segLen = Math.hypot(bx - ax, by - ay);
            const steps = Math.max(1, Math.ceil(segLen / 8));
            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                markTilesNear(set, ax + (bx - ax) * t, ay + (by - ay) * t, PATH_HALF);
            }
        }
    }
    return set;
}

// ---------------------------------------------------------------------------
// render passes
// ---------------------------------------------------------------------------

function paintBaseGrid(ctx, names) {
    for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
            const ox = gx * TILE;
            const oy = gy * TILE;
            ctx.drawImage(safeTile(names[gy][gx]), ox, oy, TILE, TILE);
            // +-6% per-tile brightness so large single-tile fields do not read
            // as one flat slab. Cheap white/black wash approximates it.
            const b = (hash2(gx, gy) - 0.5) * 0.12;
            if (b > 0.004) {
                ctx.fillStyle = 'rgba(255,255,255,' + b.toFixed(3) + ')';
                ctx.fillRect(ox, oy, TILE, TILE);
            } else if (b < -0.004) {
                ctx.fillStyle = 'rgba(0,0,0,' + (-b).toFixed(3) + ')';
                ctx.fillRect(ox, oy, TILE, TILE);
            }
        }
    }
}

// Stipple a 3px band on one edge of the current tile with the neighbour's
// colour (fillStyle set by caller). Denser at the seam, fading inward -- reads
// as a natural material transition instead of a hard grout line.
function ditherSeam(ctx, ox, oy, side) {
    const depth = 3;
    for (let a = 0; a < TILE; a++) {
        for (let d = 0; d < depth; d++) {
            let x;
            let y;
            if (side === 0) { x = ox + d; y = oy + a; }
            else if (side === 1) { x = ox + TILE - 1 - d; y = oy + a; }
            else if (side === 2) { x = ox + a; y = oy + d; }
            else { x = ox + a; y = oy + TILE - 1 - d; }
            const thr = d === 0 ? 0.82 : d === 1 ? 0.46 : 0.18;
            if (hash2(x * 2 + 1, y * 2 + 1) < thr) ctx.fillRect(x, y, 1, 1);
        }
    }
}

function paintTransitions(ctx, names) {
    for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
            const name = names[gy][gx];
            const ox = gx * TILE;
            const oy = gy * TILE;
            const left = gx > 0 ? names[gy][gx - 1] : name;
            const right = gx < GRID_W - 1 ? names[gy][gx + 1] : name;
            const up = gy > 0 ? names[gy - 1][gx] : name;
            const down = gy < GRID_H - 1 ? names[gy + 1][gx] : name;
            if (left !== name) { ctx.fillStyle = rgbaOf(avgColor(left), 0.5); ditherSeam(ctx, ox, oy, 0); }
            if (right !== name) { ctx.fillStyle = rgbaOf(avgColor(right), 0.5); ditherSeam(ctx, ox, oy, 1); }
            if (up !== name) { ctx.fillStyle = rgbaOf(avgColor(up), 0.5); ditherSeam(ctx, ox, oy, 2); }
            if (down !== name) { ctx.fillStyle = rgbaOf(avgColor(down), 0.5); ditherSeam(ctx, ox, oy, 3); }
        }
    }
}

function paintWater(ctx, names) {
    for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
            const name = names[gy][gx];
            if (!isWater(name)) continue;
            const deep = name === 'water_deep';
            const ox = gx * TILE;
            const oy = gy * TILE;
            // baked "wave" streaks -- a couple of lighter horizontal flecks read
            // as still-water glint without needing animation.
            const cnt = 2 + (hash2(gx + 3, gy + 7) < 0.45 ? 1 : 0);
            ctx.fillStyle = deep ? 'rgba(210,235,255,0.08)' : 'rgba(222,241,255,0.14)';
            for (let k = 0; k < cnt; k++) {
                const hx = ox + 3 + Math.floor(hash2(gx * 13 + k * 5, gy * 7 + 2) * 30);
                const hy = oy + 3 + Math.floor(hash2(gx * 5 + 2, gy * 11 + k * 3) * 32);
                const len = 3 + Math.floor(hash2(gx + k, gy + k) * 4);
                ctx.fillRect(hx, hy, Math.min(len, ox + TILE - hx), 1);
            }
            // shoreline rim: lighten edges facing land tiles (in-grid only, so
            // the map border itself does not get a spurious foam line).
            ctx.fillStyle = 'rgba(198,230,246,0.5)';
            if (gx > 0 && !isWater(names[gy][gx - 1])) ctx.fillRect(ox, oy, 2, TILE);
            if (gx < GRID_W - 1 && !isWater(names[gy][gx + 1])) ctx.fillRect(ox + TILE - 2, oy, 2, TILE);
            if (gy > 0 && !isWater(names[gy - 1][gx])) ctx.fillRect(ox, oy, TILE, 2);
            if (gy < GRID_H - 1 && !isWater(names[gy + 1][gx])) ctx.fillRect(ox, oy + TILE - 2, TILE, 2);
        }
    }
}

function makePathPattern(ctx, pathTileName) {
    const c = document.createElement('canvas');
    c.width = TILE;
    c.height = TILE;
    const cc = c.getContext('2d');
    cc.imageSmoothingEnabled = false;
    cc.drawImage(safeTile(pathTileName), 0, 0, TILE, TILE);
    return ctx.createPattern(c, 'repeat');
}

function strokePolyline(ctx, wp) {
    ctx.beginPath();
    ctx.moveTo(wp[0][0], wp[0][1]);
    for (let i = 1; i < wp.length; i++) ctx.lineTo(wp[i][0], wp[i][1]);
    ctx.stroke();
}

function scatterPebbles(ctx, wp) {
    for (let i = 1; i < wp.length; i++) {
        const ax = wp[i - 1][0];
        const ay = wp[i - 1][1];
        const bx = wp[i][0];
        const by = wp[i][1];
        const L = Math.hypot(bx - ax, by - ay);
        if (L < 1) continue;
        const ux = (bx - ax) / L;
        const uy = (by - ay) / L;
        const nx = -uy;
        const ny = ux;
        for (let s = 0; s < L; s += 22) {
            const t = s / L;
            const seedX = Math.round(ax + (bx - ax) * t);
            const seedY = Math.round(ay + (by - ay) * t);
            if (hash2(seedX * 3 + 1, seedY * 3 + 7) > 0.3) continue;
            const off = (hash2(seedX + 5, seedY + 9) - 0.5) * (PATH_WIDTH - 16);
            const along = (hash2(seedX + 2, seedY + 4) - 0.5) * 10;
            const cx = Math.round(ax + (bx - ax) * t + ux * along + nx * off);
            const cy = Math.round(ay + (by - ay) * t + uy * along + ny * off);
            ctx.fillStyle = 'rgba(58,48,38,0.5)';
            ctx.fillRect(cx, cy, 3, 2);
            ctx.fillStyle = 'rgba(210,205,193,0.75)';
            ctx.fillRect(cx, cy, 2, 1);
        }
    }
}

function paintPaths(ctx, mapDef, biome) {
    const pathTileName = biome && biome.path ? biome.path : 'dirt_path';
    const pattern = makePathPattern(ctx, pathTileName);
    const pc = avgColor(pathTileName);
    const trim = 'rgba(' + ((pc.r * 0.5) | 0) + ',' + ((pc.g * 0.5) | 0) + ',' + ((pc.b * 0.5) | 0) + ',0.92)';
    const solid = 'rgba(' + pc.r + ',' + pc.g + ',' + pc.b + ',1)';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const paths = mapDef.paths || [];
    for (let pi = 0; pi < paths.length; pi++) {
        const wp = paths[pi] && paths[pi].waypoints;
        if (!wp || wp.length < 2) continue;
        // Wider dark underlay stroked first -- the 2px peeking on each side of
        // the narrower path stroke becomes the worn edge trim, joins included.
        ctx.strokeStyle = trim;
        ctx.lineWidth = PATH_WIDTH + 4;
        strokePolyline(ctx, wp);
        ctx.strokeStyle = pattern || solid;
        ctx.lineWidth = PATH_WIDTH;
        strokePolyline(ctx, wp);
        scatterPebbles(ctx, wp);
    }
}

function paintDecorations(ctx, mapDef, carveSet) {
    const decos = ((mapDef.decorations || []).slice()).sort((a, b) => (a.y || 0) - (b.y || 0));
    for (let i = 0; i < decos.length; i++) {
        const d = decos[i];
        if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
        const gx = Math.floor(d.x / TILE);
        const gy = Math.floor(d.y / TILE);
        // defensive: never draw scenery on top of the walked path
        if (carveSet.has(gx + ',' + gy)) continue;
        const seed = (d.seed !== undefined && d.seed !== null)
            ? d.seed
            : ((Math.floor(d.x) * 73856093) ^ (Math.floor(d.y) * 19349663)) >>> 0;
        try {
            drawDecoration(ctx, d.type, d.x, d.y, seed);
        } catch (e) {
            // unknown decoration type -- skip rather than abort the whole bake
        }
    }
}

function paintTintAndVignette(ctx, biome) {
    if (biome && biome.tint) {
        ctx.fillStyle = biome.tint;
        ctx.fillRect(0, 0, W, H);
    }
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W / 2, H / 2));
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.72, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// mask
// ---------------------------------------------------------------------------

function markCircleBlocked(mask, x, y, r) {
    const gx0 = Math.max(0, Math.floor((x - r) / TILE));
    const gx1 = Math.min(GRID_W - 1, Math.floor((x + r) / TILE));
    const gy0 = Math.max(0, Math.floor((y - r) / TILE));
    const gy1 = Math.min(GRID_H - 1, Math.floor((y + r) / TILE));
    const r2 = r * r;
    for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
            const cx = gx * TILE + TILE / 2;
            const cy = gy * TILE + TILE / 2;
            const dx = cx - x;
            const dy = cy - y;
            if (dx * dx + dy * dy <= r2) mask[gy * GRID_W + gx] = 0;
        }
    }
}

function computeMask(mapDef, names, carveSet) {
    const mask = new Uint8Array(GRID_W * GRID_H);
    for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
            const name = names[gy][gx];
            let v = 1;
            if (isWater(name)) v = 2;
            else if (isLavaTerrain(name)) v = 0;
            mask[gy * GRID_W + gx] = v;
        }
    }
    // path exclusion: cell centre within PATH_HALF of a segment, or in carveSet
    for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
            if (mask[gy * GRID_W + gx] === 0) continue;
            const cx = gx * TILE + TILE / 2;
            const cy = gy * TILE + TILE / 2;
            if (carveSet.has(gx + ',' + gy) || nearAnyPath(mapDef, cx, cy, PATH_HALF)) {
                mask[gy * GRID_W + gx] = 0;
            }
        }
    }
    // author-placed no-build circles
    for (const bl of mapDef.blockers || []) {
        if (bl && typeof bl.x === 'number' && typeof bl.y === 'number' && bl.r > 0) {
            markCircleBlocked(mask, bl.x, bl.y, bl.r);
        }
    }
    // solid decorations (trees, boulders, huts) block their footprint
    for (const d of mapDef.decorations || []) {
        if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
        let blocks = false;
        try {
            blocks = !!decorationBlocksPlacement(d.type);
        } catch (e) {
            blocks = false;
        }
        if (blocks) markCircleBlocked(mask, d.x, d.y, 20);
    }
    return mask;
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

/**
 * Bake a MapDef into its ground canvas and placement mask.
 * @param {object} mapDef -- see CONTRACTS.md 5.4
 * @returns {{canvas: HTMLCanvasElement, mask: Uint8Array}}
 *   canvas: 1280x720 ground+path+water+decorations+tint.
 *   mask: Uint8Array(GRID_W*GRID_H), 0=blocked 1=land 2=water, index gy*GRID_W+gx.
 */
export function bakeTerrain(mapDef) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const biome = (BIOMES && mapDef && BIOMES[mapDef.biome]) ? BIOMES[mapDef.biome] : null;
    const names = buildNameGrid(mapDef);
    const carveSet = carvePathTiles(mapDef);

    paintBaseGrid(ctx, names);
    paintTransitions(ctx, names);
    paintWater(ctx, names);
    paintPaths(ctx, mapDef, biome);
    paintDecorations(ctx, mapDef, carveSet);
    paintTintAndVignette(ctx, biome);

    const mask = computeMask(mapDef, names, carveSet);
    return { canvas, mask };
}

/**
 * Static structural checks on a MapDef. Cheap, no canvas required for most of
 * it (only the optional legend->tile existence probe touches Textures).
 * @param {object} mapDef
 * @returns {string[]} human-readable problems; empty array means the map is ok.
 */
export function validateMap(mapDef) {
    const problems = [];
    if (!mapDef || typeof mapDef !== 'object') return ['map is not an object'];

    const terr = mapDef.terrain;
    if (!terr || !Array.isArray(terr.rows) || !terr.legend) {
        problems.push('missing terrain.rows/legend');
    } else {
        if (terr.rows.length !== GRID_H) {
            problems.push('terrain has ' + terr.rows.length + ' rows, expected ' + GRID_H);
        }
        for (let r = 0; r < terr.rows.length; r++) {
            const row = terr.rows[r];
            if (typeof row !== 'string' || row.length !== GRID_W) {
                problems.push('terrain row ' + r + ' has ' + (row ? row.length : '?') + ' cols, expected ' + GRID_W);
                continue;
            }
            for (let c = 0; c < row.length; c++) {
                const ch = row[c];
                const tile = terr.legend[ch];
                if (tile === undefined) {
                    problems.push("terrain row " + r + " col " + c + " char '" + ch + "' not in legend");
                } else if (Textures && typeof Textures.has === 'function' && !Textures.has(tile)) {
                    problems.push("legend '" + ch + "' -> unknown tile '" + tile + "'");
                }
            }
        }
    }

    const paths = mapDef.paths;
    if (!Array.isArray(paths) || paths.length < 1) {
        problems.push('no paths');
    } else {
        for (let pi = 0; pi < paths.length; pi++) {
            const wp = paths[pi] && paths[pi].waypoints;
            if (!Array.isArray(wp) || wp.length < 2) {
                problems.push('path ' + pi + ' needs >= 2 waypoints');
                continue;
            }
            let len = 0;
            for (let i = 0; i < wp.length; i++) {
                const pt = wp[i];
                if (!Array.isArray(pt) || pt.length < 2 || typeof pt[0] !== 'number' || typeof pt[1] !== 'number') {
                    problems.push('path ' + pi + ' waypoint ' + i + ' malformed');
                    continue;
                }
                if (i > 0) len += Math.hypot(wp[i][0] - wp[i - 1][0], wp[i][1] - wp[i - 1][1]);
                const isEnd = i === 0 || i === wp.length - 1;
                const outOfGrid = pt[0] < 0 || pt[0] >= W || pt[1] < 0 || pt[1] >= H;
                // endpoints are meant to sit slightly offscreen; interior ones must not
                if (outOfGrid && !isEnd) {
                    problems.push('path ' + pi + ' waypoint ' + i + ' out of grid (interior)');
                } else if (!outOfGrid) {
                    const nm = tileNameAt(mapDef, Math.floor(pt[0] / TILE), Math.floor(pt[1] / TILE));
                    if (isLavaTerrain(nm)) {
                        problems.push('path ' + pi + ' waypoint ' + i + ' sits on blocked terrain ' + nm);
                    }
                }
            }
            if (len < 700) problems.push('path ' + pi + ' too short (' + Math.round(len) + 'px, need >= 700)');
        }
    }

    const carveSet = carvePathTiles(mapDef);
    const decos = mapDef.decorations || [];
    for (let di = 0; di < decos.length; di++) {
        const d = decos[di];
        if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') {
            problems.push('decoration ' + di + ' malformed coords');
            continue;
        }
        const gx = Math.floor(d.x / TILE);
        const gy = Math.floor(d.y / TILE);
        if (carveSet.has(gx + ',' + gy)) {
            problems.push("decoration " + di + " ('" + d.type + "') sits on a path tile");
        }
    }

    if (mapDef.feature === 'portals' && (!Array.isArray(mapDef.portals) || mapDef.portals.length < 1)) {
        problems.push("feature 'portals' requires a non-empty portals array");
    }

    return problems;
}
