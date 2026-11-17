// Right-hand build shop -- "arsenal" redesign (orchestrator-owned).
// No tabs: every category is always visible in one scrollable column with
// color-coded section rails, so the whole roster is one glance away (BTD6
// style). The hero picker lives at the top and collapses into a live status
// chip once your hero is deployed. A card click hands the tower id to
// gamescreen (placement mode); gamescreen reports back via setPlacing() so the
// active card can pulse.

import { TOWER_LIST } from '../data/towers/index.js';
import { HERO_LIST } from '../data/heroes/index.js';
import { TowerSprites } from '../gfx/towersprites.js';
import { formatCash } from '../core/mathutil.js';
import { Input } from '../core/input.js';
import { Tooltip } from './tooltips.js';
import { SFX } from '../audio/sfx.js';

const CATEGORIES = [
    { id: 'primary', label: 'Primary', color: '#ff6a4e' },
    { id: 'military', label: 'Military', color: '#5ab2ff' },
    { id: 'magic', label: 'Magic', color: '#c08aff' },
    { id: 'support', label: 'Support', color: '#3ce87a' },
];

function _esc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _titleCase(id) {
    return String(id || '')
        .split('_')
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ');
}

function _iconCanvas(src, size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    if (src) {
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src, 0, 0, size, size);
    }
    return c;
}

export const Shop = {
    mount(rootEl, game, cfg) {
        this.game = game;
        this._onSelect = (cfg && cfg.onSelect) || function () {};
        this._unsubs = [];
        this._cards = [];        // { el, def, priceEl, isHero }
        this._placing = null;
        this._collapsed = false;
        this._host = rootEl;

        // clip box so the collapse slide stays inside the shop's screen region
        const clip = document.createElement('div');
        clip.className = 'shop-clip';
        rootEl.appendChild(clip);

        // edge handle: collapses/expands the arsenal (also hotkey B)
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'shop-toggle';
        toggle.textContent = '>';
        toggle.addEventListener('click', () => this.toggleCollapsed());
        Tooltip.attach(toggle, () => (this._collapsed ? 'Open the arsenal (B)' : 'Tuck the arsenal away (B)'));
        rootEl.appendChild(toggle);
        this._toggleBtn = toggle;

        const panel = document.createElement('div');
        panel.className = 'shop-panel mc-panel';

        const head = document.createElement('div');
        head.className = 'shop-head';
        head.innerHTML = '<span class="shop-head-txt">ARSENAL</span>';
        panel.appendChild(head);

        const body = document.createElement('div');
        body.className = 'shop-body';
        panel.appendChild(body);

        // ---- hero slot (picker -> status chip once deployed) ----
        const heroSec = document.createElement('div');
        heroSec.className = 'shop-sec shop-sec-heroes';
        heroSec.innerHTML =
            '<div class="shop-sec-label" style="--cat:#ffd24a"><i class="shop-sec-dot"></i>HERO<span class="shop-sec-rule"></span></div>';
        const heroRow = document.createElement('div');
        heroRow.className = 'shop-hero-row';
        for (const def of HERO_LIST) heroRow.appendChild(this._makeHeroMini(def));
        heroSec.appendChild(heroRow);
        const heroStatus = document.createElement('div');
        heroStatus.className = 'shop-hero-status hidden';
        heroSec.appendChild(heroStatus);
        body.appendChild(heroSec);
        this._heroRow = heroRow;
        this._heroStatus = heroStatus;

        // ---- category sections, all visible ----
        for (const cat of CATEGORIES) {
            const sec = document.createElement('div');
            sec.className = 'shop-sec';
            sec.innerHTML =
                '<div class="shop-sec-label" style="--cat:' + cat.color + '">' +
                '<i class="shop-sec-dot"></i>' + cat.label.toUpperCase() +
                '<span class="shop-sec-rule"></span></div>';
            const grid = document.createElement('div');
            grid.className = 'shop-grid';
            for (const def of TOWER_LIST) {
                if (((def && def.category) || 'primary') !== cat.id) continue;
                grid.appendChild(this._makeCard(def, cat.color));
            }
            sec.appendChild(grid);
            body.appendChild(sec);
        }

        clip.appendChild(panel);
        this._panel = panel;

        this._unsubs.push(game.bus.on('cash', () => this.refresh()));
        this._unsubs.push(game.bus.on('tower:place', () => this.refresh()));
        this._unsubs.push(game.bus.on('tower:sell', () => this.refresh()));
        this._unsubs.push(game.bus.on('hero:level', () => this._renderHeroStatus()));
        this._unsubs.push(Input.on('key', (k) => {
            if (k && k.code === 'KeyB') this.toggleCollapsed();
        }));

        this.refresh();
    },

    /** Slide the arsenal off-screen (and back) to clear the view. */
    toggleCollapsed(force) {
        const next = typeof force === 'boolean' ? force : !this._collapsed;
        if (next === this._collapsed) return;
        this._collapsed = next;
        this._host.classList.toggle('is-collapsed', next);
        this._toggleBtn.textContent = next ? '<' : '>';
        Tooltip.hideAll();
        SFX.play(next ? 'ui_close' : 'ui_open', { vol: 0.6 });
    },

    unmount() {
        for (const u of this._unsubs || []) { try { u(); } catch (e) { /* ignore */ } }
        Tooltip.hideAll();
        if (this._panel && this._panel.parentNode) this._panel.parentNode.removeChild(this._panel);
    },

    /** gamescreen reports placement mode so the active card can pulse. */
    setPlacing(id) {
        this._placing = id || null;
        for (const card of this._cards) {
            card.el.classList.toggle('is-placing', !!id && card.def && card.def.id === id);
        }
    },

    refresh() {
        const g = this.game;
        if (!g) return;
        const hero = g.towers.find((t) => t.isHero) || null;
        for (const card of this._cards) {
            const base = (card.def && card.def.cost) || 0;
            const price = g.priceFor(base);
            card.priceEl.textContent = '$' + formatCash(price);
            const affordable = g.state.cash >= price;
            card.el.classList.toggle('unaffordable', !affordable);
            if (card.isHero) {
                card.el.classList.toggle('locked', !!hero);
                card.el.disabled = !!hero;
            }
        }
        this._heroRow.classList.toggle('hidden', !!hero);
        this._heroStatus.classList.toggle('hidden', !hero);
        if (hero) this._renderHeroStatus();
    },

    // ---- internals ----

    _renderHeroStatus() {
        const g = this.game;
        const hero = g && g.towers.find((t) => t.isHero);
        if (!hero || !this._heroStatus) return;
        this._heroStatus.textContent = '';
        const icon = _iconCanvas(TowerSprites.heroIcon(hero.def.id), 34);
        icon.className = 'shop-hero-status-icon';
        this._heroStatus.appendChild(icon);
        const txt = document.createElement('div');
        txt.className = 'shop-hero-status-txt';
        txt.innerHTML =
            '<div class="shop-hero-status-name">' + _esc(hero.def.name) + '</div>' +
            '<div class="shop-hero-status-lv">DEPLOYED -- LV ' + _esc(hero.level || 1) + '</div>';
        this._heroStatus.appendChild(txt);
    },

    _makeHeroMini(def) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'shop-hero-mini';
        card.appendChild(_iconCanvas(TowerSprites.heroIcon(def.id), 38));
        const price = document.createElement('div');
        price.className = 'shop-hero-mini-price';
        price.textContent = '$0';
        card.appendChild(price);

        card.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.35 }));
        card.addEventListener('click', () => {
            if (card.disabled) { SFX.play('ui_error', { vol: 0.5 }); return; }
            this._onSelect(def.id);
        });
        Tooltip.attach(card, () => {
            const p = this.game ? this.game.priceFor(def.cost || 0) : 0;
            return '<div class="tt-title">' + _esc(def.name) + '</div>' +
                '<div class="tt-sub">Hero -- one per game</div>' +
                '<div>' + _esc(def.desc || '') + '</div>' +
                '<div class="tt-cost">$' + _esc(formatCash(p)) + '</div>';
        });
        this._cards.push({ el: card, def, priceEl: price, isHero: true });
        return card;
    },

    _makeCard(def, color) {
        const id = def && def.id;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'shop-card';
        card.style.setProperty('--cat', color);

        const iconWrap = document.createElement('div');
        iconWrap.className = 'shop-card-icon';
        iconWrap.appendChild(_iconCanvas(TowerSprites.icon(id), 52));
        card.appendChild(iconWrap);

        const name = document.createElement('div');
        name.className = 'shop-card-name';
        name.textContent = (def && def.name) || _titleCase(id);
        card.appendChild(name);

        const price = document.createElement('div');
        price.className = 'shop-card-price';
        price.textContent = '$0';
        card.appendChild(price);

        card.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.35 }));
        card.addEventListener('click', () => {
            if (card.disabled) { SFX.play('ui_error', { vol: 0.5 }); return; }
            this._onSelect(id);
        });

        Tooltip.attach(card, () => {
            const p = this.game ? this.game.priceFor((def && def.cost) || 0) : 0;
            return '<div class="tt-title">' + _esc((def && def.name) || _titleCase(id)) + '</div>' +
                '<div class="tt-sub">' + _esc(_titleCase(def.category)) + (def.placement === 'water' ? ' -- WATER ONLY' : '') + '</div>' +
                '<div>' + _esc(def.desc || '') + '</div>' +
                '<div class="tt-cost">$' + _esc(formatCash(p)) + '</div>';
        });

        this._cards.push({ el: card, def, priceEl: price, isHero: false });
        return card;
    },
};
