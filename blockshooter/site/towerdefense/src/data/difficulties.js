// Difficulty presets. Headless-safe pure data -- EXACTLY the table in
// CONTRACTS 5.7. Consumed by Game (starting lives/cash, tower price multiplier,
// mob speed multiplier, final round) and by mapselect UI (name/color).
//
//  lives       starting lives (leaks subtract mob leakCost)
//  cash        starting cash
//  priceMul    tower + upgrade cost multiplier (rounded to nearest 5 by economy)
//  rounds      final round of the campaign (freeplay continues past it)
//  mobSpeedMul global mob speed multiplier
//  color       accent for the difficulty pill in the UI
//  noContinue  ironclad: 1 life, no free-play continue offered on defeat

export const DIFFICULTIES = {
    easy: { name: 'Easy', lives: 200, cash: 750, priceMul: 0.85, rounds: 40, mobSpeedMul: 0.92, color: '#59c93c' },
    medium: { name: 'Medium', lives: 150, cash: 650, priceMul: 1.0, rounds: 60, mobSpeedMul: 1.0, color: '#e8b23a' },
    hard: { name: 'Hard', lives: 100, cash: 650, priceMul: 1.08, rounds: 80, mobSpeedMul: 1.08, color: '#e0642e' },
    ironclad: { name: 'Ironclad', lives: 1, cash: 600, priceMul: 1.2, rounds: 100, mobSpeedMul: 1.08, color: '#b03cf0', noContinue: true },
};
