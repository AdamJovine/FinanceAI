const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();
const PYTHON = process.platform === 'win32' ? 'py' : 'python3';
const SCRIPT_PATH = path.join(__dirname, '..', 'backtesting', 'price_cli.py');

router.get('/:ticker', (req, res) => {
  const ticker = (req.params.ticker || '').trim().toUpperCase();
  if (!ticker) {
    return res.status(400).json({ error: 'A ticker symbol is required.' });
  }

  const args = [SCRIPT_PATH, ticker];
  if (req.query.start) args.push('--start', req.query.start);
  if (req.query.end) args.push('--end', req.query.end);

  const proc = spawn(PYTHON, args);
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => (stdout += chunk));
  proc.stderr.on('data', (chunk) => (stderr += chunk));

  proc.on('close', (code) => {
    if (code !== 0) {
      return res.status(502).json({ error: 'Could not fetch price data.', details: stderr.trim() });
    }
    try {
      res.json({ ticker, prices: JSON.parse(stdout) });
    } catch (err) {
      res.status(502).json({ error: `Could not parse price data: ${err.message}` });
    }
  });

  proc.on('error', (err) => {
    res.status(500).json({ error: `Could not run Python: ${err.message}` });
  });
});

module.exports = router;
