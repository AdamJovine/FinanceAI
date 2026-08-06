import { useMemo, useRef, useState } from 'react'

const W = 640
const H = 320
const PAD = { left: 44, right: 20, top: 12, bottom: 28 }

function BacktestChart({ data }) {
  const svgRef = useRef(null)
  const [hoverIdx, setHoverIdx] = useState(null)

  const { dates, strategy_indexed: strategyValues, benchmark_indexed: benchmarkValues } = data
  const n = dates.length

  const { yMin, yMax } = useMemo(() => {
    const all = [...strategyValues, ...benchmarkValues]
    const min = Math.min(...all)
    const max = Math.max(...all)
    const pad = (max - min) * 0.08 || 1
    return { yMin: min - pad, yMax: max + pad }
  }, [strategyValues, benchmarkValues])

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const xAt = (i) => PAD.left + (i / (n - 1)) * plotW
  const yAt = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH

  const strategyPath = useMemo(
    () => strategyValues.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' '),
    [strategyValues, yMin, yMax]
  )
  const benchmarkPath = useMemo(
    () => benchmarkValues.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' '),
    [benchmarkValues, yMin, yMax]
  )

  const gridSteps = 4
  const gridValues = Array.from({ length: gridSteps + 1 }, (_, i) => yMin + (i / gridSteps) * (yMax - yMin))
  const xTickCount = Math.min(6, n)
  const xTickIdxs = Array.from({ length: xTickCount }, (_, i) => Math.round((i / (xTickCount - 1)) * (n - 1)))

  function handleMove(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let idx = Math.round(((px - PAD.left) / plotW) * (n - 1))
    idx = Math.max(0, Math.min(n - 1, idx))
    setHoverIdx(idx)
  }

  const hover = hoverIdx === null ? null : {
    x: xAt(hoverIdx),
    date: dates[hoverIdx],
    strategy: strategyValues[hoverIdx],
    benchmark: benchmarkValues[hoverIdx],
  }

  return (
    <div className="chart">
      <div className="chart-legend">
        <span className="chart-legend-item">
          <span className="chart-legend-key" style={{ background: 'var(--chart-strategy)' }} />
          Strategy <strong>{data.strategy_return_pct >= 0 ? '+' : ''}{data.strategy_return_pct.toFixed(2)}%</strong>
        </span>
        <span className="chart-legend-item">
          <span className="chart-legend-key" style={{ background: 'var(--chart-benchmark)' }} />
          {data.benchmark_ticker} <strong>{data.benchmark_return_pct >= 0 ? '+' : ''}{data.benchmark_return_pct.toFixed(2)}%</strong>
        </span>
      </div>

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
              {v.toFixed(0)}
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
            {dates[idx]}
          </text>
        ))}

        <path d={benchmarkPath} className="chart-line" stroke="var(--chart-benchmark)" />
        <path d={strategyPath} className="chart-line" stroke="var(--chart-strategy)" />

        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={H - PAD.bottom} className="chart-crosshair" />
            <circle cx={hover.x} cy={yAt(hover.strategy)} r={4} className="chart-dot" fill="var(--chart-strategy)" />
            <circle cx={hover.x} cy={yAt(hover.benchmark)} r={4} className="chart-dot" fill="var(--chart-benchmark)" />
          </>
        )}
      </svg>

      {hover && (
        <div
          className="chart-tooltip"
          style={{ left: `${(hover.x / W) * 100}%` }}
        >
          <div className="chart-tooltip-date">{hover.date}</div>
          <div className="chart-tooltip-row">
            <span><span className="chart-legend-key" style={{ background: 'var(--chart-strategy)' }} />Strategy</span>
            <strong>{hover.strategy.toFixed(2)}</strong>
          </div>
          <div className="chart-tooltip-row">
            <span><span className="chart-legend-key" style={{ background: 'var(--chart-benchmark)' }} />{data.benchmark_ticker}</span>
            <strong>{hover.benchmark.toFixed(2)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}

export default BacktestChart
