// Main menu -- the first impression. A baked map terrain drifts behind the title
// (slow Ken Burns pan/zoom), cosmetic mobs march the map's real path forever, a
// dark gradient lifts the text for contrast, and a handful of biome-flavored
// ambient motes drift over the top. Everything is driven by tick(dt) which the
// screen router runs via requestAnimationFrame while this screen is mounted.
//
// Browser-only (ui layer): free to touch the DOM, canvas, and Math.random. The
// heavy bake (bakeTerrain -> 1280x720 canvas) is cached per map id so returning
// to the menu is instant, and the static dark overlay is baked once per mount.

import { W, H, VERSION } from '../core/constants.js';
import { Save } from '../core/save.js';
import { Music } from '../audio/music.js';
import { SFX } from '../audio/sfx.js';
import { bakeTerrain } from '../gfx/terrain.js';
import { MobSprites } from '../gfx/mobsprites.js';
import { BIOMES } from '../gfx/palette.js';
import { MAP_LIST } from '../data/maps/index.js';
import { Path } from '../sim/path.js';
import { Screens } from './screens.js';
import { openSettings } from './settings.js';
import { bus } from '../core/events.js';
import { Session } from '../net/session.js';
import { Api } from '../net/api.js';

// Rotates each time the menu is shown so the backdrop map + mob cast vary.
let _bgRotation = 0;
// Baked terrain canvases, keyed by map id (bakeTerrain is expensive).
const _terrainCache = new Map();

// Mobs that read as a friendly "welcoming committee" at small scale.
const MARCH_ROSTER = [
    'zombie', 'skeleton', 'creeper', 'spider', 'slime_small', 'husk',
    'stray', 'pillager', 'silverfish', 'baby_zombie', 'zombie_villager', 'magma_cube_small',
];
// Mostly plain, with the odd modifier for a flash of shimmer/iron/sprout.
const MARCH_VARIANTS = ['normal', 'normal', 'normal', 'normal', 'fortified', 'regrow', 'camo'];

// Ambient mote palettes per biome ambient type (see BIOMES[...].ambient).
const PARTICLE_COLORS = {
    leaves: ['#6cae3e', '#4d8a2a', '#c98a2a', '#b5642a'],
    petals: ['#ffb7d5', '#ff9ec4', '#ffd0e4'],
    snow: ['#ffffff', '#dfeeff', '#cfe4ff'],
    embers: ['#ff8a2a', '#ffb347', '#ff5a2a'],
    ash: ['#8a8378', '#b6ada0', '#6a655c'],
    souls: ['#4ae8de', '#7ad0ff', '#a8fff6'],
    spores: ['#c48af5', '#d7b0ff', '#a86ae0'],
    bubble: ['#bfe8ff', '#8fd7ff', '#e0f6ff'],
    _default: ['#fff2c8', '#ffe9b0', '#f0e6d0'],
};
// Ambient types that rise instead of fall.
const RISING = { embers: true, souls: true, ash: true };

let state = null;

// ---------------------------------------------------------------------------
// backdrop assembly
// ---------------------------------------------------------------------------

function pickMap() {
    const beginners = MAP_LIST.filter((m) => m && m.difficulty === 'beginner');
    const pool = beginners.length ? beginners : MAP_LIST;
    if (!pool.length) return null;
    return pool[_bgRotation % pool.length] || pool[0];
}

function getTerrain(mapDef) {
    const id = mapDef && mapDef.id ? mapDef.id : 'anon';
    const hit = _terrainCache.get(id);
    if (hit) return hit;
    let canvas;
    try {
        canvas = bakeTerrain(mapDef).canvas;
    } catch (e) {
        // Never let a single bad map blank the whole menu.
        canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const cc = canvas.getContext('2d');
        cc.fillStyle = '#33502a';
        cc.fillRect(0, 0, W, H);
    }
    _terrainCache.set(id, canvas);
    return canvas;
}

// Static dark wash + vignette, baked once so it is a single drawImage per frame.
function bakeOverlay() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const cc = c.getContext('2d');
    // Vertical band: darkest at the very top (logo) and bottom (footer), letting
    // the mid-screen scenery breathe.
    const lg = cc.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0.0, 'rgba(8,6,16,0.74)');
    lg.addColorStop(0.26, 'rgba(8,6,16,0.32)');
    lg.addColorStop(0.52, 'rgba(8,6,16,0.20)');
    lg.addColorStop(0.78, 'rgba(8,6,16,0.40)');
    lg.addColorStop(1.0, 'rgba(6,4,12,0.82)');
    cc.fillStyle = lg;
    cc.fillRect(0, 0, W, H);
    // Corner vignette to frame the composition.
    const rg = cc.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30, W / 2, H / 2, Math.hypot(W / 2, H / 2));
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(0.7, 'rgba(0,0,0,0.06)');
    rg.addColorStop(1, 'rgba(0,0,0,0.55)');
    cc.fillStyle = rg;
    cc.fillRect(0, 0, W, H);
    return c;
}

function spawnMobs(paths) {
    const mobs = [];
    if (!paths.length) return mobs;
    const N = 13;
    const drawScale = 0.9;
    for (let i = 0; i < N; i++) {
        const path = paths[i % paths.length];
        if (!path || path.length < 1) continue;
        const id = MARCH_ROSTER[(i + _bgRotation) % MARCH_ROSTER.length];
        const native = MobSprites.size(id);
        mobs.push({
            path,
            id,
            variant: MARCH_VARIANTS[Math.floor(Math.random() * MARCH_VARIANTS.length)],
            dist: (i / N) * (path.length + 80) - 40,
            speed: 22 + Math.random() * 26,   // px/sec: a slow stroll
            phase: Math.random() * 10,
            draw: native * drawScale,
            foot: 3 * drawScale,              // trims the sprite's foot padding
        });
    }
    return mobs;
}

function makeParticle(palette, rise, seedInPlace) {
    return {
        x: Math.random() * W,
        y: seedInPlace ? Math.random() * H : (rise ? H + 8 : -8),
        vx: (Math.random() - 0.5) * 14,
        vy: (rise ? -1 : 1) * (10 + Math.random() * 22),
        size: 2 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 1.4,
        sway: 6 + Math.random() * 10,
        swayPhase: Math.random() * Math.PI * 2,
        alpha: 0.22 + Math.random() * 0.34,
        color: palette[Math.floor(Math.random() * palette.length)],
        rise,
    };
}

function spawnParticles(ambientType) {
    const palette = PARTICLE_COLORS[ambientType] || PARTICLE_COLORS._default;
    const rise = !!RISING[ambientType];
    const arr = [];
    for (let i = 0; i < 16; i++) arr.push(makeParticle(palette, rise, true));
    return arr;
}

// ---------------------------------------------------------------------------
// per-frame update + draw
// ---------------------------------------------------------------------------

function updateMobs(dt) {
    for (const m of state.mobs) {
        m.dist += m.speed * dt;
        const span = m.path.length + 80;
        if (m.dist > m.path.length + 40) m.dist -= span;   // loop back offscreen
    }
}

function updateParticles(dt) {
    for (const p of state.particles) {
        p.swayPhase += dt;
        p.x += (p.vx + Math.sin(p.swayPhase) * p.sway) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.rise && p.y < -12) { p.y = H + 10; p.x = Math.random() * W; }
        else if (!p.rise && p.y > H + 12) { p.y = -10; p.x = Math.random() * W; }
        if (p.x < -24) p.x = W + 20;
        else if (p.x > W + 24) p.x = -20;
    }
}

function drawMobs(ctx) {
    const t = state.time;
    for (const m of state.mobs) {
        const frame = Math.floor(t * 3.2 + m.phase) % 2;
        const spr = MobSprites.sprite(m.id, frame, m.variant);
        if (!spr) continue;
        const pose = m.path.posAt(m.dist);
        ctx.save();
        ctx.translate(pose.x, pose.y);
        if (Math.cos(pose.angle) < 0) ctx.scale(-1, 1);   // face travel direction
        ctx.drawImage(spr, -m.draw / 2, -m.draw + m.foot, m.draw, m.draw);
        ctx.restore();
    }
}

function drawParticles(ctx) {
    for (const p of state.particles) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
    }
}

function drawScene() {
    const ctx = state.ctx;
    const t = state.time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Ken Burns: gentle zoom breathing + a slow drift, all bounded so the baked
    // terrain (exactly WxH) always covers the frame.
    const zoom = 1.10 + 0.045 * Math.sin(t * 0.10);
    const panX = Math.sin(t * 0.055) * (zoom - 1) * W * 0.30;
    const panY = Math.cos(t * 0.043) * (zoom - 1) * H * 0.30;
    ctx.save();
    ctx.translate(W / 2 + panX, H / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
    ctx.drawImage(state.terrain, 0, 0);
    drawMobs(ctx);
    ctx.restore();

    ctx.drawImage(state.overlay, 0, 0);   // baked dark wash + vignette
    drawParticles(ctx);
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

function makeBtn(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = 'mc-btn menu-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('mouseenter', () => SFX.play('ui_hover'));
    b.addEventListener('click', () => {
        SFX.play('ui_click');
        onClick();
    });
    return b;
}

function buildDom(root) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.className = 'menu-bg-canvas';
    root.appendChild(canvas);

    const overlay = document.createElement('div');
    overlay.className = 'menu-overlay';
    overlay.innerHTML =
        '<div class="menu-logo"><div class="menu-logo-inner">' +
            '<div class="menu-logo-line"><span class="mc-block">B</span>LOCK</div>' +
            '<div class="menu-logo-line"><span class="mc-block">D</span>EFENSE</div>' +
        '</div></div>' +
        '<div class="menu-subtitle">a Minecraft-style tower defense</div>' +
        '<div class="menu-buttons"></div>';
    root.appendChild(overlay);

    const btnWrap = overlay.querySelector('.menu-buttons');
    btnWrap.appendChild(makeBtn('PLAY', 'mc-btn-green', () => Screens.show('mapselect')));
    if (Save.loadRun()) {
        btnWrap.appendChild(makeBtn('CONTINUE', 'mc-btn-gold', () => Screens.show('game', { resume: true })));
    }
    btnWrap.appendChild(makeBtn('ONLINE', 'menu-btn-online', () => Screens.show('mphub')));
    btnWrap.appendChild(makeBtn('CODEX', '', () => Screens.show('codex')));
    btnWrap.appendChild(makeBtn('ACHIEVEMENTS', '', () => Screens.show('achievements')));
    btnWrap.appendChild(makeBtn('SETTINGS', '', () => openSettings(root)));

    const footer = document.createElement('div');
    footer.className = 'menu-footer';
    footer.innerHTML =
        '<span class="menu-foot-ver">Block Defense v' + VERSION + '</span>' +
        '<span class="menu-foot-dot"> - </span>' +
        '<span class="menu-foot-credit">crafted block by block, a love letter to tower defense</span>';
    root.appendChild(footer);

    return canvas;
}

// Top-right account chip: name (+ PVP rating) when signed in, else "Sign in".
// Clicking opens the online hub's Account card. Refreshes on 'account:changed'.
// Returns an unsubscribe for the bus listener (the chip DOM is torn down with
// the screen root by the router).
function buildAccountChip(root) {
    const chip = document.createElement('div');
    chip.className = 'mp-menu-chip';
    const dot = document.createElement('span');
    dot.className = 'mp-chip-dot';
    const label = document.createElement('span');
    label.className = 'mp-chip-label';
    const sub = document.createElement('span');
    sub.className = 'mp-chip-sub';
    chip.appendChild(dot);
    chip.appendChild(label);
    chip.appendChild(sub);

    const update = () => {
        const acc = Session.current();
        if (acc && acc.token) {
            chip.classList.add('is-authed');
            label.textContent = acc.name || 'Account';
            sub.textContent = '';
            Api.me().then((res) => {
                if (res && res.ok && res.data && res.data.pvp) {
                    const r = res.data.pvp.rating;
                    sub.textContent = 'PVP ' + (r != null ? r : 1000);
                }
            });
        } else {
            chip.classList.remove('is-authed');
            label.textContent = 'Sign in';
            sub.textContent = '';
        }
    };
    update();

    chip.addEventListener('click', () => { SFX.play('ui_click'); Screens.show('mphub', { focus: 'account' }); });
    chip.addEventListener('mouseenter', () => SFX.play('ui_hover'));
    root.appendChild(chip);
    return bus.on('account:changed', update);
}

// ---------------------------------------------------------------------------
// screen module
// ---------------------------------------------------------------------------

export const MainMenu = {
    mount(rootEl) {
        const canvas = buildDom(rootEl);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        const mapDef = pickMap();
        const paths = mapDef && mapDef.paths
            ? mapDef.paths.map((p) => new Path(p.waypoints))
            : [];
        const biome = mapDef && BIOMES[mapDef.biome] ? BIOMES[mapDef.biome] : null;
        const ambientType = biome ? biome.ambient : null;

        state = {
            root: rootEl,
            canvas,
            ctx,
            terrain: mapDef ? getTerrain(mapDef) : getTerrain({ id: 'anon' }),
            overlay: bakeOverlay(),
            paths,
            mobs: spawnMobs(paths),
            particles: spawnParticles(ambientType),
            time: 0,
        };
        _bgRotation++;

        state.accountUnsub = buildAccountChip(rootEl);

        Music.play('menu');
        drawScene();   // paint an immediate first frame (no blank flash)
    },

    tick(dt) {
        if (!state) return;
        state.time += dt;
        updateMobs(dt);
        updateParticles(dt);
        drawScene();
    },

    unmount() {
        // The screen router removes our root element (and every child: canvas,
        // overlay, footer, account chip). Drop the account:changed subscription
        // so it can't write into the removed chip, then drop the frame state so a
        // stray tick is a no-op. Menu music is intentionally left playing -- it
        // crossfades on the next track change (mapselect keeps it, gamescreen
        // swaps to the map track).
        if (state && state.accountUnsub) { try { state.accountUnsub(); } catch (e) { /* ignore */ } }
        state = null;
    },
};

// Self-register on import (before Screens.init(), which is allowed).
Screens.register('menu', MainMenu);
