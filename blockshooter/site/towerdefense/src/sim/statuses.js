// Mob status effects. Headless-safe.
//
// Statuses live in `mob.statuses` (Map id -> state). No status stacks with
// itself: the strongest instance wins and duration refreshes. Damage-typed
// statuses respect the mob's immunities (a fire-immune mob never burns, a
// cold-immune mob never slows/freezes from a cold source). Bosses shrug off
// most of a stun/freeze (x0.25 duration) and the Warden ignores everything.

export const StatusTypes = ['slow', 'freeze', 'stun', 'burn', 'poison', 'weakness'];

const DOT_TICK = 0.5;

/**
 * True if `mob` cannot receive this status at all (Warden / matching immunity).
 * @param {*} mob
 * @param {{id:string, damageType?:string}} spec
 */
function isImmune(mob, spec) {
    const flags = mob.def.flags || {};
    // Warden: immune to ALL statuses. Encoded either as a flag or by id so we
    // stay correct regardless of how the mob data spells it.
    if (flags.immuneAllStatuses || mob.def.id === 'warden') return true;
    const dt = spec.damageType;
    if (dt && mob.def.immunities && mob.def.immunities.indexOf(dt) !== -1) return true;
    return false;
}

/**
 * Apply a status spec to a mob (no-op if immune / dead).
 * @param {*} mob
 * @param {{id:string, power?:number, duration:number, source?:*, dps?:number, damageType?:string}} spec
 * @param {*} _game unused; kept for signature symmetry with the rest of the sim
 */
export function applyStatus(mob, spec, _game) {
    if (!mob.alive || !spec) return;
    if (isImmune(mob, spec)) return;

    const map = mob.statuses;
    const id = spec.id;

    switch (id) {
        case 'slow': {
            // power = speed multiplier (<1). Strongest (lowest) wins.
            const power = spec.power != null ? spec.power : 0.5;
            const cur = map.get('slow');
            if (cur) {
                cur.power = Math.min(cur.power, power);
                cur.remaining = Math.max(cur.remaining, spec.duration);
            } else {
                map.set('slow', { type: 'slow', power, remaining: spec.duration });
            }
            break;
        }
        case 'freeze':
        case 'stun': {
            let dur = spec.duration;
            if (mob.def.flags && mob.def.flags.boss) dur *= 0.25;   // MOAB-class resistance
            const cur = map.get(id);
            if (cur) cur.remaining = Math.max(cur.remaining, dur);
            else map.set(id, { type: id, remaining: dur });
            break;
        }
        case 'burn':
        case 'poison': {
            const dps = spec.dps != null ? spec.dps : (spec.power != null ? spec.power : 1);
            const damageType = spec.damageType || (id === 'burn' ? 'fire' : 'poison');
            const cur = map.get(id);
            if (cur) {
                // burn = strongest wins; poison = refresh. Both fold to
                // "keep the strongest dps, extend the timer" which is stable.
                cur.dps = Math.max(cur.dps, dps);
                cur.remaining = Math.max(cur.remaining, spec.duration);
                cur.source = spec.source || cur.source;
                cur.damageType = damageType;
            } else {
                map.set(id, { type: id, dps, remaining: spec.duration, tick: 0, damageType, source: spec.source || null });
            }
            break;
        }
        case 'weakness': {
            // power = bonus damage-taken multiplier (>1). Strongest wins.
            const power = spec.power != null ? spec.power : 1.25;
            const cur = map.get('weakness');
            if (cur) {
                cur.power = Math.max(cur.power, power);
                cur.remaining = Math.max(cur.remaining, spec.duration);
            } else {
                map.set('weakness', { type: 'weakness', power, remaining: spec.duration });
            }
            break;
        }
        default:
            // Unknown status id: ignore rather than corrupt the map.
            return;
    }

    if (id === 'freeze' || id === 'stun') mob.frozen = true;
}

/**
 * Advance all statuses on a mob by dt: tick DoTs, expire elapsed effects,
 * recompute the frozen flag. May kill the mob via DoT (then returns early).
 * @param {*} mob
 * @param {number} dt
 * @param {*} game
 */
export function updateStatuses(mob, dt, game) {
    const map = mob.statuses;
    if (map.size === 0) { mob.frozen = false; return; }

    for (const [id, st] of [...map]) {
        if (id === 'burn' || id === 'poison') {
            st.tick += dt;
            while (st.tick >= DOT_TICK) {
                st.tick -= DOT_TICK;
                if (mob.alive) mob.takeDamage(st.dps * DOT_TICK, st.damageType, st.source, { dot: true });
            }
            if (!mob.alive) return;   // died to the tick; nothing else matters
        }
        st.remaining -= dt;
        if (st.remaining <= 0) map.delete(id);
    }

    mob.frozen = map.has('freeze') || map.has('stun');
}

/**
 * Wipe all statuses (used on cleanse / decamo-strip / resets).
 * @param {*} mob
 */
export function clearStatuses(mob) {
    mob.statuses.clear();
    mob.frozen = false;
}
