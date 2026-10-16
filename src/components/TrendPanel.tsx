import { useState, type ReactNode } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from 'lucide-react'
import { Link } from 'react-router'
import { monthLabel } from '../analytics/contracts'
import { formatDate } from '../analytics/format'
import { missingMonths, type MovementSummary, type PeriodPoint } from '../analytics/trends'
import type { EmployeeRecord, EmployeeSnapshot } from '../types/workforce'
import { FilterDropdown } from './FilterDropdown'

/** The trend data the dashboard computes once and shares with the contract panel and the report. */
export interface TrendData {
  /** Saved periods up to the active one (the active snapshot always included), oldest first. */
  snapshots: EmployeeSnapshot[]
  series: PeriodPoint[]
  /** Active period compared with `compareWith`; null when there is no earlier period. */
  movement: MovementSummary | null
  compareWith: string | null
  /** Number of saved periods, including later ones. */
  saved: number
}

type Props = { active: EmployeeSnapshot; trend: TrendData; retirementAge: number; onCompareChange: (period: string) => void }
type Tab = 'joined' | 'left' | 'transfers' | 'band' | 'status' | 'nip'

const JOINED = '#0b7bb3'
const LEFT = '#d06a1c'
const LINE = '#173b68'
const number = (value: number) => value.toLocaleString('id-ID')
const pct = (value: number | null) => value == null ? '—' : `${(value * 100).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

function Delta({ value, suffix = '' }: { value: number; suffix?: string }) {
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  return <span className={`trend-delta ${value > 0 ? 'up' : value < 0 ? 'down' : ''}`}><Icon size={12}/>{value > 0 ? '+' : ''}{number(value)}{suffix}</span>
}

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
    const a = slopes[index - 1], b = slopes[index]
    return a * b <= 0 ? 0 : 2 / (1 / a + 1 / b)
  })
  let path = `M${xs[0]},${ys[0]}`
  for (let index = 0; index < n - 1; index++) {
    const dx = (xs[index + 1] - xs[index]) / 3
    path += ` C${xs[index] + dx},${ys[index] + tangents[index] * dx} ${xs[index + 1] - dx},${ys[index + 1] - tangents[index + 1] * dx} ${xs[index + 1]},${ys[index + 1]}`
  }
  return path
}

function Sparkline({ values, tone }: { values: number[]; tone: 'light' | 'dark' }) {
  if (values.length < 2) return null
  const width = 116, height = 36, pad = 4
  const low = Math.min(...values), high = Math.max(...values)
  const xs = values.map((_, index) => pad + index * (width - pad * 2) / (values.length - 1))
  const ys = values.map(value => pad + (1 - (value - low) / (high - low || 1)) * (height - pad * 2))
  const line = smoothPath(xs, ys)
  return <svg className={`trend-spark ${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <path d={`${line} L${xs[xs.length - 1]},${height} L${xs[0]},${height} Z`} className="spark-area"/>
    <path d={line} className="spark-line"/>
    <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} className="spark-dot"/>
  </svg>
}

/** Footer with the highest and lowest value across the stored periods (ties go to the most recent period). */
function Extremes({ points, value, format }: { points: PeriodPoint[]; value: (point: PeriodPoint) => number | null; format: (value: number) => string }) {
  const valued = points.map(point => ({ point, value: value(point) })).filter((item): item is { point: PeriodPoint; value: number } => item.value !== null)
  if (valued.length < 2) return null
  const high = valued.reduce((best, item) => item.value >= best.value ? item : best)
  const low = valued.reduce((best, item) => item.value <= best.value ? item : best)
  return <div className="trend-tile-foot">
    <span>Tertinggi <b>{format(high.value)}</b> · {monthLabel(high.point.period)}</span>
    <span>Terendah <b>{format(low.value)}</b> · {monthLabel(low.point.period)}</span>
  </div>
}

function HeadcountChart({ points }: { points: PeriodPoint[] }) {
  const [active, setActive] = useState<number | null>(null)
  const width = 520, height = 200, left = 38, right = 18, top = 26, bottom = 30
  const values = points.map(point => point.headcount)
  const low = Math.min(...values), high = Math.max(...values)
  const step = niceStep((high - low) * 1.6 || high * 0.05, 3)
  const min = Math.max(0, Math.floor((low - (high - low) * 0.3 - step * 0.2) / step) * step)
  const max = Math.ceil((high + (high - low) * 0.3 + step * 0.2) / step) * step
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step)
  const plotWidth = width - left - right
  const x = (index: number) => points.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (points.length - 1)
  const y = (value: number) => top + (1 - (value - min) / (max - min || 1)) * (height - top - bottom)
  const xs = points.map((_, index) => x(index)), ys = values.map(y)
  const line = smoothPath(xs, ys)
  const area = `${line} L${xs[xs.length - 1]},${height - bottom} L${xs[0]},${height - bottom} Z`
  const slot = plotWidth / Math.max(points.length - 1, 1)
  const many = points.length > 8
  const labelled = (index: number) => !many || index === 0 || index === points.length - 1 || values[index] === high || values[index] === low
  const current = active === null ? null : points[active]
  const previous = active ? points[active - 1] : null
  return <div className="trend-line-wrap" onMouseLeave={() => setActive(null)}>
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Jumlah karyawan per periode: ${points.map(point => `${monthLabel(point.period)} ${point.headcount}`).join(', ')}`}>
      <defs><linearGradient id="headcount-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={LINE} stopOpacity={0.16}/><stop offset="100%" stopColor={LINE} stopOpacity={0}/></linearGradient></defs>
      {ticks.map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="trend-grid"/><text x={left - 8} y={y(tick) + 3} className="trend-axis" textAnchor="end">{number(tick)}</text></g>)}
      <path d={area} fill="url(#headcount-fill)"/>
      <path d={line} fill="none" stroke={LINE} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round"/>
      {active !== null && <line x1={xs[active]} x2={xs[active]} y1={top - 6} y2={height - bottom} className="trend-guide"/>}
      {points.map((point, index) => <g key={point.period}>
        <circle cx={xs[index]} cy={ys[index]} r={active === index ? 5.5 : 3.5} fill={active === index ? LINE : '#fff'} stroke={LINE} strokeWidth={2} className="trend-dot"/>
        {labelled(index) && active !== index && <text x={xs[index]} y={ys[index] - 10} className="trend-value" textAnchor={index === 0 && points.length > 1 ? 'start' : index === points.length - 1 && points.length > 1 ? 'end' : 'middle'} dx={index === 0 && points.length > 1 ? -4 : index === points.length - 1 && points.length > 1 ? 4 : 0}>{number(point.headcount)}</text>}
        {showLabel(index, points.length) && <text x={xs[index]} y={height - 9} className="trend-axis" textAnchor="middle">{monthLabel(point.period)}</text>}
        <rect x={xs[index] - slot / 2} y={0} width={slot} height={height - bottom} fill="transparent" onMouseEnter={() => setActive(index)} onClick={() => setActive(index)}/>
      </g>)}
    </svg>
    {current && <div className="trend-tooltip" style={{ left: `${xs[active!] / width * 100}%`, top: `${ys[active!] / height * 100}%` }} data-edge={active === 0 ? 'start' : active === points.length - 1 ? 'end' : undefined}>
      <strong>{monthLabel(current.period)}</strong>
      <span><b>{number(current.headcount)}</b> karyawan{previous && <em className={current.headcount > previous.headcount ? 'up' : current.headcount < previous.headcount ? 'down' : ''}> {current.headcount - previous.headcount > 0 ? '+' : ''}{number(current.headcount - previous.headcount)}</em>}</span>
      {current.joined !== null && <span><i style={{ background: JOINED }}/>Masuk {number(current.joined)} · <i style={{ background: LEFT }}/>Keluar {number(current.left ?? 0)}</span>}
    </div>}
  </div>
}

const spanText = (point: PeriodPoint) => (point.spanMonths ?? 1) > 1 ? ` (akumulasi ${point.spanMonths} bulan)` : ''

function FlowChart({ points }: { points: PeriodPoint[] }) {
  const flows = points.filter(point => point.joined !== null)
  const width = 520, height = 190, left = 30, right = 10, top = 16, bottom = 30
  const max = Math.max(1, ...flows.flatMap(point => [point.joined!, point.left!]))
  const slot = (width - left - right) / Math.max(flows.length, 1)
  const bar = Math.min(22, (slot - 10) / 2)
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom)
  const base = height - bottom
  const column = (x: number, value: number, color: string, label: string) => value > 0
    ? <path d={`M${x},${base} V${y(value) + 3} q0,-3 3,-3 h${bar - 6} q3,0 3,3 V${base} Z`} fill={color}><title>{label}</title></path>
    : <rect x={x} y={base - 1} width={bar} height={1} fill={color}><title>{label}</title></rect>
  return <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Karyawan masuk dan keluar per periode: ${flows.map(point => `${monthLabel(point.period)} masuk ${point.joined} keluar ${point.left}`).join(', ')}`}>
    {[0, Math.round(max / 2), max].map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="trend-grid"/><text x={left - 6} y={y(tick) + 3} className="trend-axis" textAnchor="end">{number(tick)}</text></g>)}
    {flows.map((point, index) => {
      const center = left + slot * index + slot / 2
      return <g key={point.period}>
        {column(center - bar - 1, point.joined!, JOINED, `${monthLabel(point.period)}: ${number(point.joined!)} masuk${spanText(point)}`)}
        {column(center + 1, point.left!, LEFT, `${monthLabel(point.period)}: ${number(point.left!)} keluar${spanText(point)}`)}
        {flows.length <= 6 && <>
          <text x={center - bar / 2 - 1} y={y(point.joined!) - 5} className="trend-value" textAnchor="middle">{point.joined}</text>
          <text x={center + bar / 2 + 1} y={y(point.left!) - 5} className="trend-value" textAnchor="middle">{point.left}</text>
        </>}
        {showLabel(index, flows.length) && <text x={center} y={height - 10} className="trend-axis" textAnchor="middle">{monthLabel(point.period)}</text>}
      </g>
    })}
  </svg>
}

type PeopleRow = { key: string; cells: ReactNode[]; flagged?: boolean }

function PeopleTable({ rows, columns }: { rows: PeopleRow[]; columns: string[] }) {
  if (!rows.length) return <p className="kpi-detail-empty">Tidak ada karyawan pada kategori ini.</p>
  return <div className="table-scroll trend-scroll" tabIndex={0} role="region" aria-label={`Daftar ${number(rows.length)} karyawan, dapat digulir`}><table className="retirement-table sticky-head"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.key} className={row.flagged ? 'is-flagged' : undefined}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>
}

function Person({ record }: { record: EmployeeRecord }) {
  return <div className="stack-cell"><strong>{record.name}</strong><span className="nip-cell">{record.nip}</span></div>
}

function Unit({ record, withDirectorate = false }: { record: EmployeeRecord; withDirectorate?: boolean }) {
  return <div className="stack-cell"><span>{withDirectorate ? record.division : record.position}</span><small>{withDirectorate ? record.directorate : record.division}</small></div>
}

const arrow = (before: ReactNode, after: ReactNode) => <span className="change-cell">{before}<span aria-label="menjadi">→</span><strong>{after}</strong></span>

function movementRows(movement: MovementSummary, tab: Tab): { columns: string[]; rows: PeopleRow[] } {
  if (tab === 'joined') {
    const stale = new Set(movement.staleJoins)
    return { columns: ['Karyawan', 'Jabatan / divisi', 'Status', 'Tanggal masuk', 'Keterangan'], rows: movement.joined.map(record => ({ key: record.nip, flagged: stale.has(record.nip), cells: [<Person key="p" record={record}/>, <Unit key="u" record={record}/>, record.status, formatDate(record.joinDate),
      stale.has(record.nip) ? <span key="check" className="check-badge" title={`Tanggal masuk sebelum ${monthLabel(movement.from)}, tetapi NIP ini tidak ada di data ${monthLabel(movement.from)}.`}><AlertTriangle size={11}/>Perlu dicek</span> : 'Karyawan baru'] })) }
  }
  if (tab === 'left') return { columns: ['Karyawan', 'Jabatan / divisi', 'Status terakhir', 'Indikasi'], rows: movement.left.map(({ record, reason }) => ({ key: record.nip, cells: [<Person key="p" record={record}/>, <Unit key="u" record={record}/>, record.status, reason] })) }
  if (tab === 'transfers') return { columns: ['Karyawan', 'Sebelumnya', 'Sekarang'], rows: movement.transfers.map(({ before, after }) => ({ key: after.nip, cells: [<Person key="p" record={after}/>, <Unit key="b" record={before} withDirectorate/>, <Unit key="a" record={after} withDirectorate/>] })) }
  if (tab === 'band') return { columns: ['Karyawan', 'Jabatan / divisi', 'Band', 'Arah'], rows: movement.bandChanges.map(({ before, after, direction }) => ({ key: after.nip, cells: [<Person key="p" record={after}/>, <Unit key="u" record={after}/>, arrow(before.band ?? '—', after.band ?? '—'), <span key="d" className={`direction ${direction === 'naik' ? 'up' : 'down'}`}>{direction === 'naik' ? '↑ Naik' : '↓ Turun'}</span>] })) }
  if (tab === 'nip') return { columns: ['Karyawan', 'NIP', 'Status', 'Jabatan / divisi'], rows: movement.nipChanges.map(({ before, after }) => ({ key: after.nip, cells: [<div key="p" className="stack-cell"><strong>{after.name}</strong><small>Lahir {formatDate(after.birthDate)}</small></div>, arrow(<span className="nip-cell">{before.nip}</span>, <span className="nip-cell">{after.nip}</span>), before.status === after.status ? after.status : arrow(before.status, after.status), <Unit key="u" record={after}/>] })) }
  return { columns: ['Karyawan', 'Jabatan / divisi', 'Status'], rows: movement.statusChanges.map(({ before, after }) => ({ key: after.nip, cells: [<Person key="p" record={after}/>, <Unit key="u" record={after}/>, arrow(before.status, after.status)] })) }
}

export function TrendPanel({ active, trend, retirementAge, onCompareChange: setChosen }: Props) {
  const { snapshots, series, movement, compareWith } = trend
  const earlier = snapshots.filter(item => item.period < active.period).map(item => item.period).reverse()
  const [tab, setTab] = useState<Tab>('joined')

  if (!movement) {
    return <section className="section-card trend-card" aria-label="Analisis antar-periode">
      <div className="section-header"><div className="retirement-title"><TrendingUp size={17}/><div><h2>Analisis antar-periode</h2><p>Tren jumlah karyawan, masuk/keluar, mutasi, dan perubahan band/status</p></div></div></div>
      <p className="kpi-detail-empty">{trend.saved > 1 ? `Belum ada periode sebelum ${monthLabel(active.period)} yang tersimpan.` : 'Baru satu periode tersimpan.'} Upload file periode lain untuk melihat perbandingan. <Link to="/impor" className="link-button">Upload periode lain</Link></p>
    </section>
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'joined', label: 'Masuk', count: movement.joined.length },
    { key: 'left', label: 'Keluar', count: movement.left.length },
    { key: 'transfers', label: 'Mutasi unit', count: movement.transfers.length },
    { key: 'band', label: 'Perubahan band', count: movement.bandChanges.length },
    { key: 'status', label: 'Perubahan status', count: movement.statusChanges.length },
    ...(movement.nipChanges.length ? [{ key: 'nip' as const, label: 'Ganti NIP', count: movement.nipChanges.length }] : []),
  ]
  const detail = movementRows(movement, tab)
  const bandUp = movement.bandChanges.filter(item => item.direction === 'naik').length
  const change = movement.headcountAfter - movement.headcountBefore
  const net = movement.joined.length - movement.left.length
  const flowTotal = movement.joined.length + movement.left.length
  // Turnover over several months is compared per month, so a Jan→Dec comparison is not set against monthly figures.
  const pastTurnover = series.filter(point => point.period < movement.to && point.monthlyTurnover !== null).map(point => point.monthlyTurnover!)
  const averageTurnover = pastTurnover.length ? pastTurnover.reduce((sum, value) => sum + value, 0) / pastTurnover.length : null
  const multiMonth = movement.spanMonths > 1
  const turnoverGap = averageTurnover === null || movement.monthlyTurnover === null ? null : movement.monthlyTurnover - averageTurnover
  const turnoverTone = turnoverGap === null || Math.abs(turnoverGap) < 0.001 ? '' : turnoverGap < 0 ? 'good' : 'bad'
  const perMonth = multiMonth ? `≈ ${pct(movement.monthlyTurnover)} per bulan, ` : ''
  const turnoverNote = movement.turnoverBase === 0 ? 'Tidak ada karyawan non-PKWT pada filter ini, jadi turnover tidak dihitung'
    : turnoverGap === null ? `Keluar non-PKWT ÷ rata-rata karyawan non-PKWT ${monthLabel(movement.from)}–${monthLabel(movement.to)}`
    : Math.abs(turnoverGap) < 0.001 ? `${perMonth}setara rata-rata per bulan sebelumnya (${pct(averageTurnover)})`
      : `${perMonth}${turnoverGap < 0 ? 'lebih rendah' : 'lebih tinggi'} dari rata-rata per bulan sebelumnya (${pct(averageTurnover)})`
  const gaps = missingMonths(series.map(point => point.period))
  function openTab(next: Tab) {
    setTab(next)
    document.getElementById('trend-detail')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return <section className="section-card trend-card" aria-label="Analisis antar-periode">
    <div className="section-header retirement-header">
      <div className="retirement-title"><TrendingUp size={17}/><div><h2>Analisis antar-periode</h2><p>{monthLabel(movement.from)} → {monthLabel(movement.to)} · mengikuti filter dashboard</p></div></div>
      <div className="retirement-controls"><div><span>Bandingkan dengan</span><FilterDropdown label="Periode pembanding" allowAll={false} options={earlier} selected={compareWith ? [compareWith] : []} display={monthLabel} onChange={([value]) => value && setChosen(value)}/></div></div>
    </div>
    <div className="trend-tiles">
      <div className="trend-tile primary">
        <div className="trend-tile-head"><span>Jumlah karyawan</span><span className="trend-pill"><Delta value={change}/></span></div>
        <div className="trend-tile-body"><strong>{number(movement.headcountAfter)}</strong><Sparkline values={series.map(point => point.headcount)} tone="dark"/></div>
        <small>{change === 0 ? 'Sama dengan' : change > 0 ? 'Naik dari' : 'Turun dari'} {number(movement.headcountBefore)} pada {monthLabel(movement.from)}</small>
        <Extremes points={series} value={point => point.headcount} format={number}/>
      </div>
      <div className="trend-tile">
        <div className="trend-tile-head"><span>Arus karyawan</span><span className={`trend-pill ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`}>Bersih {net > 0 ? '+' : net < 0 ? '−' : ''}{number(Math.abs(net))}</span></div>
        <div className="trend-flow">
          <button type="button" onClick={() => openTab('joined')}><span><i className="trend-key" style={{ background: JOINED }}/>Masuk</span><strong>{number(movement.joined.length)}</strong></button>
          <button type="button" onClick={() => openTab('left')}><span><i className="trend-key" style={{ background: LEFT }}/>Keluar</span><strong>{number(movement.left.length)}</strong></button>
        </div>
        {flowTotal > 0 && <div className="trend-split" aria-hidden="true"><span style={{ flexGrow: movement.joined.length, background: JOINED }}/><span style={{ flexGrow: movement.left.length, background: LEFT }}/></div>}
        <div className="trend-chips">{movement.exitReasons.length ? movement.exitReasons.map(item => <span key={item.reason} title={item.reason === 'Kontrak selesai' ? 'PKWT yang keluar setelah tanggal selesai kontraknya lewat; tidak dihitung sebagai turnover' : item.reason === 'PKWT berhenti' ? 'PKWT yang keluar sebelum tanggal selesai kontrak (atau tanpa tanggal selesai); tidak dihitung sebagai turnover' : undefined}>{item.reason === 'Tidak diketahui' ? 'Alasan lain' : item.reason} {number(item.count)}</span>) : <span>Tidak ada yang keluar</span>}</div>
      </div>
      <div className="trend-tile">
        <div className="trend-tile-head"><span>Turnover</span>{multiMonth && <span className="trend-pill" title={`Akumulasi ${movement.spanMonths} bulan, ${monthLabel(movement.from)}–${monthLabel(movement.to)}`}>{movement.spanMonths} bulan</span>}</div>
        <div className="trend-tile-body"><strong>{pct(movement.turnover)}</strong><Sparkline values={series.filter(point => point.monthlyTurnover !== null).map(point => point.monthlyTurnover!)} tone="light"/></div>
        <small className={turnoverTone}>{turnoverNote.charAt(0).toLocaleUpperCase('id') + turnoverNote.slice(1)}</small>
        {movement.contractExits > 0 && <small className="trend-subnote">{number(movement.turnoverExits)} dari {number(movement.left.length)} keluar dihitung; {number(movement.contractExits)} PKWT tidak termasuk</small>}
        <Extremes points={series} value={point => point.monthlyTurnover} format={value => `${pct(value)}/bln`}/>
      </div>
      <div className="trend-tile">
        <div className="trend-tile-head"><span>Pergerakan internal</span></div>
        <div className="trend-moves">
          <button type="button" onClick={() => openTab('transfers')}><span>Mutasi unit</span><strong>{number(movement.transfers.length)}</strong></button>
          <button type="button" onClick={() => openTab('band')}><span>Band <em className="up">↑{number(bandUp)}</em> <em className="down">↓{number(movement.bandChanges.length - bandUp)}</em></span><strong>{number(movement.bandChanges.length)}</strong></button>
          <button type="button" onClick={() => openTab('status')}><span>Perubahan status</span><strong>{number(movement.statusChanges.length)}</strong></button>
          {movement.nipChanges.length > 0 && <button type="button" onClick={() => openTab('nip')} title="NIP lama hilang dan NIP baru muncul dengan nama dan tanggal lahir yang sama, misalnya PKWT diangkat menjadi karyawan tetap"><span>Ganti NIP (pengangkatan)</span><strong>{number(movement.nipChanges.length)}</strong></button>}
        </div>
      </div>
    </div>
    {gaps.length > 0 && <p className="trend-gap-note" role="note"><AlertTriangle size={14}/><span><strong>Belum ada data {gaps.map(monthLabel).join(', ')}.</strong> Periode sesudah bulan yang kosong dibandingkan dengan periode tersimpan sebelumnya, jadi masuk, keluar, dan turnover-nya mencakup lebih dari satu bulan (ditandai di tabel). Turnover dibandingkan per bulan.</span></p>}
    <div className="trend-charts">
      <figure><figcaption>Jumlah karyawan per periode</figcaption><HeadcountChart points={series}/></figure>
      <figure><figcaption>Masuk &amp; keluar per periode <span className="trend-legend"><span><i style={{ background: JOINED }}/>Masuk</span><span><i style={{ background: LEFT }}/>Keluar</span></span></figcaption>{series.length > 1 ? <FlowChart points={series}/> : <p className="kpi-detail-empty">Butuh minimal dua periode.</p>}</figure>
    </div>
    <div className="trend-columns">
      <div className="trend-column">
        <h3>Ringkasan per periode</h3>
        <div className="table-scroll trend-scroll" tabIndex={0} role="region" aria-label="Ringkasan per periode, dapat digulir"><table className="retirement-table trend-table sticky-head"><thead><tr><th>Periode</th><th className="num">Karyawan</th><th className="num">Selisih</th><th className="num">Aktif</th><th className="num">PKWT</th><th className="num">Masuk</th><th className="num">Keluar</th><th className="num" title="Keluar non-PKWT ÷ rata-rata karyawan non-PKWT">Turnover</th></tr></thead>
      <tbody>{series.map((point, index) => ({ point, change: index ? point.headcount - series[index - 1].headcount : null })).reverse().map(({ point, change }) => <tr key={point.period} className={point.period === active.period ? 'is-current' : undefined}><td>{monthLabel(point.period)}{(point.spanMonths ?? 1) > 1 && <span className="span-tag" title={`Dibandingkan dengan periode tersimpan ${point.spanMonths} bulan sebelumnya`}>{point.spanMonths} bln</span>}</td><td className="num">{number(point.headcount)}</td><td className={`num trend-change ${change == null ? '' : change > 0 ? 'up' : change < 0 ? 'down' : ''}`}>{change == null ? '—' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${number(Math.abs(change))}`}</td><td className="num">{number(point.active)}</td><td className="num">{number(point.contracts)}</td><td className="num">{point.joined ?? '—'}</td><td className="num" title={point.contractExits ? `Termasuk ${point.contractExits} PKWT (tidak dihitung turnover)` : undefined}>{point.left ?? '—'}{point.contractExits ? <small className="trend-cell-note">{point.contractExits} PKWT</small> : null}</td><td className="num" title={(point.spanMonths ?? 1) > 1 ? `≈ ${pct(point.monthlyTurnover)} per bulan` : undefined}>{pct(point.turnover)}</td></tr>)}</tbody></table></div>
      </div>
      <div className="trend-column" id="trend-detail">
        <h3>Rincian karyawan · {monthLabel(movement.from)} → {monthLabel(movement.to)}</h3>
    <div className="trend-tabs" role="tablist" aria-label="Rincian perpindahan karyawan">{tabs.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'is-active' : ''} onClick={() => setTab(item.key)}>{item.label} <span>{number(item.count)}</span></button>)}</div>
    {tab === 'joined' && movement.staleJoins.length > 0 && <p className="trend-check-note" role="note"><AlertTriangle size={14}/><span><strong>{number(movement.staleJoins.length)} karyawan masuk perlu dicek:</strong> tanggal masuknya sebelum {monthLabel(movement.from)}, padahal NIP-nya tidak ada di data {monthLabel(movement.from)}. Kemungkinan salah tulis NIP atau data periode sebelumnya tidak lengkap.</span></p>}
        <PeopleTable key={tab} rows={detail.rows} columns={detail.columns}/>
      </div>
    </div>
    <p className="chart-footnote">Karyawan dicocokkan lewat NIP: masuk = NIP yang baru muncul, keluar = NIP periode pembanding yang tidak ada lagi di periode aktif. NIP yang berganti (misalnya saat PKWT diangkat menjadi karyawan tetap) dikenali lewat nama dan tanggal lahir yang sama, lalu dicatat sebagai ganti NIP, bukan keluar dan masuk; nama atau tanggal lahir yang ikut berubah tetap terbaca sebagai keluar dan masuk. Indikasi alasan keluar: "kontrak selesai" bila karyawan PKWT keluar setelah tanggal selesai kontraknya lewat, "PKWT berhenti" bila PKWT keluar sebelum tanggal itu (atau tanpa tanggal selesai), "usia pensiun" bila usia ≥ {retirementAge} tahun. Turnover hanya menghitung karyawan non-PKWT: keluar non-PKWT ÷ rata-rata karyawan non-PKWT; semua PKWT yang keluar tidak termasuk. Periode yang tidak berurutan dibandingkan langsung.</p>
  </section>
}
