// Path geometry for mob traversal. Headless-safe (pure math, no DOM/RNG).
//
// A Path is a polyline of world-space waypoints. Mobs advance a scalar distance
// `dist` along it; posAt(dist) maps that back to a world position + heading.
// Cumulative segment lengths are precomputed once so posAt is a binary search,
// not a re-walk of the polyline every frame.

/**
 * @typedef {{x:number, y:number, angle:number}} PathPose
 */

export class Path {
    /**
     * @param {Array<[number, number]>} waypoints world-px points, >= 1
     */
    constructor(waypoints) {
        const pts = [];
        for (const w of waypoints || []) pts.push({ x: w[0], y: w[1] });
        if (pts.length === 0) pts.push({ x: 0, y: 0 });

        this.points = pts;
        // Per-segment data + cumulative distance at each waypoint.
        this._cum = new Float64Array(pts.length);      // cum[i] = distance to reach points[i]
        this._segLen = new Float64Array(Math.max(1, pts.length - 1));
        this._segAngle = new Float64Array(Math.max(1, pts.length - 1));

        let total = 0;
        this._cum[0] = 0;
        for (let i = 1; i < pts.length; i++) {
            const dx = pts[i].x - pts[i - 1].x;
            const dy = pts[i].y - pts[i - 1].y;
            const len = Math.hypot(dx, dy);
            this._segLen[i - 1] = len;
            // Reuse the previous segment's heading for zero-length (duplicate) points
            // so a doubled waypoint doesn't snap the sprite to angle 0.
            this._segAngle[i - 1] = len > 1e-9 ? Math.atan2(dy, dx) : (i > 1 ? this._segAngle[i - 2] : 0);
            total += len;
            this._cum[i] = total;
        }
        this.length = total;
    }

    /**
     * World pose at distance d along the path (clamped to [0, length]).
     * @param {number} d
     * @returns {PathPose}
     */
    posAt(d) {
        const pts = this.points;
        if (pts.length === 1 || this.length <= 0) {
            return { x: pts[0].x, y: pts[0].y, angle: 0 };
        }
        if (d <= 0) {
            return { x: pts[0].x, y: pts[0].y, angle: this._segAngle[0] };
        }
        if (d >= this.length) {
            const last = pts.length - 1;
            return { x: pts[last].x, y: pts[last].y, angle: this._segAngle[last - 1] };
        }
        // Binary search for the segment whose cumulative span contains d.
        const cum = this._cum;
        let lo = 0;
        let hi = cum.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cum[mid + 1] <= d) lo = mid + 1;
            else hi = mid;
        }
        const seg = lo;                       // 0 .. points.length-2
        const segLen = this._segLen[seg];
        const t = segLen > 1e-9 ? (d - cum[seg]) / segLen : 0;
        const a = pts[seg];
        const b = pts[seg + 1];
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            angle: this._segAngle[seg],
        };
    }

    /**
     * Pose at a fraction [0,1] of total length.
     * @param {number} f
     * @returns {PathPose}
     */
    pointAtFrac(f) {
        return this.posAt(f * this.length);
    }

    /**
     * Shortest distance from an arbitrary point to the polyline. Used for
     * placement-mask carving (keep-out around the track).
     * @param {number} px
     * @param {number} py
     * @returns {number}
     */
    distanceTo(px, py) {
        const pts = this.points;
        if (pts.length === 1) return Math.hypot(px - pts[0].x, py - pts[0].y);
        let best = Infinity;
        for (let i = 1; i < pts.length; i++) {
            const d = distToSegment(px, py, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
            if (d < best) best = d;
        }
        return best;
    }
}

function distToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    if (len2 <= 1e-12) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * abx + (py - ay) * aby) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
}
