import { useState } from 'react'
import { Search, TrendingUp, Users, LineChart } from 'lucide-react'
import { SentimentSparkline, VolumeSparkline, PriceLineChart } from './Sparkline'

const API_BASE = 'http://localhost:5001'

function sentimentLabel(score) {
  if (score >= 0.15) return 'bullish'
  if (score <= -0.15) return 'bearish'
  return 'neutral'
}

const SOURCE_LABELS = { real: 'real', simulated: 'simulated', fallback_mock: 'fallback mock', unavailable: 'unavailable' }

function SourceTag({ source }) {
  return <span className={`source-tag source-tag-${source}`}>{SOURCE_LABELS[source] || source}</span>
}

function SentimentView() {
  const [ticker, setTicker] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [priceData, setPriceData] = useState(null)
  const [priceError, setPriceError] = useState('')
  const [priceLoading, setPriceLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = ticker.trim()
    if (!trimmed) {
      setError('Enter a ticker symbol first.')
      setResult(null)
      setPriceData(null)
      setPriceError('')
      return
    }

    setLoading(true)
    setError('')
    setPriceLoading(true)
    setPriceError('')

    const sentimentPromise = fetch(`${API_BASE}/api/sentiment/${encodeURIComponent(trimmed)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Request failed')
        return res.json()
      })
      .then((data) => setResult(data))
      .catch(() => {
        setError('Could not reach the sentiment service. Is the backend running?')
        setResult(null)
      })
      .finally(() => setLoading(false))

    const pricePromise = fetch(`${API_BASE}/api/price/${encodeURIComponent(trimmed)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Request failed')
        setPriceData(data.prices)
      })
      .catch((err) => {
        setPriceError(err.message || 'Could not load price data.')
        setPriceData(null)
      })
      .finally(() => setPriceLoading(false))

    await Promise.all([sentimentPromise, pricePromise])
  }

  return (
    <main className="page">
      <h1>Meme Stock Sentiment</h1>
      <p className="subtitle">Type a ticker to see real Reddit + news sentiment. Trend charts and per-platform breakdown beyond Reddit are still simulated.</p>

      <form className="search" onSubmit={handleSubmit}>
        <div className="input-wrap">
          <label className="field-label" htmlFor="sentiment-ticker">Ticker symbol</label>
          <div className="input-icon-wrap">
            <Search size={16} className="input-icon" />
            <input
              id="sentiment-ticker"
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="e.g. GME, AMC"
              aria-label="Stock ticker"
            />
          </div>
        </div>
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
              <span
                className={`stat-value ${
                  result.overall_sentiment === 'bullish' ? 'gain-positive' : result.overall_sentiment === 'bearish' ? 'gain-negative' : ''
                }`}
              >
                {result.score}
              </span>
              <span className="stat-label">
                <span className="stat-icon-chip"><TrendingUp size={12} /></span>
                Sentiment score <SourceTag source={result.source.score} />
              </span>
              <span className="stat-caption">based on {result.confidence.toLocaleString()} mentions</span>
            </div>
            <div className="stat">
              <span className="stat-value">{result.mentions.toLocaleString()}</span>
              <span className="stat-label">
                <span className="stat-icon-chip"><Users size={12} /></span>
                Mentions <SourceTag source={result.source.confidence} />
              </span>
            </div>
          </div>

          <div className="chart-block price-chart-block">
            <h3>
              <LineChart size={13} /> Price (last 90 days) <span className="source-tag source-tag-real">real</span>
            </h3>
            {priceLoading && <p className="stat-caption">Loading price data…</p>}
            {priceError && <p className="error">Could not load price data: {priceError}</p>}
            {priceData && !priceError && (
              <>
                <PriceLineChart data={priceData} />
                <p className="stat-caption">
                  {priceData[0].date} → {priceData[priceData.length - 1].date} · close ${priceData[priceData.length - 1].close.toFixed(2)}
                </p>
              </>
            )}
          </div>

          <div className="breakdown">
            <h3>
              Sentiment breakdown <SourceTag source={result.source.breakdown} />
            </h3>
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
              <h3>
                14-day sentiment trend <SourceTag source={result.source.sentiment_history} />
              </h3>
              <SentimentSparkline data={result.sentiment_history} />
            </div>
            <div className="chart-block">
              <h3>
                14-day mention volume <SourceTag source={result.source.mention_volume_history} />
              </h3>
              <VolumeSparkline data={result.mention_volume_history} />
            </div>
          </div>

          <div className="platform-breakdown">
            <h3>By platform</h3>
            {Object.entries(result.platform_breakdown).map(([platform, value]) => (
              <div className="breakdown-row" key={platform}>
                <span className="breakdown-label">
                  {platform} <SourceTag source={result.source.platform_breakdown[platform]} />
                </span>
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
            <h3>
              Sample posts <SourceTag source={result.source.sample_posts} />
            </h3>
            {result.sample_posts.length === 0 && (
              <p className="stat-caption">No real posts found for this ticker right now.</p>
            )}
            <ul>
              {result.sample_posts.map((post, i) => (
                <li key={i} className="post">
                  <span className="post-platform">{post.platform}</span>
                  {post.url ? (
                    <a className="post-text" href={post.url} target="_blank" rel="noreferrer">
                      {post.text}
                    </a>
                  ) : (
                    <span className="post-text">{post.text}</span>
                  )}
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
