// Top-bar HUD: lives, cash, round/phase readout and the run controls
// (start round, speed toggle, pause, settings, fps). Browser-only.
//
// The HUD is a passive reflection of game.state: update() diffs the live values
// each frame and only rewrites the DOM when something actually changed, so it is
// cheap to call every render frame. Control buttons route back to gamescreen by
// emitting on the game bus (gamescreen owns the loop) or by calling the sim
// directly for start-round.

import { formatCash, shortNum } from '../core/mathutil.js';
import { Save } from '../core/save.js';
import { bus as uiBus } from '../core/events.js';
import { SFX } from '../audio/sfx.js';

function _now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

// ---- tiny pixel-art icons (kept ASCII-only; drawn to offscreen canvases) ----

function _iconCanvas(size, painter) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    painter(ctx);
    return c;
}

function _px(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

function _heartIcon() {
    return _iconCanvas(16, (ctx) => {
        const rows = [
            '.XX..XX.',
            'XXXXXXXX',
            'XXXXXXXX',
            'XXXXXXXX',
            '.XXXXXX.',
            '..XXXX..',
            '...XX...',
        ];
        for (let r = 0; r < rows.length; r++) {
            for (let cidx = 0; cidx < 8; cidx++) {
                if (rows[r][cidx] !== 'X') continue;
                const light = r < 2 && cidx < 4;
                _px(ctx, 1 + cidx * 2, 1 + r * 2, 2, 2, light ? '#ff6d7a' : '#e33b2e');
            }
        }
    });
}

function _emeraldIcon() {
    return _iconCanvas(16, (ctx) => {
        _px(ctx, 5, 1, 6, 2, '#1fe870');
        _px(ctx, 3, 3, 10, 2, '#17dd62');
        _px(ctx, 2, 5, 12, 4, '#12c455');
        _px(ctx, 3, 9, 10, 2, '#0fa848');
        _px(ctx, 5, 11, 6, 2, '#0b8c3a');
        _px(ctx, 5, 3, 2, 4, '#8affc0');   // glint
    });
}

function _pauseIcon() {
    return _iconCanvas(16, (ctx) => {
        _px(ctx, 3, 3, 4, 10, '#e8e6f0');
        _px(ctx, 9, 3, 4, 10, '#e8e6f0');
    });
}

function _gearIcon() {
    return _iconCanvas(16, (ctx) => {
        ctx.fillStyle = '#c8c6d4';
        ctx.beginPath(); ctx.arc(8, 8, 6, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            _px(ctx, 8 + Math.cos(a) * 6 - 1, 8 + Math.sin(a) * 6 - 1, 2, 2, '#c8c6d4');
        }
        ctx.fillStyle = '#2a2636';
        ctx.beginPath(); ctx.arc(8, 8, 2.4, 0, Math.PI * 2); ctx.fill();
    });
}

function _fullscreenIcon() {
    return _iconCanvas(16, (ctx) => {
        const c = '#e8e6f0';
        _px(ctx, 2, 2, 5, 2, c); _px(ctx, 2, 2, 2, 5, c);
        _px(ctx, 9, 2, 5, 2, c); _px(ctx, 12, 2, 2, 5, c);
        _px(ctx, 2, 12, 5, 2, c); _px(ctx, 2, 9, 2, 5, c);
        _px(ctx, 9, 12, 5, 2, c); _px(ctx, 12, 9, 2, 5, c);
    });
}

export const HUD = {
    mount(rootEl, game, gate) {
        this.game = game;
        this.gate = gate || null;
        this._unsubs = [];
        this._fpsT = _now();
        this._fps = 60;

        const bar = document.createElement('div');
        bar.className = 'hud-bar';

        // ---- left: lives + cash ----
        const left = document.createElement('div');
        left.className = 'hud-left';
        const lives = this._stat(_heartIcon(), 'hud-lives');
        const cash = this._stat(_emeraldIcon(), 'hud-cash');
        left.appendChild(lives.wrap);
        left.appendChild(cash.wrap);
        this._livesVal = lives.val;
        this._cashVal = cash.val;
        this._livesWrap = lives.wrap;
        this._cashWrap = cash.wrap;

        // ---- center: round + phase ----
        const center = document.createElement('div');
        center.className = 'hud-center';
        this._roundEl = document.createElement('div');
        this._roundEl.className = 'hud-round';
        this._phaseEl = document.createElement('div');
        this._phaseEl.className = 'hud-phase';
        center.appendChild(this._roundEl);
        center.appendChild(this._phaseEl);

        // ---- right: controls ----
        const right = document.createElement('div');
        right.className = 'hud-right';

        this._fpsEl = document.createElement('div');
        this._fpsEl.className = 'hud-fps';

        this._startBtn = document.createElement('button');
        this._startBtn.type = 'button';
        this._startBtn.className = 'mc-btn mc-btn-green mc-btn-small hud-start';
        this._startBtn.textContent = 'START ROUND';
        this._startBtn.addEventListener('click', () => {
            SFX.play('ui_click');
            // Route through the gate (records the START command); solo applies it
            // immediately, exactly as game.startRound() did.
            if (this.gate) this.gate.start();
            else this.game.startRound();
        });

        this._speedBtn = document.createElement('button');
        this._speedBtn.type = 'button';
        this._speedBtn.className = 'mc-btn mc-btn-small hud-speed';
        this._speedBtn.textContent = '1x';
        this._speedBtn.addEventListener('click', () => {
            SFX.play('ui_click');
            this.game.bus.emit('ui:speed', {});
        });

        this._pauseBtn = this._iconBtn(_pauseIcon(), 'hud-pause', () => {
            SFX.play('ui_click');
            this.game.bus.emit('ui:pause', {});
        });
        this._gearBtn = this._iconBtn(_gearIcon(), 'hud-gear', () => {
            SFX.play('ui_click');
            this.game.bus.emit('ui:settings', {});
        });
        this._fsBtn = this._iconBtn(_fullscreenIcon(), 'hud-fullscreen', () => {
            SFX.play('ui_click');
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
        });

        right.appendChild(this._fpsEl);
        right.appendChild(this._startBtn);
        right.appendChild(this._speedBtn);
        right.appendChild(this._pauseBtn);
        right.appendChild(this._fsBtn);
        right.appendChild(this._gearBtn);

        bar.appendChild(left);
        bar.appendChild(center);
        bar.appendChild(right);
        rootEl.appendChild(bar);
        this._bar = bar;

        // cached values for diffed writes
        this._cash = null;
        this._lives = null;
        this._roundKey = null;
        this._phaseKey = null;
        this._speedKey = null;
        this._startState = null;
        this._settings = Save.loadSettings();

        // flash animations on income / damage
        this._unsubs.push(game.bus.on('cash', () => this._pop(this._cashWrap)));
        this._unsubs.push(game.bus.on('lives', (p) => { if (p && p.delta < 0) this._pop(this._livesWrap, true); }));
        this._unsubs.push(uiBus.on('settings:changed', (cfg) => { if (cfg) this._settings = cfg; }));

        this.update();
    },

    unmount() {
        for (const u of this._unsubs || []) { try { u(); } catch (e) { /* ignore */ } }
        if (this._bar && this._bar.parentNode) this._bar.parentNode.removeChild(this._bar);
    },

    update() {
        const g = this.game;
        if (!g) return;
        const st = g.state;

        // MP prediction: preview the post-spend cash (sim value + pending delta).
        const cashShown = st.cash + (g._pendingCashDelta || 0);
        if (cashShown !== this._cash) {
            this._cash = cashShown;
            this._cashVal.textContent = formatCash(Math.max(0, cashShown));
        }
        if (st.lives !== this._lives) {
            this._lives = st.lives;
            this._livesVal.textContent = shortNum(Math.max(0, st.lives));
        }

        const shown = st.phase === 'combat' ? g.currentRound : st.round;
        const roundKey = shown + '/' + g.finalRound + '/' + (st.freeplay ? 1 : 0);
        if (roundKey !== this._roundKey) {
            this._roundKey = roundKey;
            this._roundEl.textContent = '';
            const lab = document.createElement('span');
            lab.className = 'hud-round-num';
            lab.textContent = 'Round ' + shown;
            const of = document.createElement('span');
            of.className = 'hud-round-of';
            of.textContent = ' / ' + g.finalRound;
            this._roundEl.appendChild(lab);
            this._roundEl.appendChild(of);
            if (st.freeplay) {
                const fp = document.createElement('span');
                fp.className = 'hud-freeplay';
                fp.textContent = 'FREEPLAY';
                this._roundEl.appendChild(fp);
            }
        }

        if (st.phase !== this._phaseKey) {
            this._phaseKey = st.phase;
            this._phaseEl.textContent = PHASE_LABEL[st.phase] || '';
            this._phaseEl.className = 'hud-phase hud-phase-' + st.phase;
        }

        const spd = st.speed >= 3 ? '3x' : '1x';
        if (spd !== this._speedKey) {
            this._speedKey = spd;
            this._speedBtn.textContent = spd;
            this._speedBtn.classList.toggle('is-fast', spd === '3x');
        }

        // Start button: live only when a round can begin.
        const canStart = st.phase === 'idle' || st.phase === 'won';
        const startState = canStart ? 'on' : 'off';
        if (startState !== this._startState) {
            this._startState = startState;
            this._startBtn.classList.toggle('disabled', !canStart);
            this._startBtn.classList.toggle('pulse', canStart);
        }

        // fps
        const now = _now();
        const dt = (now - this._fpsT) / 1000;
        this._fpsT = now;
        if (dt > 0 && dt < 0.5) this._fps += (1 / dt - this._fps) * 0.1;
        if (this._settings.showFps) {
            this._fpsEl.style.display = '';
            this._fpsEl.textContent = Math.round(this._fps) + ' fps';
        } else if (this._fpsEl.style.display !== 'none') {
            this._fpsEl.style.display = 'none';
        }
    },

    // ---- internals ----

    _stat(iconCanvas, cls) {
        const wrap = document.createElement('div');
        wrap.className = 'hud-stat ' + cls;
        iconCanvas.className = 'hud-stat-icon';
        const val = document.createElement('span');
        val.className = 'hud-stat-val';
        val.textContent = '0';
        wrap.appendChild(iconCanvas);
        wrap.appendChild(val);
        return { wrap, val };
    },

    _iconBtn(iconCanvas, cls, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mc-btn mc-btn-small hud-icon-btn ' + cls;
        iconCanvas.className = 'hud-btn-icon';
        b.appendChild(iconCanvas);
        b.addEventListener('click', onClick);
        return b;
    },

    _pop(el, bad) {
        if (!el) return;
        el.classList.remove('hud-pop', 'hud-pop-bad');
        // Force reflow so the CSS animation restarts on rapid repeats.
        void el.offsetWidth;
        el.classList.add(bad ? 'hud-pop-bad' : 'hud-pop');
    },
};

const PHASE_LABEL = {
    idle: 'Ready',
    combat: 'Combat',
    won: 'Victory',
    over: 'Defeat',
};
