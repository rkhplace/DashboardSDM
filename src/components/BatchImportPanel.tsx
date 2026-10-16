import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, FileSpreadsheet, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { monthLabel } from '../analytics/contracts'
import { reviewBatch, type BatchItem, type ReviewedItem } from '../data/batchReview'
import type { EmployeeSnapshot } from '../types/workforce'
import { IssueList } from './DataQualityPanel'

type Props = {
  items: BatchItem[]
  stored: EmployeeSnapshot[]
  reading: boolean
  saving: string | null
  onPeriodChange: (id: string, period: string) => void
  onRemove: (id: string) => void
  onSave: (ready: ReviewedItem[]) => void
  onReset: () => void
}

const number = (value: number) => value.toLocaleString('id-ID')

function Status({ item }: { item: ReviewedItem }) {
  const warnings = (item.quality?.warnings.length ?? 0) + item.notes.filter(note => note.tone === 'warning').length
  if (item.verdict === 'reading') return <span className="batch-status reading"><Loader2 size={13} className="spin"/>Membaca...</span>
  if (item.verdict === 'unreadable') return <span className="batch-status critical"><XCircle size={13}/>Gagal dibaca</span>
  if (item.verdict === 'no-period') return <span className="batch-status critical"><XCircle size={13}/>Pilih periode</span>
  if (item.verdict === 'critical') return <span className="batch-status critical"><XCircle size={13}/>{item.quality!.critical.length} masalah kritis</span>
  if (item.verdict === 'duplicate') return <span className="batch-status critical"><XCircle size={13}/>Periode ganda</span>
  return warnings ? <span className="batch-status warning"><AlertTriangle size={13}/>Siap · {warnings} catatan</span> : <span className="batch-status ok"><CheckCircle2 size={13}/>Siap</span>
}

export function BatchImportPanel({ items, stored, reading, saving, onPeriodChange, onRemove, onSave, onReset }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const reviewed = useMemo(() => reviewBatch(items, stored), [items, stored])
  const ready = reviewed.filter(item => item.verdict === 'ready')
  const blocked = reviewed.filter(item => item.verdict !== 'ready' && item.verdict !== 'reading')
  const rows = [...reviewed].sort((a, b) => (a.period || '9999').localeCompare(b.period || '9999') || a.filename.localeCompare(b.filename))

  return <section className="dq-panel batch-panel" aria-label="Tinjau beberapa file">
    <div className="dq-head">
      <FileSpreadsheet size={20}/>
      <div><h2>Tinjau {number(items.length)} file</h2><p>Periksa periode tiap file. File yang bermasalah dilewati; sisanya disimpan sekaligus.</p></div>
    </div>
    <div className="table-scroll"><table className="batch-table">
      <thead><tr><th>File</th><th>Periode</th><th className="num">Karyawan</th><th>Status</th><th aria-label="Aksi"/></tr></thead>
      <tbody>{rows.map(item => {
        const expanded = open === item.id
        const hasDetail = Boolean(item.error || item.notes.length || item.quality?.critical.length || item.quality?.warnings.length)
        return [
          <tr key={item.id} className={`batch-row is-${item.verdict}`}>
            <td className="batch-file" title={item.filename}>{item.filename}{item.inspection && <small>Sheet “{item.inspection.sheetName}”</small>}</td>
            <td>{item.inspection ? <input type="month" value={item.period} onChange={event => onPeriodChange(item.id, event.target.value)} aria-label={`Periode ${item.filename}`} disabled={Boolean(saving)}/> : '—'}</td>
            <td className="num">{item.inspection ? number(item.inspection.records.length) : '—'}</td>
            <td><Status item={item}/></td>
            <td className="batch-actions">
              {hasDetail && <button type="button" className="icon-button" aria-expanded={expanded} aria-label={`Rincian ${item.filename}`} onClick={() => setOpen(expanded ? null : item.id)}><ChevronDown size={15} className={expanded ? 'flip' : ''}/></button>}
              <button type="button" className="icon-button" aria-label={`Hapus ${item.filename} dari daftar`} onClick={() => onRemove(item.id)} disabled={Boolean(saving)}><Trash2 size={14}/></button>
            </td>
          </tr>,
          expanded && <tr key={`${item.id}-detail`} className="batch-detail"><td colSpan={5}>
            {item.error && <p className="dq-note">{item.error}</p>}
            {item.verdict === 'duplicate' && <p className="dq-note">Ada file lain dengan periode {monthLabel(item.period)}. Ubah periodenya atau hapus salah satu.</p>}
            {item.notes.map(note => <p key={note.text} className={`dq-note ${note.tone === 'info' ? 'is-info' : ''}`}>{note.text}</p>)}
            {item.quality && item.quality.critical.length > 0 && <><h3>Masalah kritis</h3><IssueList items={item.quality.critical} tone="critical"/></>}
            {item.quality && item.quality.warnings.length > 0 && <><h3>Catatan kualitas</h3><IssueList items={item.quality.warnings} tone="warning"/></>}
          </td></tr>,
        ]
      })}</tbody>
    </table></div>
    <p className={`dq-status dq-status-${blocked.length ? 'warning' : 'ok'}`} role="status">
      {blocked.length ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>}
      {reading ? 'Membaca file...' : `${number(ready.length)} file siap disimpan${blocked.length ? `, ${number(blocked.length)} dilewati karena bermasalah` : ''}.`}
    </p>
    <div className="dq-actions">
      <button type="button" className="dq-button ghost" onClick={onReset} disabled={Boolean(saving)}><RotateCcw size={15}/> Pilih file lain</button>
      <button type="button" className="dq-button primary" onClick={() => onSave(ready)} disabled={!ready.length || reading || Boolean(saving)}>{saving ?? `Simpan ${number(ready.length)} periode & buka dashboard`}<ArrowRight size={15}/></button>
    </div>
  </section>
}
