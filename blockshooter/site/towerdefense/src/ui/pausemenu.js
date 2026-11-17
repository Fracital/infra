// Pause overlay. Browser-only. Resume / Restart / Settings / Quit.

import { SFX } from '../audio/sfx.js';
import { openSettings } from './settings.js';

export const PauseMenu = {
    /**
     * @param {HTMLElement} rootEl
     * @param {{game:object, onResume:function, onRestart:function, onQuit:function}} cfg
     */
    mount(rootEl, { game, onResume, onRestart, onQuit }) {
        this.game = game;
        this._rootEl = rootEl;
        this._onResume = onResume || function () {};
        this._onRestart = onRestart || function () {};
        this._onQuit = onQuit || function () {};
        this._open = false;

        const ov = document.createElement('div');
        ov.className = 'mc-overlay pause-overlay';

        const backdrop = document.createElement('div');
        backdrop.className = 'ov-backdrop';
        ov.appendChild(backdrop);

        const card = document.createElement('div');
        card.className = 'ov-card pause-card mc-panel';
        ov.appendChild(card);

        const title = document.createElement('div');
        title.className = 'ov-title pixel-title';
        title.textContent = 'Paused';
        card.appendChild(title);

        const list = document.createElement('div');
        list.className = 'pause-buttons';
        card.appendChild(list);

        this._btn(list, 'Resume', 'mc-btn-green', () => { this.close(); this._onResume(); });
        this._btn(list, 'Restart', '', () => { this._onRestart(); });
        this._btn(list, 'Settings', '', () => { openSettings(this._rootEl); });
        this._btn(list, 'Quit to Menu', 'mc-btn-red', () => { this._onQuit(); });

        rootEl.appendChild(ov);
        this._el = ov;
    },

    _btn(parent, label, cls, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mc-btn pause-btn' + (cls ? ' ' + cls : '');
        b.textContent = label;
        b.addEventListener('click', () => { SFX.play('ui_click'); onClick(); });
        parent.appendChild(b);
        return b;
    },

    open() {
        if (this._open) return;
        this._open = true;
        this._el.classList.add('is-open', 'anim-fade');
        SFX.play('ui_open');
    },

    close() {
        if (!this._open) return;
        this._open = false;
        this._el.classList.remove('is-open');
        SFX.play('ui_close');
    },

    get isOpen() { return this._open; },
};
