// Synthesized sound effects. Owned by the orchestrator (sound design).
// Every sound is built from oscillators + filtered noise -- no samples.

import { AudioEngine } from './audio.js';

let noiseBuf = null;
let liveVoices = 0;
const MAX_VOICES = 26;
const lastPlayed = new Map();

function ctx() { return AudioEngine.ctx; }

function getNoise() {
    if (noiseBuf) return noiseBuf;
    const c = ctx();
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
}

/** Envelope helper: attack then exponential-ish decay, auto-disconnect. */
function envGain(out, t0, vol, a, dur) {
    const g = ctx().createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(out);
    return g;
}

function tone(out, t0, { type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.5, a = 0.005, detune = 0 }) {
    const o = ctx().createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    if (detune) o.detune.value = detune;
    const g = envGain(out, t0, vol, a, dur);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    liveVoices++;
    o.onended = () => { liveVoices--; };
    return o;
}

function noise(out, t0, { dur = 0.2, vol = 0.4, a = 0.003, type = 'lowpass', f0 = 1000, f1 = null, q = 0.8 }) {
    const src = ctx().createBufferSource();
    src.buffer = getNoise();
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const flt = ctx().createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f0, t0);
    if (f1 !== null) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    flt.Q.value = q;
    const g = envGain(out, t0, vol, a, dur);
    src.connect(flt);
    flt.connect(g);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    liveVoices++;
    src.onended = () => { liveVoices--; };
}

function arp(out, t0, freqs, step, dur, vol, type = 'triangle') {
    freqs.forEach((f, i) => tone(out, t0 + i * step, { type, f0: f, dur, vol }));
}

/* ---------------- the sound bank ---------------- */

const BANK = {
    ui_click: (o, t) => tone(o, t, { type: 'square', f0: 760, f1: 540, dur: 0.06, vol: 0.25 }),
    ui_hover: (o, t) => tone(o, t, { type: 'square', f0: 500, dur: 0.03, vol: 0.08 }),
    ui_open: (o, t) => { tone(o, t, { type: 'triangle', f0: 380, f1: 640, dur: 0.12, vol: 0.25 }); noise(o, t, { dur: 0.1, vol: 0.06, f0: 2000 }); },
    ui_close: (o, t) => { tone(o, t, { type: 'triangle', f0: 640, f1: 380, dur: 0.12, vol: 0.22 }); },
    ui_error: (o, t) => { tone(o, t, { type: 'square', f0: 190, dur: 0.09, vol: 0.25 }); tone(o, t + 0.09, { type: 'square', f0: 150, dur: 0.14, vol: 0.25 }); },
    place: (o, t) => { noise(o, t, { dur: 0.14, vol: 0.4, f0: 500, f1: 180 }); tone(o, t, { type: 'sine', f0: 150, f1: 90, dur: 0.13, vol: 0.4 }); },
    sell: (o, t) => { tone(o, t, { type: 'square', f0: 1180, dur: 0.07, vol: 0.2 }); tone(o, t + 0.07, { type: 'square', f0: 880, dur: 0.1, vol: 0.2 }); noise(o, t, { dur: 0.12, vol: 0.08, f0: 5000, type: 'highpass' }); },
    upgrade: (o, t) => { arp(o, t, [523, 700, 1046], 0.07, 0.14, 0.24); noise(o, t + 0.16, { dur: 0.16, vol: 0.08, f0: 6000, type: 'highpass' }); },
    hero_level: (o, t) => { arp(o, t, [392, 523, 659, 784], 0.09, 0.24, 0.24); tone(o, t + 0.36, { type: 'triangle', f0: 1046, dur: 0.4, vol: 0.2 }); },
    round_start: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 220, f1: 330, dur: 0.34, vol: 0.22 }); tone(o, t, { type: 'sawtooth', f0: 110, f1: 165, dur: 0.34, vol: 0.18 }); tone(o, t + 0.32, { type: 'sawtooth', f0: 330, dur: 0.22, vol: 0.2 }); },
    round_end: (o, t) => arp(o, t, [523, 659, 784], 0.08, 0.3, 0.2),
    life_lost: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 300, f1: 130, dur: 0.3, vol: 0.3 }); tone(o, t, { type: 'sine', f0: 80, f1: 50, dur: 0.3, vol: 0.4 }); },
    arrow: (o, t) => { noise(o, t, { dur: 0.09, vol: 0.22, type: 'bandpass', f0: 2400, f1: 900, q: 1.4 }); },
    bolt: (o, t) => { noise(o, t, { dur: 0.07, vol: 0.26, type: 'bandpass', f0: 3200, f1: 1200, q: 1.6 }); tone(o, t, { type: 'square', f0: 220, dur: 0.03, vol: 0.12 }); },
    cannon: (o, t) => { noise(o, t, { dur: 0.5, vol: 0.5, f0: 400, f1: 60 }); tone(o, t, { type: 'sine', f0: 90, f1: 40, dur: 0.4, vol: 0.55 }); },
    mortar: (o, t) => { noise(o, t, { dur: 0.4, vol: 0.4, f0: 300, f1: 50 }); tone(o, t, { type: 'sine', f0: 70, f1: 35, dur: 0.45, vol: 0.5 }); noise(o, t + 0.05, { dur: 0.3, vol: 0.1, type: 'bandpass', f0: 1200, f1: 2400, q: 3 }); },
    snowball: (o, t) => noise(o, t, { dur: 0.1, vol: 0.2, f0: 1400, f1: 500 }),
    freeze: (o, t) => { arp(o, t, [2093, 1760, 1396], 0.05, 0.18, 0.12, 'sine'); noise(o, t, { dur: 0.25, vol: 0.08, type: 'highpass', f0: 6000 }); },
    fire_whoosh: (o, t) => noise(o, t, { dur: 0.3, vol: 0.3, type: 'bandpass', f0: 700, f1: 200, q: 0.9 }),
    flame_tick: (o, t) => noise(o, t, { dur: 0.05, vol: 0.12, type: 'bandpass', f0: 1800, q: 2 }),
    laser: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 980, f1: 320, dur: 0.18, vol: 0.2 }); tone(o, t, { type: 'sine', f0: 1960, f1: 640, dur: 0.18, vol: 0.1 }); },
    zap: (o, t) => { tone(o, t, { type: 'square', f0: 420, f1: 280, dur: 0.07, vol: 0.2 }); noise(o, t, { dur: 0.06, vol: 0.15, type: 'highpass', f0: 3000 }); },
    chain_zap: (o, t) => { for (let i = 0; i < 3; i++) { tone(o, t + i * 0.05, { type: 'square', f0: 480 - i * 90, dur: 0.05, vol: 0.18 - i * 0.04 }); } noise(o, t, { dur: 0.14, vol: 0.14, type: 'highpass', f0: 2600 }); },
    splash_potion: (o, t) => { tone(o, t, { type: 'sine', f0: 2200, f1: 1400, dur: 0.05, vol: 0.16 }); noise(o, t + 0.03, { dur: 0.18, vol: 0.2, f0: 1200, f1: 400 }); },
    fang: (o, t) => { noise(o, t, { dur: 0.08, vol: 0.3, f0: 900, f1: 200 }); tone(o, t + 0.02, { type: 'square', f0: 150, dur: 0.06, vol: 0.2 }); },
    melee_swing: (o, t) => noise(o, t, { dur: 0.12, vol: 0.2, type: 'bandpass', f0: 1600, f1: 500, q: 1.2 }),
    melee_hit: (o, t) => { tone(o, t, { type: 'sine', f0: 160, f1: 80, dur: 0.09, vol: 0.4 }); noise(o, t, { dur: 0.08, vol: 0.2, f0: 800, f1: 300 }); },
    golem_slam: (o, t) => { tone(o, t, { type: 'sine', f0: 65, f1: 32, dur: 0.4, vol: 0.6 }); noise(o, t, { dur: 0.3, vol: 0.35, f0: 500, f1: 80 }); },
    wolf_bark: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 420, f1: 250, dur: 0.07, vol: 0.22 }); tone(o, t + 0.09, { type: 'sawtooth', f0: 380, f1: 220, dur: 0.07, vol: 0.2 }); },
    wolf_bite: (o, t) => { noise(o, t, { dur: 0.06, vol: 0.25, f0: 1200, f1: 400 }); tone(o, t, { type: 'square', f0: 180, dur: 0.05, vol: 0.16 }); },
    trident_throw: (o, t) => noise(o, t, { dur: 0.14, vol: 0.22, type: 'bandpass', f0: 2000, f1: 700, q: 1.2 }),
    trident_return: (o, t) => noise(o, t, { dur: 0.14, vol: 0.18, type: 'bandpass', f0: 700, f1: 2000, q: 1.2 }),
    harvest: (o, t) => { noise(o, t, { dur: 0.12, vol: 0.14, type: 'bandpass', f0: 900, q: 0.8 }); tone(o, t + 0.06, { type: 'triangle', f0: 660, dur: 0.08, vol: 0.14 }); },
    coin: (o, t) => { tone(o, t, { type: 'square', f0: 1568, dur: 0.06, vol: 0.15 }); tone(o, t + 0.06, { type: 'square', f0: 2093, dur: 0.16, vol: 0.15 }); },
    bank: (o, t) => { tone(o, t, { type: 'square', f0: 1046, dur: 0.05, vol: 0.14 }); tone(o, t + 0.05, { type: 'square', f0: 1568, dur: 0.07, vol: 0.14 }); tone(o, t + 0.1, { type: 'sine', f0: 120, dur: 0.1, vol: 0.25 }); },
    piston: (o, t) => { noise(o, t, { dur: 0.1, vol: 0.25, f0: 900, f1: 300 }); tone(o, t, { type: 'square', f0: 160, f1: 90, dur: 0.11, vol: 0.2 }); },
    spike: (o, t) => tone(o, t, { type: 'sawtooth', f0: 2800, f1: 1300, dur: 0.08, vol: 0.12 }),
    anvil_land: (o, t) => { tone(o, t, { type: 'square', f0: 820, f1: 780, dur: 0.25, vol: 0.2 }); tone(o, t, { type: 'square', f0: 1230, f1: 1180, dur: 0.16, vol: 0.12 }); tone(o, t, { type: 'sine', f0: 90, f1: 45, dur: 0.3, vol: 0.5 }); noise(o, t, { dur: 0.2, vol: 0.2, f0: 600, f1: 100 }); },
    ghast_shoot: (o, t) => { noise(o, t, { dur: 0.3, vol: 0.3, type: 'bandpass', f0: 500, f1: 150, q: 0.8 }); tone(o, t, { type: 'sawtooth', f0: 340, f1: 160, dur: 0.25, vol: 0.14 }); },
    crystal_hum: (o, t) => { tone(o, t, { type: 'sine', f0: 220, dur: 0.4, vol: 0.12 }); tone(o, t, { type: 'sine', f0: 331, dur: 0.4, vol: 0.08, detune: 8 }); },
    ability_ready: (o, t) => arp(o, t, [784, 1046], 0.08, 0.2, 0.16),
    ability_use: (o, t) => { arp(o, t, [392, 523, 784], 0.05, 0.2, 0.2, 'sawtooth'); noise(o, t, { dur: 0.3, vol: 0.1, type: 'highpass', f0: 4000 }); },
    mob_death_small: (o, t) => { tone(o, t, { type: 'sine', f0: 420, f1: 110, dur: 0.12, vol: 0.28 }); noise(o, t, { dur: 0.07, vol: 0.1, f0: 1500, f1: 500 }); },
    mob_death_medium: (o, t) => { tone(o, t, { type: 'sine', f0: 300, f1: 70, dur: 0.2, vol: 0.35 }); noise(o, t, { dur: 0.16, vol: 0.2, f0: 900, f1: 200 }); },
    mob_death_boss: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 110, f1: 40, dur: 0.7, vol: 0.4 }); noise(o, t, { dur: 0.6, vol: 0.4, f0: 700, f1: 60 }); tone(o, t, { type: 'sine', f0: 55, f1: 28, dur: 0.7, vol: 0.5 }); },
    mob_pop: (o, t) => tone(o, t, { type: 'sine', f0: 600, f1: 200, dur: 0.07, vol: 0.2 }),
    camo_reveal: (o, t) => arp(o, t, [880, 1174, 1568], 0.04, 0.12, 0.12, 'sine'),
    teleport: (o, t) => { tone(o, t, { type: 'sine', f0: 800, f1: 1600, dur: 0.12, vol: 0.18 }); tone(o, t, { type: 'sine', f0: 300, f1: 150, dur: 0.12, vol: 0.16 }); },
    wither_spawn: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 100, f1: 380, dur: 0.9, vol: 0.3 }); noise(o, t + 0.4, { dur: 0.5, vol: 0.25, f0: 300, f1: 1200 }); },
    dragon_roar: (o, t) => { tone(o, t, { type: 'sawtooth', f0: 95, f1: 60, dur: 0.8, vol: 0.4 }); tone(o, t, { type: 'sawtooth', f0: 142, f1: 88, dur: 0.8, vol: 0.3, detune: 14 }); noise(o, t, { dur: 0.7, vol: 0.3, type: 'bandpass', f0: 400, f1: 150, q: 0.7 }); },
    explosion_small: (o, t) => { noise(o, t, { dur: 0.3, vol: 0.4, f0: 900, f1: 100 }); tone(o, t, { type: 'sine', f0: 110, f1: 45, dur: 0.25, vol: 0.4 }); },
    explosion_medium: (o, t) => { noise(o, t, { dur: 0.5, vol: 0.5, f0: 700, f1: 70 }); tone(o, t, { type: 'sine', f0: 85, f1: 35, dur: 0.4, vol: 0.55 }); },
    explosion_large: (o, t) => { noise(o, t, { dur: 0.9, vol: 0.6, f0: 600, f1: 45 }); tone(o, t, { type: 'sine', f0: 65, f1: 26, dur: 0.8, vol: 0.65 }); noise(o, t + 0.15, { dur: 0.5, vol: 0.2, type: 'highpass', f0: 2000, f1: 400 }); },
    victory: (o, t) => { arp(o, t, [523, 659, 784, 1046, 1318], 0.12, 0.3, 0.22); tone(o, t + 0.6, { type: 'triangle', f0: 1046, dur: 0.7, vol: 0.2 }); tone(o, t + 0.6, { type: 'triangle', f0: 1318, dur: 0.7, vol: 0.16 }); },
    defeat: (o, t) => { arp(o, t, [392, 311, 261], 0.22, 0.5, 0.24, 'sawtooth'); tone(o, t + 0.66, { type: 'sine', f0: 130, f1: 65, dur: 0.9, vol: 0.3 }); },
    medal: (o, t) => arp(o, t, [1046, 1318, 1568, 2093], 0.06, 0.25, 0.16),
    achievement: (o, t) => { tone(o, t, { type: 'triangle', f0: 880, dur: 0.15, vol: 0.2 }); tone(o, t + 0.13, { type: 'triangle', f0: 1318, dur: 0.35, vol: 0.2 }); },
};

export const SFX = {
    play(name, opts = {}) {
        if (!AudioEngine.ready) return;
        const recipe = BANK[name];
        if (!recipe) { console.warn('[sfx] unknown:', name); return; }
        if (liveVoices > MAX_VOICES) return;
        const now = AudioEngine.ctx.currentTime;
        const last = lastPlayed.get(name) || 0;
        if (now - last < 0.035) return;
        lastPlayed.set(name, now);

        let out = AudioEngine.buses.sfx;
        if (opts.vol !== undefined || opts.pan !== undefined) {
            const g = AudioEngine.ctx.createGain();
            g.gain.value = opts.vol ?? 1;
            if (opts.pan !== undefined && AudioEngine.ctx.createStereoPanner) {
                const p = AudioEngine.ctx.createStereoPanner();
                p.pan.value = Math.max(-1, Math.min(1, opts.pan));
                g.connect(p);
                p.connect(AudioEngine.buses.sfx);
            } else {
                g.connect(AudioEngine.buses.sfx);
            }
            out = g;
        }
        try {
            recipe(out, now + 0.001);
        } catch (e) {
            console.warn('[sfx]', name, e);
        }
    },
};
