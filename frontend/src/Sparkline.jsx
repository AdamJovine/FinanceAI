import { useMemo, useRef, useState } from 'react'

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

function PriceLineChart({ data }) {
  const svgRef = useRef(null)
  const [hoverIdx, setHoverIdx] = useState(null)

  const W = 640
  const H = 220
  const PAD = { left: 56, right: 16, top: 12, bottom: 26 }

  const n = data.length
  const values = data.map((d) => d.close)
  const trendColor = values[values.length - 1] >= values[0] ? 'var(--positive)' : 'var(--negative)'

  const { yMin, yMax } = useMemo(() => {
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = (max - min) * 0.08 || 1
    return { yMin: min - pad, yMax: max + pad }
  }, [values])

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const xAt = (i) => PAD.left + (n === 1 ? 0 : (i / (n - 1)) * plotW)
  const yAt = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH

  const linePath = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ')

  const gridSteps = 4
  const gridValues = Array.from({ length: gridSteps + 1 }, (_, i) => yMin + (i / gridSteps) * (yMax - yMin))
  const xTickCount = Math.min(5, n)
  const xTickIdxs = Array.from({ length: xTickCount }, (_, i) =>
    xTickCount === 1 ? 0 : Math.round((i / (xTickCount - 1)) * (n - 1))
  )

  function handleMove(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let idx = Math.round(((px - PAD.left) / plotW) * (n - 1))
    idx = Math.max(0, Math.min(n - 1, idx))
    setHoverIdx(idx)
  }

  const hoverX = hoverIdx === null ? null : xAt(hoverIdx)
  const label = (i) => data[i].date || `Day ${i + 1}`

  return (
    <div className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {gridValues.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yAt(v)} y2={yAt(v)} className="chart-gridline" />
            <text x={PAD.left - 8} y={yAt(v) + 4} className="chart-axis-text" textAnchor="end">
              ${v.toFixed(v < 10 ? 2 : 0)}
            </text>
          </g>
        ))}

        {xTickIdxs.map((idx, i) => (
          <text
            key={idx}
            x={xAt(idx)}
            y={H - PAD.bottom + 18}
            className="chart-axis-text"
            textAnchor={i === 0 ? 'start' : i === xTickIdxs.length - 1 ? 'end' : 'middle'}
          >
            {label(idx)}
          </text>
        ))}

        <path d={linePath} className="chart-line" stroke={trendColor} />

        {hoverIdx !== null && (
          <>
            <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={H - PAD.bottom} className="chart-crosshair" />
            <circle cx={hoverX} cy={yAt(values[hoverIdx])} r={4} className="chart-dot" fill={trendColor} />
          </>
        )}
      </svg>

      {hoverIdx !== null && (
        <div className="chart-tooltip" style={{ left: `${(hoverX / W) * 100}%` }}>
          <div className="chart-tooltip-date">{label(hoverIdx)}</div>
          <div className="chart-tooltip-row">
            <span>Close</span>
            <strong>${values[hoverIdx].toFixed(2)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}

export { SentimentSparkline, VolumeSparkline, PriceLineChart }
