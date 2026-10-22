import { useState } from 'react'
import { ArrowRight, Database, Trash2 } from 'lucide-react'
import type { StorageState } from '../data/sessionContext'
import type { StoredPeriod } from '../data/snapshotStore'
import { formatNumber } from '../analytics/format'

type Props = {
  periods: StoredPeriod[]
  storage: StorageState
  busy: boolean
  onOpen: (period: string) => void
  onRemove: (period: string) => void
}

const periodLabel = (period: string) =>
  new Date(`${period}-01T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const savedLabel = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function SavedPeriods({ periods, storage, busy, onOpen, onRemove }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null)
  if (storage === 'loading' || !periods.length) return null
  const latest = periods[periods.length - 1]
  return (
    <section className="saved-periods" aria-label="Periode tersimpan">
      <div className="saved-periods-head">
        <Database size={16} />
        <div>
          <h2>Periode tersimpan ({formatNumber(periods.length)})</h2>
          <p>Upload file periode lain untuk menambah data tren. Upload ulang periode yang sama akan menggantikannya.</p>
        </div>
        <button type="button" className="dq-button primary" disabled={busy} onClick={() => onOpen(latest.period)}>
          Buka {periodLabel(latest.period)}
          <ArrowRight size={15} />
        </button>
      </div>
      <ul>
        {[...periods].reverse().map(item => (
          <li key={item.period}>
            <div className="saved-period-main">
              <strong>{periodLabel(item.period)}</strong>
              <span>
                {item.sourceFile} · {formatNumber(item.rowCount)} karyawan · disimpan {savedLabel(item.savedAt)}
              </span>
            </div>
            {confirming === item.period ? (
              <div className="saved-period-actions">
                <span>Hapus periode ini?</span>
                <button
                  type="button"
                  className="dq-button danger"
                  onClick={() => {
                    setConfirming(null)
                    onRemove(item.period)
                  }}
                >
                  Ya, hapus
                </button>
                <button type="button" className="dq-button ghost" onClick={() => setConfirming(null)}>
                  Batal
                </button>
              </div>
            ) : (
              <div className="saved-period-actions">
                <button type="button" className="dq-button ghost" disabled={busy} onClick={() => onOpen(item.period)}>
                  Buka
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Hapus periode ${periodLabel(item.period)}`}
                  onClick={() => setConfirming(item.period)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
