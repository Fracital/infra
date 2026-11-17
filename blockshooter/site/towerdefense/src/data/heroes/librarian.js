// Librarian -- the support hero (CONTRACTS Appendix D).
//
// A wandering enchanter who rotates a powerful damage enchant through nearby
// towers while plinking with arcane bolts of her own. The level curve scales the
// bolt every level for a real bump and pushes the enchant at the signature beats:
// 5 (stronger, longer enchant), 8 (stronger + wider reach), 13 (stronger + faster
// rotation) and 16 (stronger + longer). Abilities land at 3 (Mending) and 10
// (Mass Enchant); level 20 lets her enchant two towers at once. Headless-safe.

/** L2+ rotating enchant: hand a strong damage buff to the next nearby tower(s) on a timer. */
function librarianEnchant(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    t._enchT = (t._enchT || 0) + ctx.dt;
    var iv = (t.stats && t.stats.enchantInterval) || 2.5;
    if (t._enchT < iv) return;
    t._enchT = 0;

    var range = (t.stats && t.stats.enchantRange) || 170;
    var r2 = range * range;
    var cand = [];
    var towers = g.towers;
    for (var i = 0; i < towers.length; i++) {
        var tw = towers[i];
        if (!tw || tw === t) continue;
        var dx = tw.x - t.x;
        var dy = tw.y - t.y;
        if (dx * dx + dy * dy <= r2) cand.push(tw);
    }
    if (!cand.length) return;
    // Stable ordering so the rotation cycles deterministically (no Math.random).
    cand.sort(function (a, b) { return a.uid - b.uid; });

    var n = Math.max(1, (t.stats && t.stats.enchantTargets) || 1);
    var mul = (t.stats && t.stats.enchantMul) || 1.3;
    var dur = (t.stats && t.stats.enchantDur) || 6;
    t._enchIdx = t._enchIdx || 0;
    for (var k = 0; k < n && k < cand.length; k++) {
        var pick = cand[(t._enchIdx + k) % cand.length];
        pick.addBuff({ id: 'librarian_enchant', source: t, dur: dur, mults: { damage: mul }, flags: {} });
        if (g.fx) g.fx.spawn('note', pick.x, pick.y - 10, { count: 2 });
    }
    t._enchIdx = (t._enchIdx + n) % cand.length;
}

export default {
    id: 'librarian',
    name: 'Librarian',
    category: 'support',
    cost: 500,
    isHero: true,
    desc: 'A wandering enchanter who empowers nearby towers and zaps stragglers.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 150,
        camoDetect: false,
        seesFlying: true,
        enchantMul: 1.3,
        enchantDur: 6,
        enchantInterval: 2.5,
        enchantRange: 170,
        enchantTargets: 1,
        attacks: [
            {
                kind: 'projectile',
                cooldown: 1.1,
                damage: 3,
                pierce: 1,
                damageType: 'magic',
                range: null,
                count: 1,
                spread: 0,
                aoe: 0,
                projectile: { sprite: 'magic', speed: 520, lifetime: 1.6, motion: 'homing', turnRate: 6 },
                sfx: 'zap',
            },
        ],
    },
    paths: [],
    levels: [
        {
            level: 2,
            desc: 'Enchant: rotate a +30% damage blessing through nearby towers. +1 bolt damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 1 },
                { type: 'behavior', hook: 'onTick', fn: librarianEnchant },
            ],
        },
        {
            level: 3,
            desc: 'Mending (ability): restore 3 lives. +8 range.',
            effects: [
                { type: 'stat', target: 'range', add: 8 },
                {
                    type: 'ability',
                    ability: {
                        id: 'librarian_mending',
                        name: 'Mending',
                        desc: 'Repair the breach and restore 3 lives.',
                        cooldown: 90,
                        use: function (ctx) {
                            var g = ctx.game;
                            g.state.lives += 3;
                            if (g.bus) g.bus.emit('lives', { lives: g.state.lives, delta: 3 });
                            if (g.fx) {
                                g.fx.spawn('heart', ctx.tower.x, ctx.tower.y - 12, { count: 8 });
                                g.fx.flash('#8ede4b', 0.12);
                            }
                            if (g.sfx) g.sfx.play('medal');
                        },
                    },
                },
            ],
        },
        {
            level: 4,
            desc: 'Focused chanting: faster bolts and +1 damage.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.95 },
                { type: 'stat', target: 'attacks.0.damage', add: 1 },
            ],
        },
        {
            level: 5,
            desc: 'Sharpness III: enchant grows to +40% damage and lasts 7s. +1 bolt damage.',
            effects: [
                { type: 'stat', target: 'enchantMul', add: 0.1 },
                { type: 'stat', target: 'enchantDur', add: 1 },
                { type: 'stat', target: 'attacks.0.damage', add: 1 },
            ],
        },
        {
            level: 6,
            desc: 'Arcane study: +2 bolt damage and +8 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 2 },
                { type: 'stat', target: 'range', add: 8 },
            ],
        },
        {
            level: 7,
            desc: 'Deft hands: faster bolts and the enchant rotates 10% sooner.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.93 },
                { type: 'stat', target: 'enchantInterval', mul: 0.9 },
            ],
        },
        {
            level: 8,
            desc: 'Efficiency: enchant hits +50% now and reaches 30px farther. +2 bolt damage.',
            effects: [
                { type: 'stat', target: 'enchantMul', add: 0.1 },
                { type: 'stat', target: 'enchantRange', add: 30 },
                { type: 'stat', target: 'attacks.0.damage', add: 2 },
            ],
        },
        {
            level: 9,
            desc: 'Arcane Sight: detects camo. +3 bolt damage.',
            effects: [
                { type: 'flag', flag: 'camoDetect' },
                { type: 'stat', target: 'attacks.0.damage', add: 3 },
            ],
        },
        {
            level: 10,
            desc: 'Mass Enchant (ability): all towers gain +25% damage for 12s. Faster bolts.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.92 },
                {
                    type: 'ability',
                    ability: {
                        id: 'librarian_mass_enchant',
                        name: 'Mass Enchant',
                        desc: 'Empower every tower on the map with +25% damage for 12 seconds.',
                        cooldown: 60,
                        use: function (ctx) {
                            var g = ctx.game;
                            var t = ctx.tower;
                            var towers = g.towers;
                            for (var i = 0; i < towers.length; i++) {
                                var tw = towers[i];
                                if (!tw) continue;
                                tw.addBuff({ id: 'librarian_mass', source: t, dur: 12, mults: { damage: 1.25 }, flags: {} });
                            }
                            if (g.fx) {
                                g.fx.spawn('magic', t.x, t.y, { count: 24, color: '#c58bff' });
                                g.fx.flash('#c58bff', 0.14);
                            }
                            if (g.sfx) g.sfx.play('crystal_hum');
                        },
                    },
                },
            ],
        },
        {
            level: 11,
            desc: 'Lasting blessing: enchant lasts 8s. +3 bolt damage.',
            effects: [
                { type: 'stat', target: 'enchantDur', add: 1 },
                { type: 'stat', target: 'attacks.0.damage', add: 3 },
            ],
        },
        {
            level: 12,
            desc: 'Rapid incantations: faster bolts and +10 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.9 },
                { type: 'stat', target: 'range', add: 10 },
            ],
        },
        {
            level: 13,
            desc: 'Sharpness V: enchant hits +65% and rotates faster still. +3 bolt damage.',
            effects: [
                { type: 'stat', target: 'enchantMul', add: 0.15 },
                { type: 'stat', target: 'enchantInterval', mul: 0.85 },
                { type: 'stat', target: 'attacks.0.damage', add: 3 },
            ],
        },
        {
            level: 14,
            desc: 'Deep lore: +4 bolt damage and +10 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 4 },
                { type: 'stat', target: 'range', add: 10 },
            ],
        },
        {
            level: 15,
            desc: 'Split bolt: bolts pierce +1 and fire faster.',
            effects: [
                { type: 'stat', target: 'attacks.0.pierce', add: 1 },
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.88 },
            ],
        },
        {
            level: 16,
            desc: 'Power VI: enchant hits +80% and lasts 10s. +4 bolt damage.',
            effects: [
                { type: 'stat', target: 'enchantMul', add: 0.15 },
                { type: 'stat', target: 'enchantDur', add: 2 },
                { type: 'stat', target: 'attacks.0.damage', add: 4 },
            ],
        },
        {
            level: 17,
            desc: 'Master scholar: +5 bolt damage and +12 range.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 5 },
                { type: 'stat', target: 'range', add: 12 },
            ],
        },
        {
            level: 18,
            desc: 'Fluent casting: faster bolts and the enchant rotates faster.',
            effects: [
                { type: 'stat', target: 'attacks.0.cooldown', mul: 0.86 },
                { type: 'stat', target: 'enchantInterval', mul: 0.85 },
            ],
        },
        {
            level: 19,
            desc: 'Grand tome: +6 bolt damage and +1 pierce.',
            effects: [
                { type: 'stat', target: 'attacks.0.damage', add: 6 },
                { type: 'stat', target: 'attacks.0.pierce', add: 1 },
            ],
        },
        {
            level: 20,
            desc: 'Dual Enchant (passive): blesses two towers at once, now +200% enchant. +6 bolt damage.',
            effects: [
                { type: 'stat', target: 'enchantTargets', set: 2 },
                { type: 'stat', target: 'enchantMul', add: 0.2 },
                { type: 'stat', target: 'attacks.0.damage', add: 6 },
            ],
        },
    ],
};
