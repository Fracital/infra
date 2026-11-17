// Block Defense -- particle system. Browser-only (uses Math.random, draws to a
// Canvas2D context), but the module top level is DOM-free so node can import it.
//
// Design notes (the "why"):
// - One flat pre-allocated pool of fully-shaped structs. update()/draw() never
//   allocate; colour strings are baked once at spawn and alpha rides on
//   ctx.globalAlpha so we never build 'rgba(...)' strings per frame.
// - draw() batches by composite mode: every 'source-over' particle first, then
//   every 'lighter' (additive) particle, so we flip globalCompositeOperation
//   exactly twice instead of once per particle.
// - At the quality cap the lowest-priority particle (ambient weather) is
//   recycled before any gameplay burst, so combat juice always wins the budget.

// ---- shape codes (draw dispatch) -----------------------------------------
const SH_CIRCLE = 0;      // flat filled disc (coin / droplet / bubble)
const SH_SOFT = 1;        // two-layer soft blob (smoke / flame / ember / soul / spore)
const SH_SHARD = 2;       // rotating cube-face debris with lit top + shaded side
const SH_STREAK = 3;      // line drawn back along velocity (spark / rain / portal)
const SH_DIAMOND = 4;     // rotating faceted diamond (emerald)
const SH_HEART = 5;
const SH_STAR = 6;        // spiked burst (crit)
const SH_CONE = 7;        // muzzle flash cone
const SH_NOTE = 8;        // musical note
const SH_RECT = 9;        // rotating fluttering rect (confetti / leaf / bone / feather / petal)
const SH_FLAKE = 10;      // small snow/frost flake

// ---- priorities (recycle order) ------------------------------------------
const PRIO_AMBIENT = 0;
const PRIO_NORMAL = 1;

const W = 1280;
const H = 720;
const TAU = Math.PI * 2;

const MAX_POOL = 2500;    // == high-quality cap; low/medium simply cap lower
const MAX_TEXTS = 40;

const QUALITY = {
    low: { cap: 300, countScale: 0.5, ambient: 0.4 },
    medium: { cap: 900, countScale: 0.8, ambient: 0.7 },
    high: { cap: 2500, countScale: 1.0, ambient: 1.0 },
};

// Ambient emission rate (particles/sec at high quality) per weather type.
const AMBIENT_RATE = {
    snow: 26, rain: 95, leaves: 10, ash: 20,
    spores: 14, petals: 12, souls: 11, embers: 24,
};

const CONFETTI_COLORS = ['#ff5b5b', '#ffd447', '#4ade5f', '#4aa8ff', '#c77bff', '#ff8a3a', '#4aedd9'];
const LEAF_COLORS = ['#6fae3c', '#8bc34a', '#d98a2b', '#e0a93a', '#c05a2a'];
const PETAL_COLORS = ['#ffb7d5', '#ff9ec4', '#ffc9dd', '#ff85b3'];
const NOTE_COLORS = ['#9be7ff', '#c77bff', '#ffd447', '#8bffb0'];

// -------------------------------------------------------------------- state
let _particles = [];      // flat pool, lazily filled to MAX_POOL
let _freeStack = [];      // indices of inactive slots
let _liveCount = 0;
let _cap = QUALITY.high.cap;
let _countScale = 1.0;
let _ambientScale = 1.0;

let _texts = [];
let _ambientType = null;
let _ambientAccum = 0;
let _now = 0;             // seconds, drives sway/twinkle

// ------------------------------------------------------------------ helpers
function _rand(a, b) { return a + Math.random() * (b - a); }
function _pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function _clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function _toRGB(c) {
    if (typeof c !== 'string') return { r: 255, g: 255, b: 255 };
    if (c[0] === '#') {
        let h = c.slice(1);
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const n = parseInt(h, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { const a = m[1].split(','); return { r: +a[0], g: +a[1], b: +a[2] }; }
    return { r: 255, g: 255, b: 255 };
}

// amt in 0..1: positive lightens toward white, negative darkens toward black.
function _mix(c, amt) {
    const p = _toRGB(c);
    const t = amt < 0 ? 0 : 255;
    const k = amt < 0 ? -amt : amt;
    return 'rgb(' + Math.round(p.r + (t - p.r) * k) + ',' +
        Math.round(p.g + (t - p.g) * k) + ',' +
        Math.round(p.b + (t - p.b) * k) + ')';
}

function _makeParticle() {
    return {
        active: false, shape: SH_CIRCLE, additive: false, priority: PRIO_NORMAL,
        x: 0, y: 0, vx: 0, vy: 0, gravity: 0, damp: 0, curl: 0,
        life: 1, maxLife: 1, alpha0: 1, fadeIn: 0, fadeOut: 0,
        size: 2, sizeVel: 0, minSize: 0,
        rot: 0, vrot: 0, ratio: 0.6,
        sway: 0, swayFreq: 0, phase: 0,
        hasBounce: false, bounced: false, bounceY: 0,
        spawnSplash: false, groundY: 0,
        ring: false, glint: false,
        color: '#ffffff', color2: '#ffffff', color3: '#808080',
    };
}

function _ensurePool() {
    if (_particles.length) return;
    for (let i = 0; i < MAX_POOL; i++) {
        _particles.push(_makeParticle());
        _freeStack.push(i);
    }
    for (let i = 0; i < MAX_TEXTS; i++) {
        _texts.push({ active: false, x: 0, y: 0, x0: 0, y0: 0, drift: 0, str: '', color: '#fff', size: 13, life: 0, maxLife: 1 });
    }
}

// Pick an active slot to overwrite when the pool is at cap: ambient weather
// dies first, then whichever particle has lived longest.
function _recycleVictim() {
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < _particles.length; i++) {
        const p = _particles[i];
        if (!p.active) continue;
        const score = (p.priority === PRIO_AMBIENT ? 1e7 : 0) + (p.maxLife - p.life);
        if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
}

function _reset(p) {
    p.shape = SH_CIRCLE; p.additive = false; p.priority = PRIO_NORMAL;
    p.vx = 0; p.vy = 0; p.gravity = 0; p.damp = 0; p.curl = 0;
    p.life = 1; p.maxLife = 1; p.alpha0 = 1; p.fadeIn = 0; p.fadeOut = 0;
    p.size = 2; p.sizeVel = 0; p.minSize = 0;
    p.rot = 0; p.vrot = 0; p.ratio = 0.6;
    p.sway = 0; p.swayFreq = 0; p.phase = 0;
    p.hasBounce = false; p.bounced = false; p.bounceY = 0;
    p.spawnSplash = false; p.groundY = 0;
    p.ring = false; p.glint = false;
    p.color2 = '#ffffff'; p.color3 = '#808080';
}

// Obtain a ready-to-configure particle, or null if the budget is exhausted.
function _obtain(prio) {
    _ensurePool();
    let idx;
    if (_liveCount < _cap && _freeStack.length) {
        idx = _freeStack.pop();
        _liveCount++;
    } else {
        idx = _recycleVictim();
        if (idx < 0) return null;
    }
    const p = _particles[idx];
    _reset(p);
    p.active = true;
    p.priority = prio;
    return p;
}

function _cullToCap() {
    while (_liveCount > _cap) {
        const idx = _recycleVictim();
        if (idx < 0) break;
        const p = _particles[idx];
        p.active = false;
        _liveCount--;
        _freeStack.push(idx);
    }
}

// ------------------------------------------------------------------- spawns
/**
 * Emit a burst of particles.
 * @param {string} type one of the documented spawn types
 * @param {number} x world px
 * @param {number} y world px
 * @param {object} [opts] {count, color, spread, speed, life, size, gravity, dir}
 */
function spawn(type, x, y, opts) {
    opts = opts || {};
    const dir = opts.dir;
    const col = opts.color;
    const cs = _countScale;
    let n = opts.count | 0;

    switch (type) {
        case 'blockShards': {
            n = n || Math.max(3, Math.round(8 * cs));
            const base = col || '#8a8a8a';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                const a = dir != null ? dir + _rand(-(opts.spread || 2.4), (opts.spread || 2.4)) * 0.5 : _rand(0, TAU);
                const sp = (opts.speed || 130) * _rand(0.6, 1.25);
                p.shape = SH_SHARD;
                p.x = x; p.y = y;
                p.vx = Math.cos(a) * sp;
                p.vy = Math.sin(a) * sp - _rand(40, 130);
                p.gravity = opts.gravity != null ? opts.gravity : 480;
                p.damp = 0.7;
                p.size = (opts.size || 5) * _rand(0.7, 1.35);
                p.rot = _rand(0, TAU); p.vrot = _rand(-9, 9);
                p.maxLife = p.life = _rand(0.5, 0.95); p.fadeOut = 0.25;
                p.hasBounce = true; p.bounceY = y + _rand(8, 18);
                p.color = base; p.color2 = _mix(base, 0.32); p.color3 = _mix(base, -0.3);
            }
            break;
        }
        case 'spark': {
            n = n || Math.max(3, Math.round(7 * cs));
            const base = col || '#ffd66b';
            const spread = opts.spread != null ? opts.spread : (dir != null ? 0.9 : TAU);
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                const a = (dir != null ? dir : 0) + _rand(-spread, spread) * 0.5;
                const sp = (opts.speed || 300) * _rand(0.55, 1.3);
                p.shape = SH_STREAK; p.additive = true;
                p.x = x; p.y = y;
                p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
                p.gravity = 180; p.damp = 3.2;
                p.size = _clamp(sp * 0.035, 5, 16);
                p.maxLife = p.life = (opts.life || 0.22) * _rand(0.7, 1.3);
                p.fadeOut = p.maxLife;
                p.color = base;
            }
            break;
        }
        case 'smoke': {
            n = n || Math.max(2, Math.round(5 * cs));
            const base = col || '#6a6a6a';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_SOFT;
                p.x = x + _rand(-4, 4); p.y = y + _rand(-4, 4);
                p.vx = _rand(-16, 16); p.vy = -_rand(12, 36);
                p.damp = 0.4;
                p.size = (opts.size || 7) * _rand(0.7, 1.2);
                p.sizeVel = _rand(10, 22);
                p.maxLife = p.life = (opts.life || 1.1) * _rand(0.7, 1.3);
                p.alpha0 = 0.5; p.fadeIn = 0.1; p.fadeOut = 0.55;
                p.color = base; p.color2 = _mix(base, -0.35);
            }
            break;
        }
        case 'flame': {
            n = n || Math.max(3, Math.round(6 * cs));
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_SOFT; p.additive = true;
                p.x = x + _rand(-3, 3); p.y = y + _rand(-3, 3);
                p.vx = _rand(-22, 22); p.vy = -_rand(30, 78);
                p.size = (opts.size || 7) * _rand(0.7, 1.2);
                p.sizeVel = -_rand(6, 13); p.minSize = 0.3;
                p.maxLife = p.life = (opts.life || 0.45) * _rand(0.7, 1.25);
                p.alpha0 = 0.9; p.fadeOut = p.maxLife;
                p.color = col || '#ffc23a'; p.color2 = '#ff3a1f';
            }
            break;
        }
        case 'frost': {
            n = n || Math.max(3, Math.round(8 * cs));
            const base = col || '#bfe8ff';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                const a = _rand(0, TAU); const sp = (opts.speed || 70) * _rand(0.3, 1);
                p.shape = SH_FLAKE;
                p.x = x; p.y = y;
                p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
                p.gravity = 45; p.sway = _rand(6, 16); p.swayFreq = _rand(2, 4); p.phase = _rand(0, TAU);
                p.size = (opts.size || 3) * _rand(0.7, 1.3);
                p.rot = _rand(0, TAU); p.vrot = _rand(-2, 2);
                p.maxLife = p.life = _rand(0.5, 1.1); p.fadeIn = 0.05; p.fadeOut = 0.4;
                p.alpha0 = 0.9; p.color = base;
            }
            break;
        }
        case 'splashPotion': {
            const base = col || '#38c66b';
            n = n || Math.max(5, Math.round(10 * cs));
            // droplets arcing out
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                const a = _rand(-Math.PI, 0); const sp = (opts.speed || 120) * _rand(0.4, 1.2);
                p.shape = SH_CIRCLE;
                p.x = x; p.y = y;
                p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
                p.gravity = 500;
                p.size = _rand(2, 4);
                p.maxLife = p.life = _rand(0.3, 0.6); p.fadeOut = 0.25;
                p.color = base;
            }
            // ground puddle flash
            const pf = _obtain(PRIO_NORMAL);
            if (pf) {
                pf.shape = SH_SOFT; pf.x = x; pf.y = y;
                pf.size = 5; pf.sizeVel = 42;
                pf.maxLife = pf.life = 0.28; pf.alpha0 = 0.4; pf.fadeOut = 0.28;
                pf.color = base; pf.color2 = _mix(base, -0.25);
            }
            break;
        }
        case 'magic': {
            n = n || Math.max(4, Math.round(10 * cs));
            const base = col || '#c77bff';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                const a = _rand(0, TAU); const sp = (opts.speed || 60) * _rand(0.5, 1.3);
                p.shape = SH_SOFT; p.additive = true;
                p.x = x; p.y = y;
                p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
                p.gravity = -20; p.curl = _rand(3, 7) * (Math.random() < 0.5 ? -1 : 1);
                p.size = (opts.size || 2.6) * _rand(0.6, 1.3);
                p.maxLife = p.life = (opts.life || 0.7) * _rand(0.6, 1.3);
                p.alpha0 = 0.85; p.fadeIn = 0.08; p.fadeOut = 0.4;
                p.color = base; p.color2 = _mix(base, 0.25);
            }
            break;
        }
        case 'emerald': {
            n = n || Math.max(1, Math.round((opts.count || 1)));
            const base = col || '#17dd62';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_DIAMOND;
                p.x = x; p.y = y;
                p.vx = _rand(-40, 40); p.vy = -_rand(120, 175);
                p.gravity = 430;
                p.size = (opts.size || 6.5) * _rand(0.85, 1.15);
                p.rot = _rand(-0.4, 0.4); p.vrot = _rand(-2.5, 2.5);
                p.maxLife = p.life = _rand(0.65, 1.05); p.fadeOut = 0.3;
                p.color = base; p.color2 = _mix(base, 0.4);
            }
            break;
        }
        case 'coin': {
            n = n || Math.max(1, Math.round(2 * cs));
            const base = col || '#fcdc5f';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_CIRCLE; p.glint = true;
                p.x = x; p.y = y;
                p.vx = _rand(-55, 55); p.vy = -_rand(105, 165);
                p.gravity = 410;
                p.size = (opts.size || 5) * _rand(0.85, 1.2);
                p.rot = _rand(0, TAU); p.vrot = _rand(6, 12);
                p.maxLife = p.life = _rand(0.7, 1.1); p.fadeOut = 0.3;
                p.color = base; p.color2 = _mix(base, 0.45);
            }
            break;
        }
        case 'heart': {
            n = n || Math.max(1, Math.round(3 * cs));
            const base = col || '#ff5b7a';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_HEART;
                p.x = x + _rand(-6, 6); p.y = y;
                p.vx = _rand(-8, 8); p.vy = -_rand(20, 45);
                p.sway = _rand(6, 14); p.swayFreq = _rand(2, 3.5); p.phase = _rand(0, TAU);
                p.size = (opts.size || 6) * _rand(0.8, 1.2);
                p.maxLife = p.life = _rand(0.7, 1.2); p.fadeIn = 0.1; p.fadeOut = 0.5;
                p.color = base;
            }
            break;
        }
        case 'ember': {
            n = n || Math.max(3, Math.round(6 * cs));
            const base = col || '#ff8a3a';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_SOFT; p.additive = true;
                p.x = x + _rand(-4, 4); p.y = y + _rand(-4, 4);
                p.vx = _rand(-12, 12); p.vy = -_rand(8, 26);
                p.gravity = -6; p.sway = _rand(4, 12); p.swayFreq = _rand(2, 5); p.phase = _rand(0, TAU);
                p.size = (opts.size || 2.4) * _rand(0.6, 1.3);
                p.maxLife = p.life = _rand(0.8, 1.8);
                p.alpha0 = _rand(0.5, 0.9); p.fadeIn = 0.1; p.fadeOut = 0.6;
                p.color = base; p.color2 = _mix(base, 0.3);
            }
            break;
        }
        case 'bubble': {
            n = n || Math.max(3, Math.round(5 * cs));
            const base = col || '#bfe8ff';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_CIRCLE; p.ring = true;
                p.x = x + _rand(-6, 6); p.y = y;
                p.vy = -_rand(20, 52);
                p.sway = _rand(10, 22); p.swayFreq = _rand(3, 6); p.phase = _rand(0, TAU);
                p.size = (opts.size || 4) * _rand(0.7, 1.3);
                p.maxLife = p.life = _rand(0.6, 1.2); p.fadeIn = 0.1; p.fadeOut = 0.4;
                p.alpha0 = 0.8; p.color = base;
            }
            break;
        }
        case 'note': {
            n = n || Math.max(1, Math.round(2 * cs));
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_NOTE;
                p.x = x + _rand(-6, 6); p.y = y;
                p.vy = -_rand(25, 50);
                p.sway = _rand(10, 20); p.swayFreq = _rand(2, 3.5); p.phase = _rand(0, TAU);
                p.size = (opts.size || 6) * _rand(0.85, 1.2);
                p.rot = _rand(-0.3, 0.3); p.vrot = _rand(-1, 1);
                p.maxLife = p.life = _rand(0.9, 1.5); p.fadeIn = 0.1; p.fadeOut = 0.5;
                p.alpha0 = 0.9; p.color = col || _pick(NOTE_COLORS);
            }
            break;
        }
        case 'portal': {
            n = n || Math.max(6, Math.round(12 * cs));
            const base = col || '#a24bff';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                const a = _rand(0, TAU); const r = _rand(28, 55);
                const sp = (opts.speed || 120) * _rand(0.7, 1.3);
                p.shape = SH_STREAK; p.additive = true;
                p.x = x + Math.cos(a) * r; p.y = y + Math.sin(a) * r;
                p.vx = -Math.cos(a) * sp; p.vy = -Math.sin(a) * sp;
                p.curl = _rand(2, 5) * (Math.random() < 0.5 ? -1 : 1);
                p.size = _rand(6, 12);
                p.maxLife = p.life = _rand(0.3, 0.5); p.fadeOut = p.life;
                p.color = base;
            }
            break;
        }
        case 'crit': {
            const base = col || '#ffe14a';
            const star = _obtain(PRIO_NORMAL);
            if (star) {
                star.shape = SH_STAR; star.additive = true;
                star.x = x; star.y = y;
                star.size = (opts.size || 13) * _rand(0.85, 1.2);
                star.rot = _rand(0, TAU); star.vrot = 10;
                star.maxLife = star.life = 0.22; star.fadeOut = 0.22;
                star.color = base;
            }
            n = n || Math.max(4, Math.round(8 * cs));
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                const a = (i / n) * TAU + _rand(-0.2, 0.2);
                const sp = _rand(160, 260);
                p.shape = SH_STREAK; p.additive = true;
                p.x = x; p.y = y;
                p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
                p.damp = 4; p.size = _rand(7, 13);
                p.maxLife = p.life = 0.2; p.fadeOut = 0.2;
                p.color = base;
            }
            break;
        }
        case 'muzzle': {
            const a = dir != null ? dir : 0;
            const cone = _obtain(PRIO_NORMAL);
            if (cone) {
                cone.shape = SH_CONE; cone.additive = true;
                cone.x = x; cone.y = y; cone.rot = a;
                cone.size = (opts.size || 32) * _rand(0.85, 1.2);
                cone.maxLife = cone.life = _rand(0.06, 0.1); cone.fadeOut = cone.life;
                cone.color = col || '#fff2b0';
            }
            const ns = Math.max(2, Math.round(3 * cs));
            for (let i = 0; i < ns; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                const aa = a + _rand(-0.35, 0.35); const sp = _rand(220, 380);
                p.shape = SH_STREAK; p.additive = true;
                p.x = x; p.y = y;
                p.vx = Math.cos(aa) * sp; p.vy = Math.sin(aa) * sp;
                p.damp = 5; p.size = _rand(6, 12);
                p.maxLife = p.life = _rand(0.08, 0.16); p.fadeOut = p.life;
                p.color = col || '#ffe6a0';
            }
            break;
        }
        case 'snowball_poof': {
            n = n || Math.max(4, Math.round(8 * cs));
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                const a = _rand(0, TAU); const sp = _rand(30, 95);
                p.shape = SH_SOFT;
                p.x = x; p.y = y;
                p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 10;
                p.damp = 4;
                p.size = (opts.size || 4.5) * _rand(0.7, 1.2); p.sizeVel = _rand(8, 18);
                p.maxLife = p.life = _rand(0.25, 0.5); p.alpha0 = 0.85; p.fadeOut = p.life;
                p.color = col || '#eef7ff'; p.color2 = '#cfe6ff';
            }
            break;
        }
        case 'bone': {
            n = n || Math.max(3, Math.round(5 * cs));
            const base = col || '#e8e2cf';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                const a = _rand(0, TAU); const sp = _rand(60, 150);
                p.shape = SH_RECT; p.ratio = 0.35;
                p.x = x; p.y = y;
                p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - _rand(40, 110);
                p.gravity = 430; p.damp = 0.4;
                p.size = (opts.size || 6) * _rand(0.7, 1.2);
                p.rot = _rand(0, TAU); p.vrot = _rand(-10, 10);
                p.maxLife = p.life = _rand(0.6, 1.1); p.fadeOut = 0.3;
                p.hasBounce = true; p.bounceY = y + _rand(8, 18);
                p.color = base;
            }
            break;
        }
        case 'feather': {
            n = n || Math.max(2, Math.round(4 * cs));
            const base = col || '#f4f4f4';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_RECT; p.ratio = 0.4;
                p.x = x + _rand(-6, 6); p.y = y;
                p.vx = _rand(-14, 14); p.vy = _rand(14, 34);
                p.gravity = 18; p.sway = _rand(16, 30); p.swayFreq = _rand(1.5, 3); p.phase = _rand(0, TAU);
                p.size = (opts.size || 6) * _rand(0.8, 1.2);
                p.rot = _rand(0, TAU); p.vrot = _rand(-1.5, 1.5);
                p.maxLife = p.life = _rand(1, 1.8); p.fadeIn = 0.1; p.fadeOut = 0.5;
                p.color = base;
            }
            break;
        }
        case 'soul': {
            n = n || Math.max(2, Math.round(4 * cs));
            const base = col || '#4aedd9';
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_SOFT; p.additive = true;
                p.x = x + _rand(-5, 5); p.y = y;
                p.vx = _rand(-10, 10); p.vy = -_rand(25, 58);
                p.sway = _rand(8, 18); p.swayFreq = _rand(2, 4); p.phase = _rand(0, TAU);
                p.size = (opts.size || 5) * _rand(0.7, 1.3);
                p.maxLife = p.life = _rand(0.6, 1.2); p.fadeIn = 0.15; p.fadeOut = 0.5;
                p.alpha0 = 0.7; p.color = base; p.color2 = _mix(base, 0.3);
            }
            break;
        }
        case 'confetti': {
            n = n || Math.max(10, Math.round(24 * cs));
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_RECT; p.ratio = 0.6;
                p.x = x + _rand(-12, 12); p.y = y;
                p.vx = _rand(-120, 120); p.vy = -_rand(80, 190);
                p.gravity = 260; p.damp = 0.3;
                p.sway = _rand(20, 45); p.swayFreq = _rand(3, 6); p.phase = _rand(0, TAU);
                p.size = (opts.size || 6) * _rand(0.7, 1.2);
                p.rot = _rand(0, TAU); p.vrot = _rand(-12, 12);
                p.maxLife = p.life = _rand(1.2, 2.4); p.fadeOut = 0.6;
                p.color = col || _pick(CONFETTI_COLORS);
            }
            break;
        }
        case 'leaf': {
            n = n || Math.max(2, Math.round(3 * cs));
            for (let i = 0; i < n; i++) {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_RECT; p.ratio = 0.7;
                p.x = x + _rand(-8, 8); p.y = y;
                p.vx = _rand(-20, 20); p.vy = _rand(15, 40);
                p.gravity = 22; p.sway = _rand(18, 34); p.swayFreq = _rand(1.2, 2.6); p.phase = _rand(0, TAU);
                p.size = (opts.size || 6) * _rand(0.8, 1.2);
                p.rot = _rand(0, TAU); p.vrot = _rand(-2, 2);
                p.maxLife = p.life = _rand(1.2, 2.4); p.fadeIn = 0.1; p.fadeOut = 0.6;
                p.color = col || _pick(LEAF_COLORS);
            }
            break;
        }
        default:
            // Unknown type: fall back to a small neutral spark so callers never crash.
            {
                const p = _obtain(PRIO_NORMAL); if (!p) break;
                p.shape = SH_SOFT; p.additive = true;
                p.x = x; p.y = y; p.size = 4;
                p.maxLife = p.life = 0.3; p.fadeOut = 0.3;
                p.color = col || '#ffffff'; p.color2 = '#ffffff';
            }
            break;
    }
}

// -------------------------------------------------------------------- texts
/**
 * Floating combat text. Rises ~26px over ~0.8s with a slight horizontal drift.
 * @param {number} x @param {number} y @param {string} str
 * @param {object} [opts] {color, size, crit}
 */
function text(x, y, str, opts) {
    _ensurePool();
    opts = opts || {};
    let slot = null;
    // reuse a dead slot, else steal the oldest (smallest remaining life).
    let oldest = null, oldestLife = Infinity;
    for (let i = 0; i < _texts.length; i++) {
        const t = _texts[i];
        if (!t.active) { slot = t; break; }
        if (t.life < oldestLife) { oldestLife = t.life; oldest = t; }
    }
    if (!slot) slot = oldest;
    if (!slot) return;

    let color = opts.color;
    if (!color) color = (typeof str === 'string' && str[0] === '+' && str.indexOf('$') >= 0) ? '#17dd62' : '#ffffff';
    let size = opts.size || 13;
    if (opts.crit) size *= 1.5;

    slot.active = true;
    slot.x = slot.x0 = x;
    slot.y = slot.y0 = y;
    slot.drift = _rand(-14, 14);
    slot.str = String(str);
    slot.color = color;
    slot.size = size;
    slot.maxLife = slot.life = 0.8;
}

// ------------------------------------------------------------------ ambient
/** Continuous screen-wide weather emitter, or null to stop. */
function setAmbient(type) {
    if (type === _ambientType) return;
    _ambientType = AMBIENT_RATE[type] ? type : null;
    _ambientAccum = 0;
}

function _spawnAmbientOne(type) {
    const p = _obtain(PRIO_AMBIENT);
    if (!p) return;
    switch (type) {
        case 'snow': {
            const vy = _rand(28, 58);
            p.shape = SH_FLAKE;
            p.x = _rand(-20, W + 20); p.y = -8;
            p.vx = _rand(-30, -6); p.vy = vy;
            p.sway = _rand(6, 14); p.swayFreq = _rand(0.6, 1.4); p.phase = _rand(0, TAU);
            p.size = _rand(1.6, 3); p.alpha0 = 0.85;
            p.maxLife = p.life = (H + 40) / vy;
            p.color = '#ffffff';
            break;
        }
        case 'rain': {
            const vy = _rand(540, 780);
            p.shape = SH_STREAK;
            p.x = _rand(0, W + 60); p.y = -12;
            p.vx = _rand(-70, -30); p.vy = vy;
            p.size = _rand(11, 19); p.alpha0 = 0.5;
            p.spawnSplash = true; p.groundY = _rand(H * 0.45, H - 8);
            p.maxLife = p.life = (H + 40) / vy;
            p.color = '#9fb8d8';
            break;
        }
        case 'leaves': {
            const vy = _rand(24, 50);
            p.shape = SH_RECT; p.ratio = 0.7;
            p.x = _rand(-20, W + 20); p.y = -12;
            p.vx = _rand(-24, 8); p.vy = vy; p.gravity = 6;
            p.sway = _rand(16, 30); p.swayFreq = _rand(0.5, 1.1); p.phase = _rand(0, TAU);
            p.size = _rand(4, 7); p.rot = _rand(0, TAU); p.vrot = _rand(-1.6, 1.6);
            p.alpha0 = 0.9; p.maxLife = p.life = (H + 60) / vy;
            p.color = _pick(LEAF_COLORS);
            break;
        }
        case 'ash': {
            const vy = _rand(10, 28);
            const glow = Math.random() < 0.18;
            p.shape = SH_SOFT; p.additive = glow;
            p.x = _rand(-20, W + 20); p.y = -12;
            p.vx = _rand(-14, 14); p.vy = vy;
            p.sway = _rand(8, 18); p.swayFreq = _rand(0.5, 1.2); p.phase = _rand(0, TAU);
            p.size = _rand(1.6, 3.4); p.alpha0 = glow ? 0.7 : 0.5;
            p.maxLife = p.life = (H + 60) / vy;
            p.color = glow ? '#ff8a3a' : '#37302c'; p.color2 = glow ? '#ffce5a' : '#241f1c';
            break;
        }
        case 'spores': {
            p.shape = SH_SOFT; p.additive = true;
            p.x = _rand(0, W); p.y = _rand(0, H);
            p.vx = _rand(-8, 8); p.vy = _rand(-8, 5);
            p.sway = _rand(6, 14); p.swayFreq = _rand(0.4, 1); p.phase = _rand(0, TAU);
            p.size = _rand(1.4, 2.8); p.alpha0 = _rand(0.25, 0.45);
            p.fadeIn = 0.6; p.fadeOut = 1.2;
            p.maxLife = p.life = _rand(4, 9);
            p.color = '#7fe08a'; p.color2 = '#b7f0bf';
            break;
        }
        case 'petals': {
            const vy = _rand(22, 46);
            p.shape = SH_RECT; p.ratio = 0.8;
            p.x = _rand(-20, W + 20); p.y = -12;
            p.vx = _rand(-22, 6); p.vy = vy; p.gravity = 5;
            p.sway = _rand(18, 34); p.swayFreq = _rand(0.6, 1.3); p.phase = _rand(0, TAU);
            p.size = _rand(3, 6); p.rot = _rand(0, TAU); p.vrot = _rand(-2, 2);
            p.alpha0 = 0.92; p.maxLife = p.life = (H + 60) / vy;
            p.color = _pick(PETAL_COLORS);
            break;
        }
        case 'souls': {
            const vy = _rand(24, 52);
            p.shape = SH_SOFT; p.additive = true;
            p.x = _rand(0, W); p.y = H + 10;
            p.vx = _rand(-8, 8); p.vy = -vy;
            p.sway = _rand(10, 22); p.swayFreq = _rand(0.6, 1.4); p.phase = _rand(0, TAU);
            p.size = _rand(3, 6); p.alpha0 = _rand(0.3, 0.5);
            p.fadeIn = 0.5; p.fadeOut = 1;
            p.maxLife = p.life = (H + 60) / vy;
            p.color = '#4aedd9'; p.color2 = '#8ff6ea';
            break;
        }
        case 'embers': {
            const vy = _rand(30, 72);
            p.shape = SH_SOFT; p.additive = true;
            p.x = _rand(0, W); p.y = H + 10;
            p.vx = _rand(-12, 12); p.vy = -vy; p.gravity = -3;
            p.sway = _rand(8, 20); p.swayFreq = _rand(1, 2.5); p.phase = _rand(0, TAU);
            p.size = _rand(1.6, 3.2); p.alpha0 = _rand(0.5, 0.85);
            p.fadeIn = 0.2; p.fadeOut = 0.8;
            p.maxLife = p.life = _rand(2, 5);
            p.color = Math.random() < 0.5 ? '#ff8a3a' : '#ffce5a'; p.color2 = '#ffe6a0';
            break;
        }
        default: break;
    }
}

// ------------------------------------------------------------------- update
/** Advance every live particle / text / ambient emitter by dt seconds. */
function update(dt) {
    if (dt <= 0) { _ensurePool(); return; }
    _ensurePool();
    _now += dt;

    // ambient emission (density scales with quality)
    if (_ambientType) {
        _ambientAccum += (AMBIENT_RATE[_ambientType] || 0) * _ambientScale * dt;
        let guard = 0;
        while (_ambientAccum >= 1 && guard < 300) {
            _ambientAccum -= 1;
            _spawnAmbientOne(_ambientType);
            guard++;
        }
    }

    for (let i = 0; i < _particles.length; i++) {
        const p = _particles[i];
        if (!p.active) continue;

        p.life -= dt;
        if (p.life <= 0) { p.active = false; _liveCount--; _freeStack.push(i); continue; }

        if (p.gravity) p.vy += p.gravity * dt;
        if (p.curl) {
            const c = Math.cos(p.curl * dt), s = Math.sin(p.curl * dt);
            const nvx = p.vx * c - p.vy * s;
            p.vy = p.vx * s + p.vy * c;
            p.vx = nvx;
        }
        if (p.damp) {
            const f = 1 - p.damp * dt;
            const g = f < 0 ? 0 : f;
            p.vx *= g; p.vy *= g;
        }

        let evx = p.vx;
        if (p.sway) evx += Math.sin(_now * p.swayFreq * TAU + p.phase) * p.sway;
        p.x += evx * dt;
        p.y += p.vy * dt;

        if (p.vrot) p.rot += p.vrot * dt;
        if (p.sizeVel) {
            p.size += p.sizeVel * dt;
            if (p.size < p.minSize) p.size = p.minSize;
        }

        if (p.hasBounce && !p.bounced && p.vy > 0 && p.y >= p.bounceY) {
            p.y = p.bounceY; p.vy *= -0.42; p.vx *= 0.6; p.vrot *= 0.5; p.bounced = true;
        }

        if (p.spawnSplash && p.y >= p.groundY) {
            // rain hitting the ground -> tiny splash ring + two droplets
            const gx = p.x, gy = p.groundY;
            p.active = false; _liveCount--; _freeStack.push(i);
            const s = _obtain(PRIO_AMBIENT);
            if (s) {
                s.shape = SH_SOFT; s.x = gx; s.y = gy;
                s.size = 1.5; s.sizeVel = 22;
                s.maxLife = s.life = 0.18; s.alpha0 = 0.4; s.fadeOut = 0.18;
                s.color = '#cfe0f2'; s.color2 = '#9fb8d8';
            }
            for (let k = 0; k < 2; k++) {
                const d = _obtain(PRIO_AMBIENT); if (!d) break;
                d.shape = SH_CIRCLE; d.x = gx; d.y = gy;
                d.vx = _rand(-40, 40); d.vy = -_rand(40, 90); d.gravity = 500;
                d.size = _rand(1, 1.8); d.alpha0 = 0.5;
                d.maxLife = d.life = _rand(0.12, 0.24); d.fadeOut = d.life;
                d.color = '#bcd0e6';
            }
            continue;
        }

        // ambient weather that wandered off-screen is retired early
        if (p.priority === PRIO_AMBIENT &&
            (p.y > H + 40 || p.y < -60 || p.x < -80 || p.x > W + 80)) {
            p.active = false; _liveCount--; _freeStack.push(i);
        }
    }

    for (let i = 0; i < _texts.length; i++) {
        const t = _texts[i];
        if (!t.active) continue;
        t.life -= dt;
        if (t.life <= 0) { t.active = false; }
    }
}

// --------------------------------------------------------------------- draw
function _drawParticle(ctx, p) {
    const age = p.maxLife - p.life;
    let a = p.alpha0;
    if (p.fadeIn > 0) a *= _clamp(age / p.fadeIn, 0, 1);
    if (p.fadeOut > 0) a *= _clamp(p.life / p.fadeOut, 0, 1);
    if (a <= 0.003) return;
    const s = p.size;
    if (s <= 0.1) return;

    switch (p.shape) {
        case SH_SOFT: {
            // outer haze + brighter core -> soft look without allocating gradients
            ctx.globalAlpha = a * 0.5;
            ctx.fillStyle = p.color2;
            ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.6, 0, TAU); ctx.fill();
            break;
        }
        case SH_CIRCLE: {
            ctx.globalAlpha = a;
            if (p.ring) {
                ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, s * 0.28);
                ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.stroke();
                ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(p.x - s * 0.32, p.y - s * 0.32, s * 0.22, 0, TAU); ctx.fill();
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
                if (p.glint) {
                    const gw = Math.abs(Math.cos(p.rot)) * s * 0.7;
                    ctx.fillStyle = p.color2;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, gw, s * 0.85, 0, 0, TAU); ctx.fill();
                }
            }
            break;
        }
        case SH_STREAK: {
            const sp = Math.hypot(p.vx, p.vy) || 1;
            const ux = p.vx / sp, uy = p.vy / sp;
            ctx.globalAlpha = a;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = Math.max(1, s * 0.18);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - ux * s, p.y - uy * s);
            ctx.stroke();
            break;
        }
        case SH_SHARD: {
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            const h = s;
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color; ctx.fillRect(-h / 2, -h / 2, h, h);       // front
            ctx.fillStyle = p.color2; ctx.fillRect(-h / 2, -h / 2, h, h * 0.34); // lit top
            ctx.fillStyle = p.color3; ctx.fillRect(h / 2 - h * 0.24, -h / 2, h * 0.24, h); // shaded side
            ctx.restore();
            break;
        }
        case SH_DIAMOND: {
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot + Math.PI / 4);
            const h = s;
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color; ctx.fillRect(-h / 2, -h / 2, h, h);
            ctx.fillStyle = p.color2; ctx.fillRect(-h / 2, -h / 2, h, h * 0.45);
            ctx.restore();
            break;
        }
        case SH_RECT: {
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            const w = s * (0.5 + 0.5 * Math.abs(Math.cos(p.rot * 1.6 + p.phase))); // flutter
            const hh = s * p.ratio;
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            ctx.fillRect(-w / 2, -hh / 2, w, hh);
            ctx.restore();
            break;
        }
        case SH_FLAKE: {
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.5, 0, TAU); ctx.fill();
            ctx.strokeStyle = p.color; ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y);
            ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s);
            ctx.stroke();
            break;
        }
        case SH_HEART: {
            ctx.save();
            ctx.translate(p.x, p.y); ctx.scale(s / 6, s / 6);
            ctx.globalAlpha = a; ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.moveTo(0, 3);
            ctx.bezierCurveTo(-6, -3, -6, -7, 0, -3);
            ctx.bezierCurveTo(6, -7, 6, -3, 0, 3);
            ctx.closePath(); ctx.fill();
            ctx.restore();
            break;
        }
        case SH_STAR: {
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.globalAlpha = a; ctx.strokeStyle = p.color;
            ctx.lineWidth = Math.max(1.5, s * 0.14);
            ctx.beginPath();
            for (let k = 0; k < 5; k++) {
                const ang = (k / 5) * TAU;
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
            }
            ctx.stroke();
            ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, TAU); ctx.fill();
            ctx.restore();
            break;
        }
        case SH_CONE: {
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            const len = s, half = s * 0.42;
            ctx.globalAlpha = a; ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(len, -half);
            ctx.lineTo(len * 1.1, 0);
            ctx.lineTo(len, half);
            ctx.closePath(); ctx.fill();
            ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(len * 0.55, -half * 0.4);
            ctx.lineTo(len * 0.6, 0);
            ctx.lineTo(len * 0.55, half * 0.4);
            ctx.closePath(); ctx.fill();
            ctx.restore();
            break;
        }
        case SH_NOTE: {
            ctx.save();
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.globalAlpha = a; ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.ellipse(-s * 0.35, s * 0.35, s * 0.45, s * 0.32, -0.5, 0, TAU); ctx.fill();
            ctx.fillRect(s * 0.02, -s * 0.75, s * 0.22, s * 1.15);   // stem
            ctx.fillRect(s * 0.02, -s * 0.75, s * 0.6, s * 0.24);    // flag
            ctx.restore();
            break;
        }
        default: break;
    }
}

/**
 * Render every live particle and text. Draws all 'source-over' particles, then
 * all additive 'lighter' particles, then combat text -- two composite flips
 * total instead of one per particle.
 */
function draw(ctx) {
    if (!_particles.length) return;
    ctx.save();

    // pass 1: normal particles
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < _particles.length; i++) {
        const p = _particles[i];
        if (p.active && !p.additive) _drawParticle(ctx, p);
    }

    // pass 2: additive glow particles
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < _particles.length; i++) {
        const p = _particles[i];
        if (p.active && p.additive) _drawParticle(ctx, p);
    }

    // pass 3: combat text
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = 0; i < _texts.length; i++) {
        const t = _texts[i];
        if (!t.active) continue;
        const age = t.maxLife - t.life;
        const f = age / t.maxLife;                       // 0 -> 1
        const rise = 26 * (1 - (1 - f) * (1 - f) * (1 - f)); // easeOutCubic
        const y = t.y0 - rise;
        const x = t.x0 + t.drift * f;
        let a = 1;
        if (f > 0.6) a = 1 - (f - 0.6) / 0.4;            // fade last 40%
        const pop = f < 0.15 ? 0.7 + 0.3 * (f / 0.15) : 1; // quick scale-in pop
        const sz = t.size * pop;
        ctx.globalAlpha = _clamp(a, 0, 1);
        ctx.font = '700 ' + sz.toFixed(1) + 'px "Trebuchet MS", "Segoe UI", sans-serif';
        ctx.lineWidth = Math.max(2, sz * 0.22);
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(t.str, x, y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, x, y);
    }

    ctx.restore();
}

/** Retire every live particle and text (called on map change / reset). */
function clear() {
    for (let i = 0; i < _particles.length; i++) {
        const p = _particles[i];
        if (p.active) { p.active = false; }
    }
    _freeStack.length = 0;
    for (let i = 0; i < _particles.length; i++) _freeStack.push(i);
    _liveCount = 0;
    for (let i = 0; i < _texts.length; i++) _texts[i].active = false;
    _ambientAccum = 0;
}

/** Set the particle budget + emission density from the quality setting. */
function setQuality(q) {
    const cfg = QUALITY[q] || QUALITY.high;
    _cap = cfg.cap;
    _countScale = cfg.countScale;
    _ambientScale = cfg.ambient;
    _ensurePool();
    _cullToCap();
}

export const Particles = {
    setQuality,
    spawn,
    text,
    setAmbient,
    update,
    draw,
    clear,
    get count() { return _liveCount; },
};
