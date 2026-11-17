// Procedural 16x16 Minecraft-style block textures. Owned by the orchestrator.
// Module top level is DOM-free (canvases created lazily) so node can import
// TILE_NAMES for validation.

const SIZE = 16;
const cache = new Map();

/* ---------------- deterministic helpers ---------------- */

function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function makeRng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbStr(r, g, b, a = 1) {
    return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

/** Multiply a hex color's brightness by m (clamped). */
function shade(hex, m) {
    const [r, g, b] = hexToRgb(hex);
    return rgbStr(Math.min(255, r * m), Math.min(255, g * m), Math.min(255, b * m));
}

/* ---------------- painter machinery ---------------- */

function noiseFill(ctx, rng, base, spread) {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            ctx.fillStyle = shade(base, 1 + (rng() - 0.5) * 2 * spread);
            ctx.fillRect(x, y, 1, 1);
        }
    }
}

function speckle(ctx, rng, color, count, size = 1) {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
        ctx.fillRect((rng() * SIZE) | 0, (rng() * SIZE) | 0, size, size);
    }
}

function planks(ctx, rng, base) {
    ctx.fillStyle = shade(base, 0.55);
    for (let y = 3; y < SIZE; y += 4) ctx.fillRect(0, y, SIZE, 1);
    for (let row = 0; row < 4; row++) {
        const jx = ((rng() * SIZE) | 0);
        ctx.fillRect(jx, row * 4, 1, 3);
    }
    ctx.fillStyle = shade(base, 1.18);
    for (let y = 0; y < SIZE; y += 4) ctx.fillRect(0, y, SIZE, 1);
}

function bricks(ctx, base, bw, bh, mortarShade = 0.5) {
    ctx.fillStyle = shade(base, mortarShade);
    for (let y = bh - 1; y < SIZE; y += bh) ctx.fillRect(0, y, SIZE, 1);
    let off = 0;
    for (let y = 0; y < SIZE; y += bh) {
        for (let x = off; x <= SIZE; x += bw) ctx.fillRect(x - 1, y, 1, bh - 1);
        off = off === 0 ? (bw / 2) | 0 : 0;
    }
}

function cracks(ctx, rng, color, n) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
        let x = (rng() * SIZE) | 0, y = (rng() * SIZE) | 0;
        const len = 3 + (rng() * 4) | 0;
        for (let s = 0; s < len; s++) {
            ctx.fillRect(x, y, 1, 1);
            x += rng() < 0.5 ? 1 : 0;
            y += rng() < 0.6 ? 1 : -0;
            if (x >= SIZE || y >= SIZE) break;
        }
    }
}

function blades(ctx, rng, color, n) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
        const x = (rng() * SIZE) | 0, y = (rng() * SIZE) | 0;
        ctx.fillRect(x, y, 1, 2);
    }
}

/* ---------------- tile definitions ---------------- */

// Simple noisy tiles: [base, spread, extra(ctx, rng)]
const DEFS = {
    grass: ['#6faa47', 0.09, (c, r) => { blades(c, r, '#83c455', 9); speckle(c, r, '#597f37', 8); }],
    grass2: ['#79b34e', 0.10, (c, r) => { blades(c, r, '#8fce5e', 7); speckle(c, r, '#5d8a3a', 6); speckle(c, r, '#e8e06a', 2); }],
    dirt: ['#8b5a2b', 0.11, (c, r) => speckle(c, r, '#6b421c', 10)],
    dirt_path: ['#a97d44', 0.09, (c, r) => { speckle(c, r, '#8a6234', 10); speckle(c, r, '#c49a5c', 6); }],
    gravel: ['#7d7a76', 0.14, (c, r) => { speckle(c, r, '#5d5a56', 12); speckle(c, r, '#9a9792', 10); }],
    stone: ['#7f7f7f', 0.07, (c, r) => { speckle(c, r, '#6a6a6a', 8); cracks(c, r, '#646464', 2); }],
    cobble: ['#7a7a7a', 0.08, (c) => bricks(c, '#7a7a7a', 5, 5, 0.55)],
    mossy_cobble: ['#6f7f62', 0.10, (c, r) => { bricks(c, '#6f7f62', 5, 5, 0.5); speckle(c, r, '#4f7a3a', 10); }],
    sand: ['#dbcf9c', 0.07, (c, r) => speckle(c, r, '#c4b782', 10)],
    sandstone: ['#d6c68e', 0.05, (c) => bricks(c, '#d6c68e', 8, 4, 0.75)],
    red_sand: ['#c47b3a', 0.08, (c, r) => speckle(c, r, '#a96227', 10)],
    terracotta: ['#b06843', 0.05, (c) => {
        const bands = ['#9c5535', '#c07a4e', '#8a4a30', '#b06843'];
        for (let y = 0; y < SIZE; y++) { c.fillStyle = shade(bands[(y >> 2) % 4], 1); c.fillRect(0, y, SIZE, 1); }
    }],
    snow: ['#eef4f8', 0.04, (c, r) => speckle(c, r, '#d8e4ee', 8)],
    ice: ['#9fd0f0', 0.05, (c, r) => { c.fillStyle = '#c8e8fa'; for (let i = 0; i < 3; i++) { const x = (r() * 12) | 0, y = (r() * 12) | 0; c.fillRect(x, y, 4, 1); c.fillRect(x + 3, y + 1, 3, 1); } }],
    packed_ice: ['#7fb8e0', 0.06, (c, r) => { speckle(c, r, '#a8d4ee', 8); cracks(c, r, '#6aa2cc', 2); }],
    water: ['#3f76e4', 0.05, (c, r) => { c.fillStyle = '#5f96f4'; for (let i = 0; i < 4; i++) c.fillRect((r() * 12) | 0, (r() * 16) | 0, 3 + (r() * 3 | 0), 1); }],
    water_deep: ['#2c56b8', 0.06, (c, r) => { c.fillStyle = '#4470d4'; for (let i = 0; i < 3; i++) c.fillRect((r() * 12) | 0, (r() * 16) | 0, 3, 1); }],
    lava: ['#cf4b0a', 0.10, (c, r) => {
        speckle(c, r, '#8a2c06', 14);
        c.fillStyle = '#ffb114';
        for (let i = 0; i < 4; i++) { const x = (r() * 13) | 0, y = (r() * 15) | 0; c.fillRect(x, y, 3, 1); c.fillRect(x + 1, y + 1, 2, 1); }
        speckle(c, r, '#ffe14a', 4);
    }],
    netherrack: ['#8a3a3a', 0.13, (c, r) => { speckle(c, r, '#6a2424', 12); speckle(c, r, '#a85454', 8); }],
    soul_sand: ['#5c473a', 0.10, (c, r) => {
        speckle(c, r, '#463527', 10);
        // faint trapped faces
        c.fillStyle = '#3a2c20';
        c.fillRect(4, 5, 2, 2); c.fillRect(8, 5, 2, 2); c.fillRect(6, 9, 2, 1);
        c.fillRect(11, 11, 1, 1); c.fillRect(13, 11, 1, 1);
    }],
    soul_soil: ['#4e3d31', 0.09, (c, r) => speckle(c, r, '#3a2c22', 10)],
    basalt: ['#4a4a52', 0.06, (c) => { for (let x = 0; x < SIZE; x += 3) { c.fillStyle = shade('#4a4a52', x % 6 ? 0.85 : 1.1); c.fillRect(x, 0, 2, SIZE); } }],
    crimson_nylium: ['#7d2a35', 0.10, (c, r) => { speckle(c, r, '#a83a4a', 10); blades(c, r, '#c4506a', 5); }],
    warped_nylium: ['#2a7d6a', 0.10, (c, r) => { speckle(c, r, '#3aa88a', 10); blades(c, r, '#50c4a4', 5); }],
    end_stone: ['#dde2a3', 0.06, (c, r) => { speckle(c, r, '#c2c787', 10); speckle(c, r, '#eef2bb', 6); }],
    obsidian: ['#1d1226', 0.10, (c, r) => { speckle(c, r, '#332044', 8); speckle(c, r, '#4a2e64', 4); }],
    crying_obsidian: ['#241031', 0.10, (c, r) => { speckle(c, r, '#4a2e64', 6); speckle(c, r, '#8a5cf6', 5); speckle(c, r, '#b48ffc', 2); }],
    purpur: ['#a678a6', 0.05, (c) => bricks(c, '#a678a6', 8, 8, 0.8)],
    mycelium: ['#7a6a7e', 0.10, (c, r) => { speckle(c, r, '#96829c', 9); speckle(c, r, '#5e4f62', 8); }],
    podzol: ['#6a4a26', 0.11, (c, r) => { speckle(c, r, '#87622f', 9); speckle(c, r, '#4e3419', 8); }],
    mud: ['#4c3b32', 0.08, (c, r) => { speckle(c, r, '#3a2c24', 8); speckle(c, r, '#5e4a3e', 6); }],
    clay: ['#9aa3b0', 0.06, (c, r) => speckle(c, r, '#848d9a', 8)],
    deepslate: ['#4c4c50', 0.07, (c, r) => { speckle(c, r, '#3a3a3e', 9); cracks(c, r, '#333336', 2); }],
    deepslate_tiles: ['#48484c', 0.05, (c) => bricks(c, '#48484c', 8, 8, 0.6)],
    sculk: ['#0c2430', 0.08, (c, r) => {
        speckle(c, r, '#123642', 8);
        c.fillStyle = '#18c3bc';
        for (let i = 0; i < 3; i++) { const x = (r() * 12) | 0, y = (r() * 12) | 0; c.fillRect(x + 1, y, 2, 1); c.fillRect(x, y + 1, 1, 2); c.fillRect(x + 3, y + 1, 1, 2); c.fillRect(x + 1, y + 3, 2, 1); }
        speckle(c, r, '#2ee6de', 3);
    }],
    moss: ['#5a7e3a', 0.09, (c, r) => { speckle(c, r, '#48662c', 9); speckle(c, r, '#6e9a48', 8); }],
    oak_planks: ['#a8834a', 0.06, (c, r) => planks(c, r, '#a8834a')],
    spruce_planks: ['#735531', 0.06, (c, r) => planks(c, r, '#735531')],
    oak_log: ['#9c7a44', 0.05, (c) => {
        // top-down rings
        for (let ring = 7; ring >= 1; ring -= 2) {
            c.fillStyle = shade('#9c7a44', ring % 4 ? 0.85 : 1.1);
            c.fillRect(8 - ring, 8 - ring, ring * 2, ring * 2);
        }
        c.fillStyle = '#6b4e26'; c.strokeStyle = '#6b4e26';
        c.fillRect(0, 0, SIZE, 1); c.fillRect(0, 15, SIZE, 1); c.fillRect(0, 0, 1, SIZE); c.fillRect(15, 0, 1, SIZE);
    }],
    leaves_oak: ['#4a7a28', 0.14, (c, r) => { speckle(c, r, '#3a6420', 12); speckle(c, r, '#5e9634', 10); }],
    leaves_spruce: ['#38583a', 0.12, (c, r) => { speckle(c, r, '#2a462c', 12); speckle(c, r, '#4a7050', 8); }],
    leaves_birch: ['#6a8a44', 0.12, (c, r) => { speckle(c, r, '#567234', 10); speckle(c, r, '#84a85a', 8); }],
    leaves_cherry: ['#e8a8c8', 0.10, (c, r) => { speckle(c, r, '#d488b0', 10); speckle(c, r, '#f8c8de', 8); }],
    prismarine: ['#5aa08e', 0.06, (c) => bricks(c, '#5aa08e', 4, 4, 0.72)],
    dark_prismarine: ['#2e5a4c', 0.06, (c) => bricks(c, '#2e5a4c', 4, 4, 0.6)],
    sea_lantern: ['#c8e8e0', 0.04, (c) => {
        c.fillStyle = '#a0ccC4'; c.fillRect(0, 0, SIZE, 2); c.fillRect(0, 14, SIZE, 2); c.fillRect(0, 0, 2, SIZE); c.fillRect(14, 0, 2, SIZE);
        c.fillStyle = '#eefff8'; c.fillRect(5, 5, 6, 6);
        c.fillStyle = '#ffffff'; c.fillRect(7, 7, 2, 2);
    }],
    glowstone: ['#8a6a3a', 0.08, (c, r) => {
        speckle(c, r, '#c49a4a', 12);
        c.fillStyle = '#ffd966';
        for (let i = 0; i < 4; i++) { const x = (r() * 12) | 0, y = (r() * 12) | 0; c.fillRect(x, y, 3, 3); }
        speckle(c, r, '#fff2b0', 6);
    }],
    magma: ['#5a2c14', 0.09, (c, r) => {
        c.fillStyle = '#e85a10';
        for (let i = 0; i < 5; i++) { const x = (r() * 13) | 0, y = (r() * 14) | 0; c.fillRect(x, y, 3, 2); }
        speckle(c, r, '#ffb114', 6);
    }],
    bedrock: ['#3a3a3a', 0.18, (c, r) => { speckle(c, r, '#565656', 12); speckle(c, r, '#222222', 12); }],
    farmland: ['#6b4423', 0.08, (c) => { c.fillStyle = shade('#6b4423', 0.6); for (let y = 1; y < SIZE; y += 4) c.fillRect(0, y, SIZE, 2); }],
    wheat: ['#6b4423', 0.06, (c, r) => {
        c.fillStyle = shade('#6b4423', 0.6); for (let y = 1; y < SIZE; y += 4) c.fillRect(0, y, SIZE, 2);
        c.fillStyle = '#d4b45a';
        for (let x = 1; x < SIZE; x += 3) { c.fillRect(x, 2 + ((r() * 3) | 0), 1, 10); }
        speckle(c, r, '#e8cc6a', 10);
    }],
    stone_bricks: ['#8a8a8a', 0.05, (c) => bricks(c, '#8a8a8a', 8, 4, 0.6)],
    cracked_bricks: ['#828282', 0.06, (c, r) => { bricks(c, '#828282', 8, 4, 0.6); cracks(c, r, '#5c5c5c', 4); }],
    coral_pink: ['#e87a9a', 0.09, (c, r) => { speckle(c, r, '#d05a7e', 10); speckle(c, r, '#f8a0ba', 8); }],
    coral_blue: ['#4a7ae8', 0.09, (c, r) => { speckle(c, r, '#3a5ec8', 10); speckle(c, r, '#6a9af8', 8); }],
    glass: ['#c8e8f0', 0.02, (c) => {
        c.clearRect(0, 0, SIZE, SIZE);
        c.fillStyle = 'rgba(200,232,240,0.35)'; c.fillRect(0, 0, SIZE, SIZE);
        c.fillStyle = '#e8f6fa'; c.fillRect(0, 0, SIZE, 1); c.fillRect(0, 15, SIZE, 1); c.fillRect(0, 0, 1, SIZE); c.fillRect(15, 0, 1, SIZE);
        c.fillRect(3, 3, 1, 4); c.fillRect(4, 2, 1, 3);
    }],
};

export const TILE_NAMES = Object.keys(DEFS);

/* ---------------- public API ---------------- */

function bake(name) {
    const def = DEFS[name];
    if (!def) throw new Error('[textures] unknown tile: ' + name);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const rng = makeRng(hashSeed(name));
    noiseFill(ctx, rng, def[0], def[1]);
    if (def[2]) def[2](ctx, rng);
    cache.set(name, canvas);
    return canvas;
}

export const Textures = {
    /** Bake every tile, yielding to the caller for progress updates. */
    async bakeAll(onProgress) {
        const names = TILE_NAMES;
        for (let i = 0; i < names.length; i++) {
            if (!cache.has(names[i])) bake(names[i]);
            if (onProgress && i % 8 === 0) {
                onProgress(i / names.length, 'Baking block textures... (' + names[i] + ')');
                // Microtask yield only: timer/rAF yields can be dropped entirely if
                // the renderer is throttled or backgrounded during load, deadlocking boot.
                await Promise.resolve();
            }
        }
        if (onProgress) onProgress(1, 'Textures ready');
    },

    tile(name) {
        return cache.get(name) || bake(name);
    },

    has(name) {
        return !!DEFS[name];
    },
};
