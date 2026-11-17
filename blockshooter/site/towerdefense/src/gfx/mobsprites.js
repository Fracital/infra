// Procedural mob sprites (front-facing, chunky Minecraft pixel art).
// Owned by the orchestrator. Baked once at boot into a canvas cache.
// Variants: normal | camo (translucent shimmer) | regrow (sprouts) | fortified (iron bands).

const cache = new Map();

function makeCanvas(s) {
    const c = document.createElement('canvas');
    c.width = s;
    c.height = s;
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

/** 1px outline around the opaque silhouette (allies get a teal-tinted one). */
function outline(canvas, color = 'rgba(12,8,16,0.88)') {
    const s = canvas.width;
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, s, canvas.height);
    const d = img.data;
    const solid = (x, y) => {
        if (x < 0 || y < 0 || x >= s || y >= canvas.height) return false;
        return d[(y * s + x) * 4 + 3] > 60;
    };
    const marks = [];
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < s; x++) {
            if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) {
                marks.push(x, y);
            }
        }
    }
    ctx.fillStyle = color;
    for (let i = 0; i < marks.length; i += 2) ctx.fillRect(marks[i], marks[i + 1], 1, 1);
}

/* ================= templates ================= */
/* All painters: (ctx, S, f) where S = canvas size, f = frame (0|1).
   Feet rest at y = S - 3. Facing the camera. */

/** Classic humanoid: big head, torso, swinging arms + legs. */
function humanoid(opts) {
    const {
        skin, shirt, pants, face, extra = null,
        scale = 1, thin = false, tall = 0, armless = false,
    } = opts;
    return (ctx, S, f) => {
        const u = (S / 36) * scale;
        const cx = S / 2;
        const feet = S - 3;
        const legH = (8 + tall * 2) * u;
        const bodyH = (9 + tall) * u;
        const headS = 13 * u;
        const legW = thin ? 2.4 * u : 4 * u;
        const armW = thin ? 2.2 * u : 3.4 * u;
        const swing = (f === 0 ? 1 : -1) * 1.6 * u;
        // legs
        R(ctx, cx - legW - 0.6 * u, feet - legH + (f === 0 ? 0 : 1.2 * u), legW, legH - (f === 0 ? 0 : 1.2 * u), sh(pants, 0.9));
        R(ctx, cx + 0.6 * u, feet - legH + (f === 0 ? 1.2 * u : 0), legW, legH - (f === 0 ? 1.2 * u : 0), pants);
        // torso
        const bodyY = feet - legH - bodyH;
        R(ctx, cx - 5 * u, bodyY, 10 * u, bodyH, shirt);
        R(ctx, cx - 5 * u, bodyY, 2 * u, bodyH, sh(shirt, 0.82));
        // arms
        if (!armless) {
            R(ctx, cx - 5 * u - armW, bodyY + swing * 0.4, armW, bodyH * 0.95, sh(shirt, 0.9));
            R(ctx, cx + 5 * u, bodyY - swing * 0.4, armW, bodyH * 0.95, sh(shirt, 1.05));
            R(ctx, cx - 5 * u - armW, bodyY + swing * 0.4 + bodyH * 0.7, armW, bodyH * 0.28, skin);
            R(ctx, cx + 5 * u, bodyY - swing * 0.4 + bodyH * 0.7, armW, bodyH * 0.28, skin);
        }
        // head
        const headY = bodyY - headS;
        R(ctx, cx - headS / 2, headY, headS, headS, skin);
        R(ctx, cx - headS / 2, headY, headS, 2 * u, sh(skin, 1.12));
        R(ctx, cx - headS / 2, headY, 1.6 * u, headS, sh(skin, 0.85));
        face(ctx, cx, headY, headS, u);
        if (extra) extra(ctx, cx, feet, u, f, bodyY, headY, headS);
    };
}

function zombieFace(eyeColor = '#1a1a2e') {
    return (ctx, cx, hy, hs, u) => {
        R(ctx, cx - hs * 0.32, hy + hs * 0.38, 2.4 * u, 2 * u, eyeColor);
        R(ctx, cx + hs * 0.32 - 2.4 * u, hy + hs * 0.38, 2.4 * u, 2 * u, eyeColor);
        R(ctx, cx - 1.2 * u, hy + hs * 0.66, 2.4 * u, 1.6 * u, sh(eyeColor, 1.6));
    };
}

function skeletonFace(dark = '#3a3a3a') {
    return (ctx, cx, hy, hs, u) => {
        R(ctx, cx - hs * 0.34, hy + hs * 0.4, 2.6 * u, 2.2 * u, dark);
        R(ctx, cx + hs * 0.34 - 2.6 * u, hy + hs * 0.4, 2.6 * u, 2.2 * u, dark);
        R(ctx, cx - 1 * u, hy + hs * 0.58, 2 * u, 1.6 * u, sh(dark, 1.3));
        R(ctx, cx - hs * 0.3, hy + hs * 0.8, hs * 0.6, 1 * u, dark);
    };
}

function villagerFace(noseColor, angry = false) {
    return (ctx, cx, hy, hs, u) => {
        R(ctx, cx - hs * 0.32, hy + hs * 0.4, 2.2 * u, 1.8 * u, '#2e5a3a');
        R(ctx, cx + hs * 0.32 - 2.2 * u, hy + hs * 0.4, 2.2 * u, 1.8 * u, '#2e5a3a');
        if (angry) R(ctx, cx - hs * 0.36, hy + hs * 0.32, hs * 0.72, 1 * u, '#2a2a2a');
        R(ctx, cx - 1.4 * u, hy + hs * 0.5, 2.8 * u, 4.4 * u, noseColor);
    };
}

function bow(ctx, cx, bodyY, u, color = '#8a6234') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.arc(cx, bodyY + 5 * u, 7 * u, -1.1, 1.1);
    ctx.stroke();
    ctx.strokeStyle = '#e8e8e0';
    ctx.lineWidth = 0.6 * u;
    ctx.beginPath();
    ctx.moveTo(cx + 7 * u * Math.cos(-1.1), bodyY + 5 * u + 7 * u * Math.sin(-1.1));
    ctx.lineTo(cx + 7 * u * Math.cos(1.1), bodyY + 5 * u + 7 * u * Math.sin(1.1));
    ctx.stroke();
}

function spiderish(body, eye, small = false) {
    return (ctx, S, f) => {
        const u = S / 40;
        const cx = S / 2;
        const cy = S * 0.62;
        // legs: 4 per side, alternate raise by frame
        ctx.strokeStyle = sh(body, 0.85);
        ctx.lineWidth = 2 * u;
        for (let i = 0; i < 4; i++) {
            const lift = ((i + f) % 2) * 2.5 * u;
            const ly = cy - 3 * u + i * 3 * u;
            ctx.beginPath();
            ctx.moveTo(cx - 6 * u, ly);
            ctx.lineTo(cx - 13 * u, ly - 4 * u - lift);
            ctx.lineTo(cx - 16 * u, ly + 2 * u - lift);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + 6 * u, ly);
            ctx.lineTo(cx + 13 * u, ly - 4 * u - ((i + f + 1) % 2) * 2.5 * u);
            ctx.lineTo(cx + 16 * u, ly + 2 * u - ((i + f + 1) % 2) * 2.5 * u);
            ctx.stroke();
        }
        // abdomen + head
        R(ctx, cx - 7 * u, cy - 2 * u, 14 * u, 10 * u, body);
        R(ctx, cx - 7 * u, cy - 2 * u, 14 * u, 2 * u, sh(body, 1.2));
        R(ctx, cx - 5 * u, cy - 9 * u, 10 * u, 8 * u, sh(body, 1.1));
        // eyes (2 rows)
        const er = small ? 1.2 * u : 1.5 * u;
        for (let i = 0; i < 4; i++) {
            R(ctx, cx - 4 * u + i * 2.4 * u, cy - 7.5 * u, er, er, eye);
        }
        R(ctx, cx - 3 * u, cy - 5 * u, er, er, eye);
        R(ctx, cx + 2 * u, cy - 5 * u, er, er, eye);
    };
}

function slime(color, inner) {
    return (ctx, S, f) => {
        const u = S / 36;
        const cx = S / 2;
        const squish = f === 0 ? 0 : 2 * u;
        const w = 22 * u + squish * 2;
        const h = 20 * u - squish;
        const y = S - 3 - h;
        ctx.globalAlpha = 0.82;
        R(ctx, cx - w / 2, y, w, h, color);
        R(ctx, cx - w / 2, y, w, 2.4 * u, sh(color, 1.25));
        ctx.globalAlpha = 1;
        R(ctx, cx - 6 * u, y + h * 0.32, 12 * u, 9 * u, inner);
        // face
        R(ctx, cx - 4.4 * u, y + h * 0.4, 2 * u, 2 * u, '#1a2a14');
        R(ctx, cx + 2.4 * u, y + h * 0.4, 2 * u, 2 * u, '#1a2a14');
        R(ctx, cx - 1 * u, y + h * 0.62, 2 * u, 2 * u, '#1a2a14');
    };
}

/* ================= mob painters ================= */

const MOB_SPRITES = {
    silverfish: {
        size: 30,
        draw: (ctx, S, f) => {
            const u = S / 30;
            const cy = S - 8 * u;
            const wig = f === 0 ? 1 : -1;
            R(ctx, S / 2 - 10 * u, cy - 2 * u + wig * u * 0.5, 6 * u, 5 * u, '#8a8a96');
            R(ctx, S / 2 - 5 * u, cy - 3.5 * u, 8 * u, 7 * u, '#9a9aa8');
            R(ctx, S / 2 + 3 * u, cy - 2.5 * u - wig * u * 0.5, 6 * u, 6 * u, '#aaaab8');
            for (let i = 0; i < 4; i++) R(ctx, S / 2 - 8 * u + i * 4 * u, cy - 5 * u, 1.4 * u, 2 * u, '#6a6a76');
            R(ctx, S / 2 + 6.5 * u, cy - 1.5 * u, 1.2 * u, 1.2 * u, '#2a2a34');
        },
    },
    zombie: { size: 36, draw: humanoid({ skin: '#3f9948', shirt: '#2a9db0', pants: '#35357a', face: zombieFace() }) },
    baby_zombie: { size: 26, draw: humanoid({ skin: '#3f9948', shirt: '#2a9db0', pants: '#35357a', face: zombieFace(), scale: 0.72 }) },
    husk: { size: 36, draw: humanoid({ skin: '#b0a06a', shirt: '#8a7a4e', pants: '#6a5a3a', face: zombieFace('#3a3020') }) },
    zombie_villager: {
        size: 36,
        draw: humanoid({
            skin: '#3f9948', shirt: '#6a4a2a', pants: '#4e3a22', face: villagerFace('#2f7a38'),
            extra: (ctx, cx, feet, u, f, bodyY, headY, hs) => {
                R(ctx, cx - hs / 2, headY - 1 * u, hs, 2 * u, '#5a3e22');
            },
        }),
    },
    skeleton: {
        size: 36,
        draw: humanoid({
            skin: '#d8d8d0', shirt: '#c8c8c0', pants: '#b8b8b0', face: skeletonFace(), thin: true,
            extra: (ctx, cx, feet, u, f, bodyY) => bow(ctx, cx, bodyY, u),
        }),
    },
    stray: {
        size: 36,
        draw: humanoid({
            skin: '#c8d8e0', shirt: '#7a9aac', pants: '#5a7a8c', face: skeletonFace('#2a3a44'), thin: true,
            extra: (ctx, cx, feet, u, f, bodyY, headY, hs) => {
                R(ctx, cx - hs / 2 - u, headY - 1.6 * u, hs + 2 * u, 3 * u, '#8ab0c0');
                bow(ctx, cx, bodyY, u, '#6a8a9a');
            },
        }),
    },
    spider: { size: 40, draw: spiderish('#241e1c', '#e03030') },
    cave_spider: { size: 32, draw: spiderish('#1e3c3c', '#e05050', true) },
    creeper: {
        size: 36,
        draw: (ctx, S, f) => {
            const u = S / 36;
            const cx = S / 2;
            const feet = S - 3;
            const g = '#5fba3c';
            // four stub legs
            R(ctx, cx - 6 * u, feet - 4 * u + (f ? u : 0), 5 * u, 4 * u, sh(g, 0.85));
            R(ctx, cx + 1 * u, feet - 4 * u + (f ? 0 : u), 5 * u, 4 * u, sh(g, 0.8));
            // tall body
            R(ctx, cx - 4 * u, feet - 16 * u, 8 * u, 12 * u, g);
            R(ctx, cx - 4 * u, feet - 16 * u, 1.6 * u, 12 * u, sh(g, 0.85));
            // head
            R(ctx, cx - 6.5 * u, feet - 29 * u, 13 * u, 13 * u, sh(g, 1.06));
            for (let i = 0; i < 14; i++) {
                R(ctx, cx - 6.5 * u + ((i * 7) % 13) * u, feet - 29 * u + ((i * 5) % 13) * u, u, u, sh(g, 0.9));
            }
            // iconic face
            const fy = feet - 29 * u;
            R(ctx, cx - 4.6 * u, fy + 3 * u, 2.6 * u, 2.6 * u, '#101410');
            R(ctx, cx + 2 * u, fy + 3 * u, 2.6 * u, 2.6 * u, '#101410');
            R(ctx, cx - 1.4 * u, fy + 5.6 * u, 2.8 * u, 4 * u, '#101410');
            R(ctx, cx - 2.6 * u, fy + 7.6 * u, 1.2 * u, 3 * u, '#101410');
            R(ctx, cx + 1.4 * u, fy + 7.6 * u, 1.2 * u, 3 * u, '#101410');
        },
    },
    slime_big: { size: 46, draw: slime('#56b34a', '#6fce5e') },
    slime_med: { size: 34, draw: slime('#56b34a', '#6fce5e') },
    slime_small: { size: 24, draw: slime('#56b34a', '#6fce5e') },
    magma_cube_big: {
        size: 46,
        draw: (ctx, S, f) => {
            const u = S / 36;
            const cx = S / 2;
            const stretch = f === 0 ? 0 : 3 * u;
            const w = 20 * u, h = 18 * u + stretch;
            const y = S - 3 - h;
            // lava layers visible when stretched
            R(ctx, cx - w / 2 + u, y + 2 * u, w - 2 * u, h - 4 * u, '#ff9a14');
            const bands = 4;
            for (let i = 0; i < bands; i++) {
                const bh = (h / bands) - (f ? 1.6 * u : 0.4 * u);
                R(ctx, cx - w / 2, y + (h / bands) * i, w, bh, i % 2 ? '#3a1a10' : '#4e2416');
            }
            R(ctx, cx - 4.5 * u, y + 3 * u, 2 * u, 2 * u, '#ffd24a');
            R(ctx, cx + 2.5 * u, y + 3 * u, 2 * u, 2 * u, '#ffd24a');
        },
    },
    magma_cube_small: {
        size: 26,
        draw: (ctx, S, f) => MOB_SPRITES.magma_cube_big.draw(ctx, S, f),
    },
    phantom: {
        size: 44,
        draw: (ctx, S, f) => {
            const u = S / 44;
            const cx = S / 2;
            const cy = S * 0.55;
            const flap = f === 0 ? -3 * u : 3 * u;
            const b = '#4a5a8c';
            // wings
            ctx.fillStyle = sh(b, 0.85);
            ctx.beginPath();
            ctx.moveTo(cx - 4 * u, cy);
            ctx.lineTo(cx - 19 * u, cy - 5 * u + flap);
            ctx.lineTo(cx - 15 * u, cy + 4 * u);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx + 4 * u, cy);
            ctx.lineTo(cx + 19 * u, cy - 5 * u + flap);
            ctx.lineTo(cx + 15 * u, cy + 4 * u);
            ctx.closePath(); ctx.fill();
            // body
            R(ctx, cx - 5 * u, cy - 3 * u, 10 * u, 7 * u, b);
            R(ctx, cx - 3 * u, cy + 4 * u, 6 * u, 6 * u, sh(b, 0.9));
            R(ctx, cx - 3.6 * u, cy - 1.6 * u, 2 * u, 1.6 * u, '#54e838');
            R(ctx, cx + 1.6 * u, cy - 1.6 * u, 2 * u, 1.6 * u, '#54e838');
        },
    },
    blaze: {
        size: 40,
        draw: (ctx, S, f) => {
            const u = S / 40;
            const cx = S / 2;
            const cy = S * 0.42;
            // rotating rods
            const rodPos = f === 0 ? [[-12, 6], [12, 6], [-8, 13], [8, 13]] : [[-13, 9], [13, 9], [-6, 14], [6, 14]];
            for (const [dx, dy] of rodPos) {
                R(ctx, cx + dx * u - 1.5 * u, cy + dy * u, 3 * u, 7 * u, '#d8a030');
                R(ctx, cx + dx * u - 1.5 * u, cy + dy * u, 3 * u, 1.4 * u, '#f0c860');
            }
            // smoke wisps
            ctx.globalAlpha = 0.4;
            R(ctx, cx - 7 * u, cy + 8 * u, 14 * u, 6 * u, '#6a5a34');
            ctx.globalAlpha = 1;
            // head
            R(ctx, cx - 6 * u, cy - 6 * u, 12 * u, 12 * u, '#c8a030');
            R(ctx, cx - 6 * u, cy - 6 * u, 12 * u, 2 * u, '#e0bc50');
            R(ctx, cx - 4 * u, cy - 1.6 * u, 2.4 * u, 1.8 * u, '#2a1a08');
            R(ctx, cx + 1.6 * u, cy - 1.6 * u, 2.4 * u, 1.8 * u, '#2a1a08');
            // embers
            R(ctx, cx - 8 * u, cy - 8 * u, u, u, '#ffca28');
            R(ctx, cx + 7 * u, cy - 4 * u, u, u, '#ffca28');
            R(ctx, cx + 3 * u, cy - 9 * u, u, u, '#ff9a14');
        },
    },
    vex: {
        size: 30,
        draw: (ctx, S, f) => {
            const u = S / 30;
            const cx = S / 2;
            const cy = S * 0.5;
            const flap = f === 0 ? -1.5 * u : 1.5 * u;
            const b = '#c8d0e8';
            ctx.fillStyle = sh(b, 0.8);
            ctx.beginPath();
            ctx.moveTo(cx - 3 * u, cy);
            ctx.lineTo(cx - 11 * u, cy - 4 * u + flap);
            ctx.lineTo(cx - 8 * u, cy + 3 * u);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(cx + 3 * u, cy);
            ctx.lineTo(cx + 11 * u, cy - 4 * u + flap);
            ctx.lineTo(cx + 8 * u, cy + 3 * u);
            ctx.closePath(); ctx.fill();
            R(ctx, cx - 4 * u, cy - 7 * u, 8 * u, 8 * u, b);
            R(ctx, cx - 2.5 * u, cy + u, 5 * u, 6 * u, sh(b, 0.9));
            R(ctx, cx - 2.8 * u, cy - 4 * u, 1.8 * u, 1.6 * u, '#4a6ae8');
            R(ctx, cx + 1 * u, cy - 4 * u, 1.8 * u, 1.6 * u, '#4a6ae8');
            // tiny sword
            R(ctx, cx + 5 * u, cy - 2 * u, 1.2 * u, 6 * u, '#b8b8c8');
        },
    },
    witch: {
        size: 38,
        draw: humanoid({
            skin: '#b8a890', shirt: '#4a3a5a', pants: '#3a2c48', face: villagerFace('#7a9a4e'),
            extra: (ctx, cx, feet, u, f, bodyY, headY, hs) => {
                // hat
                R(ctx, cx - hs / 2 - u, headY - u, hs + 2 * u, 2.4 * u, '#241c34');
                R(ctx, cx - hs * 0.32, headY - 5 * u, hs * 0.64, 4.4 * u, '#2c2240');
                R(ctx, cx - hs * 0.16, headY - 8 * u, hs * 0.32, 3.4 * u, '#241c34');
                // wart
                R(ctx, cx + 0.4 * u, headY + hs * 0.62, u, u, '#5a7a3e');
            },
        }),
    },
    enderman: {
        size: 52,
        draw: (ctx, S, f) => {
            const u = S / 52;
            const cx = S / 2;
            const feet = S - 3;
            const b = '#181418';
            const swing = f === 0 ? 2 * u : -2 * u;
            // long thin legs
            R(ctx, cx - 3.4 * u, feet - 20 * u, 2.2 * u, 20 * u, b);
            R(ctx, cx + 1.2 * u, feet - 20 * u, 2.2 * u, 20 * u, b);
            // torso
            R(ctx, cx - 5 * u, feet - 31 * u, 10 * u, 11 * u, sh(b, 1.25));
            // long arms
            R(ctx, cx - 7.4 * u, feet - 31 * u + swing, 2 * u, 17 * u, b);
            R(ctx, cx + 5.4 * u, feet - 31 * u - swing, 2 * u, 17 * u, b);
            // head
            R(ctx, cx - 6 * u, feet - 42 * u, 12 * u, 11 * u, sh(b, 1.15));
            // glowing eyes
            R(ctx, cx - 5.4 * u, feet - 37.5 * u, 4.6 * u, 1.8 * u, '#c85af0');
            R(ctx, cx + 0.8 * u, feet - 37.5 * u, 4.6 * u, 1.8 * u, '#c85af0');
            R(ctx, cx - 4.4 * u, feet - 37.2 * u, 2 * u, 1.2 * u, '#e8a8ff');
            R(ctx, cx + 2.4 * u, feet - 37.2 * u, 2 * u, 1.2 * u, '#e8a8ff');
        },
    },
    pillager: {
        size: 36,
        draw: humanoid({
            skin: '#a89a8a', shirt: '#4a4a52', pants: '#3a3a40', face: villagerFace('#8a7a6a', true),
            extra: (ctx, cx, feet, u, f, bodyY) => {
                // crossbow held across
                R(ctx, cx - 6 * u, bodyY + 3 * u, 12 * u, 2 * u, '#6a4a24');
                R(ctx, cx - 1 * u, bodyY + 1 * u, 2 * u, 6 * u, '#8a6234');
                R(ctx, cx - 4.4 * u, bodyY + 2 * u, u, 4 * u, '#3a3a3a');
                R(ctx, cx + 3.4 * u, bodyY + 2 * u, u, 4 * u, '#3a3a3a');
            },
        }),
    },
    vindicator: {
        size: 36,
        draw: humanoid({
            skin: '#a89a8a', shirt: '#3a4a42', pants: '#2c3a32', face: villagerFace('#8a7a6a', true),
            extra: (ctx, cx, feet, u, f, bodyY) => {
                // iron axe
                R(ctx, cx + 7 * u, bodyY - 2 * u, 1.6 * u, 12 * u, '#6a4a24');
                R(ctx, cx + 6 * u, bodyY - 4 * u, 5 * u, 3.4 * u, '#c8c8d0');
                R(ctx, cx + 6 * u, bodyY - 4 * u, 5 * u, 1.2 * u, '#e0e0e8');
            },
        }),
    },
    evoker: {
        size: 36,
        draw: humanoid({
            skin: '#b0a494', shirt: '#3a3a44', pants: '#2c2c34', face: villagerFace('#948474'),
            extra: (ctx, cx, feet, u, f, bodyY, headY, hs) => {
                // gold-trimmed robe
                R(ctx, cx - 5 * u, bodyY + 7 * u, 10 * u, 1.2 * u, '#c8a030');
                R(ctx, cx - 1 * u, bodyY, 2 * u, 8 * u, '#c8a030');
                // crossed arms band
                R(ctx, cx - 5 * u, bodyY + 3 * u, 10 * u, 2.4 * u, sh('#3a3a44', 1.2));
            },
        }),
    },
    wither_skeleton: {
        size: 42,
        draw: humanoid({
            skin: '#3a3a3e', shirt: '#2c2c30', pants: '#242428', face: skeletonFace('#0c0c10'), thin: true, tall: 2,
            extra: (ctx, cx, feet, u, f, bodyY) => {
                // stone sword
                R(ctx, cx - 9 * u, bodyY + 2 * u, 1.8 * u, 9 * u, '#8a8a8a');
                R(ctx, cx - 10 * u, bodyY + 10.4 * u, 4 * u, 1.4 * u, '#6a4a24');
            },
        }),
    },
    ravager: {
        size: 64,
        draw: (ctx, S, f) => {
            const u = S / 64;
            const cx = S / 2;
            const feet = S - 4;
            const g = '#6a6a72';
            const bob = f === 0 ? 0 : 1.5 * u;
            // legs
            R(ctx, cx - 16 * u, feet - 10 * u, 6 * u, 10 * u, sh(g, 0.8));
            R(ctx, cx + 10 * u, feet - 10 * u, 6 * u, 10 * u, sh(g, 0.75));
            R(ctx, cx - 8 * u, feet - 8 * u, 6 * u, 8 * u, sh(g, 0.85));
            R(ctx, cx + 2 * u, feet - 8 * u, 6 * u, 8 * u, sh(g, 0.8));
            // massive body
            R(ctx, cx - 18 * u, feet - 26 * u, 36 * u, 17 * u, g);
            R(ctx, cx - 18 * u, feet - 26 * u, 36 * u, 3 * u, sh(g, 1.15));
            // dark saddle plate
            R(ctx, cx - 10 * u, feet - 28 * u, 20 * u, 4 * u, '#3a3a42');
            // huge head
            R(ctx, cx - 12 * u, feet - 42 * u + bob, 24 * u, 18 * u, sh(g, 1.05));
            R(ctx, cx - 12 * u, feet - 42 * u + bob, 24 * u, 3 * u, sh(g, 1.2));
            // forehead plate + horns
            R(ctx, cx - 8 * u, feet - 45 * u + bob, 16 * u, 4 * u, '#4a4a52');
            R(ctx, cx - 16 * u, feet - 44 * u + bob, 5 * u, 3 * u, '#d8d0c0');
            R(ctx, cx - 18 * u, feet - 42 * u + bob, 4 * u, 3 * u, '#c0b8a8');
            R(ctx, cx + 11 * u, feet - 44 * u + bob, 5 * u, 3 * u, '#d8d0c0');
            R(ctx, cx + 14 * u, feet - 42 * u + bob, 4 * u, 3 * u, '#c0b8a8');
            // angry eyes + mouth
            R(ctx, cx - 8 * u, feet - 37 * u + bob, 3.4 * u, 2.4 * u, '#1a1a1e');
            R(ctx, cx + 4.6 * u, feet - 37 * u + bob, 3.4 * u, 2.4 * u, '#1a1a1e');
            R(ctx, cx - 6 * u, feet - 28.5 * u + bob, 12 * u, 3 * u, '#2a2a30');
            R(ctx, cx - 5 * u, feet - 28.5 * u + bob, 2 * u, 2 * u, '#e8e0d0');
            R(ctx, cx + 3 * u, feet - 28.5 * u + bob, 2 * u, 2 * u, '#e8e0d0');
        },
    },
    elder_guardian: {
        size: 76,
        draw: (ctx, S, f) => {
            const u = S / 76;
            const cx = S / 2;
            const cy = S / 2 + 2 * u;
            const b = '#8a9a94';
            const pulse = f === 0 ? 0 : 2 * u;
            // spikes
            ctx.fillStyle = '#5a6a64';
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                const r1 = 22 * u, r2 = (30 + (f ? 3 : 0)) * u;
                ctx.save();
                ctx.translate(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
                ctx.rotate(a);
                ctx.fillRect(0, -1.5 * u, r2 - r1, 3 * u);
                ctx.restore();
            }
            // body
            R(ctx, cx - 22 * u, cy - 20 * u, 44 * u, 40 * u, b);
            R(ctx, cx - 22 * u, cy - 20 * u, 44 * u, 5 * u, sh(b, 1.15));
            R(ctx, cx - 22 * u, cy + 14 * u, 44 * u, 6 * u, sh(b, 0.8));
            // patches
            R(ctx, cx - 18 * u, cy - 14 * u, 8 * u, 8 * u, '#a8b8b0');
            R(ctx, cx + 8 * u, cy - 10 * u, 9 * u, 7 * u, '#a8b8b0');
            R(ctx, cx - 6 * u, cy + 8 * u, 10 * u, 6 * u, '#6a7a74');
            // tail
            R(ctx, cx + 20 * u, cy - 4 * u, 8 * u, 8 * u, sh(b, 0.9));
            // single big eye
            R(ctx, cx - 8 * u, cy - 8 * u + pulse * 0.3, 16 * u, 14 * u, '#e8e4dc');
            R(ctx, cx - 3.4 * u, cy - 4 * u + pulse * 0.3, 7 * u, 7 * u, '#6a4ae0');
            R(ctx, cx - 1.4 * u, cy - 2 * u + pulse * 0.3, 3 * u, 3 * u, '#1a1030');
        },
    },
    warden: {
        size: 72,
        draw: (ctx, S, f) => {
            const u = S / 72;
            const cx = S / 2;
            const feet = S - 3;
            const b = '#0e3440';
            const swing = f === 0 ? 3 * u : -3 * u;
            // legs
            R(ctx, cx - 9 * u, feet - 16 * u, 7 * u, 16 * u, sh(b, 0.9));
            R(ctx, cx + 2 * u, feet - 16 * u, 7 * u, 16 * u, b);
            // massive torso
            R(ctx, cx - 14 * u, feet - 42 * u, 28 * u, 26 * u, b);
            R(ctx, cx - 14 * u, feet - 42 * u, 28 * u, 4 * u, sh(b, 1.2));
            // glowing soul chest
            R(ctx, cx - 4.4 * u, feet - 36 * u, 8.8 * u, 10 * u, '#18b8b0');
            R(ctx, cx - 2.4 * u, feet - 34 * u, 4.8 * u, 6 * u, '#4ae8de');
            R(ctx, cx - 1 * u, feet - 32 * u, 2 * u, 2.4 * u, '#c8fff8');
            // huge arms
            R(ctx, cx - 21 * u, feet - 42 * u + swing, 6.4 * u, 26 * u, sh(b, 0.85));
            R(ctx, cx + 14.6 * u, feet - 42 * u - swing, 6.4 * u, 26 * u, sh(b, 0.9));
            // head, no eyes -- antennae
            R(ctx, cx - 9 * u, feet - 54 * u, 18 * u, 12 * u, sh(b, 1.1));
            R(ctx, cx - 8 * u, feet - 50 * u, 16 * u, 3.4 * u, '#081c24');
            R(ctx, cx - 12 * u, feet - 60 * u, 3 * u, 8 * u, sh(b, 1.2));
            R(ctx, cx + 9 * u, feet - 60 * u, 3 * u, 8 * u, sh(b, 1.2));
            R(ctx, cx - 12 * u, feet - 60 * u, 3 * u, 2 * u, '#18b8b0');
            R(ctx, cx + 9 * u, feet - 60 * u, 3 * u, 2 * u, '#18b8b0');
        },
    },
    wither: {
        size: 96,
        draw: (ctx, S, f) => {
            const u = S / 96;
            const cx = S / 2;
            const bob = f === 0 ? 0 : 3 * u;
            const b = '#1c1c22';
            const cy = S * 0.45 + bob;
            // spine + ribs
            R(ctx, cx - 3 * u, cy, 6 * u, 30 * u, b);
            for (let i = 0; i < 3; i++) {
                R(ctx, cx - 14 * u + i * 2 * u, cy + 6 * u + i * 8 * u, (14 - i * 2) * 2 * u, 4 * u, sh(b, 1.15));
            }
            R(ctx, cx - 2 * u, cy + 30 * u, 4 * u, 6 * u, sh(b, 0.9));
            // shoulder bar
            R(ctx, cx - 22 * u, cy - 4 * u, 44 * u, 8 * u, b);
            // side skulls
            for (const side of [-1, 1]) {
                const sx = cx + side * 20 * u;
                const sy = cy - 14 * u - (f ? side * 2 * u : 0);
                R(ctx, sx - 7 * u, sy, 14 * u, 13 * u, sh(b, 1.25));
                R(ctx, sx - 4.6 * u, sy + 4.4 * u, 3 * u, 2.6 * u, '#e8e8f0');
                R(ctx, sx + 1.6 * u, sy + 4.4 * u, 3 * u, 2.6 * u, '#e8e8f0');
                R(ctx, sx - 2 * u, sy + 8.4 * u, 4 * u, 2 * u, '#0a0a0e');
            }
            // central skull
            R(ctx, cx - 10 * u, cy - 24 * u, 20 * u, 19 * u, sh(b, 1.35));
            R(ctx, cx - 10 * u, cy - 24 * u, 20 * u, 3 * u, sh(b, 1.55));
            R(ctx, cx - 6.6 * u, cy - 17 * u, 4.4 * u, 3.6 * u, '#f0f0f8');
            R(ctx, cx + 2.2 * u, cy - 17 * u, 4.4 * u, 3.6 * u, '#f0f0f8');
            R(ctx, cx - 5.4 * u, cy - 16.4 * u, 2 * u, 2.2 * u, '#3a3af0');
            R(ctx, cx + 3.4 * u, cy - 16.4 * u, 2 * u, 2.2 * u, '#3a3af0');
            R(ctx, cx - 3 * u, cy - 11 * u, 6 * u, 2.4 * u, '#0a0a0e');
        },
    },
    ender_dragon: {
        size: 148,
        draw: (ctx, S, f) => {
            const u = S / 148;
            const cx = S / 2;
            const cy = S * 0.52;
            const flap = f === 0 ? -10 * u : 8 * u;
            const b = '#1a1a20';
            const mem = '#2c2836';
            // wings
            for (const side of [-1, 1]) {
                ctx.fillStyle = mem;
                ctx.beginPath();
                ctx.moveTo(cx + side * 10 * u, cy - 6 * u);
                ctx.lineTo(cx + side * 62 * u, cy - 26 * u + flap);
                ctx.lineTo(cx + side * 54 * u, cy + 2 * u + flap * 0.4);
                ctx.lineTo(cx + side * 30 * u, cy + 8 * u);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = b;
                ctx.lineWidth = 3 * u;
                ctx.beginPath();
                ctx.moveTo(cx + side * 10 * u, cy - 6 * u);
                ctx.lineTo(cx + side * 62 * u, cy - 26 * u + flap);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(cx + side * 40 * u, cy - 15 * u + flap * 0.7);
                ctx.lineTo(cx + side * 44 * u, cy + 4 * u + flap * 0.3);
                ctx.stroke();
            }
            // tail behind
            R(ctx, cx - 3 * u, cy + 14 * u, 6 * u, 22 * u, b);
            R(ctx, cx - 6 * u, cy + 34 * u, 12 * u, 5 * u, sh(b, 1.2));
            // body
            R(ctx, cx - 14 * u, cy - 10 * u, 28 * u, 26 * u, b);
            R(ctx, cx - 14 * u, cy - 10 * u, 28 * u, 4 * u, sh(b, 1.3));
            R(ctx, cx - 8 * u, cy + 4 * u, 16 * u, 8 * u, sh(b, 0.8));
            // head
            R(ctx, cx - 11 * u, cy - 30 * u, 22 * u, 18 * u, sh(b, 1.25));
            R(ctx, cx - 7 * u, cy - 34 * u, 4 * u, 5 * u, sh(b, 1.4));
            R(ctx, cx + 3 * u, cy - 34 * u, 4 * u, 5 * u, sh(b, 1.4));
            // snout
            R(ctx, cx - 6 * u, cy - 15 * u, 12 * u, 6 * u, sh(b, 1.15));
            R(ctx, cx - 5 * u, cy - 12.4 * u, 2 * u, 1.6 * u, '#3a3a44');
            R(ctx, cx + 3 * u, cy - 12.4 * u, 2 * u, 1.6 * u, '#3a3a44');
            // purple eyes
            R(ctx, cx - 9.4 * u, cy - 25 * u, 6 * u, 2.6 * u, '#c85af0');
            R(ctx, cx + 3.4 * u, cy - 25 * u, 6 * u, 2.6 * u, '#c85af0');
            R(ctx, cx - 7.4 * u, cy - 24.6 * u, 2.4 * u, 1.8 * u, '#f0c8ff');
            R(ctx, cx + 5.4 * u, cy - 24.6 * u, 2.4 * u, 1.8 * u, '#f0c8ff');
        },
    },
};

/* ================= variants ================= */

function applyVariant(base, variant) {
    const s = base.width;
    const out = makeCanvas(s);
    const ctx = out.getContext('2d');
    if (variant === 'camo') {
        ctx.globalAlpha = 0.52;
        ctx.drawImage(base, 0, 0);
        ctx.globalAlpha = 0.35;
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = '#8fd7ff';
        for (let i = -s; i < s * 2; i += 7) {
            ctx.save();
            ctx.translate(i, 0);
            ctx.rotate(0.7);
            ctx.fillRect(0, -s, 2, s * 3);
            ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    } else if (variant === 'regrow') {
        ctx.drawImage(base, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(80,220,70,0.18)';
        ctx.fillRect(0, 0, s, s);
        ctx.globalCompositeOperation = 'source-over';
        // sprout
        const sx = s * 0.5, sy = s * 0.12;
        ctx.fillStyle = '#3f9930';
        ctx.fillRect(sx - 1, sy, 2, 5);
        ctx.fillStyle = '#67e857';
        ctx.fillRect(sx - 4, sy - 2, 3, 3);
        ctx.fillRect(sx + 1, sy - 3, 3, 3);
    } else if (variant === 'fortified') {
        ctx.drawImage(base, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
        const bandY1 = s * 0.3, bandY2 = s * 0.62;
        ctx.fillStyle = 'rgba(120,120,135,0.9)';
        ctx.fillRect(0, bandY1, s, 3);
        ctx.fillRect(0, bandY2, s, 3);
        ctx.fillStyle = 'rgba(200,200,215,0.9)';
        for (let x = 3; x < s; x += 8) {
            ctx.fillRect(x, bandY1, 2, 3);
            ctx.fillRect(x + 4, bandY2, 2, 3);
        }
        ctx.globalCompositeOperation = 'source-over';
    } else {
        ctx.drawImage(base, 0, 0);
    }
    return out;
}

/* ================= public API ================= */

const VARIANTS = ['normal', 'camo', 'regrow', 'fortified'];

export const MobSprites = {
    bake() {
        for (const id of Object.keys(MOB_SPRITES)) {
            const def = MOB_SPRITES[id];
            for (let f = 0; f < 2; f++) {
                const base = makeCanvas(def.size);
                def.draw(base.getContext('2d'), def.size, f);
                outline(base);
                for (const v of VARIANTS) {
                    cache.set(`${id}:${f}:${v}`, v === 'normal' ? base : applyVariant(base, v));
                }
            }
        }
    },

    sprite(mobId, frame = 0, variant = 'normal') {
        const key = `${mobId}:${frame % 2}:${variant}`;
        let c = cache.get(key);
        if (!c) {
            // lazy bake fallback (unknown variant -> normal)
            const def = MOB_SPRITES[mobId];
            if (!def) return null;
            this.bake();
            c = cache.get(key) || cache.get(`${mobId}:${frame % 2}:normal`);
        }
        return c;
    },

    frames() {
        return 2;
    },

    size(mobId) {
        const def = MOB_SPRITES[mobId];
        return def ? def.size : 36;
    },
};

/* ================= ally unit sprites ================= */
/* Side-view (facing +x) pixel art for spawned allies (wolves, undead, turrets).
   Teal-tinted outline so friendlies read differently from mobs at a glance. */

const UNIT_SPRITES = {
    wolf: { size: 34, draw: (ctx, S, f) => wolfPainter(ctx, S, f, '#d8d4cc', true, false) },
    dire_wolf: { size: 42, draw: (ctx, S, f) => wolfPainter(ctx, S, f, '#565660', false, false) },
    frost_wolf: { size: 34, draw: (ctx, S, f) => wolfPainter(ctx, S, f, '#bcd8ea', false, true) },
    allay: {
        size: 26,
        draw: (ctx, S, f) => {
            const u = S / 26;
            const cx = S / 2;
            const bob = f ? 1.6 * u : 0;
            // wing blur
            ctx.globalAlpha = 0.55;
            R(ctx, cx - 10 * u, 9 * u + bob, 5 * u, 6 * u, '#bfe4ff');
            R(ctx, cx + 5 * u, 9 * u + bob, 5 * u, 6 * u, '#bfe4ff');
            ctx.globalAlpha = 1;
            // body + head
            R(ctx, cx - 3.4 * u, 12 * u + bob, 6.8 * u, 8 * u, '#4a8ae8');
            R(ctx, cx - 4.4 * u, 4 * u + bob, 8.8 * u, 8 * u, '#6aaaf8');
            R(ctx, cx - 4.4 * u, 4 * u + bob, 8.8 * u, 2 * u, '#8ac4ff');
            // friendly eyes + sparkle
            R(ctx, cx - 2.6 * u, 7 * u + bob, 1.6 * u, 2 * u, '#103050');
            R(ctx, cx + 1 * u, 7 * u + bob, 1.6 * u, 2 * u, '#103050');
            R(ctx, cx + 6 * u, 2 * u + bob, u, u, '#dff2ff');
        },
    },
    skeleton_squad: {
        size: 30,
        draw: (ctx, S, f) => {
            const u = S / 30;
            const cx = S / 2;
            const feet = S - 3;
            const sw = f ? 1.4 * u : 0;
            R(ctx, cx - 3 * u, feet - 7 * u + (f ? u : 0), 2 * u, 7 * u, '#b8b8b0');
            R(ctx, cx + 1 * u, feet - 7 * u + (f ? 0 : u), 2 * u, 7 * u, '#b8b8b0');
            R(ctx, cx - 4 * u, feet - 15 * u, 8 * u, 8 * u, '#c8c8c0');
            // ally sash
            R(ctx, cx - 4 * u, feet - 15 * u, 8 * u, 2.2 * u, '#3a6ae0');
            R(ctx, cx - 5 * u, feet - 25 * u, 10 * u, 10 * u, '#d8d8d0');
            R(ctx, cx - 3 * u, feet - 21.6 * u, 2 * u, 1.8 * u, '#3a3a3a');
            R(ctx, cx + 1 * u, feet - 21.6 * u, 2 * u, 1.8 * u, '#3a3a3a');
            // bow held forward
            ctx.strokeStyle = '#8a6234';
            ctx.lineWidth = 1.6 * u;
            ctx.beginPath();
            ctx.arc(cx + 7 * u, feet - 13 * u - sw, 5 * u, -1.1, 1.1);
            ctx.stroke();
        },
    },
    raised_dead: {
        size: 32,
        draw: (ctx, S, f) => {
            const u = S / 32;
            const cx = S / 2 - 2 * u;   // hunched forward
            const feet = S - 3;
            ctx.globalAlpha = 0.92;
            // shambling legs
            R(ctx, cx - 3 * u, feet - 7 * u + (f ? 1.2 * u : 0), 2.6 * u, 7 * u, '#2c3234');
            R(ctx, cx + 1 * u, feet - 7 * u + (f ? 0 : 1.2 * u), 2.6 * u, 7 * u, '#252b2d');
            // hunched torso in tattered rags
            R(ctx, cx - 4.4 * u, feet - 16 * u, 9 * u, 9.4 * u, '#37423f');
            R(ctx, cx - 4.4 * u, feet - 8 * u, 2 * u, 1.6 * u, '#2c3234');
            R(ctx, cx + 2 * u, feet - 8.6 * u, 2 * u, 2.2 * u, '#2c3234');
            // both arms stretched forward (classic shamble)
            R(ctx, cx + 3 * u, feet - 15 * u + (f ? 0.8 * u : 0), 8 * u, 2.4 * u, '#5f7d74');
            R(ctx, cx + 3 * u, feet - 11.4 * u + (f ? 0 : 0.8 * u), 7 * u, 2.4 * u, '#54706a');
            // head, leaning forward
            R(ctx, cx - 2 * u, feet - 24 * u, 8.4 * u, 8.4 * u, '#6a8a80');
            R(ctx, cx - 2 * u, feet - 24 * u, 8.4 * u, 1.8 * u, '#7fa093');
            // glowing necromantic eyes
            R(ctx, cx + 0.4 * u, feet - 21 * u, 2 * u, 1.8 * u, '#4ae8de');
            R(ctx, cx + 4 * u, feet - 21 * u, 2 * u, 1.8 * u, '#4ae8de');
            ctx.globalAlpha = 0.5;
            R(ctx, cx + 0.8 * u, feet - 21.6 * u, 1.2 * u, 0.8 * u, '#d8fffb');
            R(ctx, cx + 4.4 * u, feet - 21.6 * u, 1.2 * u, 0.8 * u, '#d8fffb');
            // soul wisp above
            ctx.globalAlpha = f ? 0.5 : 0.3;
            R(ctx, cx + 1 * u, feet - 28 * u - (f ? u : 0), 1.6 * u, 1.6 * u, '#4ae8de');
            ctx.globalAlpha = 1;
        },
    },
    auto_turret: {
        size: 30,
        draw: (ctx, S, f) => {
            const u = S / 30;
            const cx = S / 2;
            const feet = S - 3;
            // tripod
            R(ctx, cx - 6 * u, feet - 5 * u, 2 * u, 5 * u, '#3a3a42');
            R(ctx, cx + 4 * u, feet - 5 * u, 2 * u, 5 * u, '#3a3a42');
            R(ctx, cx - 1 * u, feet - 4 * u, 2 * u, 4 * u, '#3a3a42');
            // body + top plate
            R(ctx, cx - 6 * u, feet - 13 * u, 12 * u, 8 * u, '#6a6a74');
            R(ctx, cx - 6 * u, feet - 13 * u, 12 * u, 2 * u, '#8a8a96');
            // barrel forward
            R(ctx, cx + 5 * u, feet - 11 * u, 8 * u, 3 * u, '#3a3a42');
            R(ctx, cx + 12 * u, feet - 11.8 * u, 1.6 * u, 4.6 * u, '#2a2a30');
            // blinking redstone lamp
            R(ctx, cx - 4 * u, feet - 11 * u, 2.6 * u, 2.6 * u, f ? '#ff5540' : '#7a2018');
            if (f) {
                ctx.globalAlpha = 0.4;
                R(ctx, cx - 5 * u, feet - 12 * u, 4.6 * u, 4.6 * u, '#ff8a70');
                ctx.globalAlpha = 1;
            }
        },
    },
    tnt_drone: {
        size: 28,
        draw: (ctx, S, f) => {
            const u = S / 28;
            const cx = S / 2;
            const cy = S / 2 + 2 * u;
            // rotor (bar spins: wide vs narrow)
            R(ctx, cx - 0.8 * u, cy - 9 * u, 1.6 * u, 3 * u, '#4a4a52');
            if (f) R(ctx, cx - 8 * u, cy - 10 * u, 16 * u, 1.6 * u, '#9a9aa6');
            else R(ctx, cx - 3 * u, cy - 10 * u, 6 * u, 1.6 * u, '#9a9aa6');
            // tnt body
            R(ctx, cx - 5 * u, cy - 6 * u, 10 * u, 10 * u, '#c8402a');
            R(ctx, cx - 5 * u, cy - 2.4 * u, 10 * u, 3.4 * u, '#e8e0d0');
            R(ctx, cx - 5 * u, cy - 6 * u, 10 * u, 1.6 * u, '#e05a40');
            // skids
            R(ctx, cx - 6 * u, cy + 4.6 * u, 4 * u, 1.4 * u, '#3a3a42');
            R(ctx, cx + 2 * u, cy + 4.6 * u, 4 * u, 1.4 * u, '#3a3a42');
        },
    },
};

function wolfPainter(ctx, S, f, body, collar, frost) {
    const u = S / 34;
    const feet = S - 4;
    const cx = S / 2;
    // legs (trot: diagonal pairs)
    R(ctx, cx - 8 * u, feet - 6 * u + (f ? 1.4 * u : 0), 2.4 * u, 6 * u, sh34(body, 0.75));
    R(ctx, cx - 3 * u, feet - 6 * u + (f ? 0 : 1.4 * u), 2.4 * u, 6 * u, sh34(body, 0.7));
    R(ctx, cx + 1.6 * u, feet - 6 * u + (f ? 0 : 1.4 * u), 2.4 * u, 6 * u, sh34(body, 0.75));
    R(ctx, cx + 5.4 * u, feet - 6 * u + (f ? 1.4 * u : 0), 2.4 * u, 6 * u, sh34(body, 0.7));
    // body
    R(ctx, cx - 9 * u, feet - 13 * u, 16 * u, 8 * u, body);
    R(ctx, cx - 9 * u, feet - 13 * u, 16 * u, 2 * u, sh34(body, 1.12));
    // tail (wags)
    R(ctx, cx - 12 * u, feet - 15 * u + (f ? 1.6 * u : 0), 3.4 * u, 2.4 * u, body);
    // head + snout
    R(ctx, cx + 5 * u, feet - 19 * u, 8 * u, 7 * u, body);
    R(ctx, cx + 12 * u, feet - 16.6 * u, 3.4 * u, 3.4 * u, sh34(body, 0.9));
    R(ctx, cx + 14.4 * u, feet - 15.6 * u, 1.4 * u, 1.4 * u, '#1a1a20');
    // ears + eye
    R(ctx, cx + 5.6 * u, feet - 21 * u, 2 * u, 2.6 * u, sh34(body, 0.85));
    R(ctx, cx + 9.4 * u, feet - 21 * u, 2 * u, 2.6 * u, sh34(body, 0.85));
    R(ctx, cx + 9.6 * u, feet - 17.4 * u, 1.8 * u, 1.8 * u, '#2a2a34');
    if (collar) R(ctx, cx + 4 * u, feet - 13 * u, 2 * u, 3 * u, '#e03030');
    if (frost) {
        R(ctx, cx - 6 * u, feet - 14.6 * u, 1.4 * u, 1.4 * u, '#eef8ff');
        R(ctx, cx + 1 * u, feet - 12 * u, 1.4 * u, 1.4 * u, '#eef8ff');
        R(ctx, cx + 15 * u, feet - 17 * u, u, u, '#dff2ff');
    }
}

function sh34(hex, m) {
    return sh(hex, m);
}

export const UnitSprites = {
    sprite(type, frame = 0) {
        const key = `unit:${type}:${frame % 2}`;
        let c = cache.get(key);
        if (!c) {
            const def = UNIT_SPRITES[type];
            if (!def) return null;
            c = makeCanvas(def.size);
            def.draw(c.getContext('2d'), def.size, frame % 2);
            outline(c, 'rgba(10,40,44,0.85)');
            cache.set(key, c);
        }
        return c;
    },

    size(type) {
        const def = UNIT_SPRITES[type];
        return def ? def.size : 30;
    },
};
