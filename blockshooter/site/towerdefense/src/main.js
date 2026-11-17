// Block Defense -- boot sequence.
// Owns: DOM scaffold wiring, asset bake progress, audio unlock, screen router kickoff.

import { bus } from './core/events.js';
import { VERSION } from './core/constants.js';
import { Save } from './core/save.js';
import { Input } from './core/input.js';
import { Renderer } from './engine/renderer.js';
import { Textures } from './gfx/textures.js';
import { MobSprites } from './gfx/mobsprites.js';
import { TowerSprites } from './gfx/towersprites.js';
import { Particles } from './gfx/particles.js';
import { AudioEngine } from './audio/audio.js';
import { Screens } from './ui/screens.js';

// Screen modules self-register with Screens on import.
import './ui/tooltips.js';
import './ui/mainmenu.js';
import './ui/mapselect.js';
import './ui/gamescreen.js';
import './ui/codex.js';
import './ui/achievementsui.js';
import './ui/mphub.js';
import './ui/mplobby.js';

const bootFill = document.getElementById('boot-fill');
const bootLabel = document.getElementById('boot-label');
const bootScreen = document.getElementById('boot-screen');

function setBoot(frac, label) {
    if (bootFill) bootFill.style.width = Math.round(frac * 100) + '%';
    if (label && bootLabel) bootLabel.textContent = label;
}

function nextFrame() {
    // rAF never fires in hidden/occluded tabs -- race a timer so boot cannot hang.
    return new Promise((r) => {
        requestAnimationFrame(r);
        setTimeout(r, 60);
    });
}

async function boot() {
    const canvas = document.getElementById('game-canvas');
    Renderer.init(canvas);
    Input.init(canvas, (cx, cy) => Renderer.screenToWorld(cx, cy));

    const settings = Save.loadSettings();
    Particles.setQuality(settings.particles);
    Renderer.setShakeEnabled(settings.shake);

    setBoot(0.04, 'Baking block textures...');
    await nextFrame();
    await Textures.bakeAll((f, label) => setBoot(0.04 + f * 0.45, label || 'Baking block textures...'));

    setBoot(0.55, 'Spawning mobs...');
    await nextFrame();
    MobSprites.bake();

    setBoot(0.78, 'Constructing towers...');
    await nextFrame();
    TowerSprites.bake();

    setBoot(0.96, 'Opening world...');
    await nextFrame();

    Screens.init(document.getElementById('screen-root'));
    Screens.show('menu');

    if (bootScreen) {
        bootScreen.classList.add('boot-done');
        setTimeout(() => bootScreen.remove(), 650);
    }
}

// WebAudio needs a user gesture: initialize lazily on first pointer down.
let audioUnlocked = false;
window.addEventListener('pointerdown', () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    AudioEngine.init();
    AudioEngine.applySettings(Save.loadSettings());
}, { capture: true });

bus.on('settings:changed', (settings) => {
    AudioEngine.applySettings(settings);
    Particles.setQuality(settings.particles);
    Renderer.setShakeEnabled(settings.shake);
});

// Debug/automation handle (also used by browser-driven testing).
window.BD = { bus, Screens, Save, version: VERSION };

boot().catch((err) => {
    console.error(err);
    const ov = document.getElementById('error-overlay');
    const tx = document.getElementById('error-text');
    if (ov && tx) {
        ov.hidden = false;
        tx.textContent += 'Boot failure: ' + (err && err.stack ? err.stack : err) + '\n';
    }
});
