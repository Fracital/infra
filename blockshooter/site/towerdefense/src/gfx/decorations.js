// Procedural map decorations (trees, huts, portals...). Owned by the orchestrator.
// drawDecoration(ctx, type, x, y, seed) -- (x, y) is the CENTER-BOTTOM anchor in world px.
// Module top level is DOM-free so sim/game.js and node tests can import
// decorationBlocksPlacement / DECOR_TYPES.

function makeRng(seed) {
    let s = (seed * 2654435761 + 1) >>> 0;
    return function () {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

// Unit pixel size: decorations are drawn as chunky pixel art.
const U = 3;

/** rect in decoration-local units: (0,0) = anchor; +y goes UP from the ground. */
function px(ctx, ax, ay, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(ax + x * U), Math.round(ay - (y + h) * U), Math.ceil(w * U), Math.ceil(h * U));
}

function shadow(ctx, x, y, rw, rh = 0.35) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y - 1, rw, rw * rh, 0, 0, Math.PI * 2);
    ctx.fill();
}

/* ---------------- shared shapes ---------------- */

function blobCanopy(ctx, x, y, cx, cy, r, main, dark, light, rng) {
    // clustered squares approximating a leaf blob
    for (let i = 0; i < 14; i++) {
        const a = rng() * Math.PI * 2;
        const d = rng() * r * 0.8;
        const s = 2 + (rng() * 2 | 0);
        px(ctx, x, y, cx + Math.cos(a) * d - s / 2, cy + Math.sin(a) * d * 0.7 - s / 2, s, s, rng() < 0.3 ? dark : main);
    }
    px(ctx, x, y, cx - r * 0.5, cy - r * 0.35, r, r * 0.8, main);
    for (let i = 0; i < 6; i++) {
        px(ctx, x, y, cx - r * 0.5 + rng() * r, cy - r * 0.3 + rng() * r * 0.6, 1, 1, light);
    }
}

function roundTree(main, dark, light, trunk, height, r) {
    return (ctx, x, y, rng) => {
        shadow(ctx, x, y, r * U * 1.1);
        px(ctx, x, y, -1, 0, 2, height, trunk);
        px(ctx, x, y, -1.8, 0, 0.8, 1.4, shadeStr(trunk, 0.7));
        blobCanopy(ctx, x, y, 0, height + r * 0.5, r, main, dark, light, rng);
    };
}

function shadeStr(hex, m) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) * m) | 0;
    const g = Math.min(255, ((n >> 8) & 255) * m) | 0;
    const b = Math.min(255, (n & 255) * m) | 0;
    return `rgb(${r},${g},${b})`;
}

/* ---------------- decoration painters ---------------- */

const DECOS = {
    oak_tree: { block: true, draw: roundTree('#4e8a2c', '#3a6a20', '#6cae42', '#7a5a30', 5, 5) },
    birch_tree: { block: true, draw: roundTree('#74a046', '#5a8034', '#90bc5e', '#d8d8c8', 6, 4) },
    dark_oak_tree: { block: true, draw: roundTree('#2e5a1c', '#224414', '#417a2a', '#4a3418', 4, 6) },
    jungle_tree: { block: true, draw: roundTree('#3a7a24', '#2c5c1a', '#54a238', '#8a6a3a', 8, 5) },
    cherry_tree: { block: true, draw: roundTree('#eaa8ca', '#d488b0', '#f8cce0', '#5a3a2a', 5, 5) },
    acacia_tree: {
        block: true,
        draw: (ctx, x, y, rng) => {
            shadow(ctx, x, y, 16);
            px(ctx, x, y, -1, 0, 2, 5, '#8a5a34');
            px(ctx, x, y, -2.6, 4, 2, 1.4, '#8a5a34');
            px(ctx, x, y, -6, 6, 12, 2, '#6a9a2e');
            px(ctx, x, y, -5, 7.6, 10, 1, '#84b442');
            for (let i = 0; i < 5; i++) px(ctx, x, y, -5 + rng() * 9, 5.6, 1, 0.6, '#54802a');
        },
    },
    spruce_tree: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 13);
            px(ctx, x, y, -0.8, 0, 1.6, 3, '#5a3e22');
            const c = '#38583a', d = '#2a462c';
            px(ctx, x, y, -4.5, 2.5, 9, 2, c); px(ctx, x, y, -4.5, 2.5, 9, 0.6, d);
            px(ctx, x, y, -3.5, 4.5, 7, 2, c); px(ctx, x, y, -3.5, 4.5, 7, 0.6, d);
            px(ctx, x, y, -2.5, 6.5, 5, 2, c); px(ctx, x, y, -2.5, 6.5, 5, 0.6, d);
            px(ctx, x, y, -1.5, 8.5, 3, 1.6, c);
            px(ctx, x, y, -0.5, 10, 1, 1, '#4a7050');
        },
    },
    crimson_fungus: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 11);
            px(ctx, x, y, -0.8, 0, 1.6, 5, '#a04858');
            px(ctx, x, y, -3.5, 5, 7, 2.2, '#c22a3a');
            px(ctx, x, y, -2.5, 7, 5, 1, '#e04a5a');
            px(ctx, x, y, -1.5, 5.6, 1, 1, '#ffa838'); px(ctx, x, y, 1, 5.6, 1, 1, '#ffa838');
        },
    },
    warped_fungus: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 11);
            px(ctx, x, y, -0.8, 0, 1.6, 5, '#3a8a7a');
            px(ctx, x, y, -3.5, 5, 7, 2.2, '#14b8a0');
            px(ctx, x, y, -2.5, 7, 5, 1, '#2edec2');
            px(ctx, x, y, -1.5, 5.6, 1, 1, '#ff7838'); px(ctx, x, y, 1, 5.6, 1, 1, '#ff7838');
        },
    },
    cactus: {
        block: true,
        draw: (ctx, x, y, rng) => {
            shadow(ctx, x, y, 8);
            const g = '#3a7a1e', l = '#4e9a2c';
            px(ctx, x, y, -1.2, 0, 2.4, 7 + rng() * 2, g);
            px(ctx, x, y, -0.6, 0, 1.2, 7, l);
            px(ctx, x, y, -3.2, 3, 2, 1, g); px(ctx, x, y, -3.2, 3, 1, 2.5, g);
            px(ctx, x, y, 1.2, 4, 2, 1, g); px(ctx, x, y, 2.2, 4, 1, 2, g);
        },
    },
    dead_bush: {
        block: false,
        draw: (ctx, x, y, rng) => {
            const c = '#8a6234';
            for (let i = 0; i < 5; i++) {
                const dx = (rng() - 0.5) * 4;
                px(ctx, x, y, dx, 0, 0.6, 2 + rng() * 1.5, c);
            }
            px(ctx, x, y, -0.4, 0, 0.8, 1.4, '#6a4a24');
        },
    },
    pumpkin: {
        block: false,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 8);
            px(ctx, x, y, -2.5, 0, 5, 3.6, '#d87818');
            px(ctx, x, y, -2.5, 0, 1.2, 3.6, '#b85e10');
            px(ctx, x, y, 1.4, 0, 1.1, 3.6, '#b85e10');
            px(ctx, x, y, -0.4, 3.6, 0.8, 1, '#4a7a1e');
        },
    },
    melon: {
        block: false,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 8);
            px(ctx, x, y, -2.4, 0, 4.8, 3.4, '#4a8a1e');
            px(ctx, x, y, -1.6, 0, 0.8, 3.4, '#68a838');
            px(ctx, x, y, 0.6, 0, 0.8, 3.4, '#68a838');
        },
    },
    boulder: {
        block: true,
        draw: (ctx, x, y, rng) => {
            shadow(ctx, x, y, 11);
            px(ctx, x, y, -3.5, 0, 7, 3.4, '#7f7f7f');
            px(ctx, x, y, -2.5, 3.2, 5, 1.4, '#8f8f8f');
            px(ctx, x, y, -3.5, 0, 7, 0.8, '#5f5f5f');
            for (let i = 0; i < 4; i++) px(ctx, x, y, -3 + rng() * 6, 0.5 + rng() * 3, 1, 1, rng() < 0.5 ? '#6a6a6a' : '#9a9a9a');
        },
    },
    ice_spike: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 9);
            px(ctx, x, y, -2.5, 0, 5, 3, '#9fd0f0');
            px(ctx, x, y, -1.8, 3, 3.6, 3, '#b8e0f8');
            px(ctx, x, y, -1.1, 6, 2.2, 3, '#cdeafc');
            px(ctx, x, y, -0.5, 9, 1, 2.4, '#e8f6ff');
            px(ctx, x, y, -1.8, 1, 0.8, 6, '#e8f6ff');
        },
    },
    mushroom_red: {
        block: false,
        draw: (ctx, x, y) => {
            px(ctx, x, y, -0.5, 0, 1, 2, '#e8e0cc');
            px(ctx, x, y, -1.8, 2, 3.6, 1.6, '#c22a2a');
            px(ctx, x, y, -1, 2.6, 0.8, 0.6, '#ffffff');
            px(ctx, x, y, 0.5, 2.3, 0.7, 0.6, '#ffffff');
        },
    },
    mushroom_brown: {
        block: false,
        draw: (ctx, x, y) => {
            px(ctx, x, y, -0.5, 0, 1, 2, '#e8e0cc');
            px(ctx, x, y, -1.8, 2, 3.6, 1.4, '#9a7a4e');
        },
    },
    giant_mushroom: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 15);
            px(ctx, x, y, -1.4, 0, 2.8, 6, '#e0d8c4');
            px(ctx, x, y, -1.4, 0, 1, 6, '#c4bca8');
            px(ctx, x, y, -5, 6, 10, 3, '#c22a2a');
            px(ctx, x, y, -4, 9, 8, 1, '#d84040');
            px(ctx, x, y, -3.4, 7, 1.6, 1.4, '#ffffff');
            px(ctx, x, y, 1.2, 7.6, 1.6, 1.4, '#ffffff');
            px(ctx, x, y, -0.8, 6.4, 1.2, 1, '#ffffff');
        },
    },
    flower_patch: {
        block: false,
        draw: (ctx, x, y, rng) => {
            const cols = ['#e8d84a', '#e05a5a', '#d0d0e8', '#e88ad0'];
            for (let i = 0; i < 4; i++) {
                const dx = (rng() - 0.5) * 8, dy = rng() * 2;
                px(ctx, x, y, dx, dy, 0.5, 1.6, '#4a8a2c');
                px(ctx, x, y, dx - 0.4, dy + 1.6, 1.3, 1.1, cols[(rng() * cols.length) | 0]);
            }
        },
    },
    sunflower: {
        block: false,
        draw: (ctx, x, y) => {
            px(ctx, x, y, -0.4, 0, 0.8, 4.4, '#3f7a24');
            px(ctx, x, y, -1.6, 4, 3.2, 2.6, '#e8c020');
            px(ctx, x, y, -0.8, 4.6, 1.6, 1.4, '#7a4e1e');
            px(ctx, x, y, -1.6, 2, 1.4, 0.7, '#4a8a2c');
        },
    },
    torch: {
        block: false,
        draw: (ctx, x, y) => {
            px(ctx, x, y, -0.4, 0, 0.8, 3.4, '#8a6234');
            px(ctx, x, y, -0.5, 3.4, 1, 1, '#ffca28');
            px(ctx, x, y, -0.3, 4.4, 0.6, 0.5, '#fff3a0');
            const g = ctx.createRadialGradient(x, y - 4.2 * U, 1, x, y - 4.2 * U, 16);
            g.addColorStop(0, 'rgba(255,200,80,0.35)');
            g.addColorStop(1, 'rgba(255,200,80,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - 16, y - 4.2 * U - 16, 32, 32);
        },
    },
    lantern: {
        block: false,
        draw: (ctx, x, y) => {
            px(ctx, x, y, -0.3, 4.6, 0.6, 1.4, '#3a3a3a');
            px(ctx, x, y, -1, 1, 2, 3.6, '#4a4a52');
            px(ctx, x, y, -0.6, 1.5, 1.2, 2.4, '#ffca28');
            const g = ctx.createRadialGradient(x, y - 3 * U, 1, x, y - 3 * U, 14);
            g.addColorStop(0, 'rgba(255,190,90,0.3)');
            g.addColorStop(1, 'rgba(255,190,90,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - 14, y - 3 * U - 14, 28, 28);
        },
    },
    campfire_decor: {
        block: false,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 8);
            px(ctx, x, y, -3, 0, 6, 1, '#6a4a24');
            px(ctx, x, y, -2.4, 0.6, 4.8, 0.8, '#7a5a30');
            px(ctx, x, y, -1.2, 1.2, 2.4, 1.6, '#e8641c');
            px(ctx, x, y, -0.6, 2.6, 1.2, 1.2, '#ffb114');
            px(ctx, x, y, -0.3, 3.6, 0.6, 0.7, '#fff3a0');
        },
    },
    fence: {
        block: false,
        draw: (ctx, x, y) => {
            const c = '#8a6a3a';
            px(ctx, x, y, -5, 0, 1, 3.6, c);
            px(ctx, x, y, 0, 0, 1, 3.6, c);
            px(ctx, x, y, 4.2, 0, 1, 3.6, c);
            px(ctx, x, y, -5, 2.4, 10.2, 0.7, shadeStr(c, 1.15));
            px(ctx, x, y, -5, 1, 10.2, 0.7, shadeStr(c, 1.15));
        },
    },
    rail: {
        block: false,
        draw: (ctx, x, y) => {
            px(ctx, x, y, -5, 0.8, 10, 0.5, '#9a9a9a');
            px(ctx, x, y, -5, 2, 10, 0.5, '#9a9a9a');
            for (let i = -4; i <= 4; i += 2) px(ctx, x, y, i, 0.2, 1, 3, '#6a4a24');
        },
    },
    minecart: {
        block: false,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 8);
            px(ctx, x, y, -2.8, 0.8, 5.6, 2.6, '#5a5a62');
            px(ctx, x, y, -2.2, 1.4, 4.4, 1.6, '#3a3a40');
            px(ctx, x, y, -2.2, 0, 1, 1, '#2a2a2e');
            px(ctx, x, y, 1.2, 0, 1, 1, '#2a2a2e');
        },
    },
    village_hut: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 20, 0.3);
            px(ctx, x, y, -6, 0, 12, 6, '#c4a468');
            px(ctx, x, y, -6, 0, 12, 0.8, '#a08048');
            px(ctx, x, y, -1.2, 0, 2.4, 4, '#5a3e22');
            px(ctx, x, y, -4.6, 2.5, 1.8, 1.8, '#3a5a8a');
            px(ctx, x, y, 2.8, 2.5, 1.8, 1.8, '#3a5a8a');
            px(ctx, x, y, -7, 6, 14, 1.6, '#8a4e2a');
            px(ctx, x, y, -5.6, 7.6, 11.2, 1.6, '#9a5a32');
            px(ctx, x, y, -4.2, 9.2, 8.4, 1.4, '#aa6a3a');
            px(ctx, x, y, -2.4, 10.6, 4.8, 1.2, '#b87840');
        },
    },
    well: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 13);
            px(ctx, x, y, -4, 0, 8, 3, '#7a7a7a');
            px(ctx, x, y, -3, 0.8, 6, 1.6, '#3f76e4');
            px(ctx, x, y, -3.8, 0, 1, 6.5, '#6a4a24');
            px(ctx, x, y, 2.8, 0, 1, 6.5, '#6a4a24');
            px(ctx, x, y, -4.6, 6.5, 9.2, 1.4, '#8a4e2a');
        },
    },
    hay_bale: {
        block: false,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 9);
            px(ctx, x, y, -3, 0, 6, 4, '#d4b45a');
            px(ctx, x, y, -3, 1.4, 6, 1, '#b89438');
            px(ctx, x, y, -1, 0, 1, 4, '#b89438');
        },
    },
    scaffolding: {
        block: true,
        draw: (ctx, x, y) => {
            const c = '#c4a468';
            px(ctx, x, y, -3, 0, 0.8, 8, c);
            px(ctx, x, y, 2.2, 0, 0.8, 8, c);
            px(ctx, x, y, -3, 8, 6, 0.8, shadeStr(c, 1.1));
            px(ctx, x, y, -3, 4, 6, 0.6, shadeStr(c, 0.8));
            px(ctx, x, y, -3, 0.4, 6, 0.6, shadeStr(c, 0.8));
        },
    },
    nether_portal: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 15, 0.28);
            px(ctx, x, y, -4, 0, 8, 1.6, '#1d1226');
            px(ctx, x, y, -4, 0, 1.6, 10, '#1d1226');
            px(ctx, x, y, 2.4, 0, 1.6, 10, '#1d1226');
            px(ctx, x, y, -4, 10, 8, 1.6, '#1d1226');
            px(ctx, x, y, -2.4, 1.6, 4.8, 8.4, '#7a2ee8');
            px(ctx, x, y, -1.8, 2.4, 1, 6.8, '#a45ef8');
            px(ctx, x, y, 0.6, 3, 1, 5.6, '#c88afc');
        },
    },
    end_pillar: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 13);
            px(ctx, x, y, -2.6, 0, 5.2, 12, '#1d1226');
            px(ctx, x, y, -2.6, 0, 1.2, 12, '#2c1c3c');
            px(ctx, x, y, -3.2, 12, 6.4, 1, '#332044');
        },
    },
    end_crystal_decor: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 10);
            px(ctx, x, y, -3, 0, 6, 1.4, '#3a3a3a');
            px(ctx, x, y, -1.4, 3.5, 2.8, 2.8, '#e8b8f0');
            px(ctx, x, y, -0.8, 4.1, 1.6, 1.6, '#c85af0');
            const g = ctx.createRadialGradient(x, y - 5 * U, 2, x, y - 5 * U, 18);
            g.addColorStop(0, 'rgba(220,120,255,0.35)');
            g.addColorStop(1, 'rgba(220,120,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - 18, y - 5 * U - 18, 36, 36);
        },
    },
    chorus_plant: {
        block: false,
        draw: (ctx, x, y, rng) => {
            const c = '#8a5a9a';
            px(ctx, x, y, -0.7, 0, 1.4, 5 + rng() * 2, c);
            px(ctx, x, y, -2.2, 3, 1.6, 1, c);
            px(ctx, x, y, 0.7, 4, 1.6, 1, c);
            px(ctx, x, y, -0.9, 5.4, 1.8, 1.6, '#b06ac2');
        },
    },
    shulker_box: {
        block: false,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 7);
            px(ctx, x, y, -2.2, 0, 4.4, 1.8, '#9a7ab0');
            px(ctx, x, y, -2.2, 2, 4.4, 1.8, '#b090c4');
            px(ctx, x, y, -2.2, 1.8, 4.4, 0.4, '#6a4a80');
        },
    },
    stalagmite: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 8);
            px(ctx, x, y, -2.2, 0, 4.4, 2.4, '#6a6a70');
            px(ctx, x, y, -1.4, 2.4, 2.8, 2.4, '#7a7a80');
            px(ctx, x, y, -0.7, 4.8, 1.4, 2.2, '#8a8a90');
            px(ctx, x, y, -0.3, 7, 0.6, 1.2, '#9a9aa0');
        },
    },
    glowstone_cluster: {
        block: false,
        draw: (ctx, x, y, rng) => {
            for (let i = 0; i < 3; i++) {
                const dx = (rng() - 0.5) * 6, s = 1.4 + rng();
                px(ctx, x, y, dx, rng(), s, s, '#e8b84a');
                px(ctx, x, y, dx + 0.3, rng() + 0.3, s * 0.5, s * 0.5, '#fff2b0');
            }
            const g = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, 20);
            g.addColorStop(0, 'rgba(255,220,120,0.3)');
            g.addColorStop(1, 'rgba(255,220,120,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - 20, y - 24, 40, 40);
        },
    },
    sea_pickle: {
        block: false,
        draw: (ctx, x, y, rng) => {
            for (let i = 0; i < 3; i++) {
                const dx = (rng() - 0.5) * 5;
                px(ctx, x, y, dx, 0, 1.2, 1.6 + rng(), '#7a9a4e');
                px(ctx, x, y, dx + 0.3, 1.6 + rng() * 0.5, 0.6, 0.5, '#c8e87a');
            }
        },
    },
    coral_fan: {
        block: false,
        draw: (ctx, x, y, rng) => {
            const cols = ['#e87a9a', '#4a7ae8', '#e8b84a', '#c85af0'];
            for (let i = 0; i < 4; i++) {
                const dx = (rng() - 0.5) * 6;
                px(ctx, x, y, dx, 0, 0.7, 2.2 + rng() * 1.4, cols[(rng() * cols.length) | 0]);
                px(ctx, x, y, dx - 0.7, 1.6, 2, 0.7, cols[(rng() * cols.length) | 0]);
            }
        },
    },
    lily_pad: {
        block: false,
        draw: (ctx, x, y) => {
            px(ctx, x, y, -2.2, 0, 4.4, 2.6, '#2c6a1e');
            px(ctx, x, y, -1.4, 0.6, 2, 1.4, '#3a8a2a');
            px(ctx, x, y, 0.8, 1, 1.4, 1.6, '#2c6a1e');
        },
    },
    witch_hut_decor: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 16, 0.3);
            px(ctx, x, y, -4.5, 2, 1, 2, '#5a3e22');
            px(ctx, x, y, 3.5, 2, 1, 2, '#5a3e22');
            px(ctx, x, y, -5, 3.6, 10, 4.6, '#6a5238');
            px(ctx, x, y, -0.9, 3.6, 1.8, 2.8, '#2a1e12');
            px(ctx, x, y, -6, 8.2, 12, 1.4, '#3a5a3a');
            px(ctx, x, y, -4.4, 9.6, 8.8, 1.2, '#44684a');
            px(ctx, x, y, -2.6, 10.8, 5.2, 1, '#4e785a');
        },
    },
    bee_nest: {
        block: false,
        draw: (ctx, x, y) => {
            px(ctx, x, y, -2, 2, 4, 3, '#c49a4a');
            px(ctx, x, y, -2, 3, 4, 0.8, '#a87e34');
            px(ctx, x, y, -0.6, 2.3, 1.2, 0.9, '#3a2c14');
        },
    },
    beehive_decor: {
        block: false,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 7);
            px(ctx, x, y, -2.2, 0, 4.4, 3.4, '#c4a468');
            px(ctx, x, y, -2.2, 1.2, 4.4, 0.6, '#a08048');
            px(ctx, x, y, -0.6, 0.3, 1.2, 0.9, '#3a2c14');
        },
    },
    obsidian_pillar: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 12);
            px(ctx, x, y, -2.2, 0, 4.4, 9, '#1d1226');
            px(ctx, x, y, -2.2, 0, 1, 9, '#2c1c3c');
            px(ctx, x, y, 1, 1, 0.8, 7, '#150c1e');
            px(ctx, x, y, -2.8, 9, 5.6, 1, '#332044');
        },
    },
    ruined_arch: {
        block: true,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 16, 0.28);
            px(ctx, x, y, -5.5, 0, 2.2, 7, '#7a7a7a');
            px(ctx, x, y, 3.3, 0, 2.2, 5.4, '#7a7a7a');
            px(ctx, x, y, -5.5, 7, 5, 1.8, '#8a8a8a');
            px(ctx, x, y, -5.5, 0, 1, 7, '#5f5f5f');
            px(ctx, x, y, 3.3, 0, 1, 5.4, '#5f5f5f');
            px(ctx, x, y, -3.3, 0, 1.4, 1, '#6a6a6a');
        },
    },
    chest: {
        block: false,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 7);
            px(ctx, x, y, -2.4, 0, 4.8, 3, '#a8783a');
            px(ctx, x, y, -2.4, 1.9, 4.8, 0.5, '#6a4a20');
            px(ctx, x, y, -0.4, 1.4, 0.8, 1, '#c8c8c8');
        },
    },
    anvil_decor: {
        block: false,
        draw: (ctx, x, y) => {
            shadow(ctx, x, y, 7);
            px(ctx, x, y, -1.8, 0, 3.6, 1, '#3a3a40');
            px(ctx, x, y, -1, 1, 2, 1.4, '#44444a');
            px(ctx, x, y, -2.6, 2.4, 5.2, 1.6, '#54545c');
            px(ctx, x, y, -2.6, 3.4, 5.2, 0.6, '#6a6a72');
        },
    },
    bell: {
        block: false,
        draw: (ctx, x, y) => {
            px(ctx, x, y, -2.6, 5.6, 5.2, 0.8, '#5a3e22');
            px(ctx, x, y, -2.6, 0, 0.9, 6.4, '#5a3e22');
            px(ctx, x, y, 1.7, 0, 0.9, 6.4, '#5a3e22');
            px(ctx, x, y, -1.2, 3.2, 2.4, 2.2, '#e8c020');
            px(ctx, x, y, -1.5, 3, 3, 0.7, '#c8a018');
            px(ctx, x, y, -0.4, 2.4, 0.8, 0.8, '#a88414');
        },
    },
    sweet_berry: {
        block: false,
        draw: (ctx, x, y, rng) => {
            px(ctx, x, y, -1.5, 0, 3, 2.8, '#3a6a2a');
            for (let i = 0; i < 4; i++) px(ctx, x, y, -1.2 + rng() * 2.4, 0.4 + rng() * 2, 0.7, 0.7, '#d83a4a');
        },
    },
    bamboo: {
        block: false,
        draw: (ctx, x, y, rng) => {
            for (let i = 0; i < 3; i++) {
                const dx = -2.4 + i * 2.2 + rng();
                const h = 6 + rng() * 3;
                px(ctx, x, y, dx, 0, 0.9, h, '#5a9a2e');
                px(ctx, x, y, dx, h * 0.4, 0.9, 0.4, '#3f7a1e');
                px(ctx, x, y, dx + 0.9, h * 0.75, 1.4, 0.6, '#6cae42');
            }
        },
    },
    azalea: {
        block: false,
        draw: (ctx, x, y, rng) => {
            px(ctx, x, y, -0.5, 0, 1, 1.6, '#6a4a24');
            px(ctx, x, y, -2.2, 1.4, 4.4, 2.4, '#3f7a2e');
            for (let i = 0; i < 4; i++) px(ctx, x, y, -1.8 + rng() * 3.6, 1.8 + rng() * 1.6, 0.8, 0.8, '#e878c8');
        },
    },
};

export const DECOR_TYPES = Object.keys(DECOS);

/** Whether tower placement is blocked around this decoration. */
export function decorationBlocksPlacement(type) {
    const d = DECOS[type];
    return d ? d.block : false;
}

/**
 * Draw a decoration. (x, y) = center-bottom anchor in world px.
 * Deterministic for a given seed.
 */
export function drawDecoration(ctx, type, x, y, seed = 1) {
    const d = DECOS[type];
    if (!d) return;
    d.draw(ctx, x, y, makeRng(seed));
}
