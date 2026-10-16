import { useMemo, useState } from 'react'
import { AlertTriangle, FileClock } from 'lucide-react'
import { monthLabel, projectContracts } from '../analytics/contracts'
import { countOutcomes, type ContractFollowUp, type ContractOutcome } from '../analytics/trends'
import { CONTRACT_END_COLUMNS } from '../data/excelAdapter'
import type { EmployeeRecord } from '../types/workforce'
import { RangeSlider } from './RangeSlider'
import { formatDate } from '../analytics/format'

/** Contracts due by this period, compared with an earlier saved period; null when there is none. */
export type FollowUpData = { from: string; items: ContractFollowUp[]; hasContractColumn: boolean } | null
type Props = { records: EmployeeRecord[]; asOf: string; hasContractColumn: boolean; months: number; onMonthsChange: (months: number) => void; followUp?: FollowUpData }

// Validated as a stacked-bar sequence in this order (adjacent CVD ΔE ≥ 9); counts are always printed beside the swatch.
const OUTCOME_COLORS: Record<ContractOutcome, string> = { 'Belum ada keputusan': '#eda100', 'Diangkat tetap': '#1baf7a', Diperpanjang: '#0b7bb3', Selesai: '#d06a1c' }
const OUTCOME_HINTS: Record<ContractOutcome, string> = {
  'Belum ada keputusan': 'Masih PKWT dengan tanggal selesai yang sama: perlu penilaian atasan',
  'Diangkat tetap': 'Kini berstatus tetap (termasuk yang NIP-nya berganti)',
  Diperpanjang: 'Tanggal selesai kontrak bergeser lebih lama',
  Selesai: 'Tidak ada lagi di data; tidak dihitung sebagai turnover',
}

/** Up to 4 years: the PKWT maximum under the 2026 labour law (2 years + two 1-year extensions). */
const MAX_MONTHS = 48
const monthsLabel = (months: number) => months < 12 ? `${months} bulan` : months % 12 === 0 ? `${months / 12} tahun` : `${Math.floor(months / 12)} th ${months % 12} bln`
const number = (value: number) => value.toLocaleString('id-ID')
const remaining = (months: number, expired: boolean) => expired ? 'Sudah lewat' : months <= 0 ? 'Bulan ini' : `${months} bln`

function outcomeNote(item: ContractFollowUp, asOf: string) {
  const { before, after, outcome } = item
  if (!after) return `Tidak ada di data ${monthLabel(asOf.slice(0, 7))}`
  if (outcome === 'Diangkat tetap') return `Status ${after.status}${after.nip !== before.nip ? ` · NIP baru ${after.nip}` : ''}`
  if (outcome === 'Diperpanjang') return `Kontrak baru s.d. ${formatDate(after.contractEnd!)}`
  return after.contractEnd === undefined ? 'File periode ini tanpa kolom tanggal selesai' : 'Tanggal selesai belum diperbarui'
}

function FollowUp({ data, asOf }: { data: NonNullable<FollowUpData>; asOf: string }) {
  const [chosen, setSelected] = useState<ContractOutcome | null>(null)
  const counts = countOutcomes(data.items)
  const total = data.items.length
  // A choice whose group is empty after a filter or period change is dropped instead of showing an empty table.
  const selected = chosen && counts.some(item => item.outcome === chosen && item.count > 0) ? chosen : null
  const rows = selected ? data.items.filter(item => item.outcome === selected) : []
  return <div className="followup" aria-label="Tindak lanjut kontrak jatuh tempo">
    <div className="followup-head"><h3>Tindak lanjut kontrak jatuh tempo</h3><p>{!data.hasContractColumn ? `File ${monthLabel(data.from)} belum punya kolom tanggal selesai kontrak, jadi tindak lanjut belum bisa dilihat. Upload ulang periode itu dengan kolom ${CONTRACT_END_COLUMNS[0]}, atau pilih periode pembanding lain di Analisis antar-periode.`
      : total ? `${number(total)} kontrak PKWT dengan tanggal selesai s.d. ${formatDate(asOf)}, dilihat dari data ${monthLabel(data.from)}` : `Tidak ada kontrak PKWT di data ${monthLabel(data.from)} yang jatuh tempo s.d. ${formatDate(asOf)}.`}</p></div>
    {total > 0 && <>
      <div className="followup-bar" role="img" aria-label={counts.map(item => `${item.outcome} ${item.count}`).join(', ')}>{counts.filter(item => item.count).map(item => <span key={item.outcome} title={`${item.outcome}: ${number(item.count)} (${Math.round(item.count / total * 100)}%)`} style={{ flexGrow: item.count, background: OUTCOME_COLORS[item.outcome] }}/>)}</div>
      <div className="followup-legend">{counts.map(item => <button key={item.outcome} type="button" aria-pressed={selected === item.outcome} disabled={!item.count} title={OUTCOME_HINTS[item.outcome]} className={selected === item.outcome ? 'is-active' : ''} onClick={() => setSelected(selected === item.outcome ? null : item.outcome)}>
        <span className="followup-label"><i className="trend-key" style={{ background: OUTCOME_COLORS[item.outcome] }}/>{item.outcome === 'Belum ada keputusan' && item.count > 0 && <AlertTriangle size={12} className="followup-warn" aria-hidden="true"/>}{item.outcome}</span>
        <strong>{number(item.count)}</strong>
      </button>)}</div>
      {selected && <div className="table-scroll followup-table"><table className="retirement-table"><thead><tr><th>Nama</th><th>NIP</th><th>Divisi</th><th>Selesai kontrak</th><th>Keterangan</th></tr></thead><tbody>
        {rows.map(item => <tr key={item.before.nip}><td>{item.before.name}</td><td className="nip-cell">{item.before.nip}</td><td>{item.before.division}</td><td>{formatDate(item.before.contractEnd!)}</td><td>{outcomeNote(item, asOf)}</td></tr>)}
      </tbody></table></div>}
    </>}
  </div>
}

export function ContractPanel({ records, asOf, hasContractColumn, months: horizon, onMonthsChange: setHorizon, followUp }: Props) {
  const [showAll, setShowAll] = useState(false)
  const projection = useMemo(() => projectContracts(records, asOf, horizon), [records, asOf, horizon])
  const max = Math.max(...projection.months.map(month => month.count), 1)
  const visible = showAll ? projection.list : projection.list.slice(0, 10)

  return <section className="section-card retirement-card contract-card" aria-label="Kontrak PKWT berakhir">
    <div className="section-header retirement-header">
      <div className="retirement-title"><FileClock size={17}/><div><h2>Kontrak PKWT berakhir</h2><p>Early warning untuk penilaian atasan: perpanjang, angkat tetap, atau selesai</p></div></div>
      <div className="retirement-controls"><RangeSlider label="Rentang proyeksi" value={horizon} min={1} max={MAX_MONTHS} ticks={[1, 12, 24, 36, 48]} tickLabel={months => months === 1 ? '1 bln' : `${months / 12} th`} valueLabel={monthsLabel} stepName="bulan" onChange={setHorizon}/></div>
    </div>
    {!hasContractColumn
      ? <p className="kpi-detail-empty">File periode ini belum punya kolom tanggal selesai kontrak. Tambahkan kolom <strong>{CONTRACT_END_COLUMNS[0]}</strong> pada Excel lalu upload ulang periode ini.</p>
      : projection.contracts === 0
        ? <p className="kpi-detail-empty">Tidak ada karyawan PKWT pada hasil filter.</p>
        : <>
          <div className="retirement-stats">
            <div className="retirement-stat primary"><span>Berakhir dalam {monthsLabel(horizon)}</span><strong>{number(projection.endingWithinHorizon)}</strong><small>dari {number(projection.contracts)} karyawan PKWT</small></div>
            <div className="retirement-stat"><span>Sudah lewat tanggal selesai</span><strong>{number(projection.expired)}</strong><small>Masih tercatat, belum ada keputusan</small></div>
            <div className="retirement-stat"><span>Tanpa tanggal selesai</span><strong>{number(projection.missingEndDate)}</strong><small>Tidak ikut diproyeksikan</small></div>
            <div className="retirement-stat"><span>Karyawan PKWT</span><strong>{number(projection.contracts)}</strong><small>{number(projection.withEndDate)} punya tanggal selesai</small></div>
          </div>
          {followUp && <FollowUp data={followUp} asOf={asOf}/>}
          <div className="retirement-body">
            <div className="retirement-windows">
              <h3>Kontrak berakhir per bulan</h3>
              <div className="retirement-window-list" tabIndex={projection.months.length > 12 ? 0 : undefined} aria-label="Kontrak berakhir per bulan">{projection.months.map(month => <div className="retirement-window" key={month.month} title={`${month.label}: ${number(month.count)} kontrak berakhir`}>
                <span className="retirement-window-label">{month.label}</span>
                <span className="retirement-window-track contract-track"><span style={{ width: `${month.count / max * 100}%` }}/></span>
                <strong>{number(month.count)}</strong>
              </div>)}</div>
            </div>
            <div className="retirement-divisions">
              <h3>Per divisi</h3>
              {projection.divisions.length === 0
                ? <p className="kpi-detail-empty">Tidak ada kontrak yang berakhir dalam rentang ini.</p>
                : <div className="table-scroll"><table className="retirement-table"><thead><tr><th>Divisi</th><th>PKWT</th><th>Berakhir</th><th>%</th></tr></thead><tbody>
                  {projection.divisions.map(item => <tr key={item.division}><td>{item.division}</td><td>{number(item.contracts)}</td><td>{number(item.ending)}</td><td>{(item.ending / item.contracts * 100).toFixed(0)}%</td></tr>)}
                </tbody></table></div>}
            </div>
          </div>
          {projection.list.length > 0 && <div className="retirement-list">
            <h3>Daftar kontrak ({number(projection.list.length)})</h3>
            <div className="table-scroll"><table className="retirement-table"><thead><tr><th>Nama</th><th>NIP</th><th>Status</th><th>Jabatan</th><th>Divisi</th><th>Tanggal selesai</th><th>Sisa waktu</th></tr></thead><tbody>
              {visible.map(({ record, endsOn, monthsLeft, expired }) => <tr key={record.nip} className={expired ? 'is-overdue' : ''}><td>{record.name}</td><td className="nip-cell">{record.nip}</td><td>{record.status}</td><td>{record.position}</td><td>{record.division}</td><td>{formatDate(endsOn)}</td><td>{remaining(monthsLeft, expired)}</td></tr>)}
            </tbody></table></div>
            {projection.list.length > 10 && <button type="button" className="chart-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Tampilkan 10 terdekat' : `Lihat semua ${number(projection.list.length)} kontrak`}</button>}
          </div>}
          <p className="chart-footnote">Status PKWT = status yang mengandung kata "PKWT". Kontrak dihitung berakhir pada bulan tanggal selesainya; perpanjangan yang belum tercatat di file tidak terlihat. PKWT yang keluar, baik kontraknya selesai maupun berhenti lebih awal, tidak dihitung sebagai turnover. Tindak lanjut dibaca dari periode pembanding di Analisis antar-periode: diperpanjang bila tanggal selesai bergeser, diangkat tetap bila status tidak lagi PKWT (termasuk ganti NIP), selesai bila tidak ada lagi di data. Rentang maksimal 4 tahun mengikuti batas total PKWT (2 tahun + perpanjangan 2 × 1 tahun).</p>
        </>}
  </section>
}
