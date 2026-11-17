// Minimal event bus. Headless-safe.
// Listener errors are caught and logged so one bad handler cannot kill the sim.

export class EventBus {
    constructor() {
        this._map = new Map();
    }

    /** Subscribe. Returns an unsubscribe function. */
    on(name, fn) {
        let set = this._map.get(name);
        if (!set) { set = new Set(); this._map.set(name, set); }
        set.add(fn);
        return () => this.off(name, fn);
    }

    once(name, fn) {
        const unsub = this.on(name, (payload) => { unsub(); fn(payload); });
        return unsub;
    }

    off(name, fn) {
        const set = this._map.get(name);
        if (set) set.delete(fn);
    }

    emit(name, payload) {
        const set = this._map.get(name);
        if (!set || set.size === 0) return;
        for (const fn of [...set]) {
            try {
                fn(payload);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('[events] listener error for "' + name + '":', err);
            }
        }
    }

    clear() {
        this._map.clear();
    }
}

/** Global UI-level bus. Games own their own bus instance. */
export const bus = new EventBus();
