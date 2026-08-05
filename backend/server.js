const express = require('express');
const cors = require('cors');
const sentimentRouter = require('./routes/sentiment');
const backtestRouter = require('./routes/backtest');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/sentiment', sentimentRouter);
app.use('/api/backtest', backtestRouter);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
