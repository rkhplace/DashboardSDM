import { IdCard } from 'lucide-react'
import { useMemo } from 'react'
import { formatNumber } from '../analytics/format'
import { countBy } from '../analytics/workforce'
import type { EmployeeRecord } from '../types/workforce'

type Props = { records: EmployeeRecord[]; selected: string[]; onToggle: (status: string) => void }

/** Head count per employment status; clicking a status filters the dashboard to it (clicking again clears it). */
export function StatusPanel({ records, selected, onToggle }: Props) {
  const statuses = useMemo(() => countBy(records, record => record.status), [records])
  return (
    <section className="status-panel section-card" aria-label="Distribusi status kepegawaian dan penugasan">
      <div className="status-panel-head">
        <div className="status-panel-title">
          <IdCard size={17} />
          <h2>Distribusi status kepegawaian &amp; penugasan</h2>
        </div>
        <p>
          {statuses.length} klasifikasi status <span>•</span> Total {formatNumber(records.length)} personel
        </p>
      </div>
      <div className="status-grid">
        {statuses.map(item => (
          <button
            type="button"
            key={item.name}
            className={`status-item ${selected.includes(item.name) ? 'status-selected' : ''}`}
            onClick={() => onToggle(item.name)}
            aria-label={`Filter status ${item.name}, ${formatNumber(item.value)} orang`}
          >
            <span title={item.name}>{item.name}</span>
            <div>
              <strong>{formatNumber(item.value)}</strong>
              <small>{records.length ? ((item.value / records.length) * 100).toFixed(1) : '0.0'}%</small>
            </div>
          </button>
        ))}
      </div>
      {statuses.length === 0 && <p className="status-empty">Tidak ada status pada hasil filter.</p>}
    </section>
  )
}
