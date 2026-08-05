function SentimentSparkline({ data }) {
  const width = 280
  const height = 64
  const step = width / (data.length - 1)
  const y = (v) => height / 2 - v * (height / 2 - 6)
  const points = data.map((v, i) => `${i * step},${y(v)}`).join(' ')

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} className="sparkline-baseline" />
      <polyline points={points} className="sparkline-line" fill="none" />
      <circle cx={width} cy={y(data[data.length - 1])} r="3" className="sparkline-dot" />
    </svg>
  )
}

function VolumeSparkline({ data }) {
  const width = 280
  const height = 48
  const max = Math.max(...data, 1)
  const barWidth = width / data.length

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {data.map((v, i) => {
        const barHeight = (v / max) * height
        return (
          <rect
            key={i}
            x={i * barWidth + barWidth * 0.15}
            y={height - barHeight}
            width={barWidth * 0.7}
            height={barHeight}
            className="volume-bar"
          />
        )
      })}
    </svg>
  )
}

export { SentimentSparkline, VolumeSparkline }
