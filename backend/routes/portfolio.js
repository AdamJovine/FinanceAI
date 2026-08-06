const express = require('express');
const router = express.Router();

const HOLDING_TICKERS = ['GME', 'AMC', 'TSLA', 'AAPL', 'PLTR'];

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function mulberry32(seed) {
  let state = seed;
  return function () {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

function generateHolding(ticker) {
  const rand = mulberry32(hashString(`portfolio-${ticker}`));
  const shares = Math.floor(rand() * 40) + 5;
  const current_price = round2(rand() * 300 + 10);
  const avg_cost = round2(current_price * (0.6 + rand() * 0.7));
  const market_value = round2(current_price * shares);
  const gain_loss = round2((current_price - avg_cost) * shares);
  const gain_loss_pct = round2(((current_price - avg_cost) / avg_cost) * 100);
  return { ticker, shares, avg_cost, current_price, market_value, gain_loss, gain_loss_pct };
}

function generateValueHistory(totalValue, days) {
  const rand = mulberry32(hashString('portfolio-history'));
  let value = 1 + (rand() - 0.5) * 0.3;
  const walk = [];
  for (let i = 0; i < days; i++) {
    value = Math.max(0.5, value + (rand() - 0.5) * 0.06);
    walk.push(value);
  }
  const last = walk[walk.length - 1];
  return walk.map((v) => round2((v / last) * totalValue));
}

router.get('/', (req, res) => {
  const holdings = HOLDING_TICKERS.map(generateHolding);
  const total_value = round2(holdings.reduce((sum, h) => sum + h.market_value, 0));
  const total_invested = round2(holdings.reduce((sum, h) => sum + h.avg_cost * h.shares, 0));
  const total_gain_loss = round2(total_value - total_invested);
  const total_gain_loss_pct = round2((total_gain_loss / total_invested) * 100);
  const portfolio_value_history = generateValueHistory(total_value, 30);

  res.json({
    holdings,
    total_value,
    total_invested,
    total_gain_loss,
    total_gain_loss_pct,
    portfolio_value_history,
    simulated: true,
  });
});

module.exports = router;
