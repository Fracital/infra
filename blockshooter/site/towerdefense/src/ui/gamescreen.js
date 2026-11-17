// The in-game screen: the complete play experience for one Game.
//
// Owns the canvas render loop, all in-world drawing (terrain, zones, entities,
// projectiles, effects, darkness, placement ghost), the DOM chrome hosts (HUD,
// shop, upgrade panel, ability bar, boss bar) and the composed overlays (pause,
// victory/defeat). Everything gameplay-related is requested from the sim; this
// file only *reacts* to the game bus and forwards its 'fx' stream to the visual
// and audio layers. The sim itself never touches the DOM or canvas.

import { Screens } from './screens.js';
import { HUD } from './hud.js';
import { Shop } from './shop.js';
import { UpgradePanel } from './upgradepanel.js';
import { AbilityBar } from './abilitybar.js';
import { PauseMenu } from './pausemenu.js';
import { EndScreens } from './endscreens.js';
import { toast } from './tooltips.js';
import { openSettings } from './settings.js';

import { bus as uiBus } from '../core/events.js';
import { GameLoop } from '../core/loop.js';
import { Save } from '../core/save.js';
import { Input } from '../core/input.js';
import { W, H } from '../core/constants.js';
import { TAU, clamp, dist2 } from '../core/mathutil.js';

import { Renderer } from '../engine/renderer.js';

import { Game } from '../sim/game.js';
import { MatchRunner } from '../sim/runner.js';
import { OP } from '../sim/commands.js';
import { MpMatch } from '../net/mpmatch.js';

import { PVP_SENDS } from '../data/pvpsends.js';
import { bakeTerrain } from '../gfx/terrain.js';
import { Particles } from '../gfx/particles.js';
import { Effects } from '../gfx/effects.js';
import { MobSprites, UnitSprites } from '../gfx/mobsprites.js';
import { TowerSprites } from '../gfx/towersprites.js';
import { drawZone } from '../gfx/zonesprites.js';
import { BIOMES, COLORS } from '../gfx/palette.js';

import { Music } from '../audio/music.js';
import { SFX } from '../audio/sfx.js';

import { MAPS } from '../data/maps/index.js';
import { TOWERS } from '../data/towers/index.js';
import { HEROES } from '../data/heroes/index.js';
import { ACHIEVEMENTS } from '../data/achievements.js';

// -------------------------------------------------------------- shared tables

const DMG_COLORS = {
    sharp: '#e8e8f0', blunt: '#d8b06a', explosive: '#ff8a3a', fire: '#ff6a2a',
    cold: '#8fd7ff', magic: '#c77bff', poison: '#7fe08a', true: '#ffffff',
};

// Rough dominant colour per mob for death-shard debris.
const MOB_COLORS = {
    silverfish: '#9a9aa8', zombie: '#3f9948', baby_zombie: '#3f9948', husk: '#b0a06a',
    zombie_villager: '#3f9948', skeleton: '#d8d8d0', stray: '#a9c4d2', spider: '#241e1c',
    cave_spider: '#1e3c3c', creeper: '#5fba3c', slime_big: '#56b34a', slime_med: '#56b34a',
    slime_small: '#56b34a', magma_cube_big: '#ff9a14', magma_cube_small: '#ff9a14',
    phantom: '#4a5a8c', blaze: '#e0b040', vex: '#c8d0e8', witch: '#4a3a5a', enderman: '#181418',
    pillager: '#4a4a52', vindicator: '#3a4a42', evoker: '#3a3a44', wither_skeleton: '#3a3a3e',
    ravager: '#6a6a72', elder_guardian: '#8a9a94', warden: '#0e3440', wither: '#1c1c22',
    ender_dragon: '#20202a',
};

function nowSec() {
    return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;
}

function R(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}

function hpColor(f) {
    const r = Math.round(227 + (94 - 227) * f);
    const g = Math.round(59 + (226 - 59) * f);
    const b = Math.round(46 + (74 - 46) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function resolveDef(idOrDef) {
    if (idOrDef && typeof idOrDef === 'object') return idOrDef;
    return TOWERS[idOrDef] || HEROES[idOrDef] || null;
}

function reasonText(reason) {
    switch (reason) {
        case 'path': return 'Too close to the path';
        case 'terrain': return 'Blocked terrain';
        case 'water': return 'Must build on land';
        case 'land': return 'Must build on water';
        case 'overlap': return 'Too close to another tower';
        case 'bounds': return 'Out of bounds';
        case 'hero': return 'Hero already placed';
        default: return 'Cannot build here';
    }
}

function zoneColor(z) {
    if (z.charges != null) return '#9aa0aa';                 // spike traps
    const dt = z.atk && z.atk.damageType;
    const st = z.atk && z.atk.status && z.atk.status.id;
    if (dt === 'fire' || dt === 'explosive') return '#ff7a2a';
    if (dt === 'poison') return '#5fd35f';
    if (dt === 'cold' || st === 'slow' || st === 'freeze') return '#bfe4ff';
    return z.color || '#c8c8c8';
}

// ------------------------------------------------------------- projectile art
// Each painter draws centred at (0,0) pointing along +x; the caller rotates.

function pArrow(ctx) {
    R(ctx, -9, -1, 15, 2, '#6a4a24');
    ctx.fillStyle = '#c8c8d0';
    ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(11, 0); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill();
    R(ctx, -9, -2.5, 3, 5, '#e8e8e0');
}
function pBolt(ctx) {
    R(ctx, -6, -1.4, 11, 3, '#3a3a44');
    ctx.fillStyle = '#b8c0cc';
    ctx.beginPath(); ctx.moveTo(5, -2.4); ctx.lineTo(9, 0); ctx.lineTo(5, 2.4); ctx.closePath(); ctx.fill();
}
function pSnowball(ctx) {
    ctx.fillStyle = '#eef7ff';
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
    R(ctx, -2.4, -2.4, 2, 2, '#ffffff');
}
function pTnt(ctx) {
    R(ctx, -5, -5, 10, 10, '#c8402a');
    R(ctx, -5, -1.6, 10, 3.4, '#e8e0d0');
    R(ctx, -1.4, -8, 1.4, 3, '#6a4a24');
    R(ctx, -1.8, -9.6, 2.4, 2.2, '#ffca28');
}
function pFireball(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,120,40,0.6)';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill();
}
function pTrident(ctx) {
    R(ctx, -10, -1, 16, 2, '#2ca89a');
    ctx.fillStyle = '#38c8b8';
    R(ctx, 6, -5, 1.8, 10, '#38c8b8');
    R(ctx, 5, -5, 5, 1.8, '#38c8b8');
    R(ctx, 5, 3.2, 5, 1.8, '#38c8b8');
    R(ctx, 9, -5, 1.8, 10, '#38c8b8');
}
function pPotion(ctx) {
    ctx.fillStyle = '#3a2c48';
    R(ctx, -3, -2, 6, 6, '#7fe08a');
    R(ctx, -2, -5, 4, 3, 'rgba(220,230,240,0.7)');
    R(ctx, -1.2, -6.4, 2.4, 1.6, '#8a8a8a');
}
function pAnvil(ctx) {
    R(ctx, -6, -4, 12, 3, '#3a3a40');
    R(ctx, -3, -1.4, 6, 3, '#4a4a52');
    R(ctx, -7, 2, 14, 3, '#54545c');
    R(ctx, -6, -4, 12, 1, '#6a6a74');
}
function pSpike(ctx) {
    ctx.fillStyle = '#c4ccd4';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -3); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill();
    R(ctx, -5, -1, 3, 2, '#8a9098');
}
function pOrb(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(160,90,255,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8d0ff';
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill();
}
function pLaser(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    R(ctx, -8, -1, 16, 2, '#ff5b5b');
    R(ctx, -8, -0.5, 16, 1, '#ffffff');
}

const PROJ_PAINT = {
    arrow: pArrow, bolt: pBolt, snowball: pSnowball, tnt: pTnt, fireball: pFireball,
    trident: pTrident, potion: pPotion, anvil: pAnvil, spike: pSpike, orb: pOrb, laser: pLaser,
};

function drawProjectile(ctx, p) {
    const painter = PROJ_PAINT[p.sprite] || pArrow;
    const lift = p.arcHeight || 0;
    if (p.shadow && lift > 2) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 6, 2.6, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
    }
    ctx.save();
    ctx.translate(p.x, p.y - lift);
    ctx.rotate(p.angle || 0);
    painter(ctx);
    ctx.restore();
}

// ------------------------------------------------------------------ unit art

function drawUnit(ctx, u) {
    const x = u.x, y = u.y;
    const face = Math.cos(u.angle || 0) < 0 ? -1 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    // baked ally sprites from the asset layer; inline rect art is the fallback
    const baked = UnitSprites.sprite(u.type, ((performance.now() / 170) | 0) % 2);
    if (baked) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(baked, -baked.width / 2, -baked.height / 2);
        ctx.restore();
        return;
    }
    const t = u.type;
    if (t === 'wolf' || t === 'dire_wolf' || t === 'frost_wolf') {
        const body = t === 'frost_wolf' ? '#bcd8ea' : (t === 'dire_wolf' ? '#5a5a62' : '#d8d4cc');
        const big = t === 'dire_wolf' ? 1.25 : 1;
        R(ctx, -8 * big, -8 * big, 14 * big, 8 * big, body);        // body
        R(ctx, 4 * big, -11 * big, 7 * big, 7 * big, body);        // head
        R(ctx, 4 * big, -13 * big, 2 * big, 3 * big, body);        // ear
        R(ctx, 9 * big, -13 * big, 2 * big, 3 * big, body);
        R(ctx, 6.6 * big, -9 * big, 1.6, 1.6, '#2a2a34');          // eye
        R(ctx, -8 * big, -1, 2.4, 5, '#000');                     // legs
        R(ctx, 3 * big, -1, 2.4, 5, '#000');
        R(ctx, -10 * big, -6 * big, 3 * big, 2, body);            // tail
    } else if (t === 'allay') {
        R(ctx, -3, -4, 6, 8, '#5aa0ff');
        R(ctx, -2, -6, 4, 3, '#8ac0ff');
        ctx.globalAlpha = 0.6;
        R(ctx, -8, -4, 5, 6, '#bfe4ff');
        R(ctx, 3, -4, 5, 6, '#bfe4ff');
        ctx.globalAlpha = 1;
    } else if (t === 'skeleton_squad') {
        R(ctx, -3, -6, 6, 8, '#c8c8c0');
        R(ctx, -3, -12, 6, 6, '#d8d8d0');
        R(ctx, -1.6, -10, 1.4, 1.4, '#2a2a2a');
        R(ctx, 0.6, -10, 1.4, 1.4, '#2a2a2a');
        R(ctx, -4, 0, 2, 4, '#b8b8b0');
        R(ctx, 2, 0, 2, 4, '#b8b8b0');
    } else if (t === 'raised_dead') {
        R(ctx, -3, -6, 6, 8, '#2a9db0');
        R(ctx, -3, -12, 6, 6, '#3f9948');
        R(ctx, -1.6, -10, 1.4, 1.4, '#122');
        R(ctx, 0.6, -10, 1.4, 1.4, '#122');
    } else if (t === 'auto_turret') {
        R(ctx, -6, -3, 12, 8, '#5a5a64');
        R(ctx, -6, -3, 12, 2, '#7a7a86');
        R(ctx, 2, -1.4, 10, 3, '#3a3a42');
        R(ctx, -4, -6, 8, 4, '#8a8a96');
    } else if (t === 'tnt_drone') {
        R(ctx, -5, -5, 10, 10, '#c8402a');
        R(ctx, -5, -1.6, 10, 3, '#e8e0d0');
        ctx.globalAlpha = 0.5;
        R(ctx, -10, -6, 6, 2, '#8a8a96');
        R(ctx, 4, -6, 6, 2, '#8a8a96');
        ctx.globalAlpha = 1;
    } else {
        R(ctx, -4, -5, 8, 8, '#b0b0bc');
    }
    ctx.restore();
}

// =========================================================== screen lifecycle

let s = null;   // the active session (only one game is ever mounted at a time)

function pickMapDef(params) {
    let snapshot = null;
    if (params && params.resume) {
        try { snapshot = Save.loadRun(); } catch (e) { snapshot = null; }
    }
    let mapId = snapshot ? snapshot.mapId : (params && params.mapId);
    let def = MAPS[mapId];
    // A stub/empty map (or a missing id) would crash the sim on first spawn --
    // fall back to the reference map so the screen always launches cleanly.
    if (!def || !Array.isArray(def.paths) || def.paths.length === 0) {
        def = MAPS.plains_creek || MAPS[Object.keys(MAPS)[0]];
        snapshot = null;
    }
    return { def, snapshot };
}

function resolveMapDef(mapId) {
    let def = MAPS[mapId];
    if (!def || !Array.isArray(def.paths) || def.paths.length === 0) {
        def = MAPS.plains_creek || MAPS[Object.keys(MAPS)[0]];
    }
    return def;
}

function mount(rootEl, params) {
    params = params || {};

    const mpCtx = params.mp || null;         // matchCtx {client, matchStart, code, makeClient}
    const dailyCtx = params.daily || null;   // {descriptor} or the descriptor itself

    // ---- resolve the sim context by mode ----
    let mode = 'solo';
    let match = null;
    let runner = null;
    let game = null;
    let mapDef = null;
    let snapshot = null;
    let resumedFromSnapshot = false;
    let difficulty = params.difficulty || 'medium';
    let seed = params.seed;
    let modeFlags = params.modeFlags || null;
    let mySlot = -1;
    let spectator = false;
    let pvp = false;
    let daily = null;

    if (mpCtx) {
        mode = 'mp';
        match = new MpMatch({
            client: mpCtx.client,
            matchStart: mpCtx.matchStart,
            code: mpCtx.code,
            makeClient: mpCtx.makeClient || null,
            hooks: makeMpHooks(),
        });
        mySlot = match.mySlot;
        spectator = match.isSpectator;
        pvp = match.isPvp;
        difficulty = match.difficulty;
        modeFlags = match.modeFlags;
        seed = match.seed;
        mapDef = resolveMapDef(match.mapId);
        game = match.game;   // null for pvp until the async core loads
    } else if (dailyCtx) {
        mode = 'daily';
        daily = dailyCtx.descriptor || dailyCtx;
        difficulty = daily.difficulty || 'medium';
        modeFlags = daily.modeFlags || {};
        seed = daily.seed;
        mapDef = resolveMapDef(daily.mapId);
        runner = new MatchRunner({ mapDef, difficulty, seed, modeFlags });
        game = runner.game;
    } else {
        const picked = pickMapDef(params);
        mapDef = picked.def;
        snapshot = picked.snapshot;
        resumedFromSnapshot = !!snapshot;
        runner = new MatchRunner({ mapDef, difficulty, seed, modeFlags });
        if (snapshot) runner.game = Game.restore(snapshot, mapDef);
        game = runner.game;
    }

    const biome = BIOMES[mapDef.biome] || null;

    s = {
        game,                 // may be null briefly for pvp until the core loads
        runner,               // null in mp
        mp: match,            // MpMatch or null
        mode,
        mySlot,
        spectator,
        pvp,
        daily,
        resumedFromSnapshot,
        gate: match ? (spectator ? makeNullGate() : wrapPredictiveGate(match.gate)) : makeSoloGate(runner),
        mapDef,
        mapId: mapDef.id,
        difficulty,
        seed,
        modeFlags: modeFlags || {},
        terrain: null,
        biome,
        root: rootEl,
        loop: null,
        paused: false,
        alive: true,
        placing: null,
        placeArmed: false,
        mouseWorld: { x: W / 2, y: H / 2 },
        mouseInField: false,
        zoneRings: new Map(),   // Zone instance -> Effects.zoneRing handle
        portalPhase: 0,
        darkness: { sig: '', canvas: null },
        settings: Save.loadSettings(),
        profile: Save.loadProfile(),
        prevCash: game ? game.state.cash : 0,
        unsubs: [],
        els: {},
        _autoTimer: 0,
        _finished: false,       // guards a single run:finished emission
        _lastRoomState: null,
        mpUi: null,
        pvpPanel: null,
    };

    // ---- DOM chrome ----
    const wrap = document.createElement('div');
    wrap.className = 'gs-root';
    if (match) wrap.classList.add('gs-mp');
    if (spectator) wrap.classList.add('gs-spectator');
    if (pvp) wrap.classList.add('gs-pvp');

    const field = document.createElement('div');
    field.className = 'gs-field';
    wrap.appendChild(field);

    const hudHost = document.createElement('div');
    hudHost.className = 'gs-hud';
    wrap.appendChild(hudHost);

    const shopHost = document.createElement('aside');
    shopHost.className = 'gs-shop';
    wrap.appendChild(shopHost);

    const panelHost = document.createElement('div');
    panelHost.className = 'gs-upgrade';
    wrap.appendChild(panelHost);

    const abilityHost = document.createElement('div');
    abilityHost.className = 'gs-ability';
    wrap.appendChild(abilityHost);

    const boss = document.createElement('div');
    boss.className = 'gs-bossbar';
    boss.innerHTML = '<div class="gs-bossbar-name"></div>' +
        '<div class="gs-bossbar-track"><div class="gs-bossbar-fill"></div></div>';
    wrap.appendChild(boss);

    // Right rail host for the PVP send panel / opponent view (owned by B2).
    const railHost = document.createElement('div');
    railHost.className = 'gs-rail';
    wrap.appendChild(railHost);

    const pauseHost = document.createElement('div');
    pauseHost.className = 'gs-modal-host';
    wrap.appendChild(pauseHost);

    const endHost = document.createElement('div');
    endHost.className = 'gs-modal-host';
    wrap.appendChild(endHost);

    rootEl.appendChild(wrap);

    s.els = {
        wrap, field, hudHost, shopHost, panelHost, abilityHost,
        railHost, endHost, pauseHost,
        boss,
        bossName: boss.querySelector('.gs-bossbar-name'),
        bossFill: boss.querySelector('.gs-bossbar-fill'),
    };

    // ---- MP overlay chrome (connection pill, ready button, chat, veil...) ----
    if (match) buildMpOverlay();

    // ---- ambient/audio ----
    Particles.clear();
    Effects.clear();
    Particles.setAmbient(biome ? biome.ambient : null);
    Music.play(mapDef.music || (biome && biome.music) || 'overworld');

    // ---- input (DOM-level; not sim-dependent) ----
    field.addEventListener('pointermove', onFieldMove);
    field.addEventListener('pointerdown', onFieldDown);
    field.addEventListener('pointerleave', onFieldLeave);
    field.addEventListener('contextmenu', onFieldContext);
    // Drag-back cancel: re-entering the shop with an ARMED placement returns
    // the tower to the menu. (pointerover bubbles; pointerenter does not.)
    shopHost.addEventListener('pointerover', () => {
        if (s && s.placing && s.placeArmed) {
            cancelPlacing();
            SFX.play('ui_close', { vol: 0.5 });
        }
    });
    s._fieldEl = field;
    s.unsubs.push(Input.on('key', onKey));
    s.unsubs.push(uiBus.on('settings:changed', (cfg) => { if (cfg) s.settings = cfg; }));

    if (!window.BD) window.BD = {};

    // The sim-dependent setup needs a game. Co-op/solo/daily have one now; pvp's
    // core loads asynchronously, so finish once MpMatch.whenReady() resolves.
    if (game) {
        finishSim(game);
    } else {
        mpSetVeil(true, 0, 'Connecting');
        match.whenReady().then(() => {
            if (!s || !s.alive || s.mp !== match) return;
            const g = match.game;
            if (!g) { try { toast('Could not start the match'); } catch (e) { /* ignore */ } Screens.show('menu'); return; }
            s.game = g;
            s.prevCash = g.state.cash;
            finishSim(g);
            mpSetVeil(false);
        });
    }
}

// Sim-dependent setup: bake terrain, mount sub-modules, wire the game bus, and
// start the render loop. Split out of mount so the pvp path can defer it until
// its async core is ready.
function finishSim(game) {
    const baked = bakeTerrain(s.mapDef);
    s.terrain = baked.canvas;
    s.bakedMask = baked.mask;

    wireSubModules(game);

    // Count a fresh solo/daily game as played (resume + MP keep the tally as-is).
    if (!s.mp && !s.resumedFromSnapshot) {
        s.profile.stats.gamesPlayed = (s.profile.stats.gamesPlayed || 0) + 1;
        Save.saveProfile(s.profile);
    }

    s.loop = new GameLoop({ update: onLoopUpdate, render: () => render() });
    // In MP the server owns the clock (chased in render via MpMatch.update); the
    // local loop stays at 1x. Solo/daily keep the local 1x/3x speed control.
    s.loop.setSpeed(!s.mp && game.state.speed >= 3 ? 3 : 1);
    render();          // paint one frame immediately so there's no blank flash
    s.loop.start();
}

// Bind the DOM sub-modules + game bus to a given game. Called once at start and
// again after an MP resync swaps in a freshly-replayed game object.
function wireSubModules(game) {
    game.mask = s.bakedMask;

    HUD.mount(s.els.hudHost, game, s.gate);
    Shop.mount(s.els.shopHost, game, { onSelect: (id) => startPlacing(id) });
    UpgradePanel.mount(s.els.panelHost, game, s.gate);
    AbilityBar.mount(s.els.abilityHost, game, s.gate);
    PauseMenu.mount(s.els.pauseHost, {
        game,
        onResume: () => resume(),
        onRestart: () => onEndRestart(),
        onQuit: () => onEndQuit(),
    });
    EndScreens.mount(s.els.endHost, game, {
        mp: !!s.mp,
        pvp: s.pvp,
        mySlot: s.mySlot,
        onContinueFreeplay: () => continueFreeplay(),
        onRestart: () => onEndRestart(),
        onBackToLobby: () => onBackToLobby(),
        onQuit: () => onEndQuit(),
    });

    wireGameBus(game);

    // PVP right rail (send panel + opponent mini-board) is owned by B2.
    if (s.pvp && s.mp) mountPvpPanel();

    window.BD.game = game;
    window.BD.cheat = makeCheats(game);
}

// The fixed-step update callback. Solo/daily advance the local sim one tick per
// step; MP advances via MpMatch.update() inside render() (server-clock chase),
// so here it only pumps visual layers.
function onLoopUpdate(dt) {
    if (!s) return;
    if (!s.mp && s.runner) s.runner.stepTo(s.runner.game.tick + 1);
    Particles.update(dt);
    Effects.update(dt);
    if (s.oppParticles) s.oppParticles.update(dt);
    if (s.oppEffects) s.oppEffects.update(dt);
    if (!s.mp && s._autoPending) fireAutoStart();
}

function unmount() {
    if (!s) return;
    s.alive = false;
    if (s.loop) s.loop.stop();

    const f = s._fieldEl;
    if (f) {
        f.removeEventListener('pointermove', onFieldMove);
        f.removeEventListener('pointerdown', onFieldDown);
        f.removeEventListener('pointerleave', onFieldLeave);
        f.removeEventListener('contextmenu', onFieldContext);
    }
    for (const u of s.unsubs) { try { u(); } catch (e) { /* ignore */ } }

    // Kill any live zone rings, then let sub-modules tear down.
    for (const handle of s.zoneRings.values()) { try { handle.kill(); } catch (e) { /* ignore */ } }
    s.zoneRings.clear();
    if (s.pvpPanel) unmountPvpPanel();
    for (const mod of [HUD, Shop, UpgradePanel, AbilityBar, PauseMenu, EndScreens]) {
        if (mod && typeof mod.unmount === 'function') { try { mod.unmount(); } catch (e) { /* ignore */ } }
    }

    // MP: detach the driver. Close the socket unless we handed it back to a lobby
    // (rematch flow keeps the persistent client alive).
    if (s.mp) {
        try { s.mp.dispose(); } catch (e) { /* ignore */ }
        if (!s._mpHandoff) { try { s.mp.closeClient(); } catch (e) { /* ignore */ } }
    }

    Particles.setAmbient(null);
    Particles.clear();
    Effects.clear();

    if (s.els.wrap && s.els.wrap.parentNode) s.els.wrap.parentNode.removeChild(s.els.wrap);
    if (window.BD) { window.BD.game = null; window.BD.cheat = null; }
    s = null;
}

// ---------------------------------------------------------------- game bus

function wireGameBus(game) {
    const on = (name, fn) => s.unsubs.push(game.bus.on(name, fn));

    on('fx', (e) => handleFx(e));

    // Prediction reconcile: a confirmed command clears its pending twin.
    if (s.mp && !s.spectator) {
        on('tower:place', (p) => pendingRemove((en) => en.kind === 'place' && en.towerId === p.tower.def.id && Math.abs(en.x - p.tower.x) < 1 && Math.abs(en.y - p.tower.y) < 1));
        on('tower:upgrade', (p) => pendingRemove((en) => en.kind === 'upgrade' && en.uid === p.tower.uid && en.path === p.path));
        on('tower:sell', (p) => pendingRemove((en) => en.kind === 'sell' && en.uid === p.tower.uid));
        on('ability:used', (p) => pendingRemove((en) => en.kind === 'ability' && en.key === (p.tower.uid + ':' + p.ability.id)));
        on('hero:level', (p) => pendingRemove((en) => en.kind === 'herolvl' && en.uid === p.tower.uid));
    }

    on('mob:death', () => bumpStat('kills', 1));
    on('cash', (p) => {
        const delta = p.cash - s.prevCash;
        s.prevCash = p.cash;
        if (delta > 0) bumpStat('cashEarned', delta);
    });
    on('tower:place', () => bumpStat('towersPlaced', 1));
    on('tower:upgrade', () => bumpStat('upgradesBought', 1));
    on('ability:used', (p) => {
        bumpStat('abilitiesUsed', 1);
        // universal cast flourish so every ability visibly "goes off"
        if (p && p.tower) {
            Effects.shockwave(p.tower.x, p.tower.y, 95, { color: '#ffd24a' });
            Particles.spawn('magic', p.tower.x, p.tower.y, { count: 16 });
            Renderer.flash('#fff6d0', 0.06);
        }
    });

    // Dense autosave: purchases survive a mid-round refresh (resume restarts
    // the in-progress round with everything you own, BTD6-style). The
    // snapshot is tiny, so saving per action is free. NEVER in MP -- the shared
    // multiplayer state is not a resumable solo run and must not clobber bd_run.
    const saveNow = () => {
        if (s.mp) return;
        if (game.state.phase === 'over') return;
        try { Save.saveRun(game.snapshot()); } catch (e) { /* best-effort */ }
    };
    on('tower:place', saveNow);
    on('tower:upgrade', saveNow);
    on('tower:sell', saveNow);

    on('round:start', (p) => { setStatMax('highestRound', p.round); saveNow(); });
    on('round:end', (p) => {
        bumpStat('roundsCleared', 1);
        setStatMax('highestRound', p.round);
        if (!s.mp) {
            try { Save.saveRun(game.snapshot()); } catch (e) { /* best-effort */ }
            Save.saveProfile(s.profile);
            if (s.settings.autoStart) scheduleAutoStart();
        }
    });

    on('game:won', (p) => {
        if (!s.mp) {
            const key = s.mapId + ':' + s.difficulty;
            s.profile.medals[key] = true;
            bumpStat('wins', 1);
            Save.saveProfile(s.profile);
            SFX.play('medal');
        }
        // present the end screen clean: no selection, no pending placement
        s.game.selectTower(null);
        cancelPlacing();
        emitRunFinished(true, p ? p.round : game.state.round);
    });
    on('game:over', (p) => {
        if (!s.mp) {
            try { Save.clearRun(); } catch (e) { /* ignore */ }
            Save.saveProfile(s.profile);
        }
        s.game.selectTower(null);
        cancelPlacing();
        emitRunFinished(false, p ? p.round : game.currentRound);
    });

    // HUD control routing (hud.js emits these on the game bus). In MP pause and
    // speed are VOTES (server-authoritative); solo/daily toggle locally.
    on('ui:pause', () => { if (s.mp) s.mp.votePause(!s.mp.paused); else togglePause(); });
    on('ui:speed', () => { if (s.mp) s.mp.voteSpeed(s.mp.speed >= 3 ? 1 : 3); else toggleSpeed(); });
    on('ui:settings', () => openSettings(s.root));
}

// Emit the global 'run:finished' bus event that B3 listens for to submit solo /
// daily results (B1 never touches the HTTP API). Fires exactly once per run.
function emitRunFinished(victory, round) {
    if (!s || s._finished) return;
    if (s.mp) return;                                  // MP end is server-driven
    if (s.mode !== 'solo' && s.mode !== 'daily') return;
    s._finished = true;
    const g = s.game;
    uiBus.emit('run:finished', {
        mode: s.mode,                                  // 'solo' | 'daily'
        mapId: s.mapId,
        difficulty: s.difficulty,
        seed: g.seed,
        modeFlags: s.modeFlags || {},
        round: round | 0,
        victory: !!victory,
        livesLeft: Math.max(0, g.state.lives | 0),
        ticks: g.tick | 0,
        log: s.runner ? s.runner.serializeLog() : '[]',
        resumedFromSnapshot: !!s.resumedFromSnapshot,
    });
}

function scheduleAutoStart() {
    // Immediate (BTD6-style): the flag is consumed by the game loop on the
    // very next update tick after game.update() returns -- no timers (which
    // browsers throttle) and no re-entry into the sim tick that ended the round.
    s._autoPending = true;
}

function fireAutoStart() {
    if (!s || !s.alive || !s._autoPending) return;
    if (s.paused) return;   // stays pending; resume()/the loop re-fires it
    if (s.game.state.phase === 'idle') {
        s._autoPending = false;
        s.gate.start();
    }
}

// ------------------------------------------------------------------ fx sink

function handleFx(e, P = Particles, E = Effects, remote = false) {
    switch (e.type) {
        case 'explosion': {
            const r = e.r || 40;
            P.spawn('blockShards', e.x, e.y, { count: clamp(Math.round(r * 0.35), 6, 26), color: '#8a6a3a' });
            P.spawn('flame', e.x, e.y, { count: clamp(Math.round(r * 0.28), 5, 20) });
            P.spawn('smoke', e.x, e.y, { count: clamp(Math.round(r * 0.18), 3, 12) });
            E.shockwave(e.x, e.y, r, { color: e.style === 'lava' ? '#ff8a3a' : '#ffd39b', ring2: true });
            if (!remote) Renderer.shake(clamp(r / 260, 0.05, 0.5));
            if (!remote) SFX.play(r >= 90 ? 'explosion_large' : (r >= 55 ? 'explosion_medium' : 'explosion_small'));
            break;
        }
        case 'hit': {
            const col = DMG_COLORS[e.damageType] || '#ffd66b';
            P.spawn('spark', e.x, e.y, { count: 4, color: col });
            if (e.damageType === 'blunt' || e.damageType === 'explosive') {
                P.spawn('blockShards', e.x, e.y, { count: 3, color: col });
            }
            break;
        }
        case 'death': {
            const m = e.mob;
            const col = MOB_COLORS[m.id] || '#9a9aa8';
            const big = m.def && m.def.flags && m.def.flags.boss;
            P.spawn('blockShards', m.x, m.y, { count: big ? 20 : 8, color: col });
            if (!remote) SFX.play('mob_pop');
            break;
        }
        case 'text': {
            const isCash = typeof e.str === 'string' && e.str.indexOf('$') >= 0;
            if (isCash || s.settings.damageNumbers) P.text(e.x, e.y, e.str, { color: e.color });
            break;
        }
        case 'beam': E.beam(e.x1, e.y1, e.x2, e.y2, e.style); break;
        case 'lightning': E.lightning(e.points, { color: '#bfe4ff', width: 3 }); break;
        case 'shockwave': E.shockwave(e.x, e.y, e.r, { color: '#ffffff', ring2: true }); break;
        case 'splash': P.spawn('splashPotion', e.x, e.y, { color: e.color }); break;
        case 'teleport': {
            P.spawn('magic', e.x1, e.y1, { count: 10, color: '#c77bff' });
            P.spawn('portal', e.x2, e.y2, { count: 12 });
            E.shockwave(e.x2, e.y2, 26, { color: '#c77bff' });
            break;
        }
        case 'shake': if (!remote) Renderer.shake(e.power); break;
        case 'flash': if (!remote) Renderer.flash(e.color, e.alpha); break;
        case 'sfx': if (!remote) SFX.play(e.name, e.opts); break;
        default:
            // Raw particle passthrough (blockShards, spark, coin, emerald, crit, ...).
            P.spawn(e.type, e.x, e.y, e.opts || {});
            break;
    }
}

// ------------------------------------------------------------ stats + medals

function bumpStat(name, delta) {
    const st = s.profile.stats;
    st[name] = (st[name] || 0) + delta;
    checkAchievements();
}

function setStatMax(name, val) {
    const st = s.profile.stats;
    if (val > (st[name] || 0)) { st[name] = val; checkAchievements(); }
}

function checkAchievements() {
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
        const a = ACHIEVEMENTS[i];
        if (s.profile.achievements[a.id]) continue;
        let ok = false;
        try { ok = !!a.check(s.profile); } catch (e) { ok = false; }
        if (!ok) continue;
        s.profile.achievements[a.id] = true;
        Save.saveProfile(s.profile);
        try { toast(a.name, a.icon); } catch (e) { /* ignore */ }
        SFX.play('achievement');
        uiBus.emit('achievement:unlocked', { def: a });
    }
}

// ------------------------------------------------------------- command gate

// The single mutation choke point for gamescreen + its sub-panels. In solo it
// wraps MatchRunner.applyNow (immediate application + log recording), so every
// gameplay action is applied exactly as before AND recorded for replay. In MP
// (owner B1) this object is replaced by one that round-trips through the server.
// selectTower stays local -- it is per-player UI state, not a command.
function makeSoloGate(runner) {
    const SLOT = -1;   // solo / ownership bypass
    return {
        place: (towerId, x, y) => runner.applyNow(SLOT, {
            op: OP.PLACE, towerId, qx: Math.round(x * 4), qy: Math.round(y * 4), slot: SLOT,
        }),
        upgrade: (uid, path) => runner.applyNow(SLOT, { op: OP.UPGRADE, uid, path }),
        sell: (uid) => runner.applyNow(SLOT, { op: OP.SELL, uid }),
        target: (uid, mode) => runner.applyNow(SLOT, { op: OP.TARGET, uid, mode }),
        heroLvl: (uid) => runner.applyNow(SLOT, { op: OP.HEROLVL, uid }),
        ability: (key) => runner.applyNow(SLOT, { op: OP.ABILITY, key }),
        point: (uid, x, y) => runner.applyNow(SLOT, {
            op: OP.POINT, uid, qx: Math.round(x * 4), qy: Math.round(y * 4),
        }),
        start: () => runner.applyNow(SLOT, { op: OP.START }),
    };
}

// Spectator gate: every mutation is a no-op (spectators cannot affect the sim).
function makeNullGate() {
    const nope = () => ({ ok: false, reason: 'spectator' });
    return {
        place: nope, upgrade: nope, sell: nope, target: nope,
        heroLvl: nope, ability: nope, point: nope, start: nope,
    };
}

// ------------------------------------------------------------- interactions

function startPlacing(id) {
    if (!s) return;
    s.placing = id;
    s.placeArmed = false;   // arms on first field move; see onFieldMove
    s.game.selectTower(null);
    if (Shop.setPlacing) Shop.setPlacing(id);
    SFX.play('ui_click');
}

function cancelPlacing() {
    if (s) s.placing = null;
    if (Shop.setPlacing) Shop.setPlacing(null);
}

function modalOpen() {
    return typeof document !== 'undefined' && !!document.querySelector('.mc-overlay.is-open');
}

function onFieldMove(e) {
    if (!s) return;
    let w = Renderer.screenToWorld(e.clientX, e.clientY);
    if (s.pvp) {
        // Split-screen: only MY board (left half) is a build surface.
        const m = pvpMapPoint(w.x, w.y);
        if (!m) { s.mouseInField = false; return; }
        w = m;
    }
    s.mouseWorld.x = w.x;
    s.mouseWorld.y = w.y;
    s.mouseInField = true;
    // MP: relay our cursor to peers (throttled inside the driver; co-op only --
    // Battles boards are separate worlds, a shared cursor means nothing there).
    if (s.mp && !s.spectator && !s.pvp) s.mp.sendCursor(w.x, w.y);
    // Placement began with the cursor over the shop card; the first move over
    // the field proves it left the menu. Only then does hovering the shop
    // again mean "put it back" (BTD6 drag-back cancel) -- geometric edge
    // trigger, no grace timers.
    if (s.placing && !s.placeArmed) s.placeArmed = true;
}

function onFieldLeave() {
    if (s) s.mouseInField = false;
}

function onFieldContext(e) {
    e.preventDefault();
    cancelPlacing();
}

function onFieldDown(e) {
    if (!s || s.paused || modalOpen()) return;
    let w = Renderer.screenToWorld(e.clientX, e.clientY);
    if (s.pvp) {
        const m = pvpMapPoint(w.x, w.y);
        if (!m) {
            // Clicking outside my board: plain deselect, never a placement.
            if (e.button === 0 && !s.placing) s.game.selectTower(null);
            return;
        }
        w = m;
    }
    if (e.button === 2) { cancelPlacing(); return; }
    if (e.button !== 0) return;

    if (s.placing) { tryPlace(w.x, w.y); return; }

    const t = pickTower(w.x, w.y);
    if (t) {
        s.game.selectTower(t);
        return;
    }
    // Empty-ground click: retarget a mortar tower, else deselect. The retarget is
    // a sim-affecting mutation, so it goes through the gate (OP.POINT) in ALL
    // modes -- solo applies it immediately; MP round-trips it (Appendix W item 1).
    const sel = s.game.selectedTower;
    if (sel && sel.def && sel.def.id === 'anvil_catapult' &&
        (!s.mp || sel.ownerSlot === s.mySlot)) {
        s.gate.point(sel.uid, w.x, w.y);
    } else {
        s.game.selectTower(null);
    }
}

function tryPlace(x, y) {
    const res = s.gate.place(s.placing, x, y);
    if (res.ok) {
        if (!Input.isDown('ShiftLeft') && !Input.isDown('ShiftRight')) {
            s.placing = null;
            if (Shop.setPlacing) Shop.setPlacing(null);
        }
    } else {
        SFX.play('ui_error', { vol: 0.5 });
    }
}

function pickTower(x, y) {
    let best = null;
    let bestD = Infinity;
    const towers = s.game.towers;
    for (let i = 0; i < towers.length; i++) {
        const t = towers[i];
        const r = (t.def.footprint || 18) + 8;
        const d = dist2(x, y, t.x, t.y);
        if (d <= r * r && d < bestD) { bestD = d; best = t; }
    }
    return best;
}

function onKey(p) {
    if (!s) return;
    const code = p.code;

    // MP chat input owns the keyboard while focused: only Escape (blur) matters;
    // Enter is handled by the input itself.
    if (s.mp && mpChatFocused()) {
        if (code === 'Escape') mpBlurChat();
        return;
    }
    if (s.paused) {
        if (code === 'Escape') resume();
        return;
    }
    if (modalOpen()) return;   // end screen up; ignore gameplay keys

    // MP: Enter opens the chat overlay.
    if (s.mp && code === 'Enter') { mpFocusChat(); return; }

    if (code === 'Space') {
        const phase = s.game ? s.game.state.phase : 'idle';
        if (s.mp) {
            // Idle/won -> ready toggle (server-authoritative START); combat -> speed vote.
            if (phase === 'idle' || phase === 'won') s.gate.start();
            else s.mp.voteSpeed(s.mp.speed >= 3 ? 1 : 3);
        } else {
            if (phase === 'idle' || phase === 'won') s.gate.start();
            else toggleSpeed();
        }
        return;
    }
    if (code === 'Escape') {
        if (s.placing) { cancelPlacing(); return; }
        if (s.game && s.game.selectedTower) { s.game.selectTower(null); return; }
        if (s.mp && s.spectator) { leaveMatch(); return; }
        pause();
        return;
    }
    if (code === 'KeyU') {
        if (s.game && s.game.selectedTower) s.game.selectTower(null);
    }
}

function toggleSpeed() {
    const ns = s.game.state.speed >= 3 ? 1 : 3;
    s.game.state.speed = ns;
    s.loop.setSpeed(ns);
}

function togglePause() {
    if (s.paused) resume();
    else pause();
}

function pause() {
    if (s.paused) return;
    s.paused = true;
    // MP keeps chasing the server clock behind the menu (teammates play on); the
    // menu is a local overlay, not a real pause. Solo/daily freeze the loop.
    if (!s.mp && s.loop) s.loop.stop();
    PauseMenu.open();
}

function resume() {
    if (!s.paused) return;
    s.paused = false;
    PauseMenu.close();
    if (!s.mp && s.loop) s.loop.start();
    if (!s.mp && s._autoPending) fireAutoStart();
}

// ---- MP navigation (end overlay + escape menu buttons) ----

function onEndRestart() {
    if (s.mp) { onBackToLobby(); return; }
    Screens.show('game', { mapId: s.mapId, difficulty: s.difficulty, resume: false });
}

function onEndQuit() {
    if (s.mp) { leaveMatch(); return; }
    Screens.show('menu');
}

function onBackToLobby() {
    if (!s.mp) { Screens.show('menu'); return; }
    const client = s.mp.client;
    const roomState = s._lastRoomState;
    s.mp.handoff();          // keep the socket alive for the lobby
    s._mpHandoff = true;
    Screens.show('mplobby', { client, roomState });
}

function leaveMatch() {
    if (s.mp) { try { s.mp.leave(); } catch (e) { /* ignore */ } }
    Screens.show('menu');
}

function continueFreeplay() {
    const ov = s.els.endHost.querySelector('.end-overlay');
    if (ov) ov.classList.remove('is-open');
    if (!s.paused && s.loop && !s.loop.running) s.loop.start();
}

// ------------------------------------------------------------------- cheats

function makeCheats(game) {
    return {
        cash: (n) => {
            game.state.cash = Math.max(0, Math.round(n));
            s.prevCash = game.state.cash;
            game.bus.emit('cash', { cash: game.state.cash });
        },
        lives: (n) => {
            game.state.lives = Math.round(n);
            game.bus.emit('lives', { lives: game.state.lives, delta: 0 });
        },
        skipToRound: (n) => {
            const r = Math.max(0, Math.round(n) - 1);
            game.state.round = r;
            game.currentRound = r;
            if (game.state.phase === 'combat') return;
            game.state.phase = 'idle';
            game.bus.emit('round:ready', {});
        },
        instantWin: () => {
            game.state.round = game.finalRound;
            game.currentRound = game.finalRound;
            game.state.phase = 'won';
            game._wonEmitted = true;
            game.bus.emit('game:won', { round: game.finalRound });
        },
    };
}

// ============================================================ multiplayer UI

const MP_STATUS_LABEL = {
    live: 'Connected',
    reconnecting: 'Reconnecting...',
    resyncing: 'Resyncing...',
    ended: 'Match Over',
    dead: 'Disconnected',
};

// Slot colours mirror mp/cooproom.js PLAYER_COLORS + MpMatch.
const MP_SLOT_COLORS = ['#33ADFF', '#59c93c', '#e8b23a', '#ff5540'];

function mpSlotColor(slot) {
    if (s && s.mp) {
        const peer = s.mp.peers.get(slot);
        if (peer && peer.color) return peer.color;
        for (const p of s.mp.players || []) if (p.slot === slot && p.color) return p.color;
    }
    return MP_SLOT_COLORS[((slot % 4) + 4) % 4] || '#33ADFF';
}

// The hook bundle handed to MpMatch. Closures read the module-level `s` at call
// time (they only fire on later socket events, after mount finishes).
function makeMpHooks() {
    return {
        onStatus: (st) => mpOnStatus(st),
        onSwapGame: (g) => mpOnSwapGame(g),
        onMatchEnd: (r) => mpOnMatchEnd(r),
        onRoomState: (rs) => { if (s) s._lastRoomState = rs; },
    };
}

function mpOnStatus(st) {
    if (!s || !s.mpUi) return;
    const pill = s.mpUi.pill;
    pill.textContent = MP_STATUS_LABEL[st] || st;
    pill.className = 'gs-mp-pill gs-mp-pill-' + st;
    if (st === 'reconnecting') mpSetVeil(true, 0, 'Reconnecting');
    else if (st === 'resyncing') mpSetVeil(true, s.mp ? s.mp.resyncProgress : 0, 'Resyncing');
    else if (st === 'dead') mpSetVeil(true, 0, 'Connection lost');
    else if (st === 'live') mpSetVeil(false);
}

// Swap in a freshly-replayed game after a resync: rebind all sub-modules.
function mpOnSwapGame(newGame) {
    if (!s || !newGame) return;
    if (s.pvpPanel) unmountPvpPanel();
    for (const mod of [HUD, Shop, UpgradePanel, AbilityBar, PauseMenu, EndScreens]) {
        if (mod && typeof mod.unmount === 'function') { try { mod.unmount(); } catch (e) { /* ignore */ } }
    }
    for (const handle of s.zoneRings.values()) { try { handle.kill(); } catch (e) { /* ignore */ } }
    s.zoneRings.clear();
    s.game = newGame;
    s.prevCash = newGame.state.cash;
    wireSubModules(newGame);
}

function mpOnMatchEnd(result) {
    if (!s) return;
    if (s.game) s.game.selectTower(null);
    cancelPlacing();
    if (EndScreens && typeof EndScreens.showMpResult === 'function') {
        EndScreens.showMpResult(result, {
            players: (s._lastRoomState && s._lastRoomState.players) || (s.mp && s.mp.players) || [],
            mySlot: s.mySlot,
            game: s.game,
        });
    }
}

function buildMpOverlay() {
    const host = document.createElement('div');
    host.className = 'gs-mp-overlay';

    const pill = document.createElement('div');
    pill.className = 'gs-mp-pill gs-mp-pill-live';
    pill.textContent = 'Connected';
    host.appendChild(pill);

    // Ready button (co-op only). Wired on pointerdown, textContent-only updates:
    // never rebuilt on 'cash' events, so it can't eat clicks (the known trap).
    let readyBtn = null;
    let readyVotesEl = null;
    let readyLblEl = null;
    if (!s.spectator && !s.pvp) {
        readyBtn = document.createElement('button');
        readyBtn.type = 'button';
        readyBtn.className = 'mc-btn mc-btn-small gs-mp-ready';
        readyLblEl = document.createElement('span');
        readyLblEl.className = 'gs-mp-ready-lbl';
        readyLblEl.textContent = 'START';
        readyVotesEl = document.createElement('span');
        readyVotesEl.className = 'gs-mp-ready-votes';
        readyVotesEl.textContent = '0/0';
        readyBtn.appendChild(readyLblEl);
        readyBtn.appendChild(readyVotesEl);
        readyBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (!s || !s.mp) return;
            const phase = s.game ? s.game.state.phase : 'idle';
            if (phase === 'idle' || phase === 'won') { s.mp.setReady(!s.mp.myReady); SFX.play('ui_click'); }
        });
        host.appendChild(readyBtn);
    }

    const pauseBanner = document.createElement('div');
    pauseBanner.className = 'gs-mp-pausebanner hidden';
    pauseBanner.textContent = 'PAUSED (vote)';
    host.appendChild(pauseBanner);

    let spectateBanner = null;
    if (s.spectator) {
        spectateBanner = document.createElement('div');
        spectateBanner.className = 'gs-mp-spectate';
        spectateBanner.textContent = 'SPECTATING' + (s.mp && s.mp.code ? ' ' + s.mp.code : '');
        host.appendChild(spectateBanner);

        const leaveBtn = document.createElement('button');
        leaveBtn.type = 'button';
        leaveBtn.className = 'mc-btn mc-btn-small mc-btn-red gs-mp-spectate-leave';
        leaveBtn.textContent = 'LEAVE';
        leaveBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); leaveMatch(); });
        host.appendChild(leaveBtn);
    }

    const chatWrap = document.createElement('div');
    chatWrap.className = 'gs-mp-chat';
    const chatLog = document.createElement('div');
    chatLog.className = 'gs-mp-chatlog';       // pointer-events:none -> safe to rebuild
    const chatInput = document.createElement('input');
    chatInput.type = 'text';
    chatInput.maxLength = 200;
    chatInput.className = 'gs-mp-chatinput hidden';
    chatInput.placeholder = 'Say something...';
    chatInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            const text = chatInput.value;
            chatInput.value = '';
            if (s && s.mp && text.trim()) s.mp.sendChat(text);
            mpBlurChat();
        } else if (e.key === 'Escape') {
            chatInput.value = '';
            mpBlurChat();
        }
    });
    chatWrap.appendChild(chatLog);
    chatWrap.appendChild(chatInput);
    host.appendChild(chatWrap);

    const veil = document.createElement('div');
    veil.className = 'gs-mp-veil hidden';
    const veilLabel = document.createElement('div');
    veilLabel.className = 'gs-mp-veil-label';
    veilLabel.textContent = 'Resyncing';
    const veilBar = document.createElement('div');
    veilBar.className = 'gs-mp-veil-bar';
    const veilFill = document.createElement('div');
    veilFill.className = 'gs-mp-veil-fill';
    veilBar.appendChild(veilFill);
    const veilPct = document.createElement('div');
    veilPct.className = 'gs-mp-veil-pct';
    veilPct.textContent = '0%';
    veil.appendChild(veilLabel);
    veil.appendChild(veilBar);
    veil.appendChild(veilPct);
    host.appendChild(veil);

    s.els.wrap.appendChild(host);
    s.mpUi = {
        host, pill, readyBtn, readyVotesEl, readyLblEl, pauseBanner, spectateBanner,
        chatWrap, chatLog, chatInput, veil, veilLabel, veilFill, veilPct,
        _votesTxt: null, _lblTxt: null, _readyCls: null, _pauseShown: false,
        _veilShown: false, _chatSig: null, chatFadeAt: 0,
    };
}

function updateMpOverlay() {
    const ui = s.mpUi;
    const mp = s.mp;
    if (!ui || !mp) return;

    // Ready button (textContent + class only).
    if (ui.readyBtn) {
        const phase = s.game ? s.game.state.phase : 'idle';
        const canReady = (phase === 'idle' || phase === 'won');
        const votes = mp.readyVotes();
        const votesTxt = votes.ready + '/' + votes.total;
        if (ui._votesTxt !== votesTxt) { ui._votesTxt = votesTxt; ui.readyVotesEl.textContent = votesTxt; }
        const lblTxt = mp.myReady ? 'READY' : 'START';
        if (ui._lblTxt !== lblTxt) { ui._lblTxt = lblTxt; ui.readyLblEl.textContent = lblTxt; }
        const cls = 'mc-btn mc-btn-small gs-mp-ready' +
            (mp.myReady ? ' mc-btn-green is-ready' : '') + (canReady ? '' : ' disabled');
        if (ui._readyCls !== cls) { ui._readyCls = cls; ui.readyBtn.className = cls; }
    }

    // Pause-vote banner.
    const showPause = !!mp.paused;
    if (ui._pauseShown !== showPause) { ui._pauseShown = showPause; ui.pauseBanner.classList.toggle('hidden', !showPause); }

    // Resync / catch-up veil (driver-owned; status hooks also toggle it).
    if (mp.isVeilActive()) mpSetVeil(true, mp.veilPct(), mp.veilLabel());
    else if (ui._veilShown && mp.status === 'live') mpSetVeil(false);

    mpRenderChat(ui, mp);
}

// Rebuild the (pointer-events:none) chat log only when its content changed, then
// fade it out after a few seconds unless the input is focused.
function mpRenderChat(ui, mp) {
    const last = mp.chat.length ? mp.chat[mp.chat.length - 1] : null;
    const sig = mp.chat.length + ':' + (last ? last.ts : 0);
    if (sig !== ui._chatSig) {
        ui._chatSig = sig;
        const N = 8;
        const start = Math.max(0, mp.chat.length - N);
        ui.chatLog.textContent = '';
        for (let i = start; i < mp.chat.length; i++) {
            const e = mp.chat[i];
            const line = document.createElement('div');
            line.className = 'gs-mp-chatline' + (e.system ? ' system' : '');
            if (e.system) {
                line.textContent = e.text;
            } else {
                const nm = document.createElement('span');
                nm.className = 'gs-mp-chatname';
                nm.textContent = (e.name || '?') + ': ';
                nm.style.color = mpSlotColor(e.slot);
                line.appendChild(nm);
                line.appendChild(document.createTextNode(e.text));
            }
            ui.chatLog.appendChild(line);
        }
        ui.chatFadeAt = nowSec() + 6;
        ui.chatWrap.classList.remove('faded');
    }
    const focused = mpChatFocused();
    const shouldFade = !focused && nowSec() > ui.chatFadeAt && mp.chat.length > 0;
    ui.chatWrap.classList.toggle('faded', shouldFade);
}

function mpSetVeil(on, pct, label) {
    if (!s || !s.mpUi) return;
    const ui = s.mpUi;
    ui._veilShown = !!on;
    ui.veil.classList.toggle('hidden', !on);
    if (on) {
        if (label && ui.veilLabel.textContent !== label) ui.veilLabel.textContent = label;
        const p = Math.round(Math.max(0, Math.min(1, pct || 0)) * 100);
        ui.veilFill.style.width = p + '%';
        ui.veilPct.textContent = p + '%';
    }
}

function mpChatFocused() {
    return !!(s && s.mpUi && s.mpUi.chatInput &&
        typeof document !== 'undefined' && document.activeElement === s.mpUi.chatInput);
}

function mpFocusChat() {
    if (!s || !s.mpUi) return;
    const inp = s.mpUi.chatInput;
    inp.classList.remove('hidden');
    inp.focus();
    s.mpUi.chatWrap.classList.remove('faded');
}

function mpBlurChat() {
    if (!s || !s.mpUi) return;
    const inp = s.mpUi.chatInput;
    inp.blur();
    inp.classList.add('hidden');
}

// Colored cursor + name tag for each connected peer (canvas-drawn).
function drawPeerCursors(ctx) {
    const mp = s.mp;
    if (!mp) return;
    const now = nowSec();
    ctx.save();
    ctx.font = '700 11px "Segoe UI", Verdana, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const [slot, peer] of mp.peers) {
        const c = peer.cursor;
        if (!c) continue;
        if (now - (c.ts / 1000) > 5) continue;   // stale cursor -> hide
        const color = peer.color || mpSlotColor(slot);
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x, c.y + 16);
        ctx.lineTo(c.x + 4.5, c.y + 12);
        ctx.lineTo(c.x + 11, c.y + 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const nm = peer.name || ('Player ' + (slot + 1));
        const w = ctx.measureText(nm).width + 8;
        ctx.fillStyle = color;
        ctx.fillRect(c.x + 12, c.y + 11, w, 15);
        ctx.fillStyle = '#0a0910';
        ctx.fillText(nm, c.x + 16, c.y + 13);
    }
    ctx.restore();
}

// PVP right rail (send panel + opponent view) is owned by B2 (pvppanel.js).
function mountPvpPanel() {
    if (!s || !s.mp || !s.pvp) return;
    import('./pvppanel.js').then((mod) => {
        if (!s || !s.alive || !s.pvp || !s.mp) return;
        const PvpPanel = (mod && (mod.PvpPanel || mod.default)) || null;
        if (!PvpPanel || typeof PvpPanel.mount !== 'function') return;
        try {
            const me = (s.mp.players || []).find((pl) => pl.slot === s.mySlot) || {};
            const oppEntry = (s.mp.players || []).find((pl) => pl.slot !== s.mySlot) || {};
            // Chrome positions against the full stage, NOT the old side rail.
            PvpPanel.mount(s.els.wrap, {
                pvp: s.mp.pvp,
                mySlot: s.mySlot,
                game: s.game,
                // Resolved opponent board Game -- the panel reads .state/.mobs
                // off it directly.
                oppGame: s.mp.oppGame(s.mySlot),
                names: { me: me.name || 'You', opp: oppEntry.name || 'Opponent' },
                sendFn: (sendId) => s.gate.send(sendId),
                buyFn: (towerId) => startPlacing(towerId),
                isPlacing: () => (s ? s.placing : null),
            });
            s.pvpPanel = PvpPanel;
            wireOppFx();
        } catch (e) { /* B2 panel not ready -> co-op-style layout stands */ }
    }).catch(() => { /* pvppanel.js absent (B2 in flight) */ });
}

function unmountPvpPanel() {
    if (s && s.pvpPanel && typeof s.pvpPanel.unmount === 'function') {
        try { s.pvpPanel.unmount(); } catch (e) { /* ignore */ }
    }
    if (s) {
        s.pvpPanel = null;
        if (s.oppFxUnsub) { try { s.oppFxUnsub(); } catch (e) { /* ignore */ } s.oppFxUnsub = null; }
        s.oppParticles = null;
        s.oppEffects = null;
    }
}

// ================================================================== render

// ---- client prediction (MP): a thin PENDING layer over the lockstep sim ----
// A local action shows instantly as "already true, just unconfirmed": the
// placed tower renders translucent on the spot, cash previews the post-spend
// value, the send queue bumps. The lockstep sim is NEVER touched -- an entry
// clears when its confirmed command applies (~200ms later), or expires + rolls
// back if the server refused it / the wire ate it. No fake state: only the
// same command the server is about to execute, drawn a beat early.
const PENDING_TTL_MS = 1500;

function pendingList() {
    if (!s.pending) s.pending = { entries: [], lastQueueLen: 0 };
    return s.pending.entries;
}

function pendingRecalc() {
    if (!s || !s.game || !s.pending) return;
    let d = 0;
    for (const en of s.pending.entries) d += en.cashDelta || 0;
    s.game._pendingCashDelta = d;
    s.game._pending = s.pending.entries;
}

function pendingAdd(entry) {
    entry.at = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    pendingList().push(entry);
    pendingRecalc();
}

function pendingRemove(pred) {
    if (!s || !s.pending) return false;
    const list = s.pending.entries;
    for (let i = 0; i < list.length; i++) {
        if (pred(list[i])) {
            list.splice(i, 1);
            pendingRecalc();
            return true;
        }
    }
    return false;
}

function effectiveCash() {
    return s.game.state.cash + (s.game._pendingCashDelta || 0);
}

/** Expire stale entries (rejected / lost commands roll their preview back). */
function updatePending() {
    if (!s || !s.pending) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const list = s.pending.entries;
    let dropped = false;
    for (let i = list.length - 1; i >= 0; i--) {
        if (now - list[i].at > PENDING_TTL_MS) { list.splice(i, 1); dropped = true; }
    }
    if (dropped) {
        pendingRecalc();
        SFX.play('ui_error', { vol: 0.4 });
    }
    // Mortar aim points emit no bus event either; reconcile on arrival.
    for (let i = list.length - 1; i >= 0; i--) {
        const en = list[i];
        if (en.kind !== 'point') continue;
        const t = towerByUid(en.uid);
        if (!t || (t.targetPoint && Math.abs(t.targetPoint.x - en.x) < 1 && Math.abs(t.targetPoint.y - en.y) < 1)) {
            list.splice(i, 1);
            pendingRecalc();
        }
    }
    // Target modes emit no bus event; reconcile when the sim catches up.
    for (let i = list.length - 1; i >= 0; i--) {
        const en = list[i];
        if (en.kind !== 'target') continue;
        const t = towerByUid(en.uid);
        if (!t || t.targetMode === en.mode) { list.splice(i, 1); pendingRecalc(); }
    }
    // Sends have no own-board bus event; reconcile against the queue length.
    if (s.pvp && s.mp && s.mp.pvp) {
        const drv = s.mp.pvp;
        const q = (typeof drv.sendQueueLen === 'function') ? drv.sendQueueLen(s.mySlot) : 0;
        if (q > s.pending.lastQueueLen) {
            let inc = q - s.pending.lastQueueLen;
            while (inc-- > 0 && pendingRemove((en) => en.kind === 'send')) { /* consumed */ }
        }
        s.pending.lastQueueLen = q;
    }
}

/** Pending tower placements render as translucent "future" towers; pending
 *  sells dim their tower under a marker; pending mortar aims show the
 *  reticle at its future position. */
function drawPendingTowers(ctx) {
    if (!s.pending || s.pending.entries.length === 0) return;
    const t = nowSec();
    for (const en of s.pending.entries) {
        if (en.kind === 'sell') {
            const tw = towerByUid(en.uid);
            if (tw) {
                ctx.save();
                ctx.globalAlpha = 0.75;
                ctx.strokeStyle = '#ff5540';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(tw.x - 10, tw.y - 26); ctx.lineTo(tw.x + 10, tw.y - 6);
                ctx.moveTo(tw.x + 10, tw.y - 26); ctx.lineTo(tw.x - 10, tw.y - 6);
                ctx.stroke();
                ctx.restore();
            }
            continue;
        }
        if (en.kind === 'point') {
            ctx.save();
            ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 8);
            ctx.strokeStyle = 'rgba(255,90,64,0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(en.x - 7, en.y); ctx.lineTo(en.x + 7, en.y);
            ctx.moveTo(en.x, en.y - 7); ctx.lineTo(en.x, en.y + 7); ctx.stroke();
            ctx.beginPath(); ctx.arc(en.x, en.y, 9, 0, TAU); ctx.stroke();
            ctx.restore();
            continue;
        }
        if (en.kind !== 'place') continue;
        const spr = TowerSprites.sprite(en.towerId, [0, 0, 0], 0) || TowerSprites.heroSprite(en.towerId, 0);
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 7);
        if (spr) ctx.drawImage(spr, en.x - 32, en.y - 46, 64, 64);
        ctx.restore();
    }
}

function towerByUid(uid) {
    const ts = s.game.towers;
    for (let i = 0; i < ts.length; i++) if (ts[i].uid === uid) return ts[i];
    return null;
}

// Wraps the MP gate: every action is forwarded unchanged AND recorded as a
// pending preview. Affordability is checked against the EFFECTIVE cash
// (confirmed + pending) so two quick buys cannot double-spend the same coins.
function wrapPredictiveGate(inner) {
    return {
        place(towerId, x, y) {
            const def = TOWERS[towerId] || HEROES[towerId];
            const price = def ? s.game.priceFor(def, x, y) : 0;
            if (price > effectiveCash()) return { ok: false, reason: 'cash' };
            const res = inner.place(towerId, x, y);
            if (res && res.ok !== false) pendingAdd({ kind: 'place', towerId, x, y, cashDelta: -price });
            return res;
        },
        upgrade(uid, path) {
            const t = towerByUid(uid);
            let price = 0;
            if (t) {
                const can = t.canUpgrade(path);
                if (typeof can.cost === 'number') price = s.game.priceFor(can.cost, t.x, t.y);
            }
            if (price > effectiveCash()) return { ok: false, reason: 'cash' };
            const res = inner.upgrade(uid, path);
            if (res && res.ok !== false) pendingAdd({ kind: 'upgrade', uid, path, cashDelta: -price });
            return res;
        },
        sell(uid) {
            const t = towerByUid(uid);
            const refund = t ? t.sellValue() : 0;
            const res = inner.sell(uid);
            if (res && res.ok !== false) {
                pendingAdd({ kind: 'sell', uid, cashDelta: refund });
                // Instant feel: drop the selection now; the tower renders with
                // a sell marker until the confirmed command removes it.
                if (s.game.selectedTower && s.game.selectedTower.uid === uid) s.game.selectTower(null);
            }
            return res;
        },
        heroLvl(uid) {
            const t = towerByUid(uid);
            const cost = t ? Math.floor(150 * Math.pow(t.level, 1.5)) : 0;
            if (cost > effectiveCash()) return { ok: false, reason: 'cash' };
            const res = inner.heroLvl(uid);
            if (res && res.ok !== false) pendingAdd({ kind: 'herolvl', uid, cashDelta: -cost });
            return res;
        },
        ability(key) {
            // Dedupe: one in-flight use per ability -- a double-tap during the
            // round trip would just bounce off the server.
            for (const en of pendingList()) {
                if (en.kind === 'ability' && en.key === key) return { ok: false, reason: 'pending' };
            }
            const res = inner.ability(key);
            if (res && res.ok !== false) pendingAdd({ kind: 'ability', key, cashDelta: 0 });
            return res;
        },
        send(sendId) {
            const def = PVP_SENDS[sendId];
            const cost = def ? def.cost : 0;
            if (cost > effectiveCash()) return { ok: false, reason: 'cash' };
            const res = inner.send(sendId);
            if (res && res.ok !== false) pendingAdd({ kind: 'send', sendId, cashDelta: -cost });
            return res;
        },
        target(uid, mode) {
            const res = inner.target(uid, mode);
            if (res && res.ok !== false) {
                // Latest wins: fast cycling replaces the previous pending mode.
                pendingRemove((en) => en.kind === 'target' && en.uid === uid);
                pendingAdd({ kind: 'target', uid, mode, cashDelta: 0 });
            }
            return res;
        },
        point(uid, x, y) {
            const res = inner.point(uid, x, y);
            if (res && res.ok !== false) {
                pendingRemove((en) => en.kind === 'point' && en.uid === uid);
                pendingAdd({ kind: 'point', uid, x, y, cashDelta: 0 });
            }
            return res;
        },
        start() { return inner.start(); },
    };
}

// Full-fidelity draw of the player's own world in board space (0..W, 0..H).
function drawOwnWorld(ctx) {
    ctx.drawImage(s.terrain, 0, 0);

    // ground zones: real art (spikes/char/puddles) from the asset layer
    const wallT = nowSec();
    for (let i = 0; i < s.game.zones.length; i++) drawZone(ctx, s.game.zones[i], wallT);
    drawSpeedZones(ctx);
    drawPortals(ctx);

    drawEntities(ctx);
    if (s.mp && !s.spectator) drawPendingTowers(ctx);
    drawProjectiles(ctx);

    Effects.draw(ctx);
    Particles.draw(ctx);

    if (s.mapDef.feature === 'darkness') drawDarkness(ctx);

    drawSelectedRange(ctx);
    drawPlacementGhost(ctx);

    if (s.mp && !s.pvp) drawPeerCursors(ctx);
}

// ---- Battles split-screen (PVP): my board left, opponent right ----
// Both boards run the SAME map in lockstep, so the baked terrain is shared.
const PVP_BOARD_Y = 96;
const PVP_SCALE = 0.5;
const PVP_BOARD_W = 640;
const PVP_BOARD_H = 360;

/** Map a stage-space pointer into MY board's world space (null = off-board). */
function pvpMapPoint(x, y) {
    if (x < 0 || x >= PVP_BOARD_W || y < PVP_BOARD_Y || y >= PVP_BOARD_Y + PVP_BOARD_H) return null;
    return { x: x / PVP_SCALE, y: (y - PVP_BOARD_Y) / PVP_SCALE };
}

function renderPvpSplit(ctx) {
    // Battles-style backdrop: dark bricks, not dead black.
    ctx.fillStyle = '#12101a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let by = 0; by < H; by += 28) {
        const off = (Math.floor(by / 28) % 2) * 32;
        for (let bx = -32; bx < W; bx += 64) ctx.fillRect(bx + off, by, 30, 12);
    }

    // my board (left)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, PVP_BOARD_Y, PVP_BOARD_W, PVP_BOARD_H);
    ctx.clip();
    ctx.translate(0, PVP_BOARD_Y);
    ctx.scale(PVP_SCALE, PVP_SCALE);
    drawOwnWorld(ctx);
    ctx.restore();

    // opponent board (right)
    const og = s.mp.oppGame(s.mySlot);
    if (og) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(PVP_BOARD_W, PVP_BOARD_Y, PVP_BOARD_W, PVP_BOARD_H);
        ctx.clip();
        ctx.translate(PVP_BOARD_W, PVP_BOARD_Y);
        ctx.scale(PVP_SCALE, PVP_SCALE);
        drawOppWorld(ctx, og);
        ctx.restore();
    }

    // frame + center divider
    ctx.fillStyle = '#000';
    ctx.fillRect(PVP_BOARD_W - 3, PVP_BOARD_Y - 4, 6, PVP_BOARD_H + 8);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, PVP_BOARD_Y - 1, W - 2, PVP_BOARD_H + 2);

    // corner tags so the halves read instantly
    ctx.font = '900 11px sans-serif';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(6, PVP_BOARD_Y + 6, 44, 18);
    ctx.fillRect(PVP_BOARD_W + 6, PVP_BOARD_Y + 6, 52, 18);
    ctx.fillStyle = '#9fd0ff';
    ctx.fillText('YOU', 14, PVP_BOARD_Y + 19);
    ctx.fillStyle = '#ff9b91';
    ctx.fillText('THEM', PVP_BOARD_W + 14, PVP_BOARD_Y + 19);
}

// Opponent board: the REAL game renderer -- same painters, same particle and
// effect systems (second module instances), driven by the opponent game's own
// fx bus. Only the interaction overlays (ghost/range/cursor) are omitted.
function drawOppWorld(ctx, og) {
    ctx.drawImage(s.terrain, 0, 0);
    const wallT = nowSec();
    for (let i = 0; i < og.zones.length; i++) drawZone(ctx, og.zones[i], wallT);
    drawSpeedZones(ctx);
    drawPortals(ctx);
    drawEntities(ctx, og);
    drawProjectiles(ctx, og);
    if (s.oppEffects) s.oppEffects.draw(ctx);
    if (s.oppParticles) s.oppParticles.draw(ctx);
}

// Full-parity fx for the opponent board: separate instances of the particle +
// effect modules (distinct module records via the import query string), fed by
// the opponent game's fx bus through the SAME router -- minus sound and
// screen shake, which belong to MY board.
function wireOppFx() {
    if (!s || !s.mp || s.oppFxUnsub) return;
    const og = s.mp.oppGame(s.mySlot);
    if (!og) return;
    Promise.all([
        import('../gfx/particles.js?board=opp'),
        import('../gfx/effects.js?board=opp'),
    ]).then(([pm, em]) => {
        if (!s || !s.pvp || !s.mp) return;
        s.oppParticles = pm.Particles;
        s.oppEffects = em.Effects;
        if (typeof s.oppParticles.setQuality === 'function') s.oppParticles.setQuality(s.settings.particles);
        s.oppFxUnsub = og.bus.on('fx', (e) => handleFx(e, s.oppParticles, s.oppEffects, true));
    }).catch(() => { /* opp board stays fx-less rather than breaking the match */ });
}

function render() {
    if (!s) return;
    const ctx = Renderer.ctx;
    if (!ctx) return;

    // MP: advance the local sim toward the authoritative server tick BEFORE
    // drawing, so the frame shows the freshest lockstep state. Mirror the
    // server's speed onto the HUD readout.
    if (s.mp && s.game) {
        s.mp.update();
        s.game.state.speed = s.mp.speed >= 3 ? 3 : 1;
    }
    if (!s.game || !s.terrain) { updateMpOverlayIfAny(); return; }

    Renderer.beginFrame();

    if (s.pvp && s.mp) renderPvpSplit(ctx);
    else drawOwnWorld(ctx);

    Renderer.endFrame();

    // Keep the wall-clock effects (zone rot, portal swirl) turning even at 1x.
    s.portalPhase = nowSec();

    updateBossBar();
    HUD.update();
    AbilityBar.update();

    if (s.mp) updateMpOverlay();
    if (s.pvpPanel && typeof s.pvpPanel.update === 'function') { try { s.pvpPanel.update(); } catch (e) { /* ignore */ } }
    if (s.mp && !s.spectator) updatePending();
}

function updateMpOverlayIfAny() {
    if (s && s.mp && s.mpUi) { try { updateMpOverlay(); } catch (e) { /* ignore */ } }
}

function syncZoneRings() {
    const zones = s.game.zones;
    const rings = s.zoneRings;
    // Create/refresh rings for live zones.
    for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        let handle = rings.get(z);
        if (!handle || !handle.alive) {
            handle = Effects.zoneRing(z.x, z.y, z.radius, zoneColor(z));
            rings.set(z, handle);
        } else {
            handle.move(z.x, z.y);
            handle.setRadius(z.radius);
        }
    }
    // Retire rings whose zone is gone.
    for (const [z, handle] of rings) {
        if (zones.indexOf(z) === -1) {
            handle.kill();
            rings.delete(z);
        }
    }
}

function drawSpeedZones(ctx) {
    const zones = s.mapDef.speedZones;
    if (!zones || zones.length === 0) return;
    ctx.save();
    for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        const fast = z.mult > 1;
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = fast ? '#bfe4ff' : '#7a6ad0';
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = fast ? '#cfeeff' : '#9a8ae0';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
}

function drawPortals(ctx) {
    if (s.mapDef.feature !== 'portals') return;
    const portals = s.mapDef.portals;
    if (!portals || portals.length === 0) return;
    const rot = s.portalPhase * 1.6;
    ctx.save();
    for (let i = 0; i < portals.length; i++) {
        const pt = portals[i];
        drawPortalSwirl(ctx, pt.x1, pt.y1, rot);
        drawPortalSwirl(ctx, pt.x2, pt.y2, rot + 1.1);
        if (Math.random() < 0.06) {
            Particles.spawn('portal', pt.x2, pt.y2, { count: 4 });
        }
    }
    ctx.restore();
}

function drawPortalSwirl(ctx, x, y, rot) {
    if (x == null || y == null) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
        const rr = 10 + k * 6;
        ctx.globalAlpha = 0.24 - k * 0.05;
        ctx.strokeStyle = '#a24bff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, rr, rot + k * 1.3, rot + k * 1.3 + 3.4);
        ctx.stroke();
    }
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#e8c8ff';
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
}

function drawEntities(ctx, gameArg) {
    const game = gameArg || s.game;
    const ents = [];
    for (let i = 0; i < game.towers.length; i++) ents.push(game.towers[i]);
    for (let i = 0; i < game.mobs.length; i++) { const m = game.mobs[i]; if (m.alive) ents.push(m); }
    for (let i = 0; i < game.units.length; i++) { const u = game.units[i]; if (u.alive) ents.push(u); }
    ents.sort((a, b) => a.y - b.y);

    // shadows first
    for (let i = 0; i < ents.length; i++) drawShadow(ctx, ents[i]);
    // then y-sorted sprites
    for (let i = 0; i < ents.length; i++) drawEntity(ctx, ents[i]);
}

function drawShadow(ctx, o) {
    let w, flying;
    if (isTower(o)) {                                             // tower / hero
        w = 30; flying = false;
    } else if (o.statuses) {                                      // mob
        w = MobSprites.size(o.id) * 0.42; flying = !!o.flying;
    } else {                                                      // unit
        w = 11; flying = !!o.flying;
    }
    ctx.save();
    ctx.globalAlpha = flying ? 0.16 : 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(o.x, o.y + (flying ? 8 : 2), w, w * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
}

function isTower(o) {
    return o.uid !== undefined && o.def && Array.isArray(o.def.paths);
}

function drawEntity(ctx, o) {
    if (isTower(o)) drawTower(ctx, o);
    else if (o.def && o.maxHp !== undefined && o.statuses) drawMob(ctx, o);
    else drawUnit(ctx, o);
}

function drawTower(ctx, t) {
    const frame = Math.floor(nowSec() * 2) % 2;
    if (t.selected) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(t.x, t.y, 24, 0, TAU); ctx.stroke();
        ctx.restore();
    }
    const spr = t.isHero
        ? TowerSprites.heroSprite(t.def.id, frame)
        : TowerSprites.sprite(t.def.id, t.tiers, frame);
    if (spr) ctx.drawImage(spr, t.x - 32, t.y - 46, 64, 64);
    else { R(ctx, t.x - 12, t.y - 20, 24, 24, '#7f7f7f'); }
}

function drawMob(ctx, m) {
    const size = MobSprites.size(m.id);
    const variant = m.modifiers.camo ? 'camo'
        : (m.modifiers.fortified ? 'fortified' : (m.modifiers.regrow ? 'regrow' : 'normal'));
    const fr = Math.floor(m.dist / 14) % 2;
    const spr = MobSprites.sprite(m.id, fr, variant);
    const lift = m.flying ? 12 + Math.sin(nowSec() * 3 + m.spawnOrder) * 3 : 0;
    const topY = m.y - size + 3 - lift;
    if (spr) ctx.drawImage(spr, m.x - size / 2, topY, size, size);

    // status icon row
    let ix = m.x - 6;
    const iconY = topY - 8;
    if (m.statuses.has('slow') || m.statuses.has('freeze')) { R(ctx, ix, iconY, 4, 4, '#8fd7ff'); ix += 6; }
    if (m.statuses.has('burn')) { R(ctx, ix, iconY, 4, 4, '#ff8a3a'); ix += 6; }
    if (m.statuses.has('poison')) { R(ctx, ix, iconY, 4, 4, '#7fe08a'); ix += 6; }

    // hp bar for damaged mobs
    if (m.hp < m.maxHp) {
        const frac = clamp(m.hp / m.maxHp, 0, 1);
        const bw = Math.max(16, size * 0.6);
        const bh = 3;
        const bx = m.x - bw / 2;
        const by = topY - 3;
        R(ctx, bx - 1, by - 1, bw + 2, bh + 2, 'rgba(0,0,0,0.6)');
        R(ctx, bx, by, bw * frac, bh, hpColor(frac));
    }
}

function drawProjectiles(ctx, gameArg) {
    const proj = (gameArg || s.game).projectiles;
    for (let i = 0; i < proj.length; i++) {
        const p = proj[i];
        if (p.alive) drawProjectile(ctx, p);
    }
}

// ---------------------------------------------------------------- darkness

function drawDarkness(ctx) {
    const game = s.game;
    // Signature: rebuild the mask only when hole geometry actually moves.
    let sig = '';
    for (let i = 0; i < game.towers.length; i++) {
        const t = game.towers[i];
        sig += (t.x | 0) + ',' + (t.y | 0) + ',' + Math.round((t.stats && t.stats.range) || 0) + ';';
    }
    if (sig !== s.darkness.sig || !s.darkness.canvas) {
        s.darkness.sig = sig;
        s.darkness.canvas = buildDarkness();
    }
    ctx.drawImage(s.darkness.canvas, 0, 0);
}

function darkHole(cx, x, y, r) {
    const g = cx.createRadialGradient(x, y, Math.max(1, r * 0.55), x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = g;
    cx.beginPath();
    cx.arc(x, y, r, 0, TAU);
    cx.fill();
}

function buildDarkness() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const cx = c.getContext('2d');
    cx.fillStyle = 'rgba(0,0,0,0.82)';
    cx.fillRect(0, 0, W, H);
    cx.globalCompositeOperation = 'destination-out';

    const game = s.game;
    for (let i = 0; i < game.towers.length; i++) {
        const t = game.towers[i];
        if (t.isHero) darkHole(cx, t.x, t.y, 110);
        else darkHole(cx, t.x, t.y, ((t.stats && t.stats.range) || 90) * 0.9);
    }
    for (let i = 0; i < game.paths.length; i++) {
        const path = game.paths[i];
        const a = path.posAt(0);
        const b = path.posAt(path.length);
        darkHole(cx, a.x, a.y, 90);
        darkHole(cx, b.x, b.y, 90);
    }
    cx.globalCompositeOperation = 'source-over';
    return c;
}

// ----------------------------------------------------------- range + ghost

function drawSelectedRange(ctx) {
    const sel = s.game.selectedTower;
    if (!sel || !sel.stats) return;
    const rng = sel.stats.range || 0;
    ctx.save();
    ctx.beginPath();
    ctx.arc(sel.x, sel.y, rng, 0, TAU);
    ctx.fillStyle = COLORS.rangeFill;
    ctx.fill();
    ctx.strokeStyle = COLORS.rangeStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    // mortar aim marker
    if (sel.targetPoint) {
        const p = sel.targetPoint;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,90,64,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y);
        ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y + 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.stroke();
        ctx.restore();
    }
}

function drawPlacementGhost(ctx) {
    if (!s.placing || !s.mouseInField) return;
    const def = resolveDef(s.placing);
    if (!def) return;
    const x = s.mouseWorld.x;
    const y = s.mouseWorld.y;
    const can = s.game.canPlaceAt(def, x, y);
    const price = s.game.priceFor(def, x, y);
    const affordable = s.game.state.cash >= price;
    const ok = can.ok && affordable;
    const rng = (def.base && def.base.range) || 100;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, rng, 0, TAU);
    ctx.fillStyle = ok ? COLORS.rangeFill : COLORS.rangeBadFill;
    ctx.fill();
    ctx.strokeStyle = ok ? COLORS.rangeStroke : COLORS.rangeBadStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalAlpha = 0.72;
    const spr = def.isHero
        ? TowerSprites.heroSprite(def.id, 0)
        : TowerSprites.sprite(def.id, [0, 0, 0], 0);
    if (spr) ctx.drawImage(spr, x - 32, y - 46, 64, 64);
    ctx.globalAlpha = 1;

    if (!ok) {
        const txt = can.ok ? 'Not enough cash' : reasonText(can.reason);
        ctx.font = '700 13px ' + '"Segoe UI", Verdana, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(txt, x, y + 24);
        ctx.fillStyle = '#ff8877';
        ctx.fillText(txt, x, y + 24);
    }
    ctx.restore();
}

// ----------------------------------------------------------------- boss bar

function updateBossBar() {
    let boss = null;
    const mobs = s.game.mobs;
    for (let i = 0; i < mobs.length; i++) {
        const m = mobs[i];
        if (!m.alive || !m.def.flags || !m.def.flags.boss) continue;
        if (m.maxHp <= 3000) continue;
        if (!boss || m.maxHp > boss.maxHp) boss = m;
    }
    const el = s.els.boss;
    if (boss) {
        if (!el.classList.contains('is-live')) el.classList.add('is-live');
        s.els.bossName.textContent = boss.def.name;
        const frac = clamp(boss.hp / boss.maxHp, 0, 1);
        s.els.bossFill.style.width = (frac * 100).toFixed(1) + '%';
    } else if (el.classList.contains('is-live')) {
        el.classList.remove('is-live');
    }
}

// --------------------------------------------------------------- registration

export const GameScreen = { mount, unmount };
Screens.register('game', GameScreen);
