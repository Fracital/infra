// Map-select thumbnails: a downscaled bakeTerrain with route hints painted on
// top (direction chevrons + start/end markers) so a player can read a map's
// path shape at a glance. Browser-only. Results are cached per map id + size.

import { W, H } from '../core/constants.js';
import { bakeTerrain } from './terrain.js';

const TAU = Math.PI * 2;

const START_COLOR = '#3ad14e';
const END_COLOR = '#ff3b30';

// Cache keyed by id + dimensions -- baking is expensive and mapselect scrolls
// past the same cards repeatedly.
const _cache = new Map();

function pathLength(wp) {
    let total = 0;
    for (let i = 1; i < wp.length; i++) total += Math.hypot(wp[i][0] - wp[i - 1][0], wp[i][1] - wp[i - 1][1]);
    return total;
}

// Sample a polyline at fraction f in [0,1] -> world point + travel angle.
function sampleAt(wp, f) {
    const total = pathLength(wp);
    let target = f * total;
    for (let i = 1; i < wp.length; i++) {
        const ax = wp[i - 1][0];
        const ay = wp[i - 1][1];
        const bx = wp[i][0];
        const by = wp[i][1];
        const L = Math.hypot(bx - ax, by - ay);
        if (target <= L || i === wp.length - 1) {
            const t = L > 0 ? target / L : 0;
            return {
                x: ax + (bx - ax) * t,
                y: ay + (by - ay) * t,
                angle: Math.atan2(by - ay, bx - ax),
            };
        }
        target -= L;
    }
    const last = wp[wp.length - 1];
    return { x: last[0], y: last[1], angle: 0 };
}

function drawChevron(ctx, x, y, angle, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // dark backing for contrast against any biome, then bright chevron on top
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-size, -size);
    ctx.lineTo(0, 0);
    ctx.lineTo(-size, size);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-size, -size);
    ctx.lineTo(0, 0);
    ctx.lineTo(-size, size);
    ctx.stroke();
    ctx.restore();
}

function drawStartMarker(ctx, x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 3.4, 0, TAU);
    ctx.fillStyle = START_COLOR;
    ctx.fill();
}

function drawEndMarker(ctx, x, y) {
    const s = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.stroke();
    ctx.strokeStyle = END_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.stroke();
}

/**
 * Build (or return cached) a map thumbnail: scaled terrain + route arrows and
 * start/end markers for every path.
 * @param {object} mapDef
 * @param {number} [w=320]
 * @param {number} [h=180]
 * @returns {HTMLCanvasElement}
 */
export function makeThumbnail(mapDef, w = 320, h = 180) {
    const key = (mapDef && mapDef.id ? mapDef.id : 'anon') + ':' + w + 'x' + h;
    const cached = _cache.get(key);
    if (cached) return cached;

    const full = bakeTerrain(mapDef).canvas;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // downscale with smoothing OFF -- keeps the crunchy pixel-art look
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(full, 0, 0, W, H, 0, 0, w, h);

    const sx = w / W;
    const sy = h / H;
    const clampX = (x) => Math.max(6, Math.min(w - 6, x));
    const clampY = (y) => Math.max(6, Math.min(h - 6, y));
    const chevSize = Math.max(3, Math.round(Math.min(w, h) * 0.03));

    const paths = (mapDef && mapDef.paths) || [];
    for (let pi = 0; pi < paths.length; pi++) {
        const wp = paths[pi] && paths[pi].waypoints;
        if (!Array.isArray(wp) || wp.length < 2) continue;

        // direction chevrons at ~25% intervals along the route
        for (const f of [0.25, 0.5, 0.75]) {
            const p = sampleAt(wp, f);
            drawChevron(ctx, clampX(p.x * sx), clampY(p.y * sy), p.angle, chevSize);
        }

        // endpoints sit slightly offscreen -- clamp the markers into the frame
        const start = wp[0];
        const end = wp[wp.length - 1];
        drawStartMarker(ctx, clampX(start[0] * sx), clampY(start[1] * sy));
        drawEndMarker(ctx, clampX(end[0] * sx), clampY(end[1] * sy));
    }

    _cache.set(key, canvas);
    return canvas;
}
