// Procedural music composer (C418-inspired ambient + boss percussion).
// Owned by the orchestrator. Tracks: menu | overworld | nether | end | boss.

import { AudioEngine } from './audio.js';
import { bus } from '../core/events.js';

const TRACKS = {
    menu:      { bpm: 66, root: 261.63, scale: [0, 2, 4, 7, 9], octaves: 2, density: 0.32, padEvery: 8, pad: true, dark: false, perc: false, vol: 0.9 },
    overworld: { bpm: 78, root: 293.66, scale: [0, 2, 4, 7, 9], octaves: 2, density: 0.42, padEvery: 8, pad: true, dark: false, perc: false, vol: 0.8 },
    nether:    { bpm: 70, root: 146.83, scale: [0, 3, 5, 6, 10], octaves: 1, density: 0.3, padEvery: 8, pad: true, dark: true, perc: false, vol: 0.85 },
    end:       { bpm: 58, root: 220.0, scale: [0, 2, 3, 7, 8], octaves: 2, density: 0.22, padEvery: 12, pad: true, dark: true, perc: false, vol: 0.8 },
    boss:      { bpm: 104, root: 174.61, scale: [0, 3, 5, 7, 10], octaves: 1, density: 0.5, padEvery: 4, pad: true, dark: true, perc: true, vol: 1.0 },
};

// Chord progressions as scale-degree roots (per 2 bars)
const PROG = [0, 3, 4, 2];

let current = null;      // { name, gain, timer, step, nextTime, rngState, wet, dry }
let pendingTrack = null;
let reverbNode = null;

function ctx() { return AudioEngine.ctx; }

function rng(state) {
    state.s ^= state.s << 13; state.s >>>= 0;
    state.s ^= state.s >> 17;
    state.s ^= state.s << 5; state.s >>>= 0;
    return state.s / 4294967296;
}

function getReverb() {
    if (reverbNode) return reverbNode;
    const c = ctx();
    const len = c.sampleRate * 2.4;
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
        }
    }
    reverbNode = c.createConvolver();
    reverbNode.buffer = buf;
    return reverbNode;
}

function noteFreq(track, degree, octave) {
    const t = TRACKS[track];
    const idx = ((degree % t.scale.length) + t.scale.length) % t.scale.length;
    const oct = octave + Math.floor(degree / t.scale.length);
    return t.root * Math.pow(2, (t.scale[idx] / 12)) * Math.pow(2, oct);
}

function pluck(out, when, freq, vol, dark) {
    const c = ctx();
    const o1 = c.createOscillator();
    o1.type = dark ? 'sine' : 'triangle';
    o1.frequency.value = freq;
    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq;
    o2.detune.value = 5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6);
    o1.connect(g); o2.connect(g);
    g.connect(out);
    o1.start(when); o1.stop(when + 1.7);
    o2.start(when); o2.stop(when + 1.7);
}

function pad(out, when, freqs, vol, dur) {
    const c = ctx();
    for (const f of freqs) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 10;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(vol / freqs.length, when + dur * 0.4);
        g.gain.linearRampToValueAtTime(0.0001, when + dur);
        o.connect(g);
        g.connect(out);
        o.start(when);
        o.stop(when + dur + 0.1);
    }
}

function kick(out, when) {
    const c = ctx();
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, when);
    o.frequency.exponentialRampToValueAtTime(38, when + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    o.connect(g); g.connect(out);
    o.start(when); o.stop(when + 0.25);
}

function hat(out, when, vol) {
    const c = ctx();
    const src = c.createBufferSource();
    const len = c.sampleRate * 0.06;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const flt = c.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = 7000;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(flt); flt.connect(g); g.connect(out);
    src.start(when);
}

function scheduleSteps(state) {
    const t = TRACKS[state.name];
    const stepDur = 60 / t.bpm / 2;   // 8th notes
    const c = ctx();
    while (state.nextTime < c.currentTime + 0.4) {
        const when = state.nextTime;
        const step = state.step;
        const bar = Math.floor(step / 8);
        const chordRoot = PROG[Math.floor(bar / 2) % PROG.length];

        // melody random walk on the pentatonic scale
        if (rng(state.rng) < t.density) {
            state.degree += Math.round((rng(state.rng) - 0.5) * 4);
            state.degree = Math.max(-2, Math.min(t.scale.length * t.octaves + 2, state.degree));
            const f = noteFreq(state.name, chordRoot + state.degree, 1);
            pluck(state.wet, when, f, 0.16 + rng(state.rng) * 0.06, t.dark);
            // occasional echo a fifth up
            if (rng(state.rng) < 0.18) {
                pluck(state.wet, when + stepDur, f * 1.5, 0.07, t.dark);
            }
        }
        // pad chord at bar starts
        if (t.pad && step % (8 * (t.padEvery / 4)) === 0) {
            const base = noteFreq(state.name, chordRoot, 0) / 2;
            pad(state.wet, when, [base, base * (t.dark ? 1.189 : 1.26), base * 1.498], 0.14, stepDur * t.padEvery * 2);
        }
        // bass at bar start
        if (step % 8 === 0) {
            pluck(state.dry, when, noteFreq(state.name, chordRoot, 0) / 2, 0.18, true);
        }
        // boss percussion
        if (t.perc) {
            if (step % 4 === 0) kick(state.dry, when);
            if (step % 2 === 1) hat(state.dry, when, 0.06);
            if (step % 8 === 6) kick(state.dry, when + stepDur * 0.5);
        }
        state.step++;
        state.nextTime += stepDur;
    }
}

function teardown(state, fadeSec) {
    const c = ctx();
    clearInterval(state.timer);
    state.gain.gain.setTargetAtTime(0.0001, c.currentTime, fadeSec / 3);
    setTimeout(() => {
        try { state.gain.disconnect(); } catch (e) { /* already gone */ }
    }, fadeSec * 1000 + 200);
}

export const Music = {
    get current() { return current ? current.name : null; },

    play(track) {
        if (!TRACKS[track]) return;
        if (!AudioEngine.ready) {
            pendingTrack = track;
            return;
        }
        if (current && current.name === track) return;
        const c = ctx();
        if (current) teardown(current, 1.8);

        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, c.currentTime);
        gain.gain.setTargetAtTime(TRACKS[track].vol, c.currentTime, 0.8);
        gain.connect(AudioEngine.buses.music);

        // wet (reverb) + dry sends
        const wet = c.createGain();
        wet.gain.value = 0.75;
        const rev = getReverb();
        wet.connect(rev);
        try { rev.disconnect(); } catch (e) { /* first connect */ }
        rev.connect(gain);
        const dryTap = c.createGain();
        dryTap.gain.value = 0.5;
        dryTap.connect(gain);

        const state = {
            name: track,
            gain,
            wet,
            dry: dryTap,
            step: 0,
            degree: 4,
            nextTime: c.currentTime + 0.1,
            rng: { s: (track.length * 2654435761) >>> 0 || 7 },
            timer: null,
        };
        state.timer = setInterval(() => {
            if (!AudioEngine.ready) return;
            scheduleSteps(state);
        }, 120);
        current = state;
    },

    stop() {
        if (current) {
            teardown(current, 1.2);
            current = null;
        }
        pendingTrack = null;
    },
};

bus.on('audio:ready', () => {
    if (pendingTrack) {
        const t = pendingTrack;
        pendingTrack = null;
        Music.play(t);
    }
});
