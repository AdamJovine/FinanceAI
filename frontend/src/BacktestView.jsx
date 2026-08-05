import { useState } from 'react'

const API_BASE = 'http://localhost:5001'

function BacktestView() {
  const [ticker, setTicker] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [cash, setCash] = useState('')
  const [commission, setCommission] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = ticker.trim()
    if (!trimmed) {
      setError('Enter a ticker symbol first.')
      setResult(null)
      return
    }

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: trimmed,
          start: start || undefined,
          end: end || undefined,
          cash: cash || undefined,
          commission: commission || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setResult(data)
    } catch (err) {
      setError(err.message === 'Failed to fetch'
        ? 'Could not reach the backtest service. Is the backend running?'
        : err.message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page">
      <h1>Strategy Backtesting</h1>
      <p className="subtitle">Run a historical backtest against a simple signal strategy.</p>

      <form className="search backtest-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="Ticker, e.g. AAPL"
          aria-label="Stock ticker"
        />
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          aria-label="Start date"
        />
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          aria-label="End date"
        />
        <input
          type="number"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
          placeholder="Cash (100000)"
          aria-label="Starting cash"
        />
        <input
          type="number"
          step="0.001"
          value={commission}
          onChange={(e) => setCommission(e.target.value)}
          placeholder="Commission (0.001)"
          aria-label="Commission"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Running…' : 'Run Backtest'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <section className="results">
          <div className="results-header">
            <h2>{result.ticker}</h2>
            <span className="badge badge-neutral">{result.period}</span>
          </div>

          <div className="stats">
            <div className="stat">
              <span className="stat-value">${result.start_value?.toLocaleString()}</span>
              <span className="stat-label">Start value</span>
            </div>
            <div className="stat">
              <span className="stat-value">${result.end_value?.toLocaleString()}</span>
              <span className="stat-label">End value</span>
            </div>
            <div className="stat">
              <span className="stat-value">{result.return_pct}%</span>
              <span className="stat-label">Return</span>
            </div>
            <div className="stat">
              <span className="stat-value">{result.sharpe_ratio ?? 'N/A'}</span>
              <span className="stat-label">Sharpe ratio</span>
            </div>
            <div className="stat">
              <span className="stat-value">{result.max_drawdown_pct}%</span>
              <span className="stat-label">Max drawdown</span>
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

export default BacktestView
