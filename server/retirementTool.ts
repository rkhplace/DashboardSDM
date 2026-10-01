import { DEFAULT_RETIREMENT_AGE, defaultRetirementStatuses, projectRetirement, type RetirementSettings } from '../src/analytics/retirement.ts'
import type { EmployeeRecord } from '../src/types/workforce.ts'
import type { IdentityMap } from './identity.ts'

const MAX_PEOPLE = 50
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const intIn = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

/** The retirement panel's current settings, sent by the dashboard; falls back to the panel defaults. */
export function validateRetirementSettings(input: unknown, records: EmployeeRecord[]): RetirementSettings {
  const fallback: RetirementSettings = { age: DEFAULT_RETIREMENT_AGE, horizonYears: 5, statuses: defaultRetirementStatuses(records) }
  if (!object(input)) return fallback
  const known = new Set(records.map(record => record.status))
  const statuses = Array.isArray(input.statuses)
    ? [...new Set(input.statuses.slice(0, 100).filter((status): status is string => typeof status === 'string' && known.has(status)))]
    : fallback.statuses
  return {
    age: intIn(input.age, 40, 75) ? input.age as number : fallback.age,
    horizonYears: intIn(input.horizonYears, 1, 30) ? input.horizonYears as number : fallback.horizonYears,
    statuses,
  }
}

export const retirementTool = {
  type: 'function',
  name: 'project_retirement',
  description: 'Proyeksi pensiun dengan perhitungan yang sama persis dengan panel "Proyeksi pensiun & risiko suksesi" di dashboard: usia pensiun, rentang tahun, dan status yang dihitung mengikuti pengaturan panel saat ini. Pakai untuk semua pertanyaan pensiun, karyawan yang akan/sudah pensiun, dan risiko suksesi per divisi. Karyawan dikembalikan sebagai kode KARYAWAN_n. Isi age/horizonYears hanya jika pengguna meminta skenario lain.',
  parameters: {
    type: 'object',
    properties: {
      age: { type: 'integer', description: 'Usia pensiun skenario lain (40–75). Kosongkan untuk memakai pengaturan panel.' },
      horizonYears: { type: 'integer', description: 'Rentang proyeksi skenario lain dalam tahun (1–30). Kosongkan untuk memakai pengaturan panel.' },
    },
  },
} as const

export function runRetirementProjection(input: unknown, records: EmployeeRecord[], asOf: string, panel: RetirementSettings, identities: IdentityMap) {
  const args = object(input) ? input : {}
  const settings: RetirementSettings = {
    ...panel,
    age: intIn(args.age, 40, 75) ? args.age as number : panel.age,
    horizonYears: intIn(args.horizonYears, 1, 30) ? args.horizonYears as number : panel.horizonYears,
  }
  const projection = projectRetirement(records, asOf, settings)
  const excludedStatuses = [...new Set(records.map(record => record.status))].filter(status => !settings.statuses.includes(status))
  return {
    settings: { ...settings, sameAsDashboardPanel: settings.age === panel.age && settings.horizonYears === panel.horizonYears },
    excludedStatuses,
    excludedEmployees: records.filter(record => !settings.statuses.includes(record.status)).length,
    counted: projection.counted,
    retiringWithinHorizon: projection.candidates.length - projection.overdue,
    alreadyPastRetirementAge: projection.overdue,
    keyPositionsAffected: projection.keyRetiring,
    invalidBirthDate: projection.invalidBirthDate,
    perYear: projection.windows.map(window => ({ period: window.label, count: window.count, keyPositions: window.keyCount })),
    divisions: projection.divisions.slice(0, 15).map(item => ({ division: item.division, counted: item.counted, retiring: item.retiring, share: Math.round(item.share * 1000) / 10, keyPositions: item.keyRetiring, risk: item.risk })),
    people: projection.candidates.slice(0, MAX_PEOPLE).map(candidate => ({
      ref: identities.refFor(candidate.record),
      retireOn: candidate.retireOn,
      alreadyPastAge: candidate.overdue,
      keyPosition: candidate.keyPosition,
      position: candidate.record.position,
      division: candidate.record.division,
      status: candidate.record.status,
    })),
  }
}
