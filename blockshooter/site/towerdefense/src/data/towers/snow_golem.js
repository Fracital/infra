// Snow Golem -- CONTRACTS Appendix A entry 2.
//
// A pumpkin-headed snow golem that pelts the track with snowballs. The snowball
// itself bonks for a little BLUNT damage (so it is never useless against the
// cold-immune Stray) while the real payload is a COLD slow -- damageType 'cold'
// so cold immunity correctly shrugs the chill off. Its three roles: a hard
// single-target freezer (P0), a field-wide slowing aura (P1), and a
// multi-snowball area chiller (P2).

/** P0 t3+: brief flash-freeze on every direct snowball hit (scales via stats). */
function freezeOnHit(ctx) {
    var m = ctx.mob;
    if (!m || !m.addStatus) return;
    var dur = (ctx.tower.stats.freezeDur != null) ? ctx.tower.stats.freezeDur : 0.5;
    m.addStatus({ id: 'freeze', duration: dur, damageType: 'cold', source: ctx.tower });
}

/** P0 t5 ability: flash-freeze the whole board and leave everything brittle. */
function absoluteZero(ctx) {
    var g = ctx.game;
    var mobs = g.mobs || [];
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m || !m.alive || !m.addStatus) continue;
        m.addStatus({ id: 'freeze', duration: 4, damageType: 'cold', source: ctx.tower });
        m.addStatus({ id: 'weakness', power: 1.3, duration: 6, damageType: 'cold', source: ctx.tower });
    }
    if (g.fx) { g.fx.flash('#bfe9ff', 0.4); g.fx.shake(0.5); }
    if (g.sfx) g.sfx.play('freeze');
}

/** P2 t5 ability: dump an avalanche of cold damage + a short stagger-freeze. */
function avalanche(ctx) {
    var g = ctx.game;
    var mobs = g.mobs || [];
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m || !m.alive) continue;
        m.takeDamage(45, 'cold', ctx.tower, {});
        if (m.alive && m.addStatus) {
            m.addStatus({ id: 'freeze', duration: 1.5, damageType: 'cold', source: ctx.tower });
        }
    }
    if (g.fx) { g.fx.shake(0.6); if (g.fx.spawn) g.fx.spawn('snowball_poof', ctx.tower.x, ctx.tower.y, { count: 24 }); }
    if (g.sfx) g.sfx.play('freeze');
}

export default {
    id: 'snow_golem',
    name: 'Snow Golem',
    category: 'primary',
    cost: 400,
    desc: 'Hurls snowballs that chill the track and can flash-freeze whole packs.',
    placement: 'land',
    footprint: 18,
    base: {
        range: 150,
        camoDetect: false,
        seesFlying: true,
        freezeDur: 0,
        attacks: [
            {
                kind: 'projectile',
                cooldown: 1.1,
                damage: 1,
                pierce: 1,
                damageType: 'blunt',
                range: null,
                count: 1,
                spread: 0,
                aoe: 0,
                projectile: { sprite: 'snowball', speed: 520, lifetime: 0.9, motion: 'straight', turnRate: 0 },
                status: { id: 'slow', power: 0.75, duration: 1.5, damageType: 'cold' },
                sfx: 'snowball',
            },
        ],
    },
    paths: [
        {
            name: 'Deep Freeze',
            upgrades: [
                {
                    name: 'Frozen Core',
                    cost: 240,
                    desc: 'Colder snowballs slow harder (to 60% speed) and linger longer.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.status.power', set: 0.6 },
                        { type: 'stat', target: 'attacks.0.status.duration', set: 2.0 },
                    ],
                },
                {
                    name: 'Glacial Chill',
                    cost: 470,
                    desc: 'Numbing cold drops chilled mobs to 45% speed.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.status.power', set: 0.45 },
                        { type: 'stat', target: 'attacks.0.damage', add: 1 },
                    ],
                },
                {
                    name: 'Flash Freeze',
                    cost: 1250,
                    desc: 'Direct hits briefly freeze the target solid.',
                    effects: [
                        { type: 'stat', target: 'freezeDur', set: 0.5 },
                        { type: 'behavior', hook: 'onHit', fn: freezeOnHit },
                    ],
                },
                {
                    name: 'Frostbite',
                    cost: 3600,
                    desc: 'Deeper freezes (0.9s) and heavier snowballs (+4 damage).',
                    effects: [
                        { type: 'stat', target: 'freezeDur', set: 0.9 },
                        { type: 'stat', target: 'attacks.0.damage', add: 4 },
                    ],
                },
                {
                    name: 'Absolute Zero',
                    cost: 11000,
                    desc: 'Longer point-blank freezes, plus an ability that freezes ALL mobs 4s and leaves them brittle.',
                    effects: [
                        { type: 'stat', target: 'freezeDur', set: 1.3 },
                        { type: 'stat', target: 'attacks.0.damage', add: 6 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'absolute_zero',
                                name: 'Absolute Zero',
                                desc: 'Flash-freezes every mob for 4s and makes them take +30% damage.',
                                cooldown: 45,
                                use: absoluteZero,
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Permafrost Aura',
            upgrades: [
                {
                    name: 'Permafrost Aura',
                    cost: 260,
                    desc: 'A steady chill radiates out, slowing every nearby mob.',
                    effects: [
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'aura',
                                cooldown: 0.4,
                                tick: 0.4,
                                radius: 120,
                                damageType: 'cold',
                                status: { id: 'slow', power: 0.8, duration: 0.8, damageType: 'cold' },
                                auraFx: 'frost',
                            },
                        },
                    ],
                },
                {
                    name: 'Biting Cold',
                    cost: 520,
                    desc: 'The chill reaches further and bites down to 70% speed.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.radius', mul: 1.3 },
                        { type: 'stat', target: 'attacks.1.status.power', set: 0.7 },
                    ],
                },
                {
                    name: 'Deepening Cold',
                    cost: 1300,
                    desc: 'A wider, colder field slows to 55% and clings longer.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.radius', mul: 1.3 },
                        { type: 'stat', target: 'attacks.1.status.power', set: 0.55 },
                        { type: 'stat', target: 'attacks.1.status.duration', set: 1.2 },
                    ],
                },
                {
                    name: 'Brittle Frost',
                    cost: 3400,
                    desc: 'The frost makes chilled mobs brittle, taking +15% damage.',
                    effects: [
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'aura',
                                cooldown: 0.5,
                                tick: 0.5,
                                radius: 150,
                                damageType: 'cold',
                                status: { id: 'weakness', power: 1.15, duration: 0.8, damageType: 'cold' },
                            },
                        },
                    ],
                },
                {
                    name: 'Eternal Winter',
                    cost: 10500,
                    desc: 'Winter blankets the whole map: everything is slowed and brittle, and a savage local core nearly stops mobs.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.radius', set: 2000 },
                        { type: 'stat', target: 'attacks.1.status.power', set: 0.7 },
                        { type: 'stat', target: 'attacks.2.radius', set: 2000 },
                        { type: 'stat', target: 'attacks.2.status.power', set: 1.2 },
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'aura',
                                cooldown: 0.3,
                                tick: 0.3,
                                radius: 160,
                                damageType: 'cold',
                                status: { id: 'slow', power: 0.35, duration: 0.6, damageType: 'cold' },
                                auraFx: 'frost',
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Snowball Flurry',
            upgrades: [
                {
                    name: 'Double Toss',
                    cost: 240,
                    desc: 'Packs and throws two snowballs at once.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.count', add: 1 },
                        { type: 'stat', target: 'attacks.0.spread', set: 0.25 },
                    ],
                },
                {
                    name: 'Triple Toss',
                    cost: 460,
                    desc: 'A three-snowball volley with a wider fan.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.count', add: 1 },
                        { type: 'stat', target: 'attacks.0.spread', set: 0.35 },
                    ],
                },
                {
                    name: 'Snow Squall',
                    cost: 1150,
                    desc: 'Five snowballs per throw, and throws faster.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.count', add: 2 },
                        { type: 'stat', target: 'attacks.0.spread', set: 0.6 },
                        { type: 'stat', target: 'attacks.0.cooldown', mul: 0.85 },
                    ],
                },
                {
                    name: 'Blizzard Volley',
                    cost: 3200,
                    desc: 'Eight heavy snowballs in a blinding spray.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.count', add: 3 },
                        { type: 'stat', target: 'attacks.0.spread', set: 0.9 },
                        { type: 'stat', target: 'attacks.0.damage', add: 2 },
                    ],
                },
                {
                    name: 'Avalanche',
                    cost: 9600,
                    desc: 'A fourteen-snowball barrage, plus an ability that buries the map in cold damage and staggers everything.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.count', set: 14 },
                        { type: 'stat', target: 'attacks.0.spread', set: 1.4 },
                        { type: 'stat', target: 'attacks.0.damage', add: 3 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'avalanche',
                                name: 'Avalanche',
                                desc: 'Dumps a map-wide avalanche: heavy cold damage and a 1.5s stagger-freeze on every mob.',
                                cooldown: 45,
                                use: avalanche,
                            },
                        },
                    ],
                },
            ],
        },
    ],
};
