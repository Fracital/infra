// Map-select screen. A gallery of all 30 campaign maps, split into the four
// authoring difficulty groups (beginner/intermediate/advanced/expert -- the
// mapDef.difficulty field, NOT the play difficulty). Each card previews the map
// via gfx/thumbnails.makeThumbnail and shows earned-medal dots, one per play
// difficulty. Clicking a card opens the difficulty picker, whose buttons launch
// the game screen with the chosen {mapId, difficulty}.
//
// Screen contract (CONTRACTS Section 4): registered under 'mapselect'; mount
// builds its own container inside the passed root and unmount tears it (plus the
// key listener and the lazy-thumbnail observer) fully down so re-entry is clean.

import { Screens } from './screens.js';
import { SFX } from '../audio/sfx.js';
import { MAP_LIST } from '../data/maps/index.js';
import { DIFFICULTIES } from '../data/difficulties.js';
import { makeThumbnail } from '../gfx/thumbnails.js';
import { Save } from '../core/save.js';

// Play difficulties in fixed presentation order -- also the medal-dot order.
const DIFF_ORDER = ['easy', 'medium', 'hard', 'ironclad'];

// Authoring groups (mapDef.difficulty) with a section accent color.
const GROUPS = [
    { id: 'beginner', label: 'Beginner', color: '#59c93c' },
    { id: 'intermediate', label: 'Intermediate', color: '#e8b23a' },
    { id: 'advanced', label: 'Advanced', color: '#e0642e' },
    { id: 'expert', label: 'Expert', color: '#b03cf0' },
];

function mk(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
}

// 'dark_forest' -> 'Dark Forest'. Used for the biome tag on each card.
function prettify(s) {
    return String(s || '')
        .split('_')
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' ');
}

// Draw a (possibly cached) thumbnail canvas into a fixed-size card canvas. Wrapped
// so a single malformed map can never blank the whole gallery.
function paintThumb(canvasEl, mapDef, w, h) {
    const ctx = canvasEl.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    try {
        const thumb = makeThumbnail(mapDef, w, h);
        ctx.drawImage(thumb, 0, 0, canvasEl.width, canvasEl.height);
    } catch (e) {
        // Fallback: flat panel so the card still reads as a map slot.
        ctx.fillStyle = '#1a1626';
        ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.fillStyle = '#4c445f';
        ctx.font = '14px ' + 'sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('no preview', canvasEl.width / 2, canvasEl.height / 2);
    }
}

export const MapSelect = {
    _root: null,
    _container: null,
    _observer: null,
    _onKey: null,
    _modal: null,
    _profile: null,

    mount(rootEl) {
        this._teardown();
        this._root = rootEl;
        this._profile = Save.loadProfile();

        const container = mk('div', 'ms-root anim-fade');
        this._container = container;

        // ---- header ----
        const header = mk('div', 'ms-header');
        const back = mk('button', 'mc-btn mc-btn-small ms-back', 'BACK');
        back.addEventListener('click', () => {
            SFX.play('ui_close');
            Screens.show('menu');
        });
        back.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.5 }));
        const title = mk('div', 'ms-title pixel-title', 'CHOOSE A MAP');
        const spacer = mk('div', 'ms-header-spacer');
        header.appendChild(back);
        header.appendChild(title);
        header.appendChild(spacer);
        container.appendChild(header);

        // ---- scrolling body: one section per authoring group ----
        const body = mk('div', 'ms-body');
        container.appendChild(body);

        const useObserver = typeof IntersectionObserver !== 'undefined';
        if (useObserver) {
            this._observer = new IntersectionObserver((entries, obs) => {
                for (const ent of entries) {
                    if (!ent.isIntersecting) continue;
                    const cv = ent.target;
                    obs.unobserve(cv);
                    if (cv._mapDef) paintThumb(cv, cv._mapDef, 320, 180);
                }
            }, { root: body, rootMargin: '160px' });
        }

        for (const group of GROUPS) {
            const maps = MAP_LIST.filter((m) => (m.difficulty || 'beginner') === group.id);
            if (!maps.length) continue;

            const section = mk('div', 'ms-section');
            const heading = mk('div', 'ms-section-head');
            const chip = mk('span', 'ms-section-chip');
            chip.style.background = group.color;
            heading.appendChild(chip);
            heading.appendChild(mk('span', 'ms-section-label', group.label));
            heading.appendChild(mk('span', 'ms-section-count', maps.length + ' MAPS'));
            section.appendChild(heading);

            const grid = mk('div', 'ms-grid');
            for (const mapDef of maps) grid.appendChild(this._buildCard(mapDef, useObserver));
            section.appendChild(grid);
            body.appendChild(section);
        }

        // ---- key handling: Esc closes an open modal, else returns to menu ----
        this._onKey = (ev) => {
            if (ev.key !== 'Escape') return;
            if (this._modal) {
                this._closeModal();
            } else {
                SFX.play('ui_close');
                Screens.show('menu');
            }
        };
        window.addEventListener('keydown', this._onKey);

        rootEl.appendChild(container);
    },

    _buildCard(mapDef, useObserver) {
        const card = mk('div', 'ms-card mc-slot');
        card.setAttribute('role', 'button');
        card.tabIndex = 0;

        const thumbWrap = mk('div', 'ms-thumb-wrap');
        const canvas = mk('canvas', 'ms-thumb');
        canvas.width = 320;
        canvas.height = 180;
        canvas._mapDef = mapDef;
        thumbWrap.appendChild(canvas);
        card.appendChild(thumbWrap);

        if (useObserver && this._observer) this._observer.observe(canvas);
        else paintThumb(canvas, mapDef, 320, 180);

        const info = mk('div', 'ms-card-info');
        info.appendChild(mk('div', 'ms-card-name', mapDef.name || mapDef.id));

        const meta = mk('div', 'ms-card-meta');
        meta.appendChild(mk('span', 'ms-biome-tag', prettify(mapDef.biome)));
        meta.appendChild(this._buildMedalRow(mapDef.id));
        info.appendChild(meta);
        card.appendChild(info);

        const open = () => {
            SFX.play('ui_open');
            this._openModal(mapDef);
        };
        card.addEventListener('click', open);
        card.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                open();
            }
        });
        card.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.4 }));
        return card;
    },

    // Four dots (easy/medium/hard/ironclad); a lit dot means a medal is on file.
    _buildMedalRow(mapId) {
        const row = mk('div', 'ms-medals');
        for (const d of DIFF_ORDER) {
            const dot = mk('span', 'ms-medal-dot');
            const earned = !!(this._profile && this._profile.medals && this._profile.medals[mapId + ':' + d]);
            const meta = DIFFICULTIES[d];
            if (earned) {
                dot.classList.add('earned');
                dot.style.background = (meta && meta.color) || '#fff';
                dot.style.boxShadow = '0 0 6px ' + ((meta && meta.color) || '#fff');
            }
            dot.title = ((meta && meta.name) || d) + (earned ? ' -- medal earned' : ' -- not cleared');
            row.appendChild(dot);
        }
        return row;
    },

    // ---- difficulty picker modal ----
    _openModal(mapDef) {
        this._closeModal();

        const overlay = mk('div', 'ms-modal-overlay anim-fade');
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) this._closeModal();
        });

        const panel = mk('div', 'ms-modal mc-panel anim-pop');

        const head = mk('div', 'ms-modal-head');
        head.appendChild(mk('div', 'ms-modal-title', mapDef.name || mapDef.id));
        head.appendChild(mk('div', 'ms-modal-sub text-dim', prettify(mapDef.biome) + ' biome'));
        panel.appendChild(head);

        const preview = mk('canvas', 'ms-modal-thumb');
        preview.width = 480;
        preview.height = 270;
        paintThumb(preview, mapDef, 480, 270);
        panel.appendChild(preview);

        if (mapDef.desc) panel.appendChild(mk('div', 'ms-modal-desc text-dim', mapDef.desc));

        const grid = mk('div', 'ms-diff-grid');
        for (const d of DIFF_ORDER) {
            const meta = DIFFICULTIES[d];
            if (!meta) continue;
            grid.appendChild(this._buildDiffButton(mapDef, d, meta));
        }
        panel.appendChild(grid);

        const close = mk('button', 'mc-btn mc-btn-small mc-btn-red ms-modal-close', 'CLOSE');
        close.addEventListener('click', () => this._closeModal());
        panel.appendChild(close);

        overlay.appendChild(panel);
        this._container.appendChild(overlay);
        this._modal = overlay;
    },

    _buildDiffButton(mapDef, diffId, meta) {
        const btn = mk('button', 'ms-diff-btn');
        btn.style.setProperty('--diff-color', meta.color);

        const name = mk('div', 'ms-diff-name', meta.name || diffId);
        name.style.color = meta.color;
        const earned = !!(this._profile && this._profile.medals && this._profile.medals[mapDef.id + ':' + diffId]);
        if (earned) {
            // Check mark via unicode escape so the source file stays pure ASCII.
            const badge = mk('span', 'ms-diff-medal', '\u2713');
            badge.title = 'Medal earned';
            name.appendChild(badge);
        }
        btn.appendChild(name);

        const stats = mk('div', 'ms-diff-stats');
        stats.appendChild(this._statPill('LIVES', meta.lives));
        stats.appendChild(this._statPill('CASH', meta.cash));
        stats.appendChild(this._statPill('ROUNDS', meta.rounds));
        btn.appendChild(stats);

        if (meta.noContinue) {
            btn.classList.add('ms-diff-hardcore');
            btn.appendChild(mk('div', 'ms-diff-warn', 'HARDCORE -- 1 life, no second chances'));
        }

        btn.addEventListener('click', () => {
            SFX.play('ui_click');
            Screens.show('game', { mapId: mapDef.id, difficulty: diffId });
        });
        btn.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.5 }));
        return btn;
    },

    _statPill(label, value) {
        const pill = mk('div', 'ms-stat');
        pill.appendChild(mk('span', 'ms-stat-label', label));
        pill.appendChild(mk('span', 'ms-stat-value', String(value)));
        return pill;
    },

    _closeModal() {
        if (!this._modal) return;
        SFX.play('ui_close');
        if (this._modal.parentNode) this._modal.parentNode.removeChild(this._modal);
        this._modal = null;
    },

    _teardown() {
        if (this._onKey) {
            window.removeEventListener('keydown', this._onKey);
            this._onKey = null;
        }
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
        this._modal = null;
        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
    },

    unmount() {
        this._teardown();
        this._root = null;
        this._profile = null;
    },
};

Screens.register('mapselect', MapSelect);
