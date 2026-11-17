// Cash flow. Headless-safe.
//
// Single choke point for every credit/debit so the 'cash' event and coin FX
// stay consistent. Kills award bounty here; end-of-round pays the base bonus.
// Farm/bank income is paid by tower onRoundEnd hooks calling award() directly.

import { roundCash } from '../data/rounds.js';

export const Economy = {
    /**
     * Credit the player. Emits 'cash'; spawns coin FX when a world position is
     * given (kills pass the mob position, round bonuses do not).
     * @param {*} game
     * @param {number} amount
     * @param {number} [x]
     * @param {number} [y]
     */
    award(game, amount, x, y) {
        if (!amount) return;
        game.state.cash += amount;
        game.bus.emit('cash', { cash: game.state.cash });
        if (x != null && y != null) {
            game.fx.spawn('coin', x, y, { count: Math.min(9, 2 + Math.floor(amount / 6)) });
        }
    },

    /**
     * Debit if affordable. Emits 'cash' on success.
     * @param {*} game
     * @param {number} amount
     * @returns {boolean}
     */
    trySpend(game, amount) {
        if (game.state.cash < amount) return false;
        game.state.cash -= amount;
        game.bus.emit('cash', { cash: game.state.cash });
        return true;
    },

    /**
     * Pay the end-of-round base bonus (100 + round). Farm income is separate.
     * @param {*} game
     * @param {number} round
     * @returns {number} bonus paid
     */
    endOfRound(game, round) {
        const bonus = roundCash(round);
        Economy.award(game, bonus);
        return bonus;
    },
};
