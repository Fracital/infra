// Canvas renderer front-end: owns the 2D context, the letterbox scaling of
// #game-stage, screen-to-world inversion, screen shake, and the fullscreen
// flash overlay. Browser-only, but references DOM globals only inside methods
// so importing under node is harmless.
//
// The logical resolution is a fixed 1280x720 (all game code draws in logical
// pixels). #game-stage is scaled with a CSS transform to fit the window, and
// the canvas BACKING STORE is sized to the native on-screen resolution
// (stage scale x devicePixelRatio, capped), with a matching base transform.
// Sprites therefore rasterize crisply at the display's real pixel density
// instead of being a stretched 720p bitmap.

function _now() {
    return (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
}

export const Renderer = {
    ctx: null,
    W: 1280,
    H: 720,
    canvas: null,

    _stage: null,
    _scale: 1,
    _pixelScale: 1,   // backing-store pixels per logical pixel
    _shakeEnabled: true,
    _trauma: 0,
    _time: 0,
    _last: 0,
    _onResize: null,
    _flash: null, // {color, baseAlpha, t, dur}

    /**
     * Grab the context, disable smoothing, and install the resize handler.
     * @param {HTMLCanvasElement} canvas
     */
    init(canvas) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        this.ctx = ctx;
        ctx.imageSmoothingEnabled = false;
        this._stage = (typeof document !== 'undefined')
            ? document.getElementById('game-stage')
            : null;
        this._last = _now();
        this._onResize = () => this.resize();
        window.addEventListener('resize', this._onResize);
        document.addEventListener('fullscreenchange', this._onResize);
        this.resize();
    },

    /** Fit #game-stage to the window via CSS transform scale (letterbox) and
        resize the canvas backing store to native display resolution. */
    resize() {
        const scale = Math.min(window.innerWidth / this.W, window.innerHeight / this.H);
        this._scale = scale;
        if (this._stage) {
            this._stage.style.transform = 'scale(' + scale + ')';
        }
        // Native-resolution backing: effective device pixels per logical pixel.
        // Capped so a zoomed 4K/hidpi setup cannot allocate an absurd canvas.
        const dpr = (typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0)
            ? window.devicePixelRatio : 1;
        const px = Math.max(0.5, Math.min(3, scale * dpr));
        if (px !== this._pixelScale || this.canvas.width !== Math.round(this.W * px)) {
            this._pixelScale = px;
            this.canvas.width = Math.round(this.W * px);
            this.canvas.height = Math.round(this.H * px);
            // resizing the backing store resets context state
            this.ctx.imageSmoothingEnabled = false;
        }
    },

    /**
     * Convert client (screen) coordinates to logical world coordinates. Inverts
     * the live canvas rect, so it is correct regardless of the CSS scale and
     * page position.
     * @returns {{x:number, y:number}}
     */
    screenToWorld(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = rect.width > 0 ? this.W / rect.width : 1;
        const sy = rect.height > 0 ? this.H / rect.height : 1;
        return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
    },

    /** Clear, save state, and apply the screen-shake translate. */
    beginFrame() {
        const ctx = this.ctx;
        const now = _now();
        let dt = (now - this._last) / 1000;
        this._last = now;
        if (dt > 0.1) dt = 0.1;
        if (!(dt > 0)) dt = 0;
        this._time += dt;

        const px = this._pixelScale;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.setTransform(px, 0, 0, px, 0, 0);   // draw in logical coords at native res
        ctx.save();

        if (this._shakeEnabled && this._trauma > 0) {
            // Trauma decays linearly; visible offset is trauma^2 so small
            // amounts are subtle and large hits punch. sin/cos of wall time keep
            // it smooth and cheap (no per-frame RNG).
            this._trauma = Math.max(0, this._trauma - 2.2 * dt);
            const amp = this._trauma * this._trauma * 14;
            const t = this._time;
            const ox = Math.sin(t * 47.0) * amp;
            const oy = Math.cos(t * 41.0) * amp;
            ctx.translate(Math.round(ox), Math.round(oy));
        }

        if (this._flash) {
            this._flash.t -= dt;
            if (this._flash.t <= 0) this._flash = null;
        }
    },

    /** Restore state and draw the decaying flash overlay if active. */
    endFrame() {
        const ctx = this.ctx;
        ctx.restore();
        const f = this._flash;
        if (f && f.t > 0) {
            const a = f.baseAlpha * (f.t / f.dur);
            if (a > 0.003) {
                ctx.save();
                const px = this._pixelScale;
                ctx.setTransform(px, 0, 0, px, 0, 0);
                ctx.globalAlpha = a;
                ctx.fillStyle = f.color;
                ctx.fillRect(0, 0, this.W, this.H);
                ctx.restore();
            }
        }
    },

    /** Add trauma in [0,1]. No-op when shake is disabled in settings. */
    shake(power) {
        if (!this._shakeEnabled) return;
        this._trauma = Math.min(1, this._trauma + power);
    },

    /**
     * Trigger a fullscreen tint that fades out over ~0.25s.
     * @param {string} color CSS color (hex or rgba)
     * @param {number} [alpha] peak opacity (default 0.5)
     */
    flash(color, alpha) {
        this._flash = {
            color: color || '#ffffff',
            baseAlpha: (alpha === undefined || alpha === null) ? 0.5 : alpha,
            t: 0.25,
            dur: 0.25,
        };
    },

    setShakeEnabled(b) {
        this._shakeEnabled = !!b;
        if (!b) this._trauma = 0;
    },
};
