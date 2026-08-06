import { useEffect, useState } from 'react'
import { PriceLineChart } from './Sparkline'

const API_BASE = 'http://localhost:5001'

function PortfolioView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_BASE}/api/portfolio`)
      .then((res) => res.json())
      .then(setData)
      .catch(() => setError('Could not load portfolio data. Is the backend running?'))
  }, [])

  return (
    <main className="page">
      <h1>My Portfolio</h1>
      <p className="page-simulated-note">Simulated portfolio — no real trades or funds.</p>

      {error && <p className="error">{error}</p>}

      {data && (
        <section className="results">
          <div className="stats">
            <div className="stat">
              <span className="stat-value">${data.total_value.toLocaleString()}</span>
              <span className="stat-label">Total value</span>
            </div>
            <div className="stat">
              <span className={`stat-value ${data.total_gain_loss >= 0 ? 'gain-positive' : 'gain-negative'}`}>
                {data.total_gain_loss >= 0 ? '+' : ''}${data.total_gain_loss.toLocaleString()} ({data.total_gain_loss_pct}%)
              </span>
              <span className="stat-label">Total gain/loss</span>
            </div>
          </div>

          <table className="holdings-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Shares</th>
                <th>Avg cost</th>
                <th>Current price</th>
                <th>Gain/loss</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h) => (
                <tr key={h.ticker}>
                  <td>{h.ticker}</td>
                  <td>{h.shares}</td>
                  <td>${h.avg_cost.toFixed(2)}</td>
                  <td>${h.current_price.toFixed(2)}</td>
                  <td className={h.gain_loss >= 0 ? 'gain-positive' : 'gain-negative'}>
                    {h.gain_loss >= 0 ? '+' : ''}${h.gain_loss.toFixed(2)} ({h.gain_loss_pct}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="chart-block">
            <h3>30-day portfolio value</h3>
            <PriceLineChart data={data.portfolio_value_history.map((v) => ({ close: v }))} />
          </div>
        </section>
      )}
    </main>
  )
}

export default PortfolioView
