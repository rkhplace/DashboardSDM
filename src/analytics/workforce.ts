import type { EmployeeRecord, Gender, WorkforceFilters } from '../types/workforce'

export const EDUCATION: Record<number, string> = {
  81: 'SLTP', 82: 'SLTA', 85: 'D3', 86: 'D4', 87: 'S1', 88: 'S2', 89: 'S3',
}
export const AGE_GROUPS = ['≤25', '26–30', '31–35', '36–40', '41–45', '46–50', '>50', 'Tidak diketahui'] as const
export const TENURE_GROUPS = ['<5', '5–10', '11–15', '16–20', '21–25', '>25', 'Tidak diketahui'] as const

export function genderOf(record: Pick<EmployeeRecord, 'genderCode'>): Gender {
  return record.genderCode === 1 ? 'L' : record.genderCode === 2 ? 'P' : 'UNKNOWN'
}

export function educationOf(record: Pick<EmployeeRecord, 'educationCode'>): string {
  return record.educationCode == null ? 'Tidak diketahui' : EDUCATION[record.educationCode] ?? 'Kode tidak dikenal'
}

export function fullYears(isoDate: string | null, asOf: string): number | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null
  const date = new Date(`${isoDate}T00:00:00Z`)
  const reference = new Date(`${asOf}T00:00:00Z`)
  if (Number.isNaN(date.valueOf()) || Number.isNaN(reference.valueOf()) || date > reference) return null
  if (date.toISOString().slice(0, 10) !== isoDate || reference.toISOString().slice(0, 10) !== asOf) return null
  let years = reference.getUTCFullYear() - date.getUTCFullYear()
  if (reference.getUTCMonth() < date.getUTCMonth() || (reference.getUTCMonth() === date.getUTCMonth() && reference.getUTCDate() < date.getUTCDate())) years--
  return years
}

export function ageGroup(age: number | null): string {
  if (age == null || age < 0) return 'Tidak diketahui'
  if (age <= 25) return '≤25'
  if (age <= 30) return '26–30'
  if (age <= 35) return '31–35'
  if (age <= 40) return '36–40'
  if (age <= 45) return '41–45'
  if (age <= 50) return '46–50'
  return '>50'
}

export function tenureGroup(years: number | null): string {
  if (years == null || years < 0) return 'Tidak diketahui'
  if (years < 5) return '<5'
  if (years <= 10) return '5–10'
  if (years <= 15) return '11–15'
  if (years <= 20) return '16–20'
  if (years <= 25) return '21–25'
  return '>25'
}

export function countBy(records: EmployeeRecord[], key: (record: EmployeeRecord) => string): { name: string; value: number }[] {
  const counts = new Map<string, number>()
  for (const record of records) {
    const value = key(record) || 'Tidak diketahui'
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

export function filterRecords(records: EmployeeRecord[], filters: WorkforceFilters, asOf: string): EmployeeRecord[] {
  const includes = (selected: string[], value: string) => selected.length === 0 || selected.includes(value)
  return records.filter(record => {
    const age = fullYears(record.birthDate, asOf)
    return includes(filters.directorate, record.directorate)
      && includes(filters.division, record.division || 'Tidak diketahui')
      && includes(filters.status, record.status)
      && (filters.gender.length === 0 || filters.gender.includes(genderOf(record)))
      && includes(filters.band, record.band == null ? 'Tidak tersedia' : String(record.band))
      && includes(filters.ageGroup, ageGroup(age))
      && includes(filters.tenureGroup, tenureGroup(fullYears(record.joinDate, asOf)))
      && includes(filters.education, educationOf(record))
  })
}

export function summarize(records: EmployeeRecord[], asOf: string) {
  const ages = records.map(record => fullYears(record.birthDate, asOf)).filter((age): age is number => age !== null)
  const genders = countBy(records, record => genderOf(record))
  return {
    total: new Set(records.map(record => record.nip)).size,
    active: records.filter(record => record.status === 'Aktif').length,
    averageAge: ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : null,
    ageDenominator: ages.length,
    male: genders.find(item => item.name === 'L')?.value ?? 0,
    female: genders.find(item => item.name === 'P')?.value ?? 0,
    unknownGender: genders.find(item => item.name === 'UNKNOWN')?.value ?? 0,
    units: new Set(records.map(record => record.division).filter(Boolean)).size,
  }
}

export function bandMatrix(records: EmployeeRecord[]) {
  const bands = [...new Set(records.map(record => record.band == null ? 'Tidak tersedia' : String(record.band)))].sort((a, b) => a === 'Tidak tersedia' ? 1 : b === 'Tidak tersedia' ? -1 : Number(a) - Number(b))
  const divisions = [...new Set(records.map(record => record.division))].sort()
  const rows = divisions.map(division => ({ division, counts: bands.map(band => records.filter(record => record.division === division && (record.band == null ? 'Tidak tersedia' : String(record.band)) === band).length), total: records.filter(record => record.division === division).length }))
  return { bands, rows, totals: bands.map(band => records.filter(record => (record.band == null ? 'Tidak tersedia' : String(record.band)) === band).length) }
}
