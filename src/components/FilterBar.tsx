import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { emptyFilters, type EmployeeRecord, type WorkforceFilters } from '../types/workforce'
import { ageGroup, educationOf, fullYears, genderOf, tenureGroup } from '../analytics/workforce'
import { FilterDropdown } from './FilterDropdown'

type Key = keyof WorkforceFilters
interface Props { records: EmployeeRecord[]; asOf: string; filters: WorkforceFilters; onChange: (filters: WorkforceFilters) => void; directory?: boolean }

export function FilterBar({ records, asOf, filters, onChange, directory = false }: Props) {
  const values: Record<Key, string[]> = {
    directorate: records.map(r => r.directorate), division: records.map(r => r.division || 'Tidak diketahui'), status: records.map(r => r.status),
    gender: records.map(r => genderOf(r)), band: records.map(r => r.band == null ? 'Tidak tersedia' : String(r.band)),
    ageGroup: records.map(r => ageGroup(fullYears(r.birthDate, asOf))), tenureGroup: records.map(r => tenureGroup(fullYears(r.joinDate, asOf))), education: records.map(r => educationOf(r)),
  }
  const fields: { key: Key; label: string }[] = [
    { key: 'directorate', label: 'Direktorat' }, { key: 'division', label: 'Divisi / Unit' },
    { key: 'status', label: 'Status' }, { key: 'gender', label: 'Jenis Kelamin' },
    { key: 'band', label: 'Band' }, { key: directory ? 'education' : 'ageGroup', label: directory ? 'Pendidikan' : 'Kelompok Usia' },
  ]
  const label = (value: string) => value === 'L' ? 'Laki-laki' : value === 'P' ? 'Perempuan' : value === 'UNKNOWN' ? 'Tidak diketahui' : value
  return <div className="filter-bar"><div className="filter-heading"><SlidersHorizontal size={16}/><span>Filter data</span></div><div className="filter-fields">{fields.map(({ key, label: fieldLabel }) => {
    const options = [...new Set(values[key].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'))
    return <div key={key} className="filter-field"><span>{fieldLabel}</span><FilterDropdown label={fieldLabel} options={options} selected={filters[key]} multiple={key === 'division' || key === 'status'} display={label} onChange={selected => onChange({ ...filters, [key]: selected })}/></div>
  })}<button className="reset-button" onClick={() => onChange({ ...emptyFilters })}><RotateCcw size={14}/> Reset</button></div></div>
}
