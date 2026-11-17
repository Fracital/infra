// Ground-zone art (orchestrator-owned asset layer). Immediate-mode painters
// keyed by what the zone actually does: piston spike strips that visibly
// deplete with charges, charred burning ground, bubbling poison, icy/tar
// puddles, arcane rings. Deterministic per-zone scatter (seeded from position).

const TAU = Math.PI * 2;

function seededOffsets(z, n) {
    if (z._scatter && z._scatter.length >= n * 2) return z._scatter;
    let s = ((z.x * 73856093) ^ (z.y * 19349663)) >>> 0 || 7;
    const rng = () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
    const pts = [];
    for (let i = 0; i < n; i++) {
        const a = rng() * TAU;
        const d = Math.sqrt(rng()) * 0.85;
        pts.push(Math.cos(a) * d, Math.sin(a) * d * 0.8);
    }
    z._scatter = pts;
    return pts;
}

function kindOf(z) {
    if (z.charges != null) return 'spike';
    const dt = z.atk && z.atk.damageType;
    const st = z.atk && z.atk.status && z.atk.status.id;
    if (dt === 'fire' || dt === 'explosive') return 'fire';
    if (dt === 'poison' || st === 'poison') return 'poison';
    if (dt === 'cold' || st === 'freeze') return 'ice';
    if (st === 'slow') return 'tar';
    return 'magic';
}

function spike(ctx, x, y, s) {
    // base plate
    ctx.fillStyle = '#2e2a26';
    ctx.fillRect(x - 4 * s, y - 1 * s, 8 * s, 3 * s);
    // three metal points
    for (let i = -1; i <= 1; i++) {
        const px = x + i * 3 * s;
        ctx.fillStyle = '#8a8a96';
        ctx.beginPath();
        ctx.moveTo(px - 1.6 * s, y);
        ctx.lineTo(px, y - 6 * s);
        ctx.lineTo(px + 1.6 * s, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#c8c8d4';
        ctx.fillRect(px - 0.6 * s, y - 5 * s, 1.2 * s, 3 * s);
    }
}

/**
 * Draw one zone. Called every frame under the entity layer.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} z game zone (x, y, radius, duration, charges, atk, color)
 * @param {number} t wall-clock seconds (drives pulse/bubble/rotation)
 */
export function drawZone(ctx, z, t) {
    const kind = kindOf(z);
    const r = z.radius || 40;

    if (kind === 'spike') {
        if (z._maxCharges == null) z._maxCharges = Math.max(1, z.charges || 1);
        const frac = Math.max(0, Math.min(1, (z.charges || 0) / z._maxCharges));
        const n = Math.max(1, Math.round(8 * frac));
        const pts = seededOffsets(z, 8);
        // worn plate under the trap
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#1a1712';
        ctx.beginPath();
        ctx.ellipse(z.x, z.y, r * 0.9, r * 0.62, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        for (let i = 0; i < n; i++) {
            spike(ctx, z.x + pts[i * 2] * r, z.y + pts[i * 2 + 1] * r, 1);
        }
        return;
    }

    if (kind === 'fire') {
        // charred ground + pulsing glow cracks
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = '#140c06';
        ctx.beginPath();
        ctx.ellipse(z.x, z.y, r, r * 0.7, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        const pulse = 0.55 + 0.45 * Math.sin(t * 6 + z.x);
        ctx.globalCompositeOperation = 'lighter';
        const pts = seededOffsets(z, 5);
        for (let i = 0; i < 5; i++) {
            const cx = z.x + pts[i * 2] * r * 0.7;
            const cy = z.y + pts[i * 2 + 1] * r * 0.7;
            ctx.globalAlpha = 0.35 * pulse;
            ctx.fillStyle = '#ff7a2a';
            ctx.fillRect(cx - 4, cy - 1.5, 8, 3);
            ctx.fillRect(cx - 1.5, cy - 4, 3, 8);
            ctx.globalAlpha = 0.6 * pulse;
            ctx.fillStyle = '#ffd24a';
            ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        return;
    }

    if (kind === 'poison') {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#1f4a1c';
        ctx.beginPath();
        ctx.ellipse(z.x, z.y, r, r * 0.68, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#3faa3f';
        ctx.beginPath();
        ctx.ellipse(z.x - r * 0.12, z.y - r * 0.1, r * 0.72, r * 0.48, 0, 0, TAU);
        ctx.fill();
        // rising bubbles
        ctx.globalAlpha = 0.8;
        const pts = seededOffsets(z, 4);
        for (let i = 0; i < 4; i++) {
            const phase = (t * 0.9 + i * 0.31) % 1;
            const bx = z.x + pts[i * 2] * r * 0.7;
            const by = z.y + pts[i * 2 + 1] * r * 0.55 - phase * 7;
            ctx.fillStyle = phase > 0.75 ? '#b6f0a8' : '#6fd35f';
            ctx.fillRect(bx, by, 3 - phase * 2, 3 - phase * 2);
        }
        ctx.globalAlpha = 1;
        return;
    }

    if (kind === 'ice' || kind === 'tar') {
        const icy = kind === 'ice';
        ctx.globalAlpha = icy ? 0.34 : 0.5;
        ctx.fillStyle = icy ? '#9fd0f0' : '#14100c';
        ctx.beginPath();
        ctx.ellipse(z.x, z.y, r, r * 0.68, 0, 0, TAU);
        ctx.fill();
        // gloss sheen
        ctx.globalAlpha = icy ? 0.4 : 0.14;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(z.x - r * 0.25, z.y - r * 0.2, r * 0.4, r * 0.16, -0.5, 0, TAU);
        ctx.fill();
        if (icy) {
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = '#e8f6ff';
            const pts = seededOffsets(z, 3);
            for (let i = 0; i < 3; i++) {
                const cx = z.x + pts[i * 2] * r * 0.6;
                const cy = z.y + pts[i * 2 + 1] * r * 0.5;
                ctx.fillRect(cx - 3, cy - 0.8, 6, 1.6);
                ctx.fillRect(cx - 0.8, cy - 3, 1.6, 6);
            }
        }
        ctx.globalAlpha = 1;
        return;
    }

    // magic / default: soft fill + rotating dashed rune ring
    const col = z.color || '#c08aff';
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(z.x, z.y, r, r * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -t * 14;
    ctx.beginPath();
    ctx.ellipse(z.x, z.y, r * 0.92, r * 0.64, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
}
