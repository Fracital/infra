// WebAudio engine: context + master/music/sfx buses. Owned by the orchestrator.
// init() must be called from a user gesture (main.js does this).

import { bus } from '../core/events.js';

let ctx = null;
let buses = null;
let currentSettings = { master: 0.8, music: 0.6, sfx: 0.9 };

export const AudioEngine = {
    init() {
        if (ctx) {
            if (ctx.state === 'suspended') ctx.resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        const master = ctx.createGain();
        master.connect(ctx.destination);
        const music = ctx.createGain();
        music.connect(master);
        const sfx = ctx.createGain();
        sfx.connect(master);
        buses = { master, music, sfx };
        this.ctx = ctx;
        this.buses = buses;
        this.applySettings(currentSettings);
        bus.emit('audio:ready', {});
    },

    get ready() {
        return !!ctx && ctx.state === 'running';
    },

    applySettings(settings) {
        currentSettings = {
            master: settings.master ?? currentSettings.master,
            music: settings.music ?? currentSettings.music,
            sfx: settings.sfx ?? currentSettings.sfx,
        };
        if (!buses) return;
        const t = ctx.currentTime;
        buses.master.gain.setTargetAtTime(currentSettings.master, t, 0.05);
        buses.music.gain.setTargetAtTime(currentSettings.music, t, 0.05);
        buses.sfx.gain.setTargetAtTime(currentSettings.sfx, t, 0.05);
    },

    ctx: null,
    buses: null,
};
