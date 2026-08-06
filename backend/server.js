const path = require('path');

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch (err) {
  console.warn(`Could not load backend/.env: ${err.message}`);
}

const express = require('express');
const cors = require('cors');
const sentimentRouter = require('./routes/sentiment');
const backtestRouter = require('./routes/backtest');
const priceRouter = require('./routes/price');
const portfolioRouter = require('./routes/portfolio');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/sentiment', sentimentRouter);
app.use('/api/backtest', backtestRouter);
app.use('/api/price', priceRouter);
app.use('/api/portfolio', portfolioRouter);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
