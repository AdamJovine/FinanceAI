const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const router = express.Router();
const PYTHON = process.platform === 'win32' ? 'py' : 'python3';
const SCRIPT_PATH = path.join(__dirname, '..', 'backtesting', 'backtest.py');
const CHART_SCRIPT_PATH = path.join(__dirname, '..', 'backtesting', 'benchmark_compare.py');

function parseOutput(stdout) {
  const grab = (re) => re.exec(stdout)?.[1]?.trim();
  const sharpeRaw = grab(/Sharpe ratio:\s+(.+)/);
  return {
    ticker: grab(/Ticker:\s+(.+)/),
    period: grab(/Period:\s+(.+)/),
    start_value: parseFloat(grab(/Start value:\s+([\d.-]+)/)),
    end_value: parseFloat(grab(/End value:\s+([\d.-]+)/)),
    return_pct: parseFloat(grab(/Return:\s+([\d.-]+)%/)),
    sharpe_ratio: !sharpeRaw || sharpeRaw === 'None' ? null : parseFloat(sharpeRaw),
    max_drawdown_pct: parseFloat(grab(/Max drawdown:\s+([\d.-]+)%/)),
  };
}

router.post('/', (req, res) => {
  const { ticker, start, end, cash, commission } = req.body || {};
  if (!ticker || !ticker.trim()) {
    return res.status(400).json({ error: 'A ticker symbol is required.' });
  }

  const args = [SCRIPT_PATH, '--ticker', ticker.trim().toUpperCase()];
  if (start) args.push('--start', start);
  if (end) args.push('--end', end);
  if (cash) args.push('--cash', String(cash));
  if (commission) args.push('--commission', String(commission));

  const proc = spawn(PYTHON, args);
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => (stdout += chunk));
  proc.stderr.on('data', (chunk) => (stderr += chunk));

  proc.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: 'Backtest script failed.', details: stderr.trim() });
    }
    res.json(parseOutput(stdout));
  });

  proc.on('error', (err) => {
    res.status(500).json({ error: `Could not run Python: ${err.message}` });
  });
});

router.post('/chart', (req, res) => {
  const { ticker, start, end, cash, commission, benchmark, signalProvider } = req.body || {};
  if (!ticker || !ticker.trim()) {
    return res.status(400).json({ error: 'A ticker symbol is required.' });
  }
  if (signalProvider && !['neutral', 'online'].includes(signalProvider)) {
    return res.status(400).json({ error: "signalProvider must be 'neutral' or 'online'." });
  }

  const args = [CHART_SCRIPT_PATH, '--ticker', ticker.trim().toUpperCase()];
  if (start) args.push('--start', start);
  if (end) args.push('--end', end);
  if (cash) args.push('--cash', String(cash));
  if (commission) args.push('--commission', String(commission));
  if (benchmark) args.push('--benchmark', benchmark.trim().toUpperCase());
  if (signalProvider) args.push('--signal-provider', signalProvider);

  const proc = spawn(PYTHON, args);
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => (stdout += chunk));
  proc.stderr.on('data', (chunk) => (stderr += chunk));

  proc.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: 'Chart script failed.', details: stderr.trim() });
    }
    try {
      res.json(JSON.parse(stdout));
    } catch {
      res.status(500).json({ error: 'Chart script returned invalid JSON.', details: stdout.trim() });
    }
  });

  proc.on('error', (err) => {
    res.status(500).json({ error: `Could not run Python: ${err.message}` });
  });
});

module.exports = router;
