import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatDate, formatNumber } from '../analytics/format'
import { monthLabel } from '../analytics/periods'
import type { MovementSummary } from '../analytics/trends'
import type { EmployeeRecord } from '../types/workforce'

export type Tab = 'joined' | 'left' | 'transfers' | 'band' | 'status' | 'nip'

type PeopleRow = { key: string; cells: ReactNode[]; flagged?: boolean }

function PeopleTable({ rows, columns }: { rows: PeopleRow[]; columns: string[] }) {
  if (!rows.length) return <p className="kpi-detail-empty">Tidak ada karyawan pada kategori ini.</p>
  return (
    <div
      className="table-scroll trend-scroll"
      tabIndex={0}
      role="region"
      aria-label={`Daftar ${formatNumber(rows.length)} karyawan, dapat digulir`}
    >
      <table className="retirement-table sticky-head">
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className={row.flagged ? 'is-flagged' : undefined}>
              {row.cells.map((cell, index) => (
                <td key={index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Person({ record }: { record: EmployeeRecord }) {
  return (
    <div className="stack-cell">
      <strong>{record.name}</strong>
      <span className="nip-cell">{record.nip}</span>
    </div>
  )
}

function Unit({ record, withDirectorate = false }: { record: EmployeeRecord; withDirectorate?: boolean }) {
  return (
    <div className="stack-cell">
      <span>{withDirectorate ? record.division : record.position}</span>
      <small>{withDirectorate ? record.directorate : record.division}</small>
    </div>
  )
}

const arrow = (before: ReactNode, after: ReactNode) => (
  <span className="change-cell">
    {before}
    <span aria-label="menjadi">→</span>
    <strong>{after}</strong>
  </span>
)

function movementRows(movement: MovementSummary, tab: Tab): { columns: string[]; rows: PeopleRow[] } {
  if (tab === 'joined') {
    const stale = new Set(movement.staleJoins)
    return {
      columns: ['Karyawan', 'Jabatan / divisi', 'Status', 'Tanggal masuk', 'Keterangan'],
      rows: movement.joined.map(record => ({
        key: record.nip,
        flagged: stale.has(record.nip),
        cells: [
          <Person key="p" record={record} />,
          <Unit key="u" record={record} />,
          record.status,
          formatDate(record.joinDate),
          stale.has(record.nip) ? (
            <span
              key="check"
              className="check-badge"
              title={`Tanggal masuk sebelum ${monthLabel(movement.from)}, tetapi NIP ini tidak ada di data ${monthLabel(movement.from)}.`}
            >
              <AlertTriangle size={11} />
              Perlu dicek
            </span>
          ) : (
            'Karyawan baru'
          ),
        ],
      })),
    }
  }
  if (tab === 'left')
    return {
      columns: ['Karyawan', 'Jabatan / divisi', 'Status terakhir', 'Indikasi'],
      rows: movement.left.map(({ record, reason }) => ({
        key: record.nip,
        cells: [<Person key="p" record={record} />, <Unit key="u" record={record} />, record.status, reason],
      })),
    }
  if (tab === 'transfers')
    return {
      columns: ['Karyawan', 'Sebelumnya', 'Sekarang'],
      rows: movement.transfers.map(({ before, after }) => ({
        key: after.nip,
        cells: [
          <Person key="p" record={after} />,
          <Unit key="b" record={before} withDirectorate />,
          <Unit key="a" record={after} withDirectorate />,
        ],
      })),
    }
  if (tab === 'band')
    return {
      columns: ['Karyawan', 'Jabatan / divisi', 'Band', 'Arah'],
      rows: movement.bandChanges.map(({ before, after, direction }) => ({
        key: after.nip,
        cells: [
          <Person key="p" record={after} />,
          <Unit key="u" record={after} />,
          arrow(before.band ?? '—', after.band ?? '—'),
          <span key="d" className={`direction ${direction === 'naik' ? 'up' : 'down'}`}>
            {direction === 'naik' ? '↑ Naik' : '↓ Turun'}
          </span>,
        ],
      })),
    }
  if (tab === 'nip')
    return {
      columns: ['Karyawan', 'NIP', 'Status', 'Jabatan / divisi'],
      rows: movement.nipChanges.map(({ before, after }) => ({
        key: after.nip,
        cells: [
          <div key="p" className="stack-cell">
            <strong>{after.name}</strong>
            <small>Lahir {formatDate(after.birthDate)}</small>
          </div>,
          arrow(<span className="nip-cell">{before.nip}</span>, <span className="nip-cell">{after.nip}</span>),
          before.status === after.status ? after.status : arrow(before.status, after.status),
          <Unit key="u" record={after} />,
        ],
      })),
    }
  return {
    columns: ['Karyawan', 'Jabatan / divisi', 'Status'],
    rows: movement.statusChanges.map(({ before, after }) => ({
      key: after.nip,
      cells: [<Person key="p" record={after} />, <Unit key="u" record={after} />, arrow(before.status, after.status)],
    })),
  }
}

/** The people behind one kind of movement between two periods (joined, left, transfers, band, status or NIP changes). */
export function MovementTable({ movement, tab }: { movement: MovementSummary; tab: Tab }) {
  const { rows, columns } = movementRows(movement, tab)
  return <PeopleTable rows={rows} columns={columns} />
}
