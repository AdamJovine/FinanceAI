import { useState } from 'react'
import { SentimentSparkline, VolumeSparkline } from './Sparkline'

const API_BASE = 'http://localhost:5001'

function sentimentLabel(score) {
  if (score >= 0.15) return 'bullish'
  if (score <= -0.15) return 'bearish'
  return 'neutral'
}

function SentimentView() {
  const [ticker, setTicker] = useState('')
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
      const res = await fetch(`${API_BASE}/api/sentiment/${encodeURIComponent(trimmed)}`)
      if (!res.ok) throw new Error('Request failed')
      const data = await res.json()
      setResult(data)
    } catch {
      setError('Could not reach the sentiment service. Is the backend running?')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page">
      <h1>Meme Stock Sentiment</h1>
      <p className="subtitle">Type a ticker to see simulated social sentiment.</p>

      <form className="search" onSubmit={handleSubmit}>
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="e.g. GME, AMC"
          aria-label="Stock ticker"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Loading…' : 'Check Sentiment'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <section className="results">
          <div className="results-header">
            <h2>{result.ticker}</h2>
            <span className={`badge badge-${result.overall_sentiment}`}>
              {result.overall_sentiment}
            </span>
          </div>

          {result.note && <p className="note">{result.note}</p>}

          <div className="stats">
            <div className="stat">
              <span className="stat-value">{result.score}</span>
              <span className="stat-label">Sentiment score</span>
              <span className="stat-caption">based on {result.confidence.toLocaleString()} mentions</span>
            </div>
            <div className="stat">
              <span className="stat-value">{result.mentions.toLocaleString()}</span>
              <span className="stat-label">Mentions</span>
            </div>
          </div>

          <div className="breakdown">
            {['positive', 'neutral', 'negative'].map((key) => (
              <div className="breakdown-row" key={key}>
                <span className="breakdown-label">{key}</span>
                <div className="bar-track">
                  <div
                    className={`bar-fill bar-${key}`}
                    style={{ width: `${result.breakdown[key]}%` }}
                  />
                </div>
                <span className="breakdown-value">{result.breakdown[key]}%</span>
              </div>
            ))}
          </div>

          <div className="charts">
            <div className="chart-block">
              <h3>14-day sentiment trend</h3>
              <SentimentSparkline data={result.sentiment_history} />
            </div>
            <div className="chart-block">
              <h3>14-day mention volume</h3>
              <VolumeSparkline data={result.mention_volume_history} />
            </div>
          </div>

          <div className="platform-breakdown">
            <h3>By platform</h3>
            {Object.entries(result.platform_breakdown).map(([platform, value]) => (
              <div className="breakdown-row" key={platform}>
                <span className="breakdown-label">{platform}</span>
                <div className="bar-track">
                  <div
                    className={`bar-fill bar-${
                      sentimentLabel(value) === 'bullish' ? 'positive' : sentimentLabel(value) === 'bearish' ? 'negative' : 'neutral'
                    }`}
                    style={{ width: `${Math.round(((value + 1) / 2) * 100)}%` }}
                  />
                </div>
                <span className="breakdown-value">{value}</span>
              </div>
            ))}
          </div>

          <div className="posts">
            <h3>Sample posts</h3>
            <ul>
              {result.sample_posts.map((post, i) => (
                <li key={i} className="post">
                  <span className="post-platform">{post.platform}</span>
                  <span className="post-text">{post.text}</span>
                  <span className={`post-sentiment post-sentiment-${post.sentiment}`}>
                    {post.sentiment}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  )
}

export default SentimentView
