import type { WorkforceFilters } from '../types/workforce'

export const FILTER_LABELS: Record<keyof WorkforceFilters, string> = {
  directorate: 'Direktorat', division: 'Divisi', status: 'Status', gender: 'Jenis kelamin',
  band: 'Band', ageGroup: 'Kelompok usia', tenureGroup: 'Masa kerja', education: 'Pendidikan',
}

export const genderLabel = (value: string) => value === 'L' ? 'Laki-laki' : value === 'P' ? 'Perempuan' : value === 'UNKNOWN' ? 'Tidak diketahui' : value

/** Human-readable list of active filters, e.g. ["Status: Aktif, PKWT", "Jenis kelamin: Perempuan"]. */
export function describeFilters(filters: WorkforceFilters): string[] {
  return (Object.keys(FILTER_LABELS) as (keyof WorkforceFilters)[])
    .filter(key => filters[key].length > 0)
    .map(key => `${FILTER_LABELS[key]}: ${filters[key].map(value => key === 'gender' ? genderLabel(value) : value).join(', ')}`)
}
