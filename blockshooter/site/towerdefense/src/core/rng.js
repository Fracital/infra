// Deterministic pseudo-random generator. Headless-safe.
//
// The entire simulation draws randomness ONLY from an instance of this class
// (game.rng) so that a given seed replays identically on any machine and under
// node. xorshift32 is used: fast, tiny state, good enough distribution for a
// game, and trivially reproducible across JS engines.

const UINT32 = 4294967296; // 2^32

export class RNG {
    /**
     * @param {number} seed uint32 seed. Zero is remapped to a nonzero constant
     *   because xorshift cannot escape a zero state.
     */
    constructor(seed) {
        this._s = (seed >>> 0) || 0x9e3779b9;
    }

    /**
     * Advance the generator.
     * @returns {number} float in [0, 1)
     */
    next() {
        let x = this._s;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this._s = x >>> 0;
        return this._s / UINT32;
    }

    /**
     * Inclusive integer in [a, b]. Order-insensitive.
     * @returns {number}
     */
    int(a, b) {
        if (b < a) { const t = a; a = b; b = t; }
        return a + Math.floor(this.next() * (b - a + 1));
    }

    /** Uniform pick from an array (undefined if empty). */
    pick(arr) {
        return arr[Math.floor(this.next() * arr.length)];
    }

    /** True with probability p (p<=0 -> never, p>=1 -> always). */
    chance(p) {
        return this.next() < p;
    }

    /** Uniform float in [a, b). */
    range(a, b) {
        return a + this.next() * (b - a);
    }

    /** Uniform angle in [0, 2*PI). */
    angle() {
        return this.next() * (Math.PI * 2);
    }

    /**
     * Current generator state as a uint32. Paired with setState() this lets the
     * checksum sample the RNG and lets a replay/resync restore an exact stream
     * position without re-deriving it from the seed.
     * @returns {number}
     */
    getState() {
        return this._s >>> 0;
    }

    /**
     * Restore a state captured by getState(). Zero is remapped to the same
     * nonzero constant the constructor uses (xorshift cannot escape a zero
     * state); a valid captured state is never zero, so this only guards misuse.
     * @param {number} s
     */
    setState(s) {
        this._s = (s >>> 0) || 0x9e3779b9;
    }
}
