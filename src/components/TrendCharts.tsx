import { useState } from 'react'
import { formatNumber } from '../analytics/format'
import { monthLabel } from '../analytics/periods'
import type { PeriodPoint } from '../analytics/trends'

/** Series colours shared by the charts, the flow tile and the legends (validated as a pair for colour-blind readers). */
export const JOINED = '#0b7bb3'
export const LEFT = '#d06a1c'
const LINE = '#173b68'

/** Thin every n-th x label so long histories stay readable. */
const showLabel = (index: number, count: number) => {
  if (count <= 8 || index === count - 1) return true
  const step = Math.ceil(count / 8)
  // Skip a regular label that would sit right next to the always-shown last label.
  return index % step === 0 && count - 1 - index >= step
}

/** Round tick step (1, 2, 5 × 10ⁿ) giving about `count` intervals. */
function niceStep(range: number, count: number) {
  const raw = Math.max(range, 1) / count
  const power = 10 ** Math.floor(Math.log10(raw))
  return ([1, 2, 5, 10].find(factor => factor * power >= raw) ?? 10) * power
}

/** Monotone cubic path (Fritsch–Carlson): smooth, but never overshoots between points. */
function smoothPath(xs: number[], ys: number[]) {
  const n = xs.length
  if (n < 3) return xs.map((x, index) => `${index ? 'L' : 'M'}${x},${ys[index]}`).join(' ')
  const slopes = xs.slice(1).map((x, index) => (ys[index + 1] - ys[index]) / (x - xs[index]))
  const tangents = xs.map((_, index) => {
    if (index === 0) return slopes[0]
    if (index === n - 1) return slopes[n - 2]
    const a = slopes[index - 1],
      b = slopes[index]
    return a * b <= 0 ? 0 : 2 / (1 / a + 1 / b)
  })
  let path = `M${xs[0]},${ys[0]}`
  for (let index = 0; index < n - 1; index++) {
    const dx = (xs[index + 1] - xs[index]) / 3
    path += ` C${xs[index] + dx},${ys[index] + tangents[index] * dx} ${xs[index + 1] - dx},${ys[index + 1] - tangents[index + 1] * dx} ${xs[index + 1]},${ys[index + 1]}`
  }
  return path
}

export function Sparkline({ values, tone }: { values: number[]; tone: 'light' | 'dark' }) {
  if (values.length < 2) return null
  const width = 116,
    height = 36,
    pad = 4
  const low = Math.min(...values),
    high = Math.max(...values)
  const xs = values.map((_, index) => pad + (index * (width - pad * 2)) / (values.length - 1))
  const ys = values.map(value => pad + (1 - (value - low) / (high - low || 1)) * (height - pad * 2))
  const line = smoothPath(xs, ys)
  return (
    <svg className={`trend-spark ${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={`${line} L${xs[xs.length - 1]},${height} L${xs[0]},${height} Z`} className="spark-area" />
      <path d={line} className="spark-line" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} className="spark-dot" />
    </svg>
  )
}

export function HeadcountChart({ points }: { points: PeriodPoint[] }) {
  const [active, setActive] = useState<number | null>(null)
  const width = 520,
    height = 200,
    left = 38,
    right = 18,
    top = 26,
    bottom = 30
  const values = points.map(point => point.headcount)
  const low = Math.min(...values),
    high = Math.max(...values)
  const step = niceStep((high - low) * 1.6 || high * 0.05, 3)
  const min = Math.max(0, Math.floor((low - (high - low) * 0.3 - step * 0.2) / step) * step)
  const max = Math.ceil((high + (high - low) * 0.3 + step * 0.2) / step) * step
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step)
  const plotWidth = width - left - right
  const x = (index: number) => (points.length === 1 ? left + plotWidth / 2 : left + (index * plotWidth) / (points.length - 1))
  const y = (value: number) => top + (1 - (value - min) / (max - min || 1)) * (height - top - bottom)
  const xs = points.map((_, index) => x(index)),
    ys = values.map(y)
  const line = smoothPath(xs, ys)
  const area = `${line} L${xs[xs.length - 1]},${height - bottom} L${xs[0]},${height - bottom} Z`
  const slot = plotWidth / Math.max(points.length - 1, 1)
  const many = points.length > 8
  const labelled = (index: number) => !many || index === 0 || index === points.length - 1 || values[index] === high || values[index] === low
  const current = active === null ? null : points[active]
  const previous = active ? points[active - 1] : null
  return (
    <div className="trend-line-wrap" onMouseLeave={() => setActive(null)}>
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Jumlah karyawan per periode: ${points.map(point => `${monthLabel(point.period)} ${point.headcount}`).join(', ')}`}
      >
        <defs>
          <linearGradient id="headcount-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={LINE} stopOpacity={0.16} />
            <stop offset="100%" stopColor={LINE} stopOpacity={0} />
          </linearGradient>
        </defs>
        {ticks.map(tick => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="trend-grid" />
            <text x={left - 8} y={y(tick) + 3} className="trend-axis" textAnchor="end">
              {formatNumber(tick)}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#headcount-fill)" />
        <path d={line} fill="none" stroke={LINE} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
        {active !== null && <line x1={xs[active]} x2={xs[active]} y1={top - 6} y2={height - bottom} className="trend-guide" />}
        {points.map((point, index) => (
          <g key={point.period}>
            <circle
              cx={xs[index]}
              cy={ys[index]}
              r={active === index ? 5.5 : 3.5}
              fill={active === index ? LINE : '#fff'}
              stroke={LINE}
              strokeWidth={2}
              className="trend-dot"
            />
            {labelled(index) && active !== index && (
              <text
                x={xs[index]}
                y={ys[index] - 10}
                className="trend-value"
                textAnchor={
                  index === 0 && points.length > 1 ? 'start' : index === points.length - 1 && points.length > 1 ? 'end' : 'middle'
                }
                dx={index === 0 && points.length > 1 ? -4 : index === points.length - 1 && points.length > 1 ? 4 : 0}
              >
                {formatNumber(point.headcount)}
              </text>
            )}
            {showLabel(index, points.length) && (
              <text x={xs[index]} y={height - 9} className="trend-axis" textAnchor="middle">
                {monthLabel(point.period)}
              </text>
            )}
            <rect
              x={xs[index] - slot / 2}
              y={0}
              width={slot}
              height={height - bottom}
              fill="transparent"
              onMouseEnter={() => setActive(index)}
              onClick={() => setActive(index)}
            />
          </g>
        ))}
      </svg>
      {current && (
        <div
          className="trend-tooltip"
          style={{ left: `${(xs[active!] / width) * 100}%`, top: `${(ys[active!] / height) * 100}%` }}
          data-edge={active === 0 ? 'start' : active === points.length - 1 ? 'end' : undefined}
        >
          <strong>{monthLabel(current.period)}</strong>
          <span>
            <b>{formatNumber(current.headcount)}</b> karyawan
            {previous && (
              <em className={current.headcount > previous.headcount ? 'up' : current.headcount < previous.headcount ? 'down' : ''}>
                {' '}
                {current.headcount - previous.headcount > 0 ? '+' : ''}
                {formatNumber(current.headcount - previous.headcount)}
              </em>
            )}
          </span>
          {current.joined !== null && (
            <span>
              <i style={{ background: JOINED }} />
              Masuk {formatNumber(current.joined)} · <i style={{ background: LEFT }} />
              Keluar {formatNumber(current.left ?? 0)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

const spanText = (point: PeriodPoint) => ((point.spanMonths ?? 1) > 1 ? ` (akumulasi ${point.spanMonths} bulan)` : '')

export function FlowChart({ points }: { points: PeriodPoint[] }) {
  const flows = points.filter(point => point.joined !== null)
  const width = 520,
    height = 190,
    left = 30,
    right = 10,
    top = 16,
    bottom = 30
  const max = Math.max(1, ...flows.flatMap(point => [point.joined!, point.left!]))
  const slot = (width - left - right) / Math.max(flows.length, 1)
  const bar = Math.min(22, (slot - 10) / 2)
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom)
  const base = height - bottom
  const column = (x: number, value: number, color: string, label: string) =>
    value > 0 ? (
      <path d={`M${x},${base} V${y(value) + 3} q0,-3 3,-3 h${bar - 6} q3,0 3,3 V${base} Z`} fill={color}>
        <title>{label}</title>
      </path>
    ) : (
      <rect x={x} y={base - 1} width={bar} height={1} fill={color}>
        <title>{label}</title>
      </rect>
    )
  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Karyawan masuk dan keluar per periode: ${flows.map(point => `${monthLabel(point.period)} masuk ${point.joined} keluar ${point.left}`).join(', ')}`}
    >
      {[0, Math.round(max / 2), max].map(tick => (
        <g key={tick}>
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="trend-grid" />
          <text x={left - 6} y={y(tick) + 3} className="trend-axis" textAnchor="end">
            {formatNumber(tick)}
          </text>
        </g>
      ))}
      {flows.map((point, index) => {
        const center = left + slot * index + slot / 2
        return (
          <g key={point.period}>
            {column(
              center - bar - 1,
              point.joined!,
              JOINED,
              `${monthLabel(point.period)}: ${formatNumber(point.joined!)} masuk${spanText(point)}`,
            )}
            {column(center + 1, point.left!, LEFT, `${monthLabel(point.period)}: ${formatNumber(point.left!)} keluar${spanText(point)}`)}
            {flows.length <= 6 && (
              <>
                <text x={center - bar / 2 - 1} y={y(point.joined!) - 5} className="trend-value" textAnchor="middle">
                  {point.joined}
                </text>
                <text x={center + bar / 2 + 1} y={y(point.left!) - 5} className="trend-value" textAnchor="middle">
                  {point.left}
                </text>
              </>
            )}
            {showLabel(index, flows.length) && (
              <text x={center} y={height - 10} className="trend-axis" textAnchor="middle">
                {monthLabel(point.period)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
