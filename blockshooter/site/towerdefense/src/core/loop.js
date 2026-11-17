// Fixed-timestep game loop with a render interpolation alpha.
//
// The simulation is advanced in fixed steps of `fixedDt` seconds so that
// gameplay is deterministic and independent of frame rate; rendering happens
// once per animation frame with an interpolation factor. Fast-forward is a
// multiplier on how fast the accumulator fills (setSpeed(3) => three sim
// seconds per real second), NOT a change to the step size, so determinism and
// collision behaviour are identical at 1x and 3x.
//
// This module references requestAnimationFrame only inside methods, so merely
// importing it under node is safe; start()/the frame callback are browser-only.

function _now() {
    return (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
}

export class GameLoop {
    /**
     * @param {object} cfg
     * @param {(dt: number) => void} cfg.update fixed sim step
     * @param {(alpha: number) => void} [cfg.render] per-frame render, alpha in [0,1)
     * @param {number} [cfg.fixedDt] step size in seconds (default 1/60)
     */
    constructor({ update, render, fixedDt = 1 / 60 }) {
        this._update = update;
        this._render = render || null;
        this._fixedDt = fixedDt;
        this._speed = 1;
        this._accum = 0;
        this._running = false;
        this._last = 0;
        this._rafId = 0;
        this._frame = this._frame.bind(this);
    }

    get running() {
        return this._running;
    }

    /**
     * Set fast-forward multiplier. Only 1x and 3x are meaningful (contract);
     * any value >= 3 maps to 3x, anything else to 1x.
     */
    setSpeed(mult) {
        this._speed = mult >= 3 ? 3 : 1;
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._last = _now();
        this._accum = 0;
        this._rafId = requestAnimationFrame(this._frame);
        // Hidden/occluded tabs never fire rAF. A low-rate watchdog keeps the
        // simulation (and cheap off-screen renders) alive so the game does not
        // freeze in background tabs; when rAF resumes it takes over seamlessly.
        this._watchdog = setInterval(() => {
            if (!this._running) return;
            const now = _now();
            if (now - this._last > 140) this._step(now);
        }, 100);
    }

    stop() {
        if (!this._running) return;
        this._running = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = 0;
        if (this._watchdog) clearInterval(this._watchdog);
        this._watchdog = 0;
    }

    _frame(now) {
        if (!this._running) return;
        this._rafId = requestAnimationFrame(this._frame);
        this._step(now);
    }

    _step(now) {
        let frameDt = (now - this._last) / 1000;
        this._last = now;
        // Clamp huge gaps (tab was backgrounded) so we never try to catch up an
        // unbounded amount of simulation in one frame.
        if (frameDt > 0.25) frameDt = 0.25;
        if (!(frameDt > 0)) frameDt = 0;

        this._accum += frameDt * this._speed;

        const fdt = this._fixedDt;
        // Hard safety cap: even after the frameDt clamp, guarantee we cannot
        // spin forever if update() somehow stalls the timeline.
        const maxSteps = 512;
        let steps = 0;
        while (this._accum >= fdt && steps < maxSteps) {
            this._update(fdt);
            this._accum -= fdt;
            steps++;
        }
        if (steps >= maxSteps) this._accum = 0;

        if (this._render) this._render(this._accum / fdt);
    }
}
