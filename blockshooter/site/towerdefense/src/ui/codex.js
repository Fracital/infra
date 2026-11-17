// Codex screen -- an in-game encyclopedia with three tabs: TOWERS, HEROES, MOBS.
//
// TOWERS/HEROES use a master list (left) + detail panel (right). Tower detail
// lays out all three upgrade paths (5 tiers each) with names, costs and effect
// text; hero detail lists the full 20-level progression. MOBS is a card grid
// showing each roster entry's sprite, stats, flags, immunities and spawn chain.
//
// Screen contract (CONTRACTS Section 4): registered under 'codex'; mount builds
// its own container inside the passed root, unmount removes it and the key hook.
// Sprite canvases from the shared caches are copied into fresh canvases so the
// codex never steals a cached canvas out of another screen's DOM.

import { Screens } from './screens.js';
import { SFX } from '../audio/sfx.js';
import { PATH_COLORS } from '../core/constants.js';
import { TOWER_LIST } from '../data/towers/index.js';
import { HERO_LIST } from '../data/heroes/index.js';
import { MOBS, MOB_IDS } from '../data/mobs.js';
import { TowerSprites } from '../gfx/towersprites.js';
import { MobSprites } from '../gfx/mobsprites.js';

const TABS = [
    { id: 'towers', label: 'TOWERS' },
    { id: 'heroes', label: 'HEROES' },
    { id: 'mobs', label: 'MOBS' },
];

const FLAG_BADGES = [
    { key: 'camo', label: 'CAMO', cls: 'cx-badge-camo' },
    { key: 'armored', label: 'ARMORED', cls: 'cx-badge-armored' },
    { key: 'flying', label: 'FLYING', cls: 'cx-badge-flying' },
    { key: 'boss', label: 'BOSS', cls: 'cx-badge-boss' },
];

function mk(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
}

function prettify(s) {
    return String(s || '')
        .split('_')
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' ');
}

// Copy a cached sprite/icon canvas into a fresh, fixed-size canvas, scaled to fit
// while preserving aspect (pixelated). Returns a blank canvas if src is missing.
function spriteCanvas(src, w, h, pad) {
    const c = mk('canvas', 'cx-sprite');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (src && src.width && src.height) {
        const inner = Math.max(0, (pad || 0));
        const scale = Math.min((w - inner * 2) / src.width, (h - inner * 2) / src.height);
        const dw = Math.max(1, src.width * scale);
        const dh = Math.max(1, src.height * scale);
        ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
    return c;
}

export const Codex = {
    _root: null,
    _container: null,
    _content: null,
    _onKey: null,
    _tab: 'towers',
    _selTower: 0,
    _selHero: 0,

    mount(rootEl) {
        this._teardown();
        this._root = rootEl;
        this._tab = 'towers';

        const container = mk('div', 'cx-root anim-fade');
        this._container = container;

        // ---- header: back + title + tab bar ----
        const header = mk('div', 'cx-header');
        const back = mk('button', 'mc-btn mc-btn-small cx-back', 'BACK');
        back.addEventListener('click', () => {
            SFX.play('ui_close');
            Screens.show('menu');
        });
        back.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.5 }));
        header.appendChild(back);
        header.appendChild(mk('div', 'cx-title pixel-title', 'CODEX'));

        const tabBar = mk('div', 'cx-tabs');
        this._tabButtons = {};
        for (const t of TABS) {
            const tb = mk('button', 'cx-tab', t.label);
            tb.addEventListener('click', () => this._switchTab(t.id));
            tb.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.4 }));
            this._tabButtons[t.id] = tb;
            tabBar.appendChild(tb);
        }
        header.appendChild(tabBar);
        container.appendChild(header);

        // ---- content (rebuilt per tab) ----
        this._content = mk('div', 'cx-content');
        container.appendChild(this._content);

        this._onKey = (ev) => {
            if (ev.key !== 'Escape') return;
            SFX.play('ui_close');
            Screens.show('menu');
        };
        window.addEventListener('keydown', this._onKey);

        rootEl.appendChild(container);
        this._renderTab();
    },

    _switchTab(id) {
        if (this._tab === id) return;
        SFX.play('ui_click');
        this._tab = id;
        this._renderTab();
    },

    _renderTab() {
        for (const t of TABS) {
            const tb = this._tabButtons[t.id];
            if (tb) tb.classList.toggle('active', t.id === this._tab);
        }
        this._content.innerHTML = '';
        if (this._tab === 'towers') this._renderTowers();
        else if (this._tab === 'heroes') this._renderHeroes();
        else this._renderMobs();
    },

    // ============ TOWERS ============
    _renderTowers() {
        const master = mk('div', 'cx-master');
        const detail = mk('div', 'cx-detail');
        this._content.appendChild(master);
        this._content.appendChild(detail);

        TOWER_LIST.forEach((def, i) => {
            const item = mk('div', 'cx-master-item mc-slot');
            item.appendChild(spriteCanvas(TowerSprites.icon(def.id), 40, 40, 2));
            const meta = mk('div', 'cx-master-meta');
            meta.appendChild(mk('div', 'cx-master-name', def.name || def.id));
            meta.appendChild(mk('div', 'cx-master-sub', prettify(def.category)));
            item.appendChild(meta);
            item.addEventListener('click', () => {
                SFX.play('ui_click');
                this._selTower = i;
                this._paintTowerMaster(master);
                this._paintTowerDetail(detail, def);
            });
            item.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.35 }));
            item._cxIndex = i;
            master.appendChild(item);
        });

        if (this._selTower >= TOWER_LIST.length) this._selTower = 0;
        this._paintTowerMaster(master);
        this._paintTowerDetail(detail, TOWER_LIST[this._selTower]);
    },

    _paintTowerMaster(master) {
        for (const item of master.children) {
            item.classList.toggle('selected', item._cxIndex === this._selTower);
        }
    },

    _paintTowerDetail(detail, def) {
        detail.innerHTML = '';
        if (!def) return;

        const head = mk('div', 'cx-detail-head');
        head.appendChild(spriteCanvas(TowerSprites.icon(def.id), 72, 72, 4));
        const htext = mk('div', 'cx-detail-headtext');
        htext.appendChild(mk('div', 'cx-detail-name', def.name || def.id));
        const tags = mk('div', 'cx-detail-tags');
        tags.appendChild(mk('span', 'cx-tag', prettify(def.category)));
        if (def.cost != null) tags.appendChild(mk('span', 'cx-tag cx-tag-cost', '$' + def.cost));
        if (def.placement && def.placement !== 'land') tags.appendChild(mk('span', 'cx-tag', prettify(def.placement) + ' only'));
        htext.appendChild(tags);
        htext.appendChild(mk('div', 'cx-detail-desc text-dim', def.desc || ''));
        head.appendChild(htext);
        detail.appendChild(head);

        const paths = mk('div', 'cx-paths');
        const pdefs = Array.isArray(def.paths) ? def.paths : [];
        for (let pi = 0; pi < 3; pi++) {
            const path = pdefs[pi] || { name: 'Path ' + (pi + 1), upgrades: [] };
            const col = mk('div', 'cx-path-col');
            const color = PATH_COLORS[pi] || '#888';
            const ch = mk('div', 'cx-path-head', path.name || 'Path ' + (pi + 1));
            ch.style.color = color;
            ch.style.borderColor = color;
            col.appendChild(ch);

            const ups = Array.isArray(path.upgrades) ? path.upgrades : [];
            for (let ti = 0; ti < ups.length; ti++) {
                const up = ups[ti] || {};
                const row = mk('div', 'cx-up-row');
                row.style.borderLeftColor = color;
                row.appendChild(spriteCanvas(TowerSprites.upgradeIcon(def.id, pi, ti + 1), 40, 40, 1));
                const ut = mk('div', 'cx-up-text');
                const line = mk('div', 'cx-up-line');
                line.appendChild(mk('span', 'cx-up-tier', 'T' + (ti + 1)));
                line.appendChild(mk('span', 'cx-up-name', up.name || '--'));
                if (up.cost != null) line.appendChild(mk('span', 'cx-up-cost', '$' + up.cost));
                ut.appendChild(line);
                ut.appendChild(mk('div', 'cx-up-desc text-dim', up.desc || ''));
                row.appendChild(ut);
                col.appendChild(row);
            }
            paths.appendChild(col);
        }
        detail.appendChild(paths);
    },

    // ============ HEROES ============
    _renderHeroes() {
        const master = mk('div', 'cx-master');
        const detail = mk('div', 'cx-detail');
        this._content.appendChild(master);
        this._content.appendChild(detail);

        HERO_LIST.forEach((def, i) => {
            const item = mk('div', 'cx-master-item mc-slot');
            item.appendChild(spriteCanvas(TowerSprites.heroIcon(def.id), 40, 40, 2));
            const meta = mk('div', 'cx-master-meta');
            meta.appendChild(mk('div', 'cx-master-name', def.name || def.id));
            meta.appendChild(mk('div', 'cx-master-sub', 'Hero'));
            item.appendChild(meta);
            item.addEventListener('click', () => {
                SFX.play('ui_click');
                this._selHero = i;
                this._paintHeroMaster(master);
                this._paintHeroDetail(detail, def);
            });
            item.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.35 }));
            item._cxIndex = i;
            master.appendChild(item);
        });

        if (this._selHero >= HERO_LIST.length) this._selHero = 0;
        this._paintHeroMaster(master);
        this._paintHeroDetail(detail, HERO_LIST[this._selHero]);
    },

    _paintHeroMaster(master) {
        for (const item of master.children) {
            item.classList.toggle('selected', item._cxIndex === this._selHero);
        }
    },

    _paintHeroDetail(detail, def) {
        detail.innerHTML = '';
        if (!def) return;

        const head = mk('div', 'cx-detail-head');
        head.appendChild(spriteCanvas(TowerSprites.heroIcon(def.id), 72, 72, 4));
        const htext = mk('div', 'cx-detail-headtext');
        htext.appendChild(mk('div', 'cx-detail-name', def.name || def.id));
        const tags = mk('div', 'cx-detail-tags');
        tags.appendChild(mk('span', 'cx-tag', 'Hero'));
        if (def.cost != null) tags.appendChild(mk('span', 'cx-tag cx-tag-cost', '$' + def.cost));
        htext.appendChild(tags);
        htext.appendChild(mk('div', 'cx-detail-desc text-dim', def.desc || ''));
        head.appendChild(htext);
        detail.appendChild(head);

        // Build the 20-level list: level 1 is the recruited base, 2-20 come from
        // heroDef.levels. Rows whose effects grant an ability are flagged.
        const rows = [{ level: 1, desc: def.desc || 'Recruited to the battlefield.', ability: false }];
        const lv = Array.isArray(def.levels) ? def.levels.slice() : [];
        lv.sort((a, b) => (a.level || 0) - (b.level || 0));
        for (const l of lv) {
            const hasAbility = Array.isArray(l.effects) && l.effects.some((e) => e && e.type === 'ability');
            rows.push({ level: l.level, desc: l.desc || '', ability: hasAbility });
        }

        const list = mk('div', 'cx-levels');
        list.appendChild(mk('div', 'cx-levels-head', 'PROGRESSION -- LEVELS 1 to 20'));
        for (const r of rows) {
            const row = mk('div', 'cx-level-row');
            if (r.ability) row.classList.add('cx-level-ability');
            row.appendChild(mk('span', 'cx-level-badge', String(r.level)));
            const txt = mk('div', 'cx-level-text');
            txt.appendChild(mk('span', 'cx-level-desc', r.desc));
            if (r.ability) txt.appendChild(mk('span', 'cx-level-tag', 'ABILITY'));
            row.appendChild(txt);
            list.appendChild(row);
        }
        detail.appendChild(list);
    },

    // ============ MOBS ============
    _renderMobs() {
        const grid = mk('div', 'cx-mob-grid');
        this._content.appendChild(grid);

        for (const id of MOB_IDS) {
            const def = MOBS[id];
            if (!def) continue;
            grid.appendChild(this._buildMobCard(def));
        }
    },

    _buildMobCard(def) {
        const card = mk('div', 'cx-mob-card mc-slot');
        if (def.flags && def.flags.boss) card.classList.add('cx-mob-boss');

        const spr = MobSprites.sprite(def.id, 0, 'normal');
        const box = mk('div', 'cx-mob-sprite');
        box.appendChild(spriteCanvas(spr, 72, 72, 3));
        card.appendChild(box);

        card.appendChild(mk('div', 'cx-mob-name', def.name || def.id));

        const stats = mk('div', 'cx-mob-stats');
        stats.appendChild(this._mobStat('HP', def.hp));
        stats.appendChild(this._mobStat('SPD', def.speed));
        stats.appendChild(this._mobStat('BNTY', def.bounty));
        card.appendChild(stats);

        const badges = mk('div', 'cx-mob-badges');
        const flags = def.flags || {};
        for (const b of FLAG_BADGES) {
            if (flags[b.key]) badges.appendChild(mk('span', 'cx-badge ' + b.cls, b.label));
        }
        if (def.alwaysRegrow) badges.appendChild(mk('span', 'cx-badge cx-badge-regrow', 'REGROW'));
        if (badges.children.length) card.appendChild(badges);

        const lines = mk('div', 'cx-mob-lines');
        if (Array.isArray(def.immunities) && def.immunities.length) {
            lines.appendChild(mk('div', 'cx-mob-line',
                'Immune: ' + def.immunities.map(prettify).join(', ')));
        }
        if (def.special) {
            lines.appendChild(mk('div', 'cx-mob-line', 'Special: ' + prettify(def.special)));
        }
        if (Array.isArray(def.children) && def.children.length) {
            const chain = def.children
                .map((c) => (MOBS[c.id] ? MOBS[c.id].name : prettify(c.id)) + ' x' + c.count)
                .join(', ');
            lines.appendChild(mk('div', 'cx-mob-line cx-mob-spawn', 'Spawns: ' + chain));
        }
        if (lines.children.length) card.appendChild(lines);

        return card;
    },

    _mobStat(label, value) {
        const s = mk('div', 'cx-mob-stat');
        s.appendChild(mk('span', 'cx-mob-stat-label', label));
        s.appendChild(mk('span', 'cx-mob-stat-value', String(value != null ? value : '--')));
        return s;
    },

    _teardown() {
        if (this._onKey) {
            window.removeEventListener('keydown', this._onKey);
            this._onKey = null;
        }
        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
        this._content = null;
    },

    unmount() {
        this._teardown();
        this._root = null;
    },
};

Screens.register('codex', Codex);
