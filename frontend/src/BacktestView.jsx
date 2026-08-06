import { useState } from 'react'
import BacktestChart from './BacktestChart'

const API_BASE = 'http://localhost:5001'

const MODELS = [
  { value: 'neutral', label: 'Neutral (no trades)', color: 'var(--chart-neutral)' },
  { value: 'online', label: 'Sentiment analyzer (live)', color: 'var(--chart-strategy)' },
  { value: 'rf', label: 'Random forest (live)', color: 'var(--chart-rf)' },
]

function BacktestView() {
  const [ticker, setTicker] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [cash, setCash] = useState('')
  const [commission, setCommission] = useState('')
  const [model, setModel] = useState('neutral')
  const [result, setResult] = useState(null)
  const [chartData, setChartData] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function fetchChart(body) {
    const res = await fetch(`${API_BASE}/api/backtest/chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Request failed')
    return json
  }

  async function runCompare(body) {
    setResult(null)
    const settled = await Promise.allSettled(
      MODELS.map((m) => fetchChart({ ...body, signalProvider: m.value }))
    )

    const series = []
    const newWarnings = []
    let dates = null
    let benchmarkSeries = null

    settled.forEach((r, i) => {
      const m = MODELS[i]
      if (r.status === 'fulfilled') {
        const chart = r.value
        dates = dates || chart.dates
        benchmarkSeries = benchmarkSeries || {
          key: 'benchmark',
          name: chart.benchmark_ticker,
          color: 'var(--chart-benchmark)',
          values: chart.benchmark_indexed,
          returnPct: chart.benchmark_return_pct,
        }
        series.push({
          key: m.value,
          name: m.label,
          color: m.color,
          values: chart.strategy_indexed,
          returnPct: chart.strategy_return_pct,
        })
      } else {
        newWarnings.push(`${m.label}: ${r.reason.message}`)
      }
    })

    if (!dates) throw new Error('All models failed to run.')
    series.push(benchmarkSeries)
    setChartData({ dates, series })
    setWarnings(newWarnings)
  }

  async function runSingle(body) {
    const providerBody = { ...body, signalProvider: model }
    const [statsRes, chartRes] = await Promise.all([
      fetch(`${API_BASE}/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerBody),
      }),
      fetch(`${API_BASE}/api/backtest/chart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerBody),
      }),
    ])

    const stats = await statsRes.json()
    if (!statsRes.ok) throw new Error(stats.error || 'Request failed')
    setResult(stats)

    const chart = await chartRes.json()
    if (!chartRes.ok) {
      setChartData(null)
      setWarnings([chart.error || 'Chart failed to load.'])
      return
    }

    const modelMeta = MODELS.find((m) => m.value === model)
    setChartData({
      dates: chart.dates,
      series: [
        {
          key: 'strategy',
          name: modelMeta.label,
          color: modelMeta.color,
          values: chart.strategy_indexed,
          returnPct: chart.strategy_return_pct,
        },
        {
          key: 'benchmark',
          name: chart.benchmark_ticker,
          color: 'var(--chart-benchmark)',
          values: chart.benchmark_indexed,
          returnPct: chart.benchmark_return_pct,
        },
      ],
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = ticker.trim()
    if (!trimmed) {
      setError('Enter a ticker symbol first.')
      setResult(null)
      setChartData(null)
      setWarnings([])
      return
    }

    setLoading(true)
    setError('')
    setWarnings([])
    try {
      const body = {
        ticker: trimmed,
        start: start || undefined,
        end: end || undefined,
        cash: cash || undefined,
        commission: commission || undefined,
      }

      if (model === 'compare') {
        await runCompare(body)
      } else {
        await runSingle(body)
      }
    } catch (err) {
      setError(err.message === 'Failed to fetch'
        ? 'Could not reach the backtest service. Is the backend running?'
        : err.message)
      setResult(null)
      setChartData(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page">
      <h1>Strategy Backtesting</h1>
      <p className="subtitle">Run a historical backtest against a signal strategy, or compare all of them.</p>

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
        <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
          <option value="compare">Compare all</option>
        </select>
        <button type="submit" disabled={loading}>
          {loading ? 'Running…' : 'Run Backtest'}
        </button>
      </form>
      <p className="note">
        Sentiment analyzer and Random forest run live OpenAI + Perigon calls and need
        <code> OPENAI_API_KEY</code> / <code>PERIGON_API_KEY</code> set on the server.
      </p>

      {error && <p className="error">{error}</p>}
      {warnings.map((w) => <p className="error" key={w}>{w}</p>)}

      {(result || chartData) && (
        <section className="results">
          {result && (
            <>
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
            </>
          )}

          {chartData && <BacktestChart dates={chartData.dates} series={chartData.series} />}
        </section>
      )}
    </main>
  )
}

export default BacktestView
