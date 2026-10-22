import type { EmployeeRecord, WorkforceFilters } from '../types/workforce'
import { ageGroup, educationOf, fullYears, genderOf, tenureGroup } from './workforce'

const FILTER_LABELS: Record<keyof WorkforceFilters, string> = {
  directorate: 'Direktorat',
  division: 'Divisi',
  status: 'Status',
  gender: 'Jenis kelamin',
  band: 'Band',
  ageGroup: 'Kelompok usia',
  tenureGroup: 'Masa kerja',
  education: 'Pendidikan',
}

const genderLabel = (value: string) =>
  value === 'L' ? 'Laki-laki' : value === 'P' ? 'Perempuan' : value === 'UNKNOWN' ? 'Tidak diketahui' : value

/** Human-readable list of active filters, e.g. ["Status: Aktif, PKWT", "Jenis kelamin: Perempuan"]. */
export function describeFilters(filters: WorkforceFilters): string[] {
  return (Object.keys(FILTER_LABELS) as (keyof WorkforceFilters)[])
    .filter(key => filters[key].length > 0)
    .map(key => `${FILTER_LABELS[key]}: ${filters[key].map(value => (key === 'gender' ? genderLabel(value) : value)).join(', ')}`)
}

/** Every value each filter can take in these records (the same values the filter bar offers). */
function filterValues(records: EmployeeRecord[], asOf: string): Record<keyof WorkforceFilters, Set<string>> {
  const collect = (value: (record: EmployeeRecord) => string) => new Set(records.map(value))
  return {
    directorate: collect(record => record.directorate),
    division: collect(record => record.division || 'Tidak diketahui'),
    status: collect(record => record.status),
    gender: collect(record => genderOf(record)),
    band: collect(record => (record.band == null ? 'Tidak tersedia' : String(record.band))),
    ageGroup: collect(record => ageGroup(fullYears(record.birthDate, asOf))),
    tenureGroup: collect(record => tenureGroup(fullYears(record.joinDate, asOf))),
    education: collect(record => educationOf(record)),
  }
}

/** Drops filter values that do not occur in the records; returns the kept filters and what was released. */
export function pruneFilters(
  filters: WorkforceFilters,
  records: EmployeeRecord[],
  asOf: string,
): { filters: WorkforceFilters; released: string[] } {
  const available = filterValues(records, asOf)
  const next = { ...filters }
  const released: string[] = []
  for (const key of Object.keys(FILTER_LABELS) as (keyof WorkforceFilters)[]) {
    const missing = filters[key].filter(value => !available[key].has(value))
    if (!missing.length) continue
    next[key] = filters[key].filter(value => available[key].has(value)) as never
    released.push(`${FILTER_LABELS[key]}: ${missing.map(value => (key === 'gender' ? genderLabel(value) : value)).join(', ')}`)
  }
  return { filters: next, released }
}
