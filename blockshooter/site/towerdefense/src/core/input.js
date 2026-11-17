// Pointer + keyboard input. Browser-only in practice, but references DOM globals
// only inside init()/handlers, so importing under node is harmless.
//
// Pointer listeners live on `window` (not the canvas) on purpose: the canvas
// sits UNDER #screen-root in the DOM, so DOM screen overlays would swallow
// events bound to the canvas. Binding to the window guarantees we always see
// the pointer; every pointer event carries the DOM `target` and a geometric
// `inside` flag so consumers can decide whether a click landed on the playfield
// or on a UI overlay.
//
// World coordinates come from the screenToWorld function supplied at init
// (Renderer.screenToWorld), which inverts the CSS transform + canvas rect.

import { EventBus } from './events.js';

const _bus = new EventBus();
const _keys = new Set();

let _canvas = null;
let _screenToWorld = null;
let _inited = false;

function _toWorld(clientX, clientY) {
    if (!_screenToWorld) return { x: clientX, y: clientY };
    try {
        return _screenToWorld(clientX, clientY);
    } catch (e) {
        return { x: clientX, y: clientY };
    }
}

function _geomInside(clientX, clientY) {
    if (!_canvas || !_canvas.getBoundingClientRect) return false;
    const r = _canvas.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function _updateMouse(e) {
    const w = _toWorld(e.clientX, e.clientY);
    const mouse = Input.mouse;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.worldX = w.x;
    mouse.worldY = w.y;
    mouse.inside = _geomInside(e.clientX, e.clientY);
    return w;
}

function _pointerPayload(e, w) {
    return {
        x: e.clientX,
        y: e.clientY,
        worldX: w.x,
        worldY: w.y,
        button: e.button,
        inside: Input.mouse.inside,
        target: e.target,
        orig: e,
    };
}

function _onMove(e) {
    const w = _updateMouse(e);
    _bus.emit('move', _pointerPayload(e, w));
}

function _onDown(e) {
    const w = _updateMouse(e);
    if (e.button === 0) Input.mouse.down = true;
    _bus.emit('down', _pointerPayload(e, w));
}

function _onUp(e) {
    const w = _updateMouse(e);
    if (e.button === 0) Input.mouse.down = false;
    _bus.emit('up', _pointerPayload(e, w));
}

function _onWheel(e) {
    const w = _toWorld(e.clientX, e.clientY);
    _bus.emit('wheel', {
        x: e.clientX,
        y: e.clientY,
        worldX: w.x,
        worldY: w.y,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        orig: e,
    });
}

function _onKeyDown(e) {
    _keys.add(e.code);
    // Suppress OS auto-repeat: gameplay keys (Space, Esc, digits) are discrete.
    if (e.repeat) return;
    _bus.emit('key', { code: e.code, key: e.key });
}

function _onKeyUp(e) {
    _keys.delete(e.code);
}

function _onBlur() {
    // Losing focus can eat keyup events; drop held state so keys don't stick.
    _keys.clear();
    Input.mouse.down = false;
}

export const Input = {
    mouse: { x: 0, y: 0, worldX: 0, worldY: 0, down: false, inside: false },

    /**
     * Wire up listeners. Idempotent.
     * @param {HTMLCanvasElement} canvasEl the game canvas
     * @param {(clientX:number, clientY:number) => {x:number,y:number}} screenToWorldFn
     */
    init(canvasEl, screenToWorldFn) {
        if (_inited) return;
        _inited = true;
        _canvas = canvasEl;
        _screenToWorld = screenToWorldFn || null;

        window.addEventListener('pointermove', _onMove, { passive: true });
        window.addEventListener('pointerdown', _onDown);
        window.addEventListener('pointerup', _onUp);
        window.addEventListener('keydown', _onKeyDown);
        window.addEventListener('keyup', _onKeyUp);
        window.addEventListener('blur', _onBlur);

        // Right-click is used to cancel placement -- suppress the browser menu
        // across the whole game area (the stage contains both the canvas and the
        // DOM overlays that sit above it).
        const stage = (_canvas && _canvas.parentNode) || _canvas;
        if (stage && stage.addEventListener) {
            stage.addEventListener('contextmenu', (e) => e.preventDefault());
        }
        // Wheel on the stage: no preventDefault so scrollable UI panels keep
        // working; we only report it.
        if (stage && stage.addEventListener) {
            stage.addEventListener('wheel', _onWheel, { passive: true });
        }
    },

    /**
     * Subscribe to an input event.
     * @param {'move'|'down'|'up'|'key'|'wheel'} evt
     * @param {(payload: object) => void} fn
     * @returns {() => void} unsubscribe
     */
    on(evt, fn) {
        return _bus.on(evt, fn);
    },

    /** Is a key (KeyboardEvent.code) currently held down? */
    isDown(code) {
        return _keys.has(code);
    },
};
