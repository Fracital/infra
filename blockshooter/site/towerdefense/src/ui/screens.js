// Screen router. Exactly one screen is mounted at a time inside #screen-root;
// show() tears down the previous one and mounts the next into a fresh child div.
//
// register() may run at module-import time -- before init() is ever called -- so
// registrations are kept in a map that exists from the first import. show() is
// the game entry point and always runs after init() (main.js calls init() then
// show('menu')).
//
// A screen may expose an optional tick(dt): while it is mounted, a
// requestAnimationFrame loop drives it (seconds since the previous frame,
// clamped). The loop is the only owner of the rAF handle, started on mount and
// cancelled before any unmount so a stale screen never keeps drawing.

import { bus } from '../core/events.js';

const _registry = new Map();
let _root = null;
let _current = null;    // { id, screen, el }
let _rafId = 0;
let _lastT = 0;

function _clock() {
    return (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
}

function _stopLoop() {
    if (_rafId) {
        cancelAnimationFrame(_rafId);
        _rafId = 0;
    }
}

function _startLoop() {
    _stopLoop();
    if (!_current || typeof _current.screen.tick !== 'function') return;
    _lastT = _clock();
    const step = (now) => {
        // Bail if the screen was swapped out or lost its tick between frames.
        if (!_current || typeof _current.screen.tick !== 'function') {
            _rafId = 0;
            return;
        }
        let dt = (now - _lastT) / 1000;
        _lastT = now;
        if (!(dt > 0)) dt = 0;
        if (dt > 0.1) dt = 0.1;   // clamp tab-switch / GC stalls
        try {
            _current.screen.tick(dt);
        } catch (err) {
            // A bad frame must not kill the loop -- log and keep animating.
            console.error('[screens] tick error in "' + _current.id + '":', err);
        }
        _rafId = requestAnimationFrame(step);
    };
    _rafId = requestAnimationFrame(step);
}

export const Screens = {
    /**
     * Bind the router to its host element (a child of #screen-root's parent;
     * main.js passes #screen-root itself).
     * @param {HTMLElement} rootEl
     */
    init(rootEl) {
        _root = rootEl;
    },

    /**
     * Register a screen module. Safe to call before init().
     * @param {string} id
     * @param {{mount:Function, unmount?:Function, tick?:Function}} screen
     */
    register(id, screen) {
        _registry.set(id, screen);
    },

    /**
     * Unmount the current screen and mount `id` into a fresh child div.
     * Emits the global 'screen:shown' {id} after mounting.
     * @param {string} id
     * @param {object} [params] passed straight to the screen's mount()
     */
    show(id, params = {}) {
        const screen = _registry.get(id);
        if (!screen) {
            console.warn('[screens] no screen registered for "' + id + '"');
            return;
        }
        if (!_root) {
            console.warn('[screens] show("' + id + '") called before init()');
            return;
        }

        _stopLoop();
        if (_current) {
            try {
                if (typeof _current.screen.unmount === 'function') _current.screen.unmount();
            } catch (err) {
                console.error('[screens] unmount error in "' + _current.id + '":', err);
            }
            if (_current.el && _current.el.parentNode) _current.el.parentNode.removeChild(_current.el);
            _current = null;
        }

        const el = document.createElement('div');
        el.className = 'screen screen-' + id;
        _root.appendChild(el);
        _current = { id, screen, el };
        try {
            screen.mount(el, params || {});
        } catch (err) {
            console.error('[screens] mount error in "' + id + '":', err);
        }
        _startLoop();
        bus.emit('screen:shown', { id });
    },

    /** Id of the currently mounted screen, or null. */
    get current() {
        return _current ? _current.id : null;
    },
};
