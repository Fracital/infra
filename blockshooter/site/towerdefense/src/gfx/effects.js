// Block Defense -- big-ticket visual effects (lightning, beams, shockwaves,
// ground zones, lob arcs). Browser-only, but the module top level is DOM-free
// so node can import it. All effects live in one bounded, pre-allocated pool;
// generation-time work (jagged bolt geometry) happens on the spawn call, never
// inside update()/draw().

const TAU = Math.PI * 2;
const MAX_EFFECTS = 96;   // "~80 active" with a little headroom

const E_LIGHTNING = 0;
const E_BEAM = 1;
const E_SHOCK = 2;
const E_ZONE = 3;
const E_ARC = 4;

let _pool = [];
let _now = 0;
let _gen = 1;             // monotonically increasing, stamped on each spawn for handle validity

function _rand(a, b) { return a + Math.random() * (b - a); }
function _clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function _easeOut(t) { return 1 - (1 - t) * (1 - t); }

function _makeEffect() {
    return {
        active: false, gen: 0, kind: 0,
        x: 0, y: 0, x2: 0, y2: 0, cx: 0, cy: 0,
        radius: 0, radius0: 0, radiusMax: 0,
        life: 0, maxLife: 1,
        color: '#ffffff', glow: '#9ff', width: 4,
        pts: [],           // flat [x0,y0,x1,y1,...] main jagged polyline
        nPts: 0,
        branches: [[], [], []], // up to 3 forks, each a flat point list
        nBranch: 0, branchLen: [0, 0, 0],
        ring2: false, dying: false, fadeLife: 0,
        dashOffset: 0, rot: 0, flick: 1,
        arcHeight: 0,
    };
}

function _ensurePool() {
    if (_pool.length) return;
    for (let i = 0; i < MAX_EFFECTS; i++) _pool.push(_makeEffect());
}

// Grab an effect slot: prefer a dead one, else steal whichever has lived
// longest so a fresh, more relevant effect always wins the bounded budget.
function _obtain() {
    _ensurePool();
    let free = -1, oldest = -1, oldestAge = -Infinity;
    for (let i = 0; i < _pool.length; i++) {
        const e = _pool[i];
        if (!e.active) { free = i; break; }
        const age = e.maxLife - e.life;
        if (age > oldestAge) { oldestAge = age; oldest = i; }
    }
    const idx = free >= 0 ? free : (oldest >= 0 ? oldest : 0);
    const e = _pool[idx];
    // reset the light fields; heavy arrays (pts/branches) are reused in place
    e.active = true; e.gen = _gen++;
    e.ring2 = false; e.dying = false; e.fadeLife = 0;
    e.dashOffset = 0; e.rot = 0; e.flick = 1; e.nPts = 0; e.nBranch = 0;
    e.radius = 0; e.radius0 = 0; e.radiusMax = 0; e.arcHeight = 0;
    return e;
}

// ------------------------------------------------------------- lightning gen
// Recursive midpoint displacement between two anchors, appended to `flat`.
function _subdivide(flat, ax, ay, bx, by, disp, depth) {
    if (depth <= 0) {
        flat.push(bx, by);
        return;
    }
    let mx = (ax + bx) * 0.5;
    let my = (ay + by) * 0.5;
    // perpendicular offset
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const off = _rand(-disp, disp);
    mx += (-dy / len) * off;
    my += (dx / len) * off;
    _subdivide(flat, ax, ay, mx, my, disp * 0.55, depth - 1);
    _subdivide(flat, mx, my, bx, by, disp * 0.55, depth - 1);
}

function _buildBolt(e, points) {
    const flat = e.pts;
    flat.length = 0;
    flat.push(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        const ax = points[i - 1][0], ay = points[i - 1][1];
        const bx = points[i][0], by = points[i][1];
        const segLen = Math.hypot(bx - ax, by - ay);
        _subdivide(flat, ax, ay, bx, by, segLen * 0.16, 5);
    }
    e.nPts = flat.length >> 1;

    // 2-3 branch forks off random interior nodes
    const forks = 2 + ((Math.random() * 2) | 0);
    e.nBranch = Math.min(forks, e.branches.length);
    for (let b = 0; b < e.nBranch; b++) {
        const node = 2 * (1 + ((Math.random() * (e.nPts - 2)) | 0));
        const sx = flat[node], sy = flat[node + 1];
        // shoot off roughly perpendicular-ish, short
        const prevx = flat[node - 2] != null ? flat[node - 2] : sx;
        const prevy = flat[node - 1] != null ? flat[node - 1] : sy;
        const dirx = sx - prevx, diry = sy - prevy;
        const base = Math.atan2(diry, dirx) + _rand(-1, 1);
        const bl = _rand(26, 60);
        const ex = sx + Math.cos(base) * bl;
        const ey = sy + Math.sin(base) * bl;
        const bf = e.branches[b];
        bf.length = 0;
        bf.push(sx, sy);
        _subdivide(bf, sx, sy, ex, ey, bl * 0.28, 3);
        e.branchLen[b] = bf.length >> 1;
    }
}

// ---------------------------------------------------------------- public API
/**
 * Jagged electric bolt through the given main polyline points.
 * @param {Array<[number,number]>} points world-space anchors, >= 2
 * @param {object} [opts] {color, width, life}
 */
function lightning(points, opts) {
    if (!points || points.length < 2) return;
    opts = opts || {};
    const e = _obtain();
    e.kind = E_LIGHTNING;
    e.color = '#ffffff';
    e.glow = opts.color || '#9ff';
    e.width = opts.width || 3;
    e.maxLife = e.life = opts.life || 0.22;
    _buildBolt(e, points);
}

/**
 * Layered energy beam from (x1,y1) to (x2,y2). Short-lived by default so a
 * continuously-firing tower keeps it alive by re-calling every frame.
 * @param {object} [style] {color, width, duration}
 */
function beam(x1, y1, x2, y2, style) {
    style = style || {};
    const e = _obtain();
    e.kind = E_BEAM;
    e.x = x1; e.y = y1; e.x2 = x2; e.y2 = y2;
    e.color = style.color || '#8fd8ff';
    e.width = style.width || 5;
    e.maxLife = e.life = style.duration || 0.09;
}

/**
 * Expanding additive ring, thick fading to thin.
 * @param {number} radius target (max) radius
 * @param {object} [opts] {color, life, width, ring2}
 */
function shockwave(x, y, radius, opts) {
    opts = opts || {};
    const e = _obtain();
    e.kind = E_SHOCK;
    e.x = x; e.y = y;
    e.radius0 = radius * 0.12;
    e.radiusMax = radius;
    e.color = opts.color || '#ffffff';
    e.width = opts.width || 6;
    e.ring2 = !!opts.ring2;
    e.maxLife = e.life = opts.life || 0.4;
}

/**
 * Persistent soft ground zone (fire / glue / smoke). Stays until the returned
 * handle's kill() is called, then fades out over ~0.3s.
 * @returns {{kill: function, move: function, setRadius: function, get alive(): boolean}}
 */
function zoneRing(x, y, radius, color) {
    const e = _obtain();
    e.kind = E_ZONE;
    e.x = x; e.y = y;
    e.radius = radius;
    e.color = color || '#ff7a2a';
    e.maxLife = e.life = Infinity;
    const gen = e.gen;
    return {
        kill() {
            if (e.active && e.gen === gen && !e.dying) {
                e.dying = true; e.fadeLife = 0.3; e.maxLife = 0.3; e.life = 0.3;
            }
        },
        move(nx, ny) { if (e.active && e.gen === gen) { e.x = nx; e.y = ny; } },
        setRadius(r) { if (e.active && e.gen === gen) e.radius = r; },
        get alive() { return e.active && e.gen === gen; },
    };
}

/**
 * Faint dotted lob-arc hint from source to target that fades in ~0.3s.
 * @param {object} [opts] {color, height, life}
 */
function arcTracer(fromX, fromY, toX, toY, opts) {
    opts = opts || {};
    const e = _obtain();
    e.kind = E_ARC;
    e.x = fromX; e.y = fromY; e.x2 = toX; e.y2 = toY;
    const dx = toX - fromX, dy = toY - fromY;
    const d = Math.hypot(dx, dy);
    e.arcHeight = opts.height != null ? opts.height : d * 0.32;
    e.cx = (fromX + toX) * 0.5;
    e.cy = (fromY + toY) * 0.5 - e.arcHeight;
    e.color = opts.color || '#ffffff';
    e.maxLife = e.life = opts.life || 0.5;
}

// ------------------------------------------------------------------- update
function update(dt) {
    if (dt <= 0) { _ensurePool(); return; }
    _ensurePool();
    _now += dt;
    for (let i = 0; i < _pool.length; i++) {
        const e = _pool[i];
        if (!e.active) continue;

        switch (e.kind) {
            case E_LIGHTNING:
                e.flick = 0.55 + Math.random() * 0.45;
                e.life -= dt;
                break;
            case E_BEAM:
                e.dashOffset -= 60 * dt;
                e.life -= dt;
                break;
            case E_SHOCK:
                e.life -= dt;
                break;
            case E_ZONE:
                e.rot += 22 * dt;
                if (e.dying) { e.life -= dt; }
                break;
            case E_ARC:
                e.dashOffset -= 30 * dt;
                e.life -= dt;
                break;
            default:
                e.life -= dt;
                break;
        }
        if (e.life <= 0) e.active = false;
    }
}

// --------------------------------------------------------------------- draw
function _strokeFlat(ctx, flat, n) {
    if (n < 2) return;
    ctx.beginPath();
    ctx.moveTo(flat[0], flat[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(flat[i * 2], flat[i * 2 + 1]);
    ctx.stroke();
}

function _drawLightning(ctx, e) {
    const lifeF = _clamp(e.life / e.maxLife, 0, 1);
    const base = e.flick * (0.4 + 0.6 * lifeF);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // three passes: wide colour haze -> tighter colour -> white core
    const passes = [
        { w: e.width * 3.2, c: e.glow, a: 0.22 },
        { w: e.width * 1.7, c: e.glow, a: 0.5 },
        { w: Math.max(1, e.width * 0.6), c: '#ffffff', a: 0.95 },
    ];
    for (let k = 0; k < passes.length; k++) {
        const ps = passes[k];
        ctx.globalAlpha = _clamp(ps.a * base, 0, 1);
        ctx.strokeStyle = ps.c;
        ctx.lineWidth = ps.w;
        _strokeFlat(ctx, e.pts, e.nPts);
        for (let b = 0; b < e.nBranch; b++) {
            ctx.lineWidth = ps.w * 0.6;
            _strokeFlat(ctx, e.branches[b], e.branchLen[b]);
        }
    }
}

function _drawBeam(ctx, e) {
    const lifeF = _clamp(e.life / e.maxLife, 0, 1);
    const fade = lifeF > 0.7 ? 1 : lifeF / 0.7;
    ctx.lineCap = 'round';
    // soft outer glow (additive)
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = e.color;
    ctx.globalAlpha = 0.18 * fade;
    ctx.lineWidth = e.width * 2.4;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    ctx.globalAlpha = 0.4 * fade;
    ctx.lineWidth = e.width * 1.3;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    // bright white core
    ctx.globalAlpha = 0.92 * fade;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, e.width * 0.55);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    // shimmering dashed overlay
    ctx.setLineDash([10, 9]);
    ctx.lineDashOffset = e.dashOffset;
    ctx.globalAlpha = 0.5 * fade;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = Math.max(1, e.width * 0.35);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke();
    ctx.setLineDash([]);
}

function _drawShock(ctx, e) {
    const prog = _clamp(1 - e.life / e.maxLife, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = e.color;
    const r = e.radius0 + (e.radiusMax - e.radius0) * _easeOut(prog);
    ctx.globalAlpha = (1 - prog) * 0.9;
    ctx.lineWidth = e.width * (1 - prog) + 1;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
    if (e.ring2) {
        const prog2 = _clamp(prog * 1.35, 0, 1);
        const r2 = e.radius0 + (e.radiusMax - e.radius0) * _easeOut(prog2) * 0.72;
        ctx.globalAlpha = (1 - prog2) * 0.6;
        ctx.lineWidth = e.width * 0.6 * (1 - prog2) + 1;
        ctx.beginPath(); ctx.arc(e.x, e.y, r2, 0, TAU); ctx.stroke();
    }
}

function _drawZone(ctx, e) {
    let a = 1;
    if (e.dying) a = _clamp(e.fadeLife > 0 ? e.life / e.fadeLife : 0, 0, 1);
    const pulse = 0.94 + 0.06 * Math.sin(_now * 3 + e.x);
    const r = e.radius * pulse;
    ctx.globalCompositeOperation = 'source-over';
    // soft fill
    ctx.globalAlpha = 0.12 * a;
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill();
    // bright rim
    ctx.globalAlpha = 0.5 * a;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke();
    // slow rotating dashed edge
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = e.rot;
    ctx.globalAlpha = 0.6 * a;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.97, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
}

function _drawArc(ctx, e) {
    const age = e.maxLife - e.life;
    let a;
    if (age < 0.3) a = age / 0.3;                 // fade in
    else a = _clamp(e.life / (e.maxLife - 0.3), 0, 1); // then out
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = _clamp(a, 0, 1) * 0.7;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 7]);
    ctx.lineDashOffset = e.dashOffset;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.quadraticCurveTo(e.cx, e.cy, e.x2, e.y2);
    ctx.stroke();
    ctx.setLineDash([]);
}

/** Render every active effect. */
function draw(ctx) {
    if (!_pool.length) return;
    ctx.save();
    for (let i = 0; i < _pool.length; i++) {
        const e = _pool[i];
        if (!e.active) continue;
        switch (e.kind) {
            case E_LIGHTNING: _drawLightning(ctx, e); break;
            case E_BEAM: _drawBeam(ctx, e); break;
            case E_SHOCK: _drawShock(ctx, e); break;
            case E_ZONE: _drawZone(ctx, e); break;
            case E_ARC: _drawArc(ctx, e); break;
            default: break;
        }
    }
    ctx.restore();
}

/** Retire every active effect. */
function clear() {
    for (let i = 0; i < _pool.length; i++) _pool[i].active = false;
}

export const Effects = {
    lightning,
    beam,
    shockwave,
    zoneRing,
    arcTracer,
    update,
    draw,
    clear,
};
