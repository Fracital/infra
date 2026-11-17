// Achievements screen -- a grid of all 20 achievement cards. Unlocked cards glow
// with a gold border; locked cards are dimmed. The header shows the unlocked
// count. Unlock state is read from the persisted profile: an entry is unlocked if
// it was previously recorded (profile.achievements[id]) OR its live predicate
// passes now (def.check(profile)), so freshly-met milestones show even before the
// gamescreen has written them back.
//
// Screen contract (CONTRACTS Section 4): registered under 'achievements'; mount
// builds its own container inside the passed root; unmount removes it plus the
// key hook. Styling lives in css/codex.css (the shared codex/gallery sheet).

import { Screens } from './screens.js';
import { SFX } from '../audio/sfx.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { Save } from '../core/save.js';

function mk(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
}

// Checks are contracted to be total, but a stray throw must never blank the grid.
function isUnlocked(def, profile) {
    if (profile && profile.achievements && profile.achievements[def.id]) return true;
    try {
        return typeof def.check === 'function' && def.check(profile) === true;
    } catch (e) {
        return false;
    }
}

export const AchievementsUI = {
    _root: null,
    _container: null,
    _onKey: null,

    mount(rootEl) {
        this._teardown();
        this._root = rootEl;

        const profile = Save.loadProfile();
        let unlocked = 0;
        for (const def of ACHIEVEMENTS) if (isUnlocked(def, profile)) unlocked++;

        const container = mk('div', 'ach-root anim-fade');
        this._container = container;

        // ---- header ----
        const header = mk('div', 'ach-header');
        const back = mk('button', 'mc-btn mc-btn-small ach-back', 'BACK');
        back.addEventListener('click', () => {
            SFX.play('ui_close');
            Screens.show('menu');
        });
        back.addEventListener('mouseenter', () => SFX.play('ui_hover', { vol: 0.5 }));
        header.appendChild(back);
        header.appendChild(mk('div', 'ach-title pixel-title', 'ACHIEVEMENTS'));

        const count = mk('div', 'ach-count');
        count.appendChild(mk('span', 'ach-count-num text-gold', String(unlocked)));
        count.appendChild(mk('span', 'ach-count-total', ' / ' + ACHIEVEMENTS.length));
        header.appendChild(count);
        container.appendChild(header);

        // ---- grid ----
        const grid = mk('div', 'ach-grid');
        for (const def of ACHIEVEMENTS) {
            const got = isUnlocked(def, profile);
            const card = mk('div', 'ach-card mc-slot ' + (got ? 'unlocked' : 'locked'));

            const icon = mk('div', 'ach-icon', def.icon || '?');
            card.appendChild(icon);

            const info = mk('div', 'ach-info');
            info.appendChild(mk('div', 'ach-name', def.name || def.id));
            info.appendChild(mk('div', 'ach-desc', def.desc || ''));
            info.appendChild(mk('div', 'ach-status', got ? 'UNLOCKED' : 'LOCKED'));
            card.appendChild(info);

            grid.appendChild(card);
        }
        container.appendChild(grid);

        this._onKey = (ev) => {
            if (ev.key !== 'Escape') return;
            SFX.play('ui_close');
            Screens.show('menu');
        };
        window.addEventListener('keydown', this._onKey);

        rootEl.appendChild(container);
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
    },

    unmount() {
        this._teardown();
        this._root = null;
    },
};

Screens.register('achievements', AchievementsUI);
