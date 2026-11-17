// Iron Golem -- a slow, heavy melee guardian that slams mobs with knockback
// (CONTRACTS Appendix A entry 13). High damage per hit, long recovery. Three
// paths: raw slams (Haymaker -> Meteor Fist craters), reach + multi-hit (Long
// Arms -> Colossus), and a village-protector support role (Village Guardian).
//
// Meteor Fist leaves lingering crater zones, which needs the sim zone helper
// (permitted: only gfx/audio/ui imports are barred from data files).

import { spawnZone } from '../../sim/projectiles.js';

/**
 * P0 t4 'Seismic Slam': every slam shockwaves the impact point for half damage,
 * radius from stats.slamAoe. Raw takeDamage keeps the aoe self-contained.
 */
function seismicSlam(ctx) {
    var atk = ctx.atk;
    if (!atk || atk.kind !== 'melee') return;
    var t = ctx.targets && ctx.targets[0];
    if (!t) return;
    var tower = ctx.tower;
    var game = ctx.game;
    var r = (tower.stats && tower.stats.slamAoe) || 0;
    if (r <= 0) return;
    var dmg = (atk.damage || 0) * 0.5 * (tower.stats.damageMul || 1);
    var mobs = game.grid ? game.grid.queryCircle(t.x, t.y, r + 64) : (game.mobs || []);
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive || m === t) continue;
        var reach = r + (m.radius || 0);
        var dx = m.x - t.x;
        var dy = m.y - t.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        var dealt = m.takeDamage(dmg, 'blunt', tower, {});
        if (dealt > 0) tower.damageDealt = (tower.damageDealt || 0) + dealt;
    }
    if (game.fx) {
        game.fx.shockwave(t.x, t.y, r);
        game.fx.shake(0.3);
        if (game.fx.spawn) game.fx.spawn('blockShards', t.x, t.y, { count: 10, color: '#9a9a9a' });
    }
}

/** P0 t5 'Meteor Fist': each slam cracks the ground into a slowing crater zone. */
function meteorCrater(ctx) {
    var atk = ctx.atk;
    if (!atk || atk.kind !== 'melee') return;
    var t = ctx.targets && ctx.targets[0];
    if (!t) return;
    spawnZone(ctx.game, {
        x: t.x, y: t.y, source: ctx.tower,
        radius: 74, duration: 2.5, tickRate: 0.5,
        atk: { kind: 'zone', damage: 8, damageType: 'blunt', status: { id: 'slow', power: 0.55, duration: 1 }, zoneKind: 'blunt' },
        color: 'rgba(120,110,90,0.4)', kind: 'blunt', groundOnly: true,
    });
}

/**
 * P2 'Village Guardian': buff nearby MELEE towers (attack speed + damage). The
 * filter is what makes it melee-only, which the declarative aura buff cannot do,
 * so it runs as an onTick hook re-applying a short buff each frame.
 */
function guardianAura(ctx) {
    var tower = ctx.tower;
    var game = ctx.game;
    var spd = (tower.stats && tower.stats.allySpeed) || 1;
    var dmg = (tower.stats && tower.stats.allyDamage) || 1;
    if (spd <= 1 && dmg <= 1) return;
    var r = (tower.stats && tower.stats.guardianRadius) || 140;
    var r2 = r * r;
    var towers = game.towers;
    for (var i = 0; i < towers.length; i++) {
        var t2 = towers[i];
        if (t2 === tower) continue;
        var atks = t2.stats && t2.stats.attacks;
        var isMelee = false;
        if (atks) {
            for (var k = 0; k < atks.length; k++) {
                if (atks[k] && atks[k].kind === 'melee') { isMelee = true; break; }
            }
        }
        if (!isMelee) continue;
        var dx = t2.x - tower.x;
        var dy = t2.y - tower.y;
        if (dx * dx + dy * dy > r2) continue;
        t2.addBuff({ id: 'village_guardian:' + tower.uid, source: tower, dur: 0.5, mults: { attackSpeed: spd, damage: dmg } });
    }
}

/**
 * P2 t5 ability 'Protector of the Realm': taunt-stun every mob in range for 3s
 * (taunt is flavor -- there is no aggro system, so the stun is the mechanic) and
 * shield the realm so leaks cost no lives for 6s. The shield reacts to the
 * game's own 'mob:leak' event, refunding the lost lives inside the window.
 */
function protectorUse(ctx) {
    var game = ctx.game;
    var tower = ctx.tower;
    var r = (tower.stats.range || 88) * (tower.stats.rangeMul || 1);
    var mobs = game.grid ? game.grid.queryCircle(tower.x, tower.y, r + 64) : (game.mobs || []);
    for (var i = 0; i < mobs.length; i++) {
        var m = mobs[i];
        if (!m.alive || !m.addStatus) continue;
        var reach = r + (m.radius || 0);
        var dx = m.x - tower.x;
        var dy = m.y - tower.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        m.addStatus({ id: 'stun', power: 1, duration: 3, source: tower });
    }
    tower._shieldUntil = game.time + 6;
    if (!tower._shieldSub) {
        tower._shieldSub = true;
        game.bus.on('mob:leak', function (p) {
            if (game.time <= (tower._shieldUntil || 0)) {
                game.state.lives += p.damage;
                game.bus.emit('lives', { lives: game.state.lives, delta: p.damage });
            }
        });
    }
    if (game.fx) {
        game.fx.shockwave(tower.x, tower.y, r);
        game.fx.flash('#ffd54a', 0.15);
    }
    if (game.sfx) game.sfx.play('golem_slam');
}

export default {
    id: 'iron_golem',
    name: 'Iron Golem',
    category: 'primary',
    cost: 550,
    desc: 'A hulking guardian whose heavy slams hammer mobs back down the track.',
    placement: 'land',
    footprint: 20,
    base: {
        range: 88,
        camoDetect: false,
        seesFlying: false,
        slamAoe: 0,
        allySpeed: 1,
        allyDamage: 1,
        guardianRadius: 150,
        attacks: [
            {
                kind: 'melee',
                cooldown: 1.6,
                damage: 16,
                pierce: 1,
                damageType: 'blunt',
                range: null,
                arc: 1.5,
                knockback: 40,
                sfx: 'golem_slam',
            },
        ],
    },
    paths: [
        {
            name: 'Haymaker',
            upgrades: [
                {
                    name: 'Heavy Fists',
                    cost: 360,
                    desc: '+12 damage and a stronger knockback.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 12 },
                        { type: 'stat', target: 'attacks.0.knockback', add: 20 },
                    ],
                },
                {
                    name: 'Crushing Blow',
                    cost: 620,
                    desc: '+18 damage per slam.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 18 },
                    ],
                },
                {
                    name: 'Piledriver',
                    cost: 1700,
                    desc: '+30 damage and a bone-rattling knockback.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 30 },
                        { type: 'stat', target: 'attacks.0.knockback', add: 30 },
                    ],
                },
                {
                    name: 'Seismic Slam',
                    cost: 5200,
                    desc: '+50 damage and each slam shockwaves nearby mobs.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', add: 50 },
                        { type: 'stat', target: 'slamAoe', set: 72 },
                        { type: 'behavior', hook: 'onFire', fn: seismicSlam },
                    ],
                },
                {
                    name: 'Meteor Fist',
                    cost: 17000,
                    desc: 'An earth-shattering slam that swats flyers and leaves slowing craters.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.damage', set: 220 },
                        { type: 'stat', target: 'slamAoe', set: 120 },
                        { type: 'flag', flag: 'hitsFlying' },
                        { type: 'behavior', hook: 'onFire', fn: meteorCrater },
                    ],
                },
            ],
        },
        {
            name: 'Long Arms',
            upgrades: [
                {
                    name: 'Reaching Fists',
                    cost: 340,
                    desc: '+20% range.',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.2 },
                    ],
                },
                {
                    name: 'Wide Sweep',
                    cost: 600,
                    desc: 'A broader arc that cleaves a second mob.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.arc', set: 2.4 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 1 },
                    ],
                },
                {
                    name: 'Iron Reach',
                    cost: 1500,
                    desc: '+25% range and hits up to two more mobs per sweep.',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.25 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 2 },
                    ],
                },
                {
                    name: 'Sweeping Blows',
                    cost: 4200,
                    desc: '+20% range, an even wider arc, and +3 more targets per swing.',
                    effects: [
                        { type: 'stat', target: 'range', mul: 1.2 },
                        { type: 'stat', target: 'attacks.0.arc', set: 3 },
                        { type: 'stat', target: 'attacks.0.pierce', add: 3 },
                    ],
                },
                {
                    name: 'Colossus',
                    cost: 14000,
                    desc: 'A titan that slams every single mob in its huge range at once.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.arc', set: 6.283185 },
                        { type: 'stat', target: 'attacks.0.pierce', set: 40 },
                        { type: 'stat', target: 'range', mul: 1.3 },
                        { type: 'stat', target: 'attacks.0.damage', add: 40 },
                        { type: 'flag', flag: 'hitsFlying' },
                    ],
                },
            ],
        },
        {
            name: 'Village Guardian',
            upgrades: [
                {
                    name: 'Watchful Guardian',
                    cost: 420,
                    desc: 'An intimidating presence slows mobs that wander near.',
                    effects: [
                        {
                            type: 'attackAdd',
                            attack: {
                                kind: 'aura',
                                cooldown: 1,
                                radius: 132,
                                tick: 0.7,
                                status: { id: 'slow', power: 0.8, duration: 1 },
                                auraFx: 'smoke',
                            },
                        },
                    ],
                },
                {
                    name: 'War Drums',
                    cost: 700,
                    desc: 'Rallies nearby melee towers to attack 15% faster.',
                    effects: [
                        { type: 'stat', target: 'allySpeed', set: 1.15 },
                        { type: 'behavior', hook: 'onTick', fn: guardianAura },
                    ],
                },
                {
                    name: 'Rallying Banner',
                    cost: 1700,
                    desc: 'A harsher slow, and allies gain +20% speed and +10% damage.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.status.power', set: 0.7 },
                        { type: 'stat', target: 'allySpeed', set: 1.2 },
                        { type: 'stat', target: 'allyDamage', set: 1.1 },
                    ],
                },
                {
                    name: 'Bastion',
                    cost: 4600,
                    desc: 'A wider, stronger fear aura and greater ally buffs; the golem also hits harder.',
                    effects: [
                        { type: 'stat', target: 'attacks.1.radius', mul: 1.3 },
                        { type: 'stat', target: 'attacks.1.status.power', set: 0.6 },
                        { type: 'stat', target: 'allySpeed', set: 1.25 },
                        { type: 'stat', target: 'allyDamage', set: 1.2 },
                        { type: 'stat', target: 'attacks.0.damage', add: 30 },
                    ],
                },
                {
                    name: 'Protector of the Realm',
                    cost: 18000,
                    desc: 'Empowers allies further, plus an ability that stuns all foes and shields the realm from leaks.',
                    effects: [
                        { type: 'stat', target: 'allySpeed', set: 1.4 },
                        { type: 'stat', target: 'allyDamage', set: 1.35 },
                        { type: 'stat', target: 'attacks.1.status.power', set: 0.5 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'protector_realm',
                                name: 'Protector of the Realm',
                                desc: 'Stuns every mob in range for 3s and makes leaks cost no lives for 6s.',
                                cooldown: 60,
                                use: protectorUse,
                            },
                        },
                    ],
                },
            ],
        },
    ],
};
