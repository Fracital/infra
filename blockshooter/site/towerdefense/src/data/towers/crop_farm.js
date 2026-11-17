// Crop Farm -- the economy engine: wheat plots that pay out at round end
// (CONTRACTS Appendix A entry 15).
//
// Three income philosophies:
//   P0 Bumper Crops  -- raw per-round harvest scaling (the base income attack's
//                       amount; the synthesized onRoundEnd hook pays it out).
//   P1 Village Bank  -- a compounding vault: each round the bank deposits and
//                       earns interest (tower.bankBalance), collected on demand.
//   P2 Trading Post  -- emeralds on kills + a discount aura for nearby towers.
//
// Engine notes that dictated the P2 design: mobs.die() pays a FLAT def.bounty and
// consults no per-mob or global bounty multiplier, and there is no global onKill
// hook. So "bounty aura" is implemented by subscribing to the 'mob:death' bus
// event and awarding a fraction of the dead mob's bounty (which IS, precisely, a
// +X% bounty). The subscription self-cleans when the farm is sold (it checks the
// tower is still on the board and unsubscribes otherwise). Discounts ride on
// stats.discountAura, which game.priceFor() consults directly. No sim imports:
// cash is credited through ctx.game.economy.award, exactly like the reference.

/** Feedback for a harvest payout (the cash itself is awarded by the income hook). */
function harvestFx(ctx) {
    var g = ctx.game;
    var t = ctx.tower;
    if (g.sfx) g.sfx.play('harvest');
    if (g.fx) g.fx.spawn('emerald', t.x, t.y - 6, { count: 6 });
}

/** Golden Harvest ability: reap another full round's income immediately. */
function harvestNow(ctx) {
    var t = ctx.tower;
    var g = ctx.game;
    var atk = t.stats.attacks && t.stats.attacks[0];
    var amt = (atk && atk.amount) || 0;
    if (amt <= 0) return;
    g.economy.award(g, amt, t.x, t.y);
    if (g.sfx) g.sfx.play('harvest');
    if (g.fx) g.fx.spawn('emerald', t.x, t.y - 6, { count: 10 });
}

/**
 * Village Bank: deposit + compound interest each round, auto-collecting when the
 * vault is full. bankBalance lives on the tower instance and survives recomputes.
 */
function bankRound(ctx) {
    var t = ctx.tower;
    var g = ctx.game;
    var b = t.stats && t.stats.bank;
    if (!b) return;
    if (t.bankBalance == null) t.bankBalance = 0;
    t.bankBalance += b.deposit;
    t.bankBalance += t.bankBalance * b.rate;
    if (t.bankBalance >= b.cap) {
        var pay = Math.floor(t.bankBalance);
        t.bankBalance = 0;
        g.economy.award(g, pay, t.x, t.y);
        if (g.sfx) g.sfx.play('bank');
    }
}

/** Manual cash-out of everything currently held in the vault. */
function collectBank(ctx) {
    var t = ctx.tower;
    var g = ctx.game;
    var pay = Math.floor(t.bankBalance || 0);
    if (pay <= 0) return;
    t.bankBalance = 0;
    g.economy.award(g, pay, t.x, t.y);
    if (g.sfx) g.sfx.play('bank');
    if (g.fx) g.fx.spawn('emerald', t.x, t.y - 6, { count: 8 });
}

/**
 * Trading Post: wire a one-time 'mob:death' listener that drops emeralds worth a
 * fraction of the slain mob's bounty (radius <= 0 or huge = global). Guarded so
 * it wires only once and disappears when the farm is sold.
 */
function wireMerchant(ctx) {
    var t = ctx.tower;
    var g = ctx.game;
    if (t._merchantWired) return;
    t._merchantWired = true;
    var unsub = g.bus.on('mob:death', function (ev) {
        if (g.towers.indexOf(t) === -1) { if (t._merchantUnsub) t._merchantUnsub(); return; }
        var mc = t.stats && t.stats.merchant;
        var m = ev && ev.mob;
        if (!mc || !m) return;
        var r = mc.radius;
        if (r > 0) {
            var dx = m.x - t.x;
            var dy = m.y - t.y;
            if (dx * dx + dy * dy > r * r) return;
        }
        var bounty = (m.def && m.def.bounty) || 0;
        var bonus = Math.floor(bounty * mc.frac);
        if (bonus > 0) {
            g.economy.award(g, bonus, m.x, m.y);
            if (g.fx) g.fx.spawn('emerald', m.x, m.y, { count: 2 });
        }
    });
    t._merchantUnsub = unsub;
}

export default {
    id: 'crop_farm',
    name: 'Crop Farm',
    category: 'support',
    cost: 1000,
    desc: 'Wheat plots that ripen into a cash harvest at the end of every round.',
    placement: 'land',
    footprint: 20,
    base: {
        range: 90,
        camoDetect: false,
        seesFlying: true,
        attacks: [
            {
                kind: 'income',
                cooldown: 1,
                amount: 120,
                when: 'roundEnd',
                sfx: 'harvest',
            },
        ],
    },
    paths: [
        {
            name: 'Bumper Crops',
            upgrades: [
                {
                    name: 'Fertilizer',
                    cost: 600,
                    desc: 'Richer soil: +90 per harvest, with a satisfying reap.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.amount', add: 90 },
                        { type: 'behavior', hook: 'onRoundEnd', fn: harvestFx },
                    ],
                },
                {
                    name: 'Greenhouse',
                    cost: 900,
                    desc: 'Year-round growth: +140 per harvest.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.amount', add: 140 },
                    ],
                },
                {
                    name: 'Irrigation',
                    cost: 3000,
                    desc: 'Channelled water doubles the yield: +260 per harvest.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.amount', add: 260 },
                    ],
                },
                {
                    name: 'Combine Harvester',
                    cost: 8000,
                    desc: 'Industrial reaping: +480 per harvest.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.amount', add: 480 },
                    ],
                },
                {
                    name: 'Golden Harvest',
                    cost: 26000,
                    desc: 'A staggering $1,600 per round, plus an instant-harvest ability.',
                    effects: [
                        { type: 'stat', target: 'attacks.0.amount', set: 1600 },
                        {
                            type: 'ability',
                            ability: {
                                id: 'golden_harvest',
                                name: 'Golden Harvest',
                                desc: 'Instantly reap a full round\'s harvest.',
                                cooldown: 50,
                                use: harvestNow,
                            },
                        },
                    ],
                },
            ],
        },
        {
            name: 'Village Bank',
            upgrades: [
                {
                    name: 'Village Bank',
                    cost: 700,
                    desc: 'Bank $250 each round at 12% interest; collect it whenever you like.',
                    effects: [
                        { type: 'stat', target: 'bank', set: { deposit: 250, rate: 0.12, cap: 2500 } },
                        { type: 'behavior', hook: 'onRoundEnd', fn: bankRound },
                        {
                            type: 'ability',
                            ability: {
                                id: 'bank_collect',
                                name: 'Collect',
                                desc: 'Withdraw everything held in the vault.',
                                cooldown: 1,
                                use: collectBank,
                            },
                        },
                    ],
                },
                {
                    name: 'Interest Account',
                    cost: 1100,
                    desc: 'Deposit $400/round at 14% interest, holding up to $4,000.',
                    effects: [
                        { type: 'stat', target: 'bank', set: { deposit: 400, rate: 0.14, cap: 4000 } },
                    ],
                },
                {
                    name: 'Loan Shark',
                    cost: 3200,
                    desc: 'Deposit $650/round at 16% interest, holding up to $7,000.',
                    effects: [
                        { type: 'stat', target: 'bank', set: { deposit: 650, rate: 0.16, cap: 7000 } },
                    ],
                },
                {
                    name: 'Central Reserve',
                    cost: 8500,
                    desc: 'Deposit $1,000/round at 18% interest, holding up to $12,000.',
                    effects: [
                        { type: 'stat', target: 'bank', set: { deposit: 1000, rate: 0.18, cap: 12000 } },
                    ],
                },
                {
                    name: 'Emerald Vault',
                    cost: 28000,
                    desc: 'Deposit $1,800/round at a booming 22% interest, holding up to $24,000.',
                    effects: [
                        { type: 'stat', target: 'bank', set: { deposit: 1800, rate: 0.22, cap: 24000 } },
                    ],
                },
            ],
        },
        {
            name: 'Trading Post',
            upgrades: [
                {
                    name: 'Trading Post',
                    cost: 650,
                    desc: 'Kills near the farm drop +50% bounty in emeralds; nearby towers cost 5% less.',
                    effects: [
                        { type: 'stat', target: 'merchant', set: { frac: 0.5, radius: 170 } },
                        { type: 'stat', target: 'discountAura', set: { radius: 150, mul: 0.95 } },
                        { type: 'behavior', hook: 'onRoundStart', fn: wireMerchant },
                    ],
                },
                {
                    name: 'Haggler',
                    cost: 1000,
                    desc: '+70% bounty from nearby kills; nearby towers cost 8% less.',
                    effects: [
                        { type: 'stat', target: 'merchant', set: { frac: 0.7, radius: 200 } },
                        { type: 'stat', target: 'discountAura', set: { radius: 160, mul: 0.92 } },
                    ],
                },
                {
                    name: 'Bulk Trader',
                    cost: 2800,
                    desc: '+90% bounty over a wider market; nearby towers cost 12% less.',
                    effects: [
                        { type: 'stat', target: 'merchant', set: { frac: 0.9, radius: 240 } },
                        { type: 'stat', target: 'discountAura', set: { radius: 180, mul: 0.88 } },
                    ],
                },
                {
                    name: 'Guild Charter',
                    cost: 7500,
                    desc: '+110% bounty across half the map; nearby towers cost 16% less.',
                    effects: [
                        { type: 'stat', target: 'merchant', set: { frac: 1.1, radius: 300 } },
                        { type: 'stat', target: 'discountAura', set: { radius: 200, mul: 0.84 } },
                    ],
                },
                {
                    name: 'Master Merchant',
                    cost: 24000,
                    desc: 'Every kill anywhere pays +25% bounty; nearby towers cost 22% less.',
                    effects: [
                        { type: 'stat', target: 'merchant', set: { frac: 0.25, radius: 4000 } },
                        { type: 'stat', target: 'discountAura', set: { radius: 260, mul: 0.78 } },
                    ],
                },
            ],
        },
    ],
};
