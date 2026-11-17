// Object pool. Headless-safe. Recycles allocation-heavy sim objects
// (projectiles, particles) to keep per-frame GC pressure near zero.
//
// The pool tracks its currently checked-out ("live") objects in a Set so that
// releaseAll() can reclaim everything at once (e.g. on world clear / round
// reset) without the caller keeping a parallel list, and so size reports the
// number of live objects. Set add/delete are O(1) and allocation-free.

export class Pool {
    /**
     * @param {() => object} factory creates a fresh object when the free list
     *   is empty.
     * @param {(obj: object) => void} [resetFn] clears an object on release so it
     *   is clean for the next get().
     */
    constructor(factory, resetFn) {
        this._factory = factory;
        this._reset = resetFn || null;
        this._free = [];
        this._live = new Set();
    }

    /** Check out an object (reused or freshly built). */
    get() {
        const obj = this._free.length ? this._free.pop() : this._factory();
        this._live.add(obj);
        return obj;
    }

    /** Return an object to the pool. Safe to call on an untracked object. */
    release(obj) {
        if (!this._live.delete(obj)) {
            // Not currently checked out from this pool -- ignore double/foreign
            // releases so we never corrupt the free list.
            return;
        }
        if (this._reset) this._reset(obj);
        this._free.push(obj);
    }

    /** Reclaim every live object at once. */
    releaseAll() {
        if (this._reset) {
            for (const obj of this._live) this._reset(obj);
        }
        for (const obj of this._live) this._free.push(obj);
        this._live.clear();
    }

    /** Number of objects currently checked out. */
    get size() {
        return this._live.size;
    }
}
