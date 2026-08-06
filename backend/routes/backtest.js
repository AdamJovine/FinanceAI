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

const SIGNAL_PROVIDERS = ['neutral', 'online', 'rf', 'finbert'];

// Python failures land here as either a raw message (`raise SystemExit("...")`,
// e.g. missing API keys) or a full traceback ending in `SomeError: message`
// (e.g. yfinance's ValueError on a bad ticker). Either way the last non-empty
// line is the human-readable summary -- surface that as the primary error
// instead of a generic "script failed", and strip the exception-class prefix
// when there is one so the UI doesn't show Python internals.
function describeError(stderr) {
  const lines = stderr.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return 'The script failed with no error output.';
  const lastLine = lines[lines.length - 1];
  const match = /^[\w.]+(?:Error|Exception|Exit):\s*(.+)$/.exec(lastLine);
  return match ? match[1] : lastLine;
}

router.post('/', (req, res) => {
  const { ticker, start, end, cash, commission, signalProvider } = req.body || {};
  if (!ticker || !ticker.trim()) {
    return res.status(400).json({ error: 'A ticker symbol is required.' });
  }
  if (signalProvider && !SIGNAL_PROVIDERS.includes(signalProvider)) {
    return res.status(400).json({ error: `signalProvider must be one of: ${SIGNAL_PROVIDERS.join(', ')}.` });
  }

  const args = [SCRIPT_PATH, '--ticker', ticker.trim().toUpperCase()];
  if (start) args.push('--start', start);
  if (end) args.push('--end', end);
  if (cash) args.push('--cash', String(cash));
  if (commission) args.push('--commission', String(commission));
  if (signalProvider) args.push('--signal-provider', signalProvider);

  const proc = spawn(PYTHON, args);
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => (stdout += chunk));
  proc.stderr.on('data', (chunk) => (stderr += chunk));

  proc.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: describeError(stderr), details: stderr.trim() });
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
  if (signalProvider && !SIGNAL_PROVIDERS.includes(signalProvider)) {
    return res.status(400).json({ error: `signalProvider must be one of: ${SIGNAL_PROVIDERS.join(', ')}.` });
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
      return res.status(500).json({ error: describeError(stderr), details: stderr.trim() });
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
