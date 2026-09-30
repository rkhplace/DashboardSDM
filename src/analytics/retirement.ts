import type { EmployeeRecord } from '../types/workforce'

export const DEFAULT_RETIREMENT_AGE = 56
export const RETIREMENT_AGE_OPTIONS = [55, 56, 57, 58, 60] as const
/** Contract, board and CLTP statuses do not follow normal-age retirement, so they are excluded by default. */
const NON_RETIRING_STATUS = /pkwt|direksi|komisaris|cltp/i

export type RiskLevel = 'Tinggi' | 'Sedang' | 'Rendah'

export interface RetirementSettings { age: number; horizonYears: number; statuses: string[] }

export interface RetirementCandidate {
  record: EmployeeRecord
  retireOn: string
  monthsLeft: number
  overdue: boolean
  keyPosition: boolean
}

export interface DivisionRisk {
  division: string
  counted: number
  retiring: number
  share: number
  keyRetiring: number
  risk: RiskLevel
}

export interface RetirementProjection {
  counted: number
  invalidBirthDate: number
  candidates: RetirementCandidate[]
  overdue: number
  keyRetiring: number
  windows: { label: string; count: number; keyCount: number }[]
  divisions: DivisionRisk[]
}

export function defaultRetirementStatuses(records: EmployeeRecord[]): string[] {
  return [...new Set(records.map(record => record.status))].filter(status => status && !NON_RETIRING_STATUS.test(status)).sort((a, b) => a.localeCompare(b, 'id'))
}

export function isKeyPosition(record: Pick<EmployeeRecord, 'positionType'>): boolean {
  return /struktural/i.test(record.positionType ?? '')
}

function validIso(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function addYears(iso: string, years: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year + years, month - 1, day)).toISOString().slice(0, 10)
}

export function retirementDate(birthDate: string | null, age: number): string | null {
  return validIso(birthDate) ? addYears(birthDate, age) : null
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0)
}

const monthLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function riskOf(share: number, keyRetiring: number): RiskLevel {
  if (share >= 0.2 || keyRetiring > 0) return 'Tinggi'
  if (share >= 0.1) return 'Sedang'
  return 'Rendah'
}

const RISK_ORDER: Record<RiskLevel, number> = { Tinggi: 0, Sedang: 1, Rendah: 2 }

export function projectRetirement(records: EmployeeRecord[], asOf: string, settings: RetirementSettings): RetirementProjection {
  const counted = records.filter(record => settings.statuses.includes(record.status))
  const horizonEnd = addYears(asOf, settings.horizonYears)
  let invalidBirthDate = 0
  const candidates: RetirementCandidate[] = []
  for (const record of counted) {
    const retireOn = retirementDate(record.birthDate, settings.age)
    if (!retireOn) { invalidBirthDate++; continue }
    if (retireOn > horizonEnd) continue
    candidates.push({ record, retireOn, monthsLeft: Math.max(0, monthsBetween(asOf, retireOn)), overdue: retireOn <= asOf, keyPosition: isKeyPosition(record) })
  }
  candidates.sort((a, b) => a.retireOn.localeCompare(b.retireOn) || a.record.name.localeCompare(b.record.name, 'id'))

  const windows = Array.from({ length: settings.horizonYears }, (_, index) => {
    const start = addYears(asOf, index)
    const end = addYears(asOf, index + 1)
    const inWindow = candidates.filter(candidate => candidate.retireOn > start && candidate.retireOn <= end)
    const first = new Date(`${start}T00:00:00Z`)
    first.setUTCDate(first.getUTCDate() + 1)
    return { label: `${monthLabel(first.toISOString().slice(0, 10))} – ${monthLabel(end)}`, count: inWindow.length, keyCount: inWindow.filter(candidate => candidate.keyPosition).length }
  })

  const byDivision = new Map<string, { counted: number; retiring: number; keyRetiring: number }>()
  for (const record of counted) {
    const division = record.division || 'Tidak diketahui'
    const item = byDivision.get(division) ?? { counted: 0, retiring: 0, keyRetiring: 0 }
    item.counted++
    byDivision.set(division, item)
  }
  for (const candidate of candidates) {
    const item = byDivision.get(candidate.record.division || 'Tidak diketahui')!
    item.retiring++
    if (candidate.keyPosition) item.keyRetiring++
  }
  const divisions = [...byDivision].filter(([, item]) => item.retiring > 0).map(([division, item]) => {
    const share = item.counted ? item.retiring / item.counted : 0
    return { division, ...item, share, risk: riskOf(share, item.keyRetiring) }
  }).sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || b.share - a.share || b.retiring - a.retiring)

  return {
    counted: counted.length, invalidBirthDate, candidates, windows, divisions,
    overdue: candidates.filter(candidate => candidate.overdue).length,
    keyRetiring: candidates.filter(candidate => candidate.keyPosition).length,
  }
}
