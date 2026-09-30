import { AlertTriangle, ArrowRight, CheckCircle2, Download, FileSpreadsheet, RotateCcw, XCircle } from 'lucide-react'
import type { ExcelInspection } from '../data/excelAdapter'
import { qualityCsv, type ImportIssue, type ImportQuality } from '../data/validateImport'
import { downloadCsv } from '../report/download'

type Props = {
  inspection: ExcelInspection
  filename: string
  period: string
  onPeriodChange: (period: string) => void
  quality: ImportQuality | null
  loading: boolean
  onContinue: () => void
  onReset: () => void
}

const number = (value: number) => value.toLocaleString('id-ID')

function IssueList({ items, tone }: { items: ImportIssue[]; tone: 'critical' | 'warning' }) {
  return <ul className={`dq-list dq-${tone}`}>{items.map(item => <li key={item.label}>
    <div className="dq-item-top">{tone === 'critical' ? <XCircle size={15}/> : <AlertTriangle size={15}/>}<span>{item.label}</span><strong>{number(item.count)}</strong></div>
    {item.hint && <p>{item.hint}</p>}
    {item.nips && item.nips.length > 0 && <p className="dq-sample">Contoh NIP: {item.nips.slice(0, 5).join(', ')}{item.nips.length > 5 ? ` dan ${number(item.nips.length - 5)} lainnya` : ''}</p>}
  </li>)}</ul>
}

export function DataQualityPanel({ inspection, filename, period, onPeriodChange, quality, loading, onContinue, onReset }: Props) {
  const critical = quality?.critical ?? []
  const warnings = quality?.warnings ?? []
  const affected = new Set(warnings.flatMap(item => item.nips ?? [])).size
  const ready = Boolean(quality) && critical.length === 0
  const status = !quality ? { icon: AlertTriangle, text: 'Pilih periode data untuk memeriksa file.', tone: 'warning' }
    : critical.length ? { icon: XCircle, text: `${critical.length} masalah kritis harus diperbaiki di file sebelum lanjut.`, tone: 'critical' }
      : warnings.length ? { icon: AlertTriangle, text: `Bisa lanjut. ${warnings.length} jenis catatan menyangkut ${number(affected)} karyawan.`, tone: 'warning' }
        : { icon: CheckCircle2, text: 'Data lengkap, tidak ada temuan.', tone: 'ok' }

  return <section className="dq-panel" aria-label="Pemeriksaan kualitas data">
    <div className="dq-head">
      <FileSpreadsheet size={20}/>
      <div><h2>Pemeriksaan kualitas data</h2><p>{filename} · sheet “{inspection.sheetName}”</p></div>
    </div>
    <div className="dq-stats">
      <div><span>Baris data</span><strong>{number(inspection.rowCount)}</strong></div>
      <div><span>Karyawan terbaca</span><strong>{number(inspection.records.length)}</strong></div>
      <div><span>Kolom</span><strong>{number(inspection.headers.filter(Boolean).length)}</strong></div>
      <label><span>Periode data</span><input type="month" value={period} onChange={event => onPeriodChange(event.target.value)} aria-label="Periode data"/></label>
    </div>
    {!inspection.period && <p className="dq-note">Periode tidak ditemukan di nama sheet atau file. Pilih bulan data secara manual.</p>}
    <p className={`dq-status dq-status-${status.tone}`} role="status"><status.icon size={16}/>{status.text}</p>
    {critical.length > 0 && <><h3>Masalah kritis</h3><IssueList items={critical} tone="critical"/></>}
    {warnings.length > 0 && <><h3>Catatan kualitas</h3><IssueList items={warnings} tone="warning"/></>}
    <div className="dq-actions">
      <button type="button" className="dq-button ghost" onClick={onReset} disabled={loading}><RotateCcw size={15}/> Pilih file lain</button>
      {quality && (critical.length + warnings.length) > 0 && <button type="button" className="dq-button ghost" onClick={() => downloadCsv(qualityCsv(quality, inspection.records), `temuan-kualitas-${period || 'data'}.csv`)}><Download size={15}/> Unduh daftar temuan</button>}
      <button type="button" className="dq-button primary" onClick={onContinue} disabled={!ready || loading}>{loading ? 'Menyiapkan...' : 'Lanjut ke dashboard'}<ArrowRight size={15}/></button>
    </div>
  </section>
}
