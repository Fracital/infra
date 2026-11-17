// Procedural tower + hero sprites (Minecraft builds, chunky pixel art).
// Owned by the orchestrator. Tier accents: 3+ gold trim, 4+ diamond studs,
// 5 netherite glow. Per-path pips drawn along the base.

import { PATH_COLORS } from '../core/constants.js';

const cache = new Map();

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h || w;
    return c;
}

function R(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function sh(hex, m) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) * m) | 0;
    const g = Math.min(255, ((n >> 8) & 255) * m) | 0;
    const b = Math.min(255, (n & 255) * m) | 0;
    return `rgb(${r},${g},${b})`;
}

function glow(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/* Draw a Minecraft block face (front view with top highlight + side shade). */
function block(ctx, x, y, s, base) {
    R(ctx, x, y, s, s, base);
    R(ctx, x, y, s, s * 0.16, sh(base, 1.2));
    R(ctx, x, y + s * 0.84, s, s * 0.16, sh(base, 0.75));
    R(ctx, x, y, s * 0.12, s, sh(base, 0.85));
}

/* ================= tower painters (S = 64) ================= */

const T = {
    dispenser: (ctx, S, f) => {
        const u = S / 64;
        block(ctx, 14 * u, 26 * u, 36 * u, '#7f7f7f');
        // face: dark hole + dots
        R(ctx, 24 * u, 34 * u, 16 * u, 16 * u, '#2a2a2a');
        R(ctx, 26 * u, 36 * u, 12 * u, 12 * u, '#1a1a1a');
        R(ctx, 20 * u, 30 * u, 3 * u, 3 * u, '#4a4a4a');
        R(ctx, 41 * u, 30 * u, 3 * u, 3 * u, '#4a4a4a');
        R(ctx, 20 * u, 51 * u, 3 * u, 3 * u, '#4a4a4a');
        R(ctx, 41 * u, 51 * u, 3 * u, 3 * u, '#4a4a4a');
        if (f === 0) {
            R(ctx, 30 * u, 30 * u, 4 * u, 10 * u, '#c8b880');
            R(ctx, 29 * u, 28 * u, 6 * u, 4 * u, '#8a8a92');
        }
    },
    snow_golem: (ctx, S, f) => {
        const u = S / 64;
        const bob = f ? u : 0;
        R(ctx, 18 * u, 44 * u, 28 * u, 16 * u, '#e8f0f6');
        R(ctx, 18 * u, 44 * u, 28 * u, 3 * u, '#ffffff');
        R(ctx, 22 * u, 30 * u + bob, 20 * u, 15 * u, '#f0f6fa');
        // stick arms
        R(ctx, 8 * u, 32 * u + bob, 14 * u, 2 * u, '#6a4a24');
        R(ctx, 42 * u, 32 * u + bob, 14 * u, 2 * u, '#6a4a24');
        // pumpkin head
        block(ctx, 22 * u, 12 * u + bob, 20 * u, '#d87818');
        R(ctx, 26 * u, 18 * u + bob, 3.4 * u, 3.4 * u, '#2a1a08');
        R(ctx, 34.6 * u, 18 * u + bob, 3.4 * u, 3.4 * u, '#2a1a08');
        R(ctx, 30 * u, 23 * u + bob, 4 * u, 4 * u, '#2a1a08');
        // snow sparkle
        R(ctx, 20 * u, 48 * u, 2 * u, 2 * u, '#ffffff');
        R(ctx, 40 * u, 52 * u, 2 * u, 2 * u, '#ffffff');
    },
    tnt_cannon: (ctx, S, f) => {
        const u = S / 64;
        // wood mount
        R(ctx, 12 * u, 50 * u, 40 * u, 8 * u, '#7a5a30');
        R(ctx, 14 * u, 46 * u, 8 * u, 6 * u, '#6a4a24');
        R(ctx, 42 * u, 46 * u, 8 * u, 6 * u, '#6a4a24');
        // TNT block
        R(ctx, 16 * u, 28 * u, 22 * u, 22 * u, '#c8402a');
        R(ctx, 16 * u, 36 * u, 22 * u, 7 * u, '#e8e0d0');
        ctx.fillStyle = '#2a1a12';
        ctx.font = `bold ${7 * u}px monospace`;
        ctx.fillText('TNT', 18.5 * u, 42 * u);
        R(ctx, 16 * u, 28 * u, 22 * u, 3 * u, '#e05a40');
        // barrel angled up-right
        ctx.save();
        ctx.translate(40 * u, 34 * u);
        ctx.rotate(-0.55);
        R(ctx, 0, -5 * u, 22 * u, 10 * u, '#3a3a40');
        R(ctx, 0, -5 * u, 22 * u, 2.4 * u, '#54545c');
        R(ctx, 20 * u, -6 * u, 3 * u, 12 * u, '#2a2a30');
        ctx.restore();
        // fuse spark
        if (f === 0) {
            R(ctx, 26 * u, 24 * u, 2 * u, 4 * u, '#6a4a24');
            R(ctx, 25 * u, 21 * u, 4 * u, 4 * u, '#ffca28');
            glow(ctx, 27 * u, 23 * u, 8 * u, 'rgba(255,190,60,0.5)');
        }
    },
    blaze_tower: (ctx, S, f) => {
        const u = S / 64;
        // stone base + fire glow
        R(ctx, 14 * u, 52 * u, 36 * u, 8 * u, '#5a5a5a');
        glow(ctx, 32 * u, 40 * u, 22 * u, 'rgba(255,140,30,0.35)');
        // blaze inside
        const rodPos = f === 0 ? [[-11, 4], [11, 4], [-7, 10], [7, 10]] : [[-12, 7], [12, 7], [-5, 11], [5, 11]];
        for (const [dx, dy] of rodPos) {
            R(ctx, 32 * u + dx * u - 1.5 * u, 28 * u + dy * u, 3 * u, 6 * u, '#d8a030');
        }
        R(ctx, 26 * u, 22 * u, 12 * u, 12 * u, '#c8a030');
        R(ctx, 28.4 * u, 26 * u, 2.4 * u, 2 * u, '#2a1a08');
        R(ctx, 33.2 * u, 26 * u, 2.4 * u, 2 * u, '#2a1a08');
        // cage bars
        for (let i = 0; i < 5; i++) {
            R(ctx, (16 + i * 8) * u, 14 * u, 2 * u, 40 * u, '#3a3a42');
        }
        R(ctx, 14 * u, 12 * u, 36 * u, 4 * u, '#4a4a52');
        R(ctx, 14 * u, 12 * u, 36 * u, 1.4 * u, '#5c5c66');
    },
    skeleton_sniper: (ctx, S, f) => {
        const u = S / 64;
        const bob = f ? u * 0.8 : 0;
        // watchtower
        R(ctx, 18 * u, 34 * u, 4 * u, 26 * u, '#6a4a24');
        R(ctx, 42 * u, 34 * u, 4 * u, 26 * u, '#6a4a24');
        R(ctx, 22 * u, 44 * u, 20 * u, 3 * u, '#7a5a30');
        R(ctx, 14 * u, 30 * u, 36 * u, 6 * u, '#8a6a3a');
        R(ctx, 14 * u, 30 * u, 36 * u, 2 * u, '#a0804a');
        // skeleton upper body on platform
        R(ctx, 26 * u, 14 * u + bob, 12 * u, 12 * u, '#d8d8d0');
        R(ctx, 28.4 * u, 18 * u + bob, 2.6 * u, 2.2 * u, '#3a3a3a');
        R(ctx, 33 * u, 18 * u + bob, 2.6 * u, 2.2 * u, '#3a3a3a');
        R(ctx, 28 * u, 26 * u + bob, 8 * u, 5 * u, '#b8b8b0');
        // long rifle-bow
        R(ctx, 36 * u, 18 * u + bob, 24 * u, 2.4 * u, '#5a3e22');
        R(ctx, 54 * u, 16.4 * u + bob, 4 * u, 2 * u, '#3a3a3a');
        R(ctx, 40 * u, 21 * u + bob, 6 * u, 2 * u, '#8a6234');
    },
    trident_sentry: (ctx, S, f) => {
        const u = S / 64;
        // drowned
        R(ctx, 24 * u, 40 * u, 6 * u, 18 * u, '#2c6a5e');
        R(ctx, 34 * u, 40 * u, 6 * u, 18 * u, '#245a50');
        R(ctx, 22 * u, 26 * u, 20 * u, 15 * u, '#3a8a74');
        R(ctx, 22 * u, 26 * u, 4 * u, 15 * u, '#2c6a5e');
        R(ctx, 25 * u, 12 * u, 14 * u, 14 * u, '#4aa88a');
        R(ctx, 27.4 * u, 16.4 * u, 2.6 * u, 2.2 * u, '#103830');
        R(ctx, 33 * u, 16.4 * u, 2.6 * u, 2.2 * u, '#103830');
        // trident arm raised
        const ang = f === 0 ? -0.2 : -0.45;
        ctx.save();
        ctx.translate(44 * u, 30 * u);
        ctx.rotate(ang);
        R(ctx, -1.4 * u, -22 * u, 2.8 * u, 26 * u, '#2ca89a');
        R(ctx, -6 * u, -24 * u, 12 * u, 2.4 * u, '#2ca89a');
        R(ctx, -6 * u, -30 * u, 2.4 * u, 6.4 * u, '#38c8b8');
        R(ctx, -1.2 * u, -32 * u, 2.4 * u, 8.4 * u, '#38c8b8');
        R(ctx, 3.6 * u, -30 * u, 2.4 * u, 6.4 * u, '#38c8b8');
        ctx.restore();
    },
    witch_hut: (ctx, S, f) => {
        const u = S / 64;
        // hut on stilts
        R(ctx, 18 * u, 46 * u, 3 * u, 12 * u, '#4a3418');
        R(ctx, 43 * u, 46 * u, 3 * u, 12 * u, '#4a3418');
        R(ctx, 14 * u, 28 * u, 36 * u, 20 * u, '#6a5238');
        R(ctx, 14 * u, 28 * u, 36 * u, 3 * u, '#7a6244');
        R(ctx, 28 * u, 34 * u, 8 * u, 14 * u, '#2a1e12');
        R(ctx, 10 * u, 22 * u, 44 * u, 7 * u, '#3a5a3a');
        R(ctx, 16 * u, 16 * u, 32 * u, 7 * u, '#44684a');
        R(ctx, 22 * u, 11 * u, 20 * u, 6 * u, '#4e785a');
        // cauldron
        R(ctx, 20 * u, 52 * u, 14 * u, 8 * u, '#3a3a40');
        R(ctx, 21.4 * u, 53 * u, 11.2 * u, 2.4 * u, '#54e838');
        if (f === 0) {
            R(ctx, 24 * u, 50 * u, 2 * u, 2 * u, '#54e838');
            R(ctx, 29 * u, 49 * u, 1.6 * u, 1.6 * u, '#88f070');
        } else {
            R(ctx, 27 * u, 50 * u, 2 * u, 2 * u, '#54e838');
        }
        glow(ctx, 27 * u, 54 * u, 10 * u, 'rgba(90,230,60,0.3)');
    },
    enchanter: (ctx, S, f) => {
        const u = S / 64;
        // obsidian table
        R(ctx, 16 * u, 38 * u, 32 * u, 20 * u, '#1d1226');
        R(ctx, 14 * u, 34 * u, 36 * u, 6 * u, '#2c1c3c');
        R(ctx, 14 * u, 34 * u, 36 * u, 2 * u, '#4a2e64');
        // diamond inlays
        R(ctx, 18 * u, 42 * u, 4 * u, 4 * u, '#4aedd9');
        R(ctx, 42 * u, 42 * u, 4 * u, 4 * u, '#4aedd9');
        // floating book
        const bob = f ? 2 * u : 0;
        R(ctx, 24 * u, 20 * u + bob, 16 * u, 4 * u, '#8a2a2a');
        R(ctx, 24 * u, 16 * u + bob, 7 * u, 5 * u, '#e8e0d0');
        R(ctx, 33 * u, 16 * u + bob, 7 * u, 5 * u, '#e8e0d0');
        R(ctx, 31 * u, 15 * u + bob, 2 * u, 6 * u, '#c8c0b0');
        // glyphs
        ctx.fillStyle = '#c8a2ff';
        ctx.font = `${5 * u}px monospace`;
        ctx.fillText('*', 18 * u, (16 + (f ? 3 : 0)) * u);
        ctx.fillText('+', 44 * u, (22 - (f ? 3 : 0)) * u);
        glow(ctx, 32 * u, 22 * u, 16 * u, 'rgba(160,90,255,0.28)');
    },
    guardian: (ctx, S, f) => {
        const u = S / 64;
        // water ring
        ctx.fillStyle = '#2c56b8';
        ctx.beginPath();
        ctx.ellipse(32 * u, 46 * u, 24 * u, 12 * u, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3f76e4';
        ctx.beginPath();
        ctx.ellipse(32 * u, 46 * u, 20 * u, 9 * u, 0, 0, Math.PI * 2);
        ctx.fill();
        // guardian body
        const p = f ? 2 * u : 0;
        ctx.fillStyle = '#5a6a64';
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + 0.4;
            ctx.save();
            ctx.translate(32 * u + Math.cos(a) * (13 * u + p), 32 * u + Math.sin(a) * (13 * u + p) * 0.8);
            ctx.rotate(a);
            ctx.fillRect(0, -1.4 * u, 5 * u, 2.8 * u);
            ctx.restore();
        }
        R(ctx, 20 * u, 22 * u, 24 * u, 20 * u, '#8a9a84');
        R(ctx, 20 * u, 22 * u, 24 * u, 3 * u, '#a0b09a');
        R(ctx, 24 * u, 26 * u, 6 * u, 5 * u, '#c88a4a');
        R(ctx, 35 * u, 26 * u, 5 * u, 4 * u, '#c88a4a');
        // eye
        R(ctx, 27 * u, 28 * u, 10 * u, 9 * u, '#e8e4dc');
        R(ctx, 30 * u, 31 * u, 4 * u, 4 * u, '#6a4ae0');
    },
    ghast: (ctx, S, f) => {
        const u = S / 64;
        const bob = f ? 2.4 * u : 0;
        // tether
        R(ctx, 30 * u, 44 * u, 1.4 * u, 14 * u, '#6a5a3a');
        R(ctx, 27 * u, 56 * u, 8 * u, 4 * u, '#5a3e22');
        // tentacles
        for (let i = 0; i < 5; i++) {
            const sway = ((i + f) % 2) ? 2 * u : 0;
            R(ctx, (20 + i * 5.4) * u, 34 * u + bob, 3 * u, (8 + (i % 3) * 3) * u + sway, '#e0e0e6');
        }
        // body
        R(ctx, 14 * u, 8 * u + bob, 36 * u, 28 * u, '#f0f0f4');
        R(ctx, 14 * u, 8 * u + bob, 36 * u, 5 * u, '#ffffff');
        R(ctx, 14 * u, 8 * u + bob, 5 * u, 28 * u, '#d8d8de');
        // closed cry eyes
        R(ctx, 22 * u, 18 * u + bob, 5 * u, 2 * u, '#3a3a44');
        R(ctx, 37 * u, 18 * u + bob, 5 * u, 2 * u, '#3a3a44');
        R(ctx, 23 * u, 20 * u + bob, 2 * u, 4 * u, '#8aa8c8');
        R(ctx, 39 * u, 20 * u + bob, 2 * u, 4 * u, '#8aa8c8');
        R(ctx, 28 * u, 26 * u + bob, 8 * u, 3 * u, '#3a3a44');
    },
    end_crystal: (ctx, S, f) => {
        const u = S / 64;
        // bedrock base
        block(ctx, 18 * u, 46 * u, 28 * u, '#3a3a3a');
        R(ctx, 20 * u, 48 * u, 4 * u, 3 * u, '#565656');
        R(ctx, 38 * u, 52 * u, 5 * u, 3 * u, '#222222');
        glow(ctx, 32 * u, 28 * u, 24 * u, 'rgba(220,120,255,0.35)');
        // rotating crystal (diamond orientation flips)
        ctx.save();
        ctx.translate(32 * u, 26 * u);
        ctx.rotate(f === 0 ? Math.PI / 4 : Math.PI / 4 + 0.35);
        R(ctx, -9 * u, -9 * u, 18 * u, 18 * u, 'rgba(232,184,240,0.85)');
        R(ctx, -5 * u, -5 * u, 10 * u, 10 * u, '#c85af0');
        R(ctx, -2 * u, -2 * u, 4 * u, 4 * u, '#f0d0ff');
        ctx.restore();
        // cage frame
        ctx.strokeStyle = '#2a2a30';
        ctx.lineWidth = 2 * u;
        ctx.strokeRect(20 * u, 14 * u, 24 * u, 24 * u);
    },
    piglin_brute: (ctx, S, f) => {
        const u = S / 64;
        // legs
        R(ctx, 25 * u, 46 * u, 5.4 * u, 12 * u, '#3a2c1e');
        R(ctx, 33 * u, 46 * u, 5.4 * u, 12 * u, '#32241a');
        // gold-vest torso
        R(ctx, 21 * u, 30 * u, 22 * u, 17 * u, '#e8a0a0');
        R(ctx, 21 * u, 33 * u, 22 * u, 6 * u, '#c8a030');
        R(ctx, 21 * u, 33 * u, 22 * u, 1.6 * u, '#e0bc50');
        // arms
        R(ctx, 15 * u, 30 * u, 6 * u, 14 * u, '#dc9494');
        R(ctx, 43 * u, 26 * u, 6 * u, 14 * u, '#e8a0a0');
        // piglin head
        R(ctx, 23 * u, 14 * u, 18 * u, 16 * u, '#e8a0a0');
        R(ctx, 23 * u, 14 * u, 18 * u, 2.4 * u, '#f0b4b4');
        R(ctx, 27 * u, 24 * u, 10 * u, 5 * u, '#d88888');
        R(ctx, 28 * u, 25 * u, 2 * u, 2.4 * u, '#4a3020');
        R(ctx, 34 * u, 25 * u, 2 * u, 2.4 * u, '#4a3020');
        R(ctx, 26 * u, 19 * u, 2.6 * u, 2.2 * u, '#e05050');
        R(ctx, 35.4 * u, 19 * u, 2.6 * u, 2.2 * u, '#e05050');
        // tusks
        R(ctx, 26 * u, 27 * u, 2 * u, 3 * u, '#f0e8d8');
        R(ctx, 36 * u, 27 * u, 2 * u, 3 * u, '#f0e8d8');
        // golden axe
        const raise = f === 0 ? 0 : -6 * u;
        R(ctx, 46 * u, 12 * u + raise, 2.4 * u, 26 * u, '#6a4a24');
        R(ctx, 42 * u, 8 * u + raise, 10 * u, 7 * u, '#f0c020');
        R(ctx, 42 * u, 8 * u + raise, 10 * u, 2 * u, '#ffe060');
    },
    iron_golem: (ctx, S, f) => {
        const u = S / 64;
        const swing = f === 0 ? 3 * u : -3 * u;
        const iron = '#c8c4bc';
        // legs
        R(ctx, 25 * u, 44 * u, 6 * u, 14 * u, sh(iron, 0.8));
        R(ctx, 33 * u, 44 * u, 6 * u, 14 * u, sh(iron, 0.75));
        // torso
        R(ctx, 19 * u, 26 * u, 26 * u, 19 * u, iron);
        R(ctx, 19 * u, 26 * u, 26 * u, 3 * u, sh(iron, 1.12));
        // vines
        R(ctx, 22 * u, 34 * u, 6 * u, 2 * u, '#4a8a3a');
        R(ctx, 24 * u, 36 * u, 2 * u, 5 * u, '#4a8a3a');
        // long arms
        R(ctx, 11 * u, 26 * u + swing, 7 * u, 24 * u, sh(iron, 0.9));
        R(ctx, 46 * u, 26 * u - swing, 7 * u, 24 * u, sh(iron, 0.95));
        // head
        R(ctx, 25 * u, 12 * u, 14 * u, 14 * u, iron);
        R(ctx, 27 * u, 17 * u, 3 * u, 2 * u, '#8a3030');
        R(ctx, 34 * u, 17 * u, 3 * u, 2 * u, '#8a3030');
        R(ctx, 30 * u, 19 * u, 4 * u, 7 * u, sh(iron, 0.85));
        // brow
        R(ctx, 25 * u, 15.4 * u, 14 * u, 1.6 * u, sh(iron, 0.7));
        // rose
        R(ctx, 47 * u, 20 * u - swing, 2 * u, 6 * u, '#3a6a2a');
        R(ctx, 46 * u, 17 * u - swing, 4 * u, 4 * u, '#d83a4a');
    },
    wolf_den: (ctx, S, f) => {
        const u = S / 64;
        // doghouse
        R(ctx, 14 * u, 30 * u, 36 * u, 28 * u, '#8a6a3a');
        R(ctx, 14 * u, 30 * u, 36 * u, 3 * u, '#a0804a');
        R(ctx, 10 * u, 22 * u, 44 * u, 9 * u, '#6a4a24');
        R(ctx, 16 * u, 15 * u, 32 * u, 8 * u, '#7a5a30');
        R(ctx, 24 * u, 38 * u, 16 * u, 20 * u, '#241a10');
        // wolf head peeking (frame toggles)
        if (f === 0) {
            R(ctx, 26 * u, 42 * u, 12 * u, 10 * u, '#d8d4cc');
            R(ctx, 25 * u, 40 * u, 4 * u, 4 * u, '#c0bcb4');
            R(ctx, 35 * u, 40 * u, 4 * u, 4 * u, '#c0bcb4');
            R(ctx, 28.4 * u, 45 * u, 2.2 * u, 2 * u, '#2a2a34');
            R(ctx, 33.4 * u, 45 * u, 2.2 * u, 2 * u, '#2a2a34');
            R(ctx, 30.4 * u, 48.4 * u, 3.2 * u, 2.4 * u, '#1a1a20');
        }
        // bone
        R(ctx, 40 * u, 54 * u, 10 * u, 2.4 * u, '#e8e4d8');
        R(ctx, 38.6 * u, 52.8 * u, 3 * u, 2.4 * u, '#e8e4d8');
        R(ctx, 38.6 * u, 55.4 * u, 3 * u, 2.4 * u, '#e8e4d8');
        R(ctx, 48.4 * u, 52.8 * u, 3 * u, 2.4 * u, '#e8e4d8');
        R(ctx, 48.4 * u, 55.4 * u, 3 * u, 2.4 * u, '#e8e4d8');
    },
    crop_farm: (ctx, S, f) => {
        const u = S / 64;
        // farmland plot
        R(ctx, 10 * u, 34 * u, 44 * u, 24 * u, '#6b4423');
        R(ctx, 10 * u, 34 * u, 44 * u, 2 * u, '#7d5230');
        for (let row = 0; row < 3; row++) {
            R(ctx, 10 * u, (38 + row * 7) * u, 44 * u, 2.4 * u, '#4e3018');
        }
        // wheat rows (sway by frame)
        for (let i = 0; i < 7; i++) {
            const x = (13 + i * 6) * u + (f && i % 2 ? u : 0);
            for (let row = 0; row < 3; row++) {
                R(ctx, x, (30 + row * 7) * u, 2 * u, 7 * u, '#d4b45a');
                R(ctx, x - 1 * u, (30 + row * 7) * u, 4 * u, 2 * u, '#e8cc6a');
            }
        }
        // fence corner + hay
        R(ctx, 6 * u, 28 * u, 2 * u, 12 * u, '#6a4a24');
        R(ctx, 6 * u, 30 * u, 12 * u, 2 * u, '#6a4a24');
        R(ctx, 46 * u, 22 * u, 12 * u, 9 * u, '#d4b45a');
        R(ctx, 46 * u, 25 * u, 12 * u, 2 * u, '#b89438');
    },
    beacon: (ctx, S, f) => {
        const u = S / 64;
        // beam
        ctx.globalAlpha = f === 0 ? 0.75 : 0.55;
        R(ctx, 28 * u, 0, 8 * u, 34 * u, '#8ae8ff');
        R(ctx, 30.4 * u, 0, 3.2 * u, 34 * u, '#e0fbff');
        ctx.globalAlpha = 1;
        // iron pyramid
        R(ctx, 10 * u, 50 * u, 44 * u, 9 * u, '#c8c4bc');
        R(ctx, 10 * u, 50 * u, 44 * u, 2 * u, '#e0dcd4');
        R(ctx, 17 * u, 42 * u, 30 * u, 9 * u, '#b8b4ac');
        R(ctx, 17 * u, 42 * u, 30 * u, 2 * u, '#d4d0c8');
        // glass shell + core
        R(ctx, 24 * u, 30 * u, 16 * u, 13 * u, 'rgba(180,230,240,0.5)');
        R(ctx, 27 * u, 33 * u, 10 * u, 8 * u, '#4aedd9');
        R(ctx, 29.4 * u, 35 * u, 5.2 * u, 4 * u, '#c8fff8');
        glow(ctx, 32 * u, 36 * u, 18 * u, 'rgba(120,240,255,0.4)');
    },
    brewing_stand: (ctx, S, f) => {
        const u = S / 64;
        // base
        block(ctx, 18 * u, 46 * u, 28 * u, '#7a7a7a');
        // stand rod
        R(ctx, 30.6 * u, 22 * u, 2.8 * u, 24 * u, '#c8a030');
        R(ctx, 26 * u, 22 * u, 12 * u, 3 * u, '#3a3a40');
        // bottles
        const bl = [['#e05050', 22], ['#54e838', 31], ['#4aa8ff', 40]];
        for (const [col, bx] of bl) {
            R(ctx, bx * u, 38 * u, 6 * u, 7 * u, col);
            R(ctx, (bx + 1.4) * u, 34.6 * u, 3.2 * u, 3.6 * u, 'rgba(220,230,240,0.7)');
        }
        // bubbles
        if (f === 0) {
            R(ctx, 24 * u, 30 * u, 2 * u, 2 * u, '#e888a0');
            R(ctx, 42 * u, 28 * u, 2 * u, 2 * u, '#8ac8ff');
        } else {
            R(ctx, 33 * u, 27 * u, 2 * u, 2 * u, '#88e8a0');
        }
        glow(ctx, 32 * u, 40 * u, 16 * u, 'rgba(200,120,255,0.22)');
    },
    piston_trap: (ctx, S, f) => {
        const u = S / 64;
        // piston block face-up
        block(ctx, 16 * u, 34 * u, 32 * u, '#6a5a3a');
        R(ctx, 18 * u, 36 * u, 28 * u, 8 * u, '#c4a468');
        // arm (extended on frame 1)
        if (f === 1) {
            R(ctx, 28 * u, 16 * u, 8 * u, 20 * u, '#8a6a3a');
            R(ctx, 20 * u, 10 * u, 24 * u, 8 * u, '#c4a468');
            R(ctx, 20 * u, 10 * u, 24 * u, 2.4 * u, '#d8bc80');
        } else {
            R(ctx, 20 * u, 26 * u, 24 * u, 9 * u, '#c4a468');
            R(ctx, 20 * u, 26 * u, 24 * u, 2.4 * u, '#d8bc80');
        }
        // redstone dust + torch
        R(ctx, 12 * u, 56 * u, 40 * u, 2 * u, '#8a1a10');
        R(ctx, 20 * u, 55 * u, 3 * u, 3 * u, '#e03020');
        R(ctx, 42 * u, 55 * u, 3 * u, 3 * u, '#e03020');
        R(ctx, 52 * u, 48 * u, 2.4 * u, 8 * u, '#6a4a24');
        R(ctx, 51.6 * u, 45 * u, 3.4 * u, 3.4 * u, '#ff5540');
        glow(ctx, 53 * u, 47 * u, 7 * u, 'rgba(255,80,50,0.5)');
    },
    lightning_rod: (ctx, S, f) => {
        const u = S / 64;
        // stone base
        block(ctx, 22 * u, 44 * u, 20 * u, '#6a6a6a');
        // copper rod
        R(ctx, 29.4 * u, 16 * u, 5.2 * u, 30 * u, '#c87848');
        R(ctx, 29.4 * u, 16 * u, 2 * u, 30 * u, '#e89868');
        R(ctx, 27.4 * u, 10 * u, 9.2 * u, 7 * u, '#c87848');
        R(ctx, 27.4 * u, 10 * u, 9.2 * u, 2 * u, '#e89868');
        // storm cloud + spark
        R(ctx, 12 * u, 4 * u, 18 * u, 6 * u, '#4a4a58');
        R(ctx, 34 * u, 2 * u, 16 * u, 6 * u, '#3e3e4c');
        if (f === 0) {
            ctx.strokeStyle = '#aaddff';
            ctx.lineWidth = 2 * u;
            ctx.beginPath();
            ctx.moveTo(40 * u, 8 * u);
            ctx.lineTo(35 * u, 12 * u);
            ctx.lineTo(37 * u, 13 * u);
            ctx.lineTo(33 * u, 17 * u);
            ctx.stroke();
            glow(ctx, 32 * u, 13 * u, 12 * u, 'rgba(150,220,255,0.5)');
        }
    },
    anvil_catapult: (ctx, S, f) => {
        const u = S / 64;
        // wheels
        ctx.fillStyle = '#4a3418';
        ctx.beginPath(); ctx.arc(18 * u, 54 * u, 6 * u, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(46 * u, 54 * u, 6 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6a4a24';
        ctx.beginPath(); ctx.arc(18 * u, 54 * u, 3 * u, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(46 * u, 54 * u, 3 * u, 0, Math.PI * 2); ctx.fill();
        // frame
        R(ctx, 10 * u, 46 * u, 44 * u, 5 * u, '#7a5a30');
        R(ctx, 14 * u, 34 * u, 5 * u, 14 * u, '#6a4a24');
        // throwing arm
        ctx.save();
        ctx.translate(18 * u, 36 * u);
        ctx.rotate(f === 0 ? -0.5 : -1.1);
        R(ctx, 0, -2.4 * u, 34 * u, 4.8 * u, '#8a6a3a');
        R(ctx, 0, -2.4 * u, 34 * u, 1.4 * u, '#a0804a');
        // anvil in basket
        R(ctx, 28 * u, -9 * u, 10 * u, 3 * u, '#3a3a40');
        R(ctx, 30.4 * u, -6.4 * u, 5.2 * u, 2.4 * u, '#44444a');
        R(ctx, 27 * u, -12 * u, 12 * u, 3.4 * u, '#54545c');
        ctx.restore();
        // rope spool
        R(ctx, 40 * u, 40 * u, 8 * u, 6 * u, '#5a3e22');
        R(ctx, 41 * u, 41 * u, 6 * u, 4 * u, '#c4a468');
    },
};

/* ================= hero painters ================= */

const HERO_T = {
    steve: (ctx, S, f) => {
        const u = S / 64;
        const swing = f === 0 ? 2 * u : -2 * u;
        R(ctx, 25 * u, 44 * u, 6 * u, 14 * u, '#3a3a8a');
        R(ctx, 33 * u, 44 * u, 6 * u, 14 * u, '#32327a');
        R(ctx, 22 * u, 28 * u, 20 * u, 17 * u, '#2ab5b0');
        R(ctx, 22 * u, 28 * u, 4 * u, 17 * u, '#219a96');
        R(ctx, 16 * u, 28 * u + swing, 6 * u, 15 * u, '#b98a67');
        R(ctx, 42 * u, 28 * u - swing, 6 * u, 15 * u, '#b98a67');
        R(ctx, 25 * u, 13 * u, 14 * u, 15 * u, '#b98a67');
        R(ctx, 25 * u, 13 * u, 14 * u, 5 * u, '#4a2f1e');
        R(ctx, 25 * u, 13 * u, 2 * u, 8 * u, '#4a2f1e');
        R(ctx, 37 * u, 13 * u, 2 * u, 8 * u, '#4a2f1e');
        R(ctx, 27.4 * u, 20 * u, 2.6 * u, 2.2 * u, '#4a3ab0');
        R(ctx, 34 * u, 20 * u, 2.6 * u, 2.2 * u, '#4a3ab0');
        R(ctx, 30 * u, 23.4 * u, 4 * u, 2 * u, '#8a6a50');
        // diamond sword
        R(ctx, 45.4 * u, 8 * u - swing, 2.8 * u, 20 * u, '#4aedd9');
        R(ctx, 45.4 * u, 8 * u - swing, 1.2 * u, 20 * u, '#8af5e8');
        R(ctx, 43 * u, 27 * u - swing, 7.6 * u, 2.4 * u, '#6a4a24');
        R(ctx, 45.8 * u, 29 * u - swing, 2 * u, 4 * u, '#6a4a24');
    },
    alex: (ctx, S, f) => {
        const u = S / 64;
        const swing = f === 0 ? 2 * u : -2 * u;
        R(ctx, 25 * u, 44 * u, 6 * u, 14 * u, '#6a4a2a');
        R(ctx, 33 * u, 44 * u, 6 * u, 14 * u, '#5e4024');
        R(ctx, 22 * u, 28 * u, 20 * u, 17 * u, '#7a9a4e');
        R(ctx, 22 * u, 28 * u, 4 * u, 17 * u, '#68843e');
        R(ctx, 16 * u, 28 * u + swing, 6 * u, 15 * u, '#d8a878');
        R(ctx, 42 * u, 28 * u - swing, 6 * u, 15 * u, '#d8a878');
        R(ctx, 25 * u, 13 * u, 14 * u, 15 * u, '#d8a878');
        R(ctx, 25 * u, 13 * u, 14 * u, 4 * u, '#c8702a');
        R(ctx, 25 * u, 13 * u, 3 * u, 13 * u, '#c8702a');
        R(ctx, 36 * u, 13 * u, 3 * u, 13 * u, '#c8702a');
        R(ctx, 27.8 * u, 20 * u, 2.6 * u, 2.2 * u, '#4a8a3a');
        R(ctx, 33.6 * u, 20 * u, 2.6 * u, 2.2 * u, '#4a8a3a');
        // bow
        ctx.strokeStyle = '#8a6234';
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.arc(47 * u, 34 * u - swing, 9 * u, -1.2, 1.2);
        ctx.stroke();
        ctx.strokeStyle = '#e8e8e0';
        ctx.lineWidth = 0.8 * u;
        ctx.beginPath();
        ctx.moveTo(47 * u + 9 * u * Math.cos(-1.2), 34 * u - swing + 9 * u * Math.sin(-1.2));
        ctx.lineTo(47 * u + 9 * u * Math.cos(1.2), 34 * u - swing + 9 * u * Math.sin(1.2));
        ctx.stroke();
    },
    librarian: (ctx, S, f) => {
        const u = S / 64;
        const bob = f ? u : 0;
        R(ctx, 24 * u, 42 * u, 16 * u, 16 * u, '#e8e4d8');
        R(ctx, 22 * u, 26 * u, 20 * u, 17 * u, '#f0ece0');
        R(ctx, 22 * u, 26 * u, 20 * u, 3 * u, '#d8202a');
        R(ctx, 30 * u, 26 * u, 4 * u, 17 * u, '#d8d4c8');
        R(ctx, 25 * u, 11 * u, 14 * u, 15 * u, '#c8a882');
        // glasses
        R(ctx, 26.4 * u, 17 * u, 4.6 * u, 3.6 * u, '#2a2a30');
        R(ctx, 33 * u, 17 * u, 4.6 * u, 3.6 * u, '#2a2a30');
        R(ctx, 31 * u, 18 * u, 2 * u, 1.2 * u, '#2a2a30');
        R(ctx, 27.4 * u, 18 * u, 2.6 * u, 1.6 * u, '#8ac8e8');
        R(ctx, 34 * u, 18 * u, 2.6 * u, 1.6 * u, '#8ac8e8');
        // nose
        R(ctx, 30.6 * u, 20 * u, 2.8 * u, 4 * u, '#b09070');
        // floating book
        R(ctx, 44 * u, 24 * u - bob * 2, 10 * u, 3 * u, '#8a2a2a');
        R(ctx, 44 * u, 21 * u - bob * 2, 4.6 * u, 3.4 * u, '#e8e0d0');
        R(ctx, 49.4 * u, 21 * u - bob * 2, 4.6 * u, 3.4 * u, '#e8e0d0');
        glow(ctx, 49 * u, 24 * u - bob * 2, 10 * u, 'rgba(160,90,255,0.3)');
    },
    tinkerer: (ctx, S, f) => {
        const u = S / 64;
        const swing = f === 0 ? 1.6 * u : -1.6 * u;
        R(ctx, 25 * u, 44 * u, 6 * u, 14 * u, '#4a4a52');
        R(ctx, 33 * u, 44 * u, 6 * u, 14 * u, '#42424a');
        R(ctx, 22 * u, 28 * u, 20 * u, 17 * u, '#8a5a2a');
        R(ctx, 24 * u, 30 * u, 16 * u, 12 * u, '#6a441e');
        R(ctx, 16 * u, 28 * u + swing, 6 * u, 15 * u, '#c8a882');
        R(ctx, 42 * u, 28 * u - swing, 6 * u, 15 * u, '#c8a882');
        R(ctx, 25 * u, 13 * u, 14 * u, 15 * u, '#c8a882');
        // goggles
        R(ctx, 25 * u, 15 * u, 14 * u, 2 * u, '#4a3418');
        R(ctx, 26.4 * u, 16.4 * u, 4.6 * u, 4 * u, '#c8a030');
        R(ctx, 33 * u, 16.4 * u, 4.6 * u, 4 * u, '#c8a030');
        R(ctx, 27.4 * u, 17.4 * u, 2.6 * u, 2 * u, '#8ae8ff');
        R(ctx, 34 * u, 17.4 * u, 2.6 * u, 2 * u, '#8ae8ff');
        R(ctx, 30.6 * u, 21 * u, 2.8 * u, 3.4 * u, '#b09070');
        // wrench
        R(ctx, 45 * u, 24 * u - swing, 2.4 * u, 14 * u, '#a8a8b4');
        R(ctx, 43 * u, 21 * u - swing, 6.4 * u, 4 * u, '#a8a8b4');
        R(ctx, 45 * u, 22 * u - swing, 2.4 * u, 2 * u, '#6a6a76');
        // redstone pouch
        R(ctx, 38 * u, 40 * u, 5 * u, 5 * u, '#5a3e22');
        R(ctx, 39 * u, 39 * u, 3 * u, 2 * u, '#e03020');
    },
};

/* ================= tier accents ================= */

/** Opaque-pixel bounding box of the painted sprite. */
function contentBounds(canvas) {
    const s = canvas.width;
    const h = canvas.height;
    const d = canvas.getContext('2d').getImageData(0, 0, s, h).data;
    let x0 = s, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < s; x++) {
            if (d[(y * s + x) * 4 + 3] > 40) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = s - 1; y1 = h - 1; }
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const T5_GLOW = ['rgba(255,110,60,0.5)', 'rgba(90,160,255,0.5)', 'rgba(110,255,120,0.5)'];

/** Accents are fitted to the sprite's content bounds so upgrades read as
    modifications OF the model, not chrome floating around it. */
function applyTierAccents(base, tiers) {
    if (tiers[0] + tiers[1] + tiers[2] === 0) return base;
    const S = base.width;
    const maxTier = Math.max(tiers[0], tiers[1], tiers[2]);
    const b = contentBounds(base);
    const ctx = base.getContext('2d');

    // tier 5: netherite re-tint of the model itself + top-edge sheen (clipped to silhouette)
    if (maxTier >= 5) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(58,22,88,0.30)';
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = 'rgba(205,150,255,0.4)';
        ctx.fillRect(b.x0, b.y0, b.w, 2);
        ctx.globalCompositeOperation = 'source-over';
    }
    // tier 4: diamond studs pinned to the model's shoulders + sparkles on the body
    if (maxTier >= 4) {
        ctx.fillStyle = '#4aedd9';
        ctx.fillRect(b.x0 + 1, b.y0 + 1, 3, 3);
        ctx.fillRect(b.x1 - 3, b.y0 + 1, 3, 3);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(b.x0 + ((b.w * 0.3) | 0), b.y0 + ((b.h * 0.35) | 0), 2, 2);
        ctx.fillRect(b.x0 + ((b.w * 0.72) | 0), b.y0 + ((b.h * 0.62) | 0), 2, 2);
        ctx.globalCompositeOperation = 'source-over';
    }
    // tier 3: gold brackets hugging the silhouette corners
    if (maxTier >= 3) {
        ctx.fillStyle = maxTier >= 5 ? '#c98aff' : '#fcdc5f';
        const t = 2;
        const L = Math.max(5, (b.w * 0.24) | 0);
        ctx.fillRect(b.x0 - 2, b.y0 - 2, L, t); ctx.fillRect(b.x0 - 2, b.y0 - 2, t, L);
        ctx.fillRect(b.x1 + 3 - L, b.y0 - 2, L, t); ctx.fillRect(b.x1 + 1, b.y0 - 2, t, L);
        ctx.fillRect(b.x0 - 2, b.y1 + 1, L, t); ctx.fillRect(b.x0 - 2, b.y1 + 3 - L, t, L);
        ctx.fillRect(b.x1 + 3 - L, b.y1 + 1, L, t); ctx.fillRect(b.x1 + 1, b.y1 + 3 - L, t, L);
    }
    // path gems: set INTO the model near its base, one per invested path,
    // growing with tier (this is the per-path "what did you build" read)
    const active = [0, 1, 2].filter((p) => tiers[p] > 0);
    active.forEach((p, i) => {
        const size = tiers[p] >= 4 ? 6 : tiers[p] >= 2 ? 5 : 4;
        const gx = Math.round(b.cx + (i - (active.length - 1) / 2) * 9 - size / 2);
        const gy = Math.round(b.y1 - size - 2);
        ctx.fillStyle = '#141018';
        ctx.fillRect(gx - 1, gy - 1, size + 2, size + 2);
        ctx.fillStyle = PATH_COLORS[p];
        ctx.fillRect(gx, gy, size, size);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(gx, gy, 2, 1);
    });
    // tier pips: tight row just under the model
    const py = Math.min(S - 3, b.y1 + 4);
    for (let p = 0; p < 3; p++) {
        for (let i = 0; i < tiers[p]; i++) {
            ctx.fillStyle = PATH_COLORS[p];
            ctx.fillRect(Math.round(b.cx) - 24 + p * 17 + i * 3, py, 2, 2);
        }
    }
    // tier 5: aura behind the model, centered on the content, colored by WHICH path hit 5
    if (maxTier >= 5) {
        const g = makeCanvas(S);
        const gc = g.getContext('2d');
        const p5 = tiers.indexOf(5);
        glow(gc, b.cx, b.cy, Math.max(b.w, b.h) * 0.72, T5_GLOW[p5 < 0 ? 2 : p5]);
        gc.drawImage(base, 0, 0);
        return g;
    }
    return base;
}

/* ================= public API ================= */

export const TowerSprites = {
    bake() {
        for (const id of Object.keys(T)) {
            this.sprite(id, [0, 0, 0], 0);
            this.sprite(id, [0, 0, 0], 1);
            this.icon(id);
        }
        for (const id of Object.keys(HERO_T)) {
            this.heroSprite(id, 0);
            this.heroSprite(id, 1);
            this.heroIcon(id);
        }
    },

    sprite(towerId, tiers = [0, 0, 0], frame = 0) {
        const key = `t:${towerId}:${tiers[0]}${tiers[1]}${tiers[2]}:${frame % 2}`;
        let c = cache.get(key);
        if (!c) {
            const painter = T[towerId];
            if (!painter) return null;
            c = makeCanvas(64);
            painter(c.getContext('2d'), 64, frame % 2);
            c = applyTierAccents(c, tiers);
            cache.set(key, c);
        }
        return c;
    },

    icon(towerId) {
        const key = `i:${towerId}`;
        let c = cache.get(key);
        if (!c) {
            const painter = T[towerId] || HERO_T[towerId];
            if (!painter) return null;
            c = makeCanvas(64);
            painter(c.getContext('2d'), 64, 0);
            cache.set(key, c);
        }
        return c;
    },

    upgradeIcon(towerId, path, tier) {
        const key = `u:${towerId}:${path}:${tier}`;
        let c = cache.get(key);
        if (!c) {
            c = makeCanvas(48);
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#1a1626';
            ctx.fillRect(0, 0, 48, 48);
            ctx.strokeStyle = PATH_COLORS[path] || '#888';
            ctx.lineWidth = 3;
            ctx.strokeRect(1.5, 1.5, 45, 45);
            const icon = this.icon(towerId);
            if (icon) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(icon, 8, 4, 32, 32);
            }
            // tier pips
            ctx.fillStyle = PATH_COLORS[path] || '#888';
            for (let i = 0; i < tier; i++) {
                ctx.fillRect(6 + i * 8, 40, 6, 4);
            }
            cache.set(key, c);
        }
        return c;
    },

    heroSprite(heroId, frame = 0) {
        const key = `h:${heroId}:${frame % 2}`;
        let c = cache.get(key);
        if (!c) {
            const painter = HERO_T[heroId];
            if (!painter) return null;
            c = makeCanvas(64);
            painter(c.getContext('2d'), 64, frame % 2);
            cache.set(key, c);
        }
        return c;
    },

    heroIcon(heroId) {
        return this.heroSprite(heroId, 0);
    },
};
