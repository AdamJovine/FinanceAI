import { useState } from 'react'
import { Search, DollarSign, Percent, Gauge, TrendingDown, LineChart } from 'lucide-react'
import BacktestChart from './BacktestChart'

const API_BASE = 'http://localhost:5001'

const MODELS = [
  { value: 'finbert', label: 'FinBERT (news only)', color: 'var(--chart-finbert)' },
  { value: 'online', label: 'Sentiment analyzer (live)', color: 'var(--chart-strategy)' },
  { value: 'rf', label: 'Random forest (live)', color: 'var(--chart-rf)' },
]

function sentimentLabel(score) {
  if (score >= 0.15) return 'bullish'
  if (score <= -0.15) return 'bearish'
  return 'neutral'
}

function BacktestView() {
  const [ticker, setTicker] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [cash, setCash] = useState('')
  const [commission, setCommission] = useState('')
  const [model, setModel] = useState('online')
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
    <main className="page backtest-page">
      <h1>Strategy Backtesting</h1>
      <p className="subtitle">Run a historical backtest against a signal strategy, or compare all of them.</p>

      <form className="backtest-toolbar" onSubmit={handleSubmit}>
        <div className="input-wrap">
          <label className="field-label" htmlFor="backtest-ticker">Ticker symbol</label>
          <div className="input-icon-wrap">
            <Search size={16} className="input-icon" />
            <input
              id="backtest-ticker"
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="Ticker, e.g. AAPL"
              aria-label="Stock ticker"
            />
          </div>
        </div>
        <div className="input-wrap">
          <label className="field-label" htmlFor="backtest-start">Start</label>
          <input
            id="backtest-start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            aria-label="Start date"
          />
        </div>
        <div className="input-wrap">
          <label className="field-label" htmlFor="backtest-end">End</label>
          <input
            id="backtest-end"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            aria-label="End date"
          />
        </div>
        <div className="input-wrap">
          <label className="field-label" htmlFor="backtest-cash">Cash</label>
          <input
            id="backtest-cash"
            type="number"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            placeholder="100000"
            aria-label="Starting cash"
          />
        </div>
        <div className="input-wrap">
          <label className="field-label" htmlFor="backtest-commission">Commission</label>
          <input
            id="backtest-commission"
            type="number"
            step="0.001"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            placeholder="0.001"
            aria-label="Commission"
          />
        </div>
        <div className="input-wrap">
          <label className="field-label" htmlFor="backtest-model">Model</label>
          <select id="backtest-model" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
            <option value="compare">Compare all</option>
          </select>
        </div>
        <button type="submit" disabled={loading} className="backtest-toolbar-submit">
          {loading ? 'Running…' : 'Run Backtest'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {warnings.map((w) => <p className="error" key={w}>{w}</p>)}

      <section className="backtest-results">
        <div className="backtest-results-header">
          <h2>{result?.ticker || 'No backtest run yet'}</h2>
          {result?.period && <span className="badge badge-neutral">{result.period}</span>}
          {result?.signal_score != null && (
            <span className={`badge badge-${sentimentLabel(result.signal_score)}`}>
              Sentiment {result.signal_score >= 0 ? '+' : ''}{result.signal_score.toFixed(2)} ({sentimentLabel(result.signal_score)})
            </span>
          )}
        </div>

        <div className="backtest-results-grid">
          <div className="backtest-stats-col">
            <div className="stat">
              <span className="stat-value">{result ? `$${result.start_value?.toLocaleString()}` : '—'}</span>
              <span className="stat-label">
                <span className="stat-icon-chip"><DollarSign size={12} /></span>
                Start value
              </span>
            </div>
            <div className="stat">
              <span className="stat-value">{result ? `$${result.end_value?.toLocaleString()}` : '—'}</span>
              <span className="stat-label">
                <span className="stat-icon-chip"><DollarSign size={12} /></span>
                End value
              </span>
            </div>
            <div className="stat">
              <span className={`stat-value ${result ? (result.return_pct >= 0 ? 'gain-positive' : 'gain-negative') : ''}`}>
                {result ? `${result.return_pct}%` : '—'}
              </span>
              <span className="stat-label">
                <span className="stat-icon-chip"><Percent size={12} /></span>
                Return
              </span>
            </div>
            <div className="stat">
              <span className="stat-value">{result ? (result.sharpe_ratio ?? 'N/A') : '—'}</span>
              <span className="stat-label">
                <span className="stat-icon-chip"><Gauge size={12} /></span>
                Sharpe ratio
              </span>
            </div>
            <div className="stat">
              <span className="stat-value">{result ? `${result.max_drawdown_pct}%` : '—'}</span>
              <span className="stat-label">
                <span className="stat-icon-chip"><TrendingDown size={12} /></span>
                Max drawdown
              </span>
            </div>
          </div>

          <div className="backtest-chart-col">
            {chartData ? (
              <BacktestChart dates={chartData.dates} series={chartData.series} />
            ) : (
              <div className="chart-placeholder">
                <LineChart size={28} className="chart-placeholder-icon" />
                <p>{loading ? 'Running backtest…' : 'Run a backtest to see the equity curve here.'}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

export default BacktestView
