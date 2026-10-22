import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { bandMatrix } from '../analytics/workforce'
import type { EmployeeRecord } from '../types/workforce'
import { SectionCard } from './SectionCard'

/** Employees per unit and band, with a unit search that also recomputes the totals row. */
export function BandMatrix({ records }: { records: EmployeeRecord[] }) {
  const [matrixQuery, setMatrixQuery] = useState('')
  const matrix = useMemo(() => bandMatrix(records), [records])
  const visibleMatrixRows = useMemo(() => {
    const search = matrixQuery.toLocaleLowerCase('id').trim()
    return search ? matrix.rows.filter(row => row.division.toLocaleLowerCase('id').includes(search)) : matrix.rows
  }, [matrix, matrixQuery])
  const visibleMatrixTotals = matrix.bands.map((_, index) => visibleMatrixRows.reduce((sum, row) => sum + row.counts[index], 0))
  const visibleMatrixTotal = visibleMatrixRows.reduce((sum, row) => sum + row.total, 0)
  return (
    <SectionCard
      title="Matriks klasifikasi band jabatan per unit"
      subtitle="Band kosong tetap dihitung pada kolom Tidak tersedia"
      className="matrix-section"
      headerAction={
        <label className="matrix-search-box">
          <Search size={16} />
          <input
            value={matrixQuery}
            onChange={event => setMatrixQuery(event.target.value)}
            placeholder="Cari unit di matriks"
            aria-label="Cari unit di matriks klasifikasi"
          />
          {matrixQuery && (
            <button type="button" onClick={() => setMatrixQuery('')} aria-label="Hapus pencarian matriks">
              <X size={15} />
            </button>
          )}
        </label>
      }
    >
      <div className="table-scroll" role="region" aria-label="Matriks klasifikasi band jabatan, dapat digulir" tabIndex={0}>
        <table className="matrix-table">
          <thead>
            <tr>
              <th>Unit / Band</th>
              {matrix.bands.map(band => (
                <th key={band}>{band}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {visibleMatrixRows.map(row => (
              <tr key={row.division}>
                <td>{row.division}</td>
                {row.counts.map((count, index) => (
                  <td key={matrix.bands[index]}>{count || '—'}</td>
                ))}
                <td>
                  <strong>{row.total}</strong>
                </td>
              </tr>
            ))}
            {!visibleMatrixRows.length && (
              <tr>
                <td colSpan={matrix.bands.length + 2}>Tidak ada unit yang cocok dengan pencarian.</td>
              </tr>
            )}
            <tr className="total-row">
              <td>Total hasil</td>
              {visibleMatrixTotals.map((count, index) => (
                <td key={matrix.bands[index]}>{count}</td>
              ))}
              <td>{visibleMatrixTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
