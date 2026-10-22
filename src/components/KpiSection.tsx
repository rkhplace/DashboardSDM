import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Building2, ChevronDown, Clock3, IdCard, Mars, UsersRound, Venus, X } from 'lucide-react'
import { formatNumber } from '../analytics/format'
import { ageGroup, countBy, fullYears, genderOf, summarize } from '../analytics/workforce'
import { emptyFilters, type EmployeeRecord, type WorkforceFilters } from '../types/workforce'

type Distribution = { name: string; value: number }
type KpiKey = 'total' | 'active' | 'age' | 'male' | 'female' | 'units'
type Props = {
  records: EmployeeRecord[]
  /** Employees in the whole period, before filters: the base of the "Total karyawan" meter. */
  periodTotal: number
  period: string
  asOf: string
  onFiltersChange: Dispatch<SetStateAction<WorkforceFilters>>
}

function BreakdownBars({ data, total, onSelect }: { data: Distribution[]; total: number; onSelect: (name: string) => void }) {
  if (!data.length) return <p className="kpi-detail-empty">Tidak ada data yang sesuai dengan filter.</p>
  return (
    <div className="breakdown-list">
      {data.map(item => {
        const percent = total ? (item.value / total) * 100 : 0
        return (
          <button
            type="button"
            className="breakdown-item"
            key={item.name}
            onClick={() => onSelect(item.name)}
            aria-label={`Filter ${item.name}, ${formatNumber(item.value)} karyawan, ${percent.toFixed(1)} persen`}
          >
            <span className="breakdown-label">{item.name}</span>
            <span className="breakdown-track">
              <span style={{ width: `${percent}%` }} />
            </span>
            <span className="breakdown-value">
              {formatNumber(item.value)} <small>{percent.toFixed(1)}%</small>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** The six headline figures; each opens a breakdown whose categories filter the whole dashboard. */
export function KpiSection({ records, periodTotal, period, asOf, onFiltersChange: setFilters }: Props) {
  const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null)
  useEffect(() => {
    if (selectedKpi) document.getElementById('kpi-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedKpi])
  const summary = useMemo(() => summarize(records, asOf), [records, asOf])
  const statuses = useMemo(() => countBy(records, record => record.status), [records])
  const gender = useMemo(
    () => countBy(records, record => (genderOf(record) === 'L' ? 'Laki-laki' : genderOf(record) === 'P' ? 'Perempuan' : 'Tidak diketahui')),
    [records],
  )
  const age = useMemo(() => countBy(records, record => ageGroup(fullYears(record.birthDate, asOf))), [records, asOf])
  const divisions = useMemo(() => countBy(records, record => record.division), [records])
  const percent = (value: number) => (summary.total ? (value / summary.total) * 100 : 0)
  const kpis = [
    {
      key: 'total',
      label: 'Total karyawan',
      value: formatNumber(summary.total),
      suffix: '',
      note: 'Data pada hasil filter',
      share: periodTotal ? (summary.total / periodTotal) * 100 : 0,
      icon: UsersRound,
    },
    {
      key: 'active',
      label: 'Karyawan aktif',
      value: formatNumber(summary.active),
      suffix: '',
      note: `${percent(summary.active).toFixed(1)}% dari hasil filter`,
      share: percent(summary.active),
      icon: IdCard,
    },
    {
      key: 'age',
      label: 'Rata-rata usia',
      value: summary.averageAge == null ? '—' : summary.averageAge.toFixed(1),
      suffix: 'tahun',
      note: `${formatNumber(summary.ageDenominator)} tanggal lahir valid`,
      share: undefined,
      icon: Clock3,
    },
    {
      key: 'male',
      label: 'Laki-laki',
      value: formatNumber(summary.male),
      suffix: `${percent(summary.male).toFixed(1)}%`,
      note: `${formatNumber(summary.male)} orang`,
      share: percent(summary.male),
      icon: Mars,
    },
    {
      key: 'female',
      label: 'Perempuan',
      value: formatNumber(summary.female),
      suffix: `${percent(summary.female).toFixed(1)}%`,
      note: `${formatNumber(summary.female)} orang`,
      share: percent(summary.female),
      icon: Venus,
    },
    {
      key: 'units',
      label: 'Jumlah divisi',
      value: formatNumber(summary.units),
      suffix: 'unit',
      note: 'Divisi pada hasil filter',
      share: undefined,
      icon: Building2,
    },
  ] satisfies { key: KpiKey; label: string; value: string; suffix: string; note: string; share?: number; icon: typeof UsersRound }[]
  const detail =
    selectedKpi === 'age'
      ? { title: 'Rincian kelompok usia', data: age, firstColumn: 'Usia' }
      : selectedKpi === 'male' || selectedKpi === 'female'
        ? { title: 'Rincian jenis kelamin', data: gender, firstColumn: 'Jenis kelamin' }
        : selectedKpi === 'units'
          ? { title: 'Rincian per unit', data: divisions, firstColumn: 'Divisi / Unit' }
          : { title: 'Rincian status karyawan', data: statuses, firstColumn: 'Status' }

  function selectDetail(name: string) {
    if (selectedKpi === 'age') setFilters(current => ({ ...current, ageGroup: [name] }))
    else if (selectedKpi === 'male' || selectedKpi === 'female') {
      const gender = name === 'Laki-laki' ? 'L' : name === 'Perempuan' ? 'P' : 'UNKNOWN'
      setFilters(current => ({ ...current, gender: [gender] }))
    } else if (selectedKpi === 'units') setFilters(current => ({ ...current, division: [name] }))
    else setFilters(current => ({ ...current, status: [name] }))
    setSelectedKpi(null)
  }
  return (
    <>
      <div className="kpi-grid">
        {kpis.map(kpi => (
          <button
            key={kpi.key}
            type="button"
            className={`kpi-card kpi-button ${kpi.key === 'total' ? 'kpi-primary' : ''} ${selectedKpi === kpi.key ? 'kpi-selected' : ''}`}
            aria-expanded={selectedKpi === kpi.key}
            aria-controls="kpi-detail"
            onClick={() => setSelectedKpi(selectedKpi === kpi.key ? null : kpi.key)}
          >
            <span className="kpi-top">
              <span>{kpi.label}</span>
              <span className="kpi-icon">
                <kpi.icon size={16} strokeWidth={2.2} />
              </span>
            </span>
            <span className="kpi-figure">
              <strong>{kpi.value}</strong>
              {kpi.suffix && <span>{kpi.suffix}</span>}
            </span>
            <span className="kpi-footer">
              <small>{kpi.note}</small>
              {kpi.share !== undefined && (
                <span className="kpi-meter" aria-hidden="true">
                  <span style={{ width: `${kpi.share}%` }} />
                </span>
              )}
            </span>
            <ChevronDown className="kpi-chevron" size={13} aria-hidden="true" />
          </button>
        ))}
      </div>
      {selectedKpi && (
        <section id="kpi-detail" className="kpi-detail" aria-label={detail.title}>
          <div className="kpi-detail-head">
            <div>
              <h2>{detail.title}</h2>
              <p>
                Komposisi {detail.firstColumn.toLowerCase()} pada periode {period}. Pilih kategori untuk menyaring dashboard.
              </p>
            </div>
            <button type="button" className="icon-button" aria-label="Tutup rincian" onClick={() => setSelectedKpi(null)}>
              <X size={18} />
            </button>
          </div>
          <BreakdownBars data={detail.data} total={records.length} onSelect={selectDetail} />
          {selectedKpi === 'total' && (
            <button
              type="button"
              className="kpi-reset"
              onClick={() => {
                setFilters(emptyFilters)
                setSelectedKpi(null)
              }}
            >
              Tampilkan semua data
            </button>
          )}
        </section>
      )}
    </>
  )
}
