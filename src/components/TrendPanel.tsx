import { useState } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from 'lucide-react'
import { Link } from 'react-router'
import { monthLabel } from '../analytics/periods'
import { formatNumber, formatPercent } from '../analytics/format'
import { missingMonths, type MovementSummary, type PeriodPoint } from '../analytics/trends'
import type { EmployeeSnapshot } from '../types/workforce'
import { FilterDropdown } from './FilterDropdown'
import { MovementTable, type Tab } from './MovementTable'
import { FlowChart, HeadcountChart, JOINED, LEFT, Sparkline } from './TrendCharts'

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

function Delta({ value, suffix = '' }: { value: number; suffix?: string }) {
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  return (
    <span className={`trend-delta ${value > 0 ? 'up' : value < 0 ? 'down' : ''}`}>
      <Icon size={12} />
      {value > 0 ? '+' : ''}
      {formatNumber(value)}
      {suffix}
    </span>
  )
}

/** Footer with the highest and lowest value across the stored periods (ties go to the most recent period). */
function Extremes({
  points,
  value,
  format,
}: {
  points: PeriodPoint[]
  value: (point: PeriodPoint) => number | null
  format: (value: number) => string
}) {
  const valued = points
    .map(point => ({ point, value: value(point) }))
    .filter((item): item is { point: PeriodPoint; value: number } => item.value !== null)
  if (valued.length < 2) return null
  const high = valued.reduce((best, item) => (item.value >= best.value ? item : best))
  const low = valued.reduce((best, item) => (item.value <= best.value ? item : best))
  return (
    <div className="trend-tile-foot">
      <span>
        Tertinggi <b>{format(high.value)}</b> · {monthLabel(high.point.period)}
      </span>
      <span>
        Terendah <b>{format(low.value)}</b> · {monthLabel(low.point.period)}
      </span>
    </div>
  )
}

export function TrendPanel({ active, trend, retirementAge, onCompareChange: setChosen }: Props) {
  const { snapshots, series, movement, compareWith } = trend
  const earlier = snapshots
    .filter(item => item.period < active.period)
    .map(item => item.period)
    .reverse()
  const [tab, setTab] = useState<Tab>('joined')

  if (!movement) {
    return (
      <section className="section-card trend-card" aria-label="Analisis antar-periode">
        <div className="section-header">
          <div className="retirement-title">
            <TrendingUp size={17} />
            <div>
              <h2>Analisis antar-periode</h2>
              <p>Tren jumlah karyawan, masuk/keluar, mutasi, dan perubahan band/status</p>
            </div>
          </div>
        </div>
        <p className="kpi-detail-empty">
          {trend.saved > 1 ? `Belum ada periode sebelum ${monthLabel(active.period)} yang tersimpan.` : 'Baru satu periode tersimpan.'}{' '}
          Upload file periode lain untuk melihat perbandingan.{' '}
          <Link to="/impor" className="link-button">
            Upload periode lain
          </Link>
        </p>
      </section>
    )
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'joined', label: 'Masuk', count: movement.joined.length },
    { key: 'left', label: 'Keluar', count: movement.left.length },
    { key: 'transfers', label: 'Mutasi unit', count: movement.transfers.length },
    { key: 'band', label: 'Perubahan band', count: movement.bandChanges.length },
    { key: 'status', label: 'Perubahan status', count: movement.statusChanges.length },
    ...(movement.nipChanges.length ? [{ key: 'nip' as const, label: 'Ganti NIP', count: movement.nipChanges.length }] : []),
  ]
  const bandUp = movement.bandChanges.filter(item => item.direction === 'naik').length
  const change = movement.headcountAfter - movement.headcountBefore
  const net = movement.joined.length - movement.left.length
  const flowTotal = movement.joined.length + movement.left.length
  // Turnover over several months is compared per month, so a Jan→Dec comparison is not set against monthly figures.
  const pastTurnover = series
    .filter(point => point.period < movement.to && point.monthlyTurnover !== null)
    .map(point => point.monthlyTurnover!)
  const averageTurnover = pastTurnover.length ? pastTurnover.reduce((sum, value) => sum + value, 0) / pastTurnover.length : null
  const multiMonth = movement.spanMonths > 1
  const turnoverGap = averageTurnover === null || movement.monthlyTurnover === null ? null : movement.monthlyTurnover - averageTurnover
  const turnoverTone = turnoverGap === null || Math.abs(turnoverGap) < 0.001 ? '' : turnoverGap < 0 ? 'good' : 'bad'
  const perMonth = multiMonth ? `≈ ${formatPercent(movement.monthlyTurnover)} per bulan, ` : ''
  const turnoverNote =
    movement.turnoverBase === 0
      ? 'Tidak ada karyawan non-PKWT pada filter ini, jadi turnover tidak dihitung'
      : turnoverGap === null
        ? `Keluar non-PKWT ÷ rata-rata karyawan non-PKWT ${monthLabel(movement.from)}–${monthLabel(movement.to)}`
        : Math.abs(turnoverGap) < 0.001
          ? `${perMonth}setara rata-rata per bulan sebelumnya (${formatPercent(averageTurnover)})`
          : `${perMonth}${turnoverGap < 0 ? 'lebih rendah' : 'lebih tinggi'} dari rata-rata per bulan sebelumnya (${formatPercent(averageTurnover)})`
  const gaps = missingMonths(series.map(point => point.period))
  function openTab(next: Tab) {
    setTab(next)
    document.getElementById('trend-detail')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <section className="section-card trend-card" aria-label="Analisis antar-periode">
      <div className="section-header retirement-header">
        <div className="retirement-title">
          <TrendingUp size={17} />
          <div>
            <h2>Analisis antar-periode</h2>
            <p>
              {monthLabel(movement.from)} → {monthLabel(movement.to)} · mengikuti filter dashboard
            </p>
          </div>
        </div>
        <div className="retirement-controls">
          <div>
            <span>Bandingkan dengan</span>
            <FilterDropdown
              label="Periode pembanding"
              allowAll={false}
              options={earlier}
              selected={compareWith ? [compareWith] : []}
              display={monthLabel}
              onChange={([value]) => value && setChosen(value)}
            />
          </div>
        </div>
      </div>
      <div className="trend-tiles">
        <div className="trend-tile primary">
          <div className="trend-tile-head">
            <span>Jumlah karyawan</span>
            <span className="trend-pill">
              <Delta value={change} />
            </span>
          </div>
          <div className="trend-tile-body">
            <strong>{formatNumber(movement.headcountAfter)}</strong>
            <Sparkline values={series.map(point => point.headcount)} tone="dark" />
          </div>
          <small>
            {change === 0 ? 'Sama dengan' : change > 0 ? 'Naik dari' : 'Turun dari'} {formatNumber(movement.headcountBefore)} pada{' '}
            {monthLabel(movement.from)}
          </small>
          <Extremes points={series} value={point => point.headcount} format={formatNumber} />
        </div>
        <div className="trend-tile">
          <div className="trend-tile-head">
            <span>Arus karyawan</span>
            <span className={`trend-pill ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`}>
              Bersih {net > 0 ? '+' : net < 0 ? '−' : ''}
              {formatNumber(Math.abs(net))}
            </span>
          </div>
          <div className="trend-flow">
            <button type="button" onClick={() => openTab('joined')}>
              <span>
                <i className="trend-key" style={{ background: JOINED }} />
                Masuk
              </span>
              <strong>{formatNumber(movement.joined.length)}</strong>
            </button>
            <button type="button" onClick={() => openTab('left')}>
              <span>
                <i className="trend-key" style={{ background: LEFT }} />
                Keluar
              </span>
              <strong>{formatNumber(movement.left.length)}</strong>
            </button>
          </div>
          {flowTotal > 0 && (
            <div className="trend-split" aria-hidden="true">
              <span style={{ flexGrow: movement.joined.length, background: JOINED }} />
              <span style={{ flexGrow: movement.left.length, background: LEFT }} />
            </div>
          )}
          <div className="trend-chips">
            {movement.exitReasons.length ? (
              movement.exitReasons.map(item => (
                <span
                  key={item.reason}
                  title={
                    item.reason === 'Kontrak selesai'
                      ? 'PKWT yang keluar setelah tanggal selesai kontraknya lewat; tidak dihitung sebagai turnover'
                      : item.reason === 'PKWT berhenti'
                        ? 'PKWT yang keluar sebelum tanggal selesai kontrak (atau tanpa tanggal selesai); tidak dihitung sebagai turnover'
                        : undefined
                  }
                >
                  {item.reason === 'Tidak diketahui' ? 'Alasan lain' : item.reason} {formatNumber(item.count)}
                </span>
              ))
            ) : (
              <span>Tidak ada yang keluar</span>
            )}
          </div>
        </div>
        <div className="trend-tile">
          <div className="trend-tile-head">
            <span>Turnover</span>
            {multiMonth && (
              <span
                className="trend-pill"
                title={`Akumulasi ${movement.spanMonths} bulan, ${monthLabel(movement.from)}–${monthLabel(movement.to)}`}
              >
                {movement.spanMonths} bulan
              </span>
            )}
          </div>
          <div className="trend-tile-body">
            <strong>{formatPercent(movement.turnover)}</strong>
            <Sparkline values={series.filter(point => point.monthlyTurnover !== null).map(point => point.monthlyTurnover!)} tone="light" />
          </div>
          <small className={turnoverTone}>{turnoverNote.charAt(0).toLocaleUpperCase('id') + turnoverNote.slice(1)}</small>
          {movement.contractExits > 0 && (
            <small className="trend-subnote">
              {formatNumber(movement.turnoverExits)} dari {formatNumber(movement.left.length)} keluar dihitung;{' '}
              {formatNumber(movement.contractExits)} PKWT tidak termasuk
            </small>
          )}
          <Extremes points={series} value={point => point.monthlyTurnover} format={value => `${formatPercent(value)}/bln`} />
        </div>
        <div className="trend-tile">
          <div className="trend-tile-head">
            <span>Pergerakan internal</span>
          </div>
          <div className="trend-moves">
            <button type="button" onClick={() => openTab('transfers')}>
              <span>Mutasi unit</span>
              <strong>{formatNumber(movement.transfers.length)}</strong>
            </button>
            <button type="button" onClick={() => openTab('band')}>
              <span>
                Band <em className="up">↑{formatNumber(bandUp)}</em>{' '}
                <em className="down">↓{formatNumber(movement.bandChanges.length - bandUp)}</em>
              </span>
              <strong>{formatNumber(movement.bandChanges.length)}</strong>
            </button>
            <button type="button" onClick={() => openTab('status')}>
              <span>Perubahan status</span>
              <strong>{formatNumber(movement.statusChanges.length)}</strong>
            </button>
            {movement.nipChanges.length > 0 && (
              <button
                type="button"
                onClick={() => openTab('nip')}
                title="NIP lama hilang dan NIP baru muncul dengan nama dan tanggal lahir yang sama, misalnya PKWT diangkat menjadi karyawan tetap"
              >
                <span>Ganti NIP (pengangkatan)</span>
                <strong>{formatNumber(movement.nipChanges.length)}</strong>
              </button>
            )}
          </div>
        </div>
      </div>
      {gaps.length > 0 && (
        <p className="trend-gap-note" role="note">
          <AlertTriangle size={14} />
          <span>
            <strong>Belum ada data {gaps.map(monthLabel).join(', ')}.</strong> Periode sesudah bulan yang kosong dibandingkan dengan periode
            tersimpan sebelumnya, jadi masuk, keluar, dan turnover-nya mencakup lebih dari satu bulan (ditandai di tabel). Turnover
            dibandingkan per bulan.
          </span>
        </p>
      )}
      <div className="trend-charts">
        <figure>
          <figcaption>Jumlah karyawan per periode</figcaption>
          <HeadcountChart points={series} />
        </figure>
        <figure>
          <figcaption>
            Masuk &amp; keluar per periode{' '}
            <span className="trend-legend">
              <span>
                <i style={{ background: JOINED }} />
                Masuk
              </span>
              <span>
                <i style={{ background: LEFT }} />
                Keluar
              </span>
            </span>
          </figcaption>
          {series.length > 1 ? <FlowChart points={series} /> : <p className="kpi-detail-empty">Butuh minimal dua periode.</p>}
        </figure>
      </div>
      <div className="trend-columns">
        <div className="trend-column">
          <h3>Ringkasan per periode</h3>
          <div className="table-scroll trend-scroll" tabIndex={0} role="region" aria-label="Ringkasan per periode, dapat digulir">
            <table className="retirement-table trend-table sticky-head">
              <thead>
                <tr>
                  <th>Periode</th>
                  <th className="num">Karyawan</th>
                  <th className="num">Selisih</th>
                  <th className="num">Aktif</th>
                  <th className="num">PKWT</th>
                  <th className="num">Masuk</th>
                  <th className="num">Keluar</th>
                  <th className="num" title="Keluar non-PKWT ÷ rata-rata karyawan non-PKWT">
                    Turnover
                  </th>
                </tr>
              </thead>
              <tbody>
                {series
                  .map((point, index) => ({ point, change: index ? point.headcount - series[index - 1].headcount : null }))
                  .reverse()
                  .map(({ point, change }) => (
                    <tr key={point.period} className={point.period === active.period ? 'is-current' : undefined}>
                      <td>
                        {monthLabel(point.period)}
                        {(point.spanMonths ?? 1) > 1 && (
                          <span className="span-tag" title={`Dibandingkan dengan periode tersimpan ${point.spanMonths} bulan sebelumnya`}>
                            {point.spanMonths} bln
                          </span>
                        )}
                      </td>
                      <td className="num">{formatNumber(point.headcount)}</td>
                      <td className={`num trend-change ${change == null ? '' : change > 0 ? 'up' : change < 0 ? 'down' : ''}`}>
                        {change == null ? '—' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${formatNumber(Math.abs(change))}`}
                      </td>
                      <td className="num">{formatNumber(point.active)}</td>
                      <td className="num">{formatNumber(point.contracts)}</td>
                      <td className="num">{point.joined ?? '—'}</td>
                      <td
                        className="num"
                        title={point.contractExits ? `Termasuk ${point.contractExits} PKWT (tidak dihitung turnover)` : undefined}
                      >
                        {point.left ?? '—'}
                        {point.contractExits ? <small className="trend-cell-note">{point.contractExits} PKWT</small> : null}
                      </td>
                      <td
                        className="num"
                        title={(point.spanMonths ?? 1) > 1 ? `≈ ${formatPercent(point.monthlyTurnover)} per bulan` : undefined}
                      >
                        {formatPercent(point.turnover)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="trend-column" id="trend-detail">
          <h3>
            Rincian karyawan · {monthLabel(movement.from)} → {monthLabel(movement.to)}
          </h3>
          <div className="trend-tabs" role="tablist" aria-label="Rincian perpindahan karyawan">
            {tabs.map(item => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                className={tab === item.key ? 'is-active' : ''}
                onClick={() => setTab(item.key)}
              >
                {item.label} <span>{formatNumber(item.count)}</span>
              </button>
            ))}
          </div>
          {tab === 'joined' && movement.staleJoins.length > 0 && (
            <p className="trend-check-note" role="note">
              <AlertTriangle size={14} />
              <span>
                <strong>{formatNumber(movement.staleJoins.length)} karyawan masuk perlu dicek:</strong> tanggal masuknya sebelum{' '}
                {monthLabel(movement.from)}, padahal NIP-nya tidak ada di data {monthLabel(movement.from)}. Kemungkinan salah tulis NIP atau
                data periode sebelumnya tidak lengkap.
              </span>
            </p>
          )}
          <MovementTable key={tab} movement={movement} tab={tab} />
        </div>
      </div>
      <p className="chart-footnote">
        Karyawan dicocokkan lewat NIP: masuk = NIP yang baru muncul, keluar = NIP periode pembanding yang tidak ada lagi di periode aktif.
        NIP yang berganti (misalnya saat PKWT diangkat menjadi karyawan tetap) dikenali lewat nama dan tanggal lahir yang sama, lalu dicatat
        sebagai ganti NIP, bukan keluar dan masuk; nama atau tanggal lahir yang ikut berubah tetap terbaca sebagai keluar dan masuk.
        Indikasi alasan keluar: "kontrak selesai" bila karyawan PKWT keluar setelah tanggal selesai kontraknya lewat, "PKWT berhenti" bila
        PKWT keluar sebelum tanggal itu (atau tanpa tanggal selesai), "usia pensiun" bila usia ≥ {retirementAge} tahun. Turnover hanya
        menghitung karyawan non-PKWT: keluar non-PKWT ÷ rata-rata karyawan non-PKWT; semua PKWT yang keluar tidak termasuk. Periode yang
        tidak berurutan dibandingkan langsung.
      </p>
    </section>
  )
}
