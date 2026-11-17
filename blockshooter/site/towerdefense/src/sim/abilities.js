// Activated ability runtime. Headless-safe, dependency-free.
//
// Abilities are collected onto towers by recomputeStats() (effect type
// 'ability'). Cooldown state persists on the tower instance (tower.abilityState),
// keyed by uid + ability id so multiple towers of the same type don't share
// timers. game.js drives update(); the ability bar UI drives collect()/use().

const _warnedUse = new WeakSet();

function ensureState(tower, key) {
    if (!tower.abilityState) tower.abilityState = new Map();
    let st = tower.abilityState.get(key);
    if (!st) { st = { remaining: 0 }; tower.abilityState.set(key, st); }
    return st;
}

function keyFor(tower, ability) {
    return tower.uid + ':' + ability.id;
}

export const AbilityRuntime = {
    /**
     * One descriptor per ability instance across all towers.
     * @returns {Array<{key:string, def:object, tower:object, remaining:number, ready:boolean}>}
     */
    collect(game) {
        const out = [];
        const towers = game.towers || [];
        for (let i = 0; i < towers.length; i++) {
            const t = towers[i];
            if (!t || !t.abilities) continue;
            for (let j = 0; j < t.abilities.length; j++) {
                const ab = t.abilities[j];
                if (!ab || !ab.def) continue;
                const key = keyFor(t, ab.def);
                const st = ensureState(t, key);
                out.push({ key, def: ab.def, tower: t, remaining: st.remaining, ready: st.remaining <= 0 });
            }
        }
        return out;
    },

    /**
     * Fire an ability by key if ready. Runs def.use({game, tower}), plays the
     * ability sfx, starts the cooldown, emits 'ability:used'.
     * @returns {boolean} whether it fired
     */
    use(game, key) {
        const towers = game.towers || [];
        for (let i = 0; i < towers.length; i++) {
            const t = towers[i];
            if (!t || !t.abilities) continue;
            for (let j = 0; j < t.abilities.length; j++) {
                const ab = t.abilities[j];
                if (!ab || !ab.def || keyFor(t, ab.def) !== key) continue;
                const st = ensureState(t, key);
                if (st.remaining > 0) return false;
                try {
                    ab.def.use({ game, tower: t });
                } catch (err) {
                    if (!_warnedUse.has(ab.def)) {
                        _warnedUse.add(ab.def);
                        // eslint-disable-next-line no-console
                        console.warn('[abilities] use() threw (suppressed further):', err);
                    }
                }
                if (game.sfx) game.sfx.play('ability_use');
                st.remaining = ab.def.cooldown || 0;
                if (game.bus) game.bus.emit('ability:used', { ability: ab.def, tower: t });
                return true;
            }
        }
        return false;
    },

    /** Tick every ability cooldown; emit 'ability:ready' on the ready edge. */
    update(game, dt) {
        const towers = game.towers || [];
        for (let i = 0; i < towers.length; i++) {
            const t = towers[i];
            if (!t || !t.abilities) continue;
            for (let j = 0; j < t.abilities.length; j++) {
                const ab = t.abilities[j];
                if (!ab || !ab.def) continue;
                const key = keyFor(t, ab.def);
                const st = ensureState(t, key);
                if (st.remaining > 0) {
                    st.remaining -= dt;
                    if (st.remaining <= 0) {
                        st.remaining = 0;
                        if (game.bus) game.bus.emit('ability:ready', { ability: ab.def, tower: t });
                    }
                }
            }
        }
    },
};
