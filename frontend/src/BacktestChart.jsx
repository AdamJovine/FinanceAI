import { useMemo, useRef, useState } from 'react'

const W = 640
const H = 320
const PAD = { left: 44, right: 20, top: 12, bottom: 28 }

// series: [{ key, name, color, values, returnPct }, ...] -- all `values` arrays
// must be the same length as `dates` and indexed to the same basis (e.g. 100 at start).
function BacktestChart({ dates, series }) {
  const svgRef = useRef(null)
  const [hoverIdx, setHoverIdx] = useState(null)

  const n = dates.length

  const { yMin, yMax } = useMemo(() => {
    const all = series.flatMap((s) => s.values)
    const min = Math.min(...all)
    const max = Math.max(...all)
    const pad = (max - min) * 0.08 || 1
    return { yMin: min - pad, yMax: max + pad }
  }, [series])

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const xAt = (i) => PAD.left + (i / (n - 1)) * plotW
  const yAt = (v) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH

  const paths = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        d: s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' '),
      })),
    [series, yMin, yMax]
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

  const hoverX = hoverIdx === null ? null : xAt(hoverIdx)

  return (
    <div className="chart">
      <div className="chart-legend">
        {series.map((s) => (
          <span className="chart-legend-item" key={s.key}>
            <span className="chart-legend-key" style={{ background: s.color }} />
            {s.name} <strong>{s.returnPct >= 0 ? '+' : ''}{s.returnPct.toFixed(2)}%</strong>
          </span>
        ))}
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

        {paths.map((s) => (
          <path key={s.key} d={s.d} className="chart-line" stroke={s.color} />
        ))}

        {hoverX !== null && (
          <>
            <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={H - PAD.bottom} className="chart-crosshair" />
            {series.map((s) => (
              <circle key={s.key} cx={hoverX} cy={yAt(s.values[hoverIdx])} r={4} className="chart-dot" fill={s.color} />
            ))}
          </>
        )}
      </svg>

      {hoverIdx !== null && (
        <div className="chart-tooltip" style={{ left: `${(hoverX / W) * 100}%` }}>
          <div className="chart-tooltip-date">{dates[hoverIdx]}</div>
          {series.map((s) => (
            <div className="chart-tooltip-row" key={s.key}>
              <span><span className="chart-legend-key" style={{ background: s.color }} />{s.name}</span>
              <strong>{s.values[hoverIdx].toFixed(2)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default BacktestChart
