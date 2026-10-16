import type { EmployeeRecord, EmployeeSnapshot, WorkforceFilters } from '../types/workforce'
import { isContract } from './contracts'
import { filterRecords, fullYears, summarize } from './workforce'

/*
 * Period-to-period analysis. Employees are matched by NIP:
 * - masuk  = NIP present in the later snapshot but not in the earlier one;
 * - keluar = NIP present in the earlier snapshot but gone from the later one;
 * - mutasi = same NIP, different division or directorate;
 * - ganti NIP = a NIP that disappeared and a new one with the same name and birth date (see matchNipChanges);
 *   these are neither masuk nor keluar.
 * With dashboard filters active, "masuk" is judged on the employee's new record and "keluar" on the old
 * one, so moving between units is a mutasi, never a masuk/keluar.
 * Turnover (HC policy, Oct 2026): PKWT exits never count as turnover, whether the contract ran out ("kontrak selesai")
 * or the PKWT left earlier ("PKWT berhenti"). Turnover = non-PKWT exits ÷ average non-PKWT headcount.
 * Contracts are an early warning for the supervisor's assessment instead: each contract due by the later period
 * gets a follow-up outcome (diperpanjang, diangkat tetap, selesai, or still no decision recorded).
 */

export type ExitReason = 'Kontrak selesai' | 'PKWT berhenti' | 'Usia pensiun' | 'Tidak diketahui'
export type ContractOutcome = 'Diperpanjang' | 'Diangkat tetap' | 'Selesai' | 'Belum ada keputusan'
/** Display order: the outcome that needs action first. Also the stacked-bar order its colours were validated in. */
export const CONTRACT_OUTCOMES: ContractOutcome[] = ['Belum ada keputusan', 'Diangkat tetap', 'Diperpanjang', 'Selesai']

export interface ContractFollowUp {
  before: EmployeeRecord
  /** The same person in the later period (possibly under a new NIP); null when they left. */
  after: EmployeeRecord | null
  outcome: ContractOutcome
}

export interface PeriodPoint {
  period: string
  asOf: string
  headcount: number
  active: number
  contracts: number
  male: number
  female: number
  averageAge: number | null
  averageTenure: number | null
  /** Compared with the previous point; null for the first point. */
  joined: number | null
  left: number | null
  /** Of `left`: PKWT exits (contract ended or left earlier); not counted as turnover. */
  contractExits: number | null
  /** Non-PKWT exits ÷ average non-PKWT headcount of the two periods. */
  turnover: number | null
  /** Calendar months since the previous stored point (1 = consecutive); null for the first point. */
  spanMonths: number | null
  /** turnover ÷ spanMonths, so points with a missing month in between stay comparable. */
  monthlyTurnover: number | null
}

export interface MovementSummary {
  from: string
  to: string
  headcountBefore: number
  headcountAfter: number
  joined: EmployeeRecord[]
  left: { record: EmployeeRecord; reason: ExitReason }[]
  transfers: { before: EmployeeRecord; after: EmployeeRecord }[]
  bandChanges: { before: EmployeeRecord; after: EmployeeRecord; direction: 'naik' | 'turun' }[]
  statusChanges: { before: EmployeeRecord; after: EmployeeRecord }[]
  /** Exits that count as turnover: employees who were not PKWT in the earlier period. */
  turnoverExits: number
  /** PKWT exits, not counted as turnover: contractEnded + PKWT who left before the end date (or without one). */
  contractExits: number
  /** Of contractExits: reason "Kontrak selesai". */
  contractEnded: number
  /** Average non-PKWT headcount of the two periods: the turnover denominator. */
  turnoverBase: number
  /** turnoverExits ÷ turnoverBase. */
  turnover: number | null
  /** Calendar months between the two periods. */
  spanMonths: number
  /** turnover ÷ spanMonths. */
  monthlyTurnover: number | null
  exitReasons: { reason: ExitReason; count: number }[]
  /** NIPs counted as "masuk" whose join date is on or before the earlier period: likely a NIP typo or a gap in the earlier data. */
  staleJoins: string[]
  /** Same person under a new NIP (for example PKWT appointed as permanent), matched by name and birth date. */
  nipChanges: { before: EmployeeRecord; after: EmployeeRecord }[]
  /** PKWT in the earlier period whose contract end date is on or before the later period date, and what happened next. */
  contractFollowUps: ContractFollowUp[]
}

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const byName = (a: EmployeeRecord, b: EmployeeRecord) => a.name.localeCompare(b.name, 'id')

function exitReason(record: EmployeeRecord, laterAsOf: string, retirementAge: number): ExitReason {
  if (isContract(record)) return record.contractEnd && record.contractEnd <= laterAsOf ? 'Kontrak selesai' : 'PKWT berhenti'
  const age = fullYears(record.birthDate, laterAsOf)
  if (age !== null && age >= retirementAge) return 'Usia pensiun'
  return 'Tidak diketahui'
}

/** What happened to a PKWT whose contract end date had passed by the later period. */
function followUpOutcome(before: EmployeeRecord, later: EmployeeRecord | null): ContractOutcome {
  if (!later) return 'Selesai'
  if (!isContract(later)) return 'Diangkat tetap'
  if (later.contractEnd && later.contractEnd > before.contractEnd!) return 'Diperpanjang'
  return 'Belum ada keputusan'
}

/** Count per outcome, in the fixed order of CONTRACT_OUTCOMES. */
export function countOutcomes(items: ContractFollowUp[]) {
  return CONTRACT_OUTCOMES.map(outcome => ({ outcome, count: items.filter(item => item.outcome === outcome).length }))
}

/** Name key that ignores letter case, dots, extra spaces and degrees written after a comma ("Budi Santoso, S.T."). */
export function personKey(record: Pick<EmployeeRecord, 'name' | 'birthDate'>): string | null {
  const name = record.name.split(',')[0].toLocaleLowerCase('id').replace(/\./g, ' ').replace(/\s+/g, ' ').trim()
  return name && record.birthDate ? `${name}|${record.birthDate}` : null
}

/**
 * A NIP can change when someone is appointed from PKWT to permanent. Pairs a NIP that disappeared with a NIP that
 * appeared when both carry the same name and birth date (and the same gender when known). Ambiguous keys (more than
 * one candidate on either side) are left unmatched rather than guessed.
 */
export function matchNipChanges(gone: EmployeeRecord[], arrived: EmployeeRecord[]) {
  const group = (records: EmployeeRecord[]) => {
    const map = new Map<string, EmployeeRecord[]>()
    for (const record of records) {
      const key = personKey(record)
      if (key) map.set(key, [...map.get(key) ?? [], record])
    }
    return map
  }
  const goneByKey = group(gone)
  const arrivedByKey = group(arrived)
  const pairs: { before: EmployeeRecord; after: EmployeeRecord }[] = []
  for (const [key, candidates] of goneByKey) {
    const matches = arrivedByKey.get(key)
    if (candidates.length !== 1 || matches?.length !== 1) continue
    const [before, after] = [candidates[0], matches[0]]
    if (before.genderCode && after.genderCode && before.genderCode !== after.genderCode) continue
    pairs.push({ before, after })
  }
  return pairs
}

/** Calendar months from one YYYY-MM period to another. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** Months between the first and last stored period that have no upload. */
export function missingMonths(periods: string[]): string[] {
  const sorted = [...new Set(periods)].sort()
  if (sorted.length < 2) return []
  const missing: string[] = []
  const [year, month] = sorted[0].split('-').map(Number)
  for (let offset = 1; offset < monthsBetween(sorted[0], sorted[sorted.length - 1]); offset++) {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7)
    if (!sorted.includes(date)) missing.push(date)
  }
  return missing
}

const scopeOf = (snapshot: EmployeeSnapshot, filters: WorkforceFilters) => new Set(filterRecords(snapshot.records, filters, snapshot.asOf).map(record => record.nip))

export function compareSnapshots(previous: EmployeeSnapshot, current: EmployeeSnapshot, filters: WorkforceFilters, retirementAge: number): MovementSummary {
  return compareScoped(previous, current, scopeOf(previous, filters), scopeOf(current, filters), retirementAge)
}

/** compareSnapshots with the filtered NIP sets already computed (periodSeries reuses them across neighbouring pairs). */
function compareScoped(previous: EmployeeSnapshot, current: EmployeeSnapshot, beforeScope: Set<string>, afterScope: Set<string>, retirementAge: number): MovementSummary {
  const before = new Map(previous.records.map(record => [record.nip, record]))
  const after = new Map(current.records.map(record => [record.nip, record]))
  const inScope = (pair: { before: EmployeeRecord; after: EmployeeRecord }) => beforeScope.has(pair.before.nip) || afterScope.has(pair.after.nip)

  const renamed = matchNipChanges(previous.records.filter(record => !after.has(record.nip)), current.records.filter(record => !before.has(record.nip)))
  const renamedBefore = new Set(renamed.map(pair => pair.before.nip))
  const renamedAfter = new Set(renamed.map(pair => pair.after.nip))
  const nipChanges = renamed.filter(inScope).sort((a, b) => byName(a.after, b.after))

  const joined = current.records.filter(record => !before.has(record.nip) && !renamedAfter.has(record.nip) && afterScope.has(record.nip)).sort(byName)
  const left = previous.records.filter(record => !after.has(record.nip) && !renamedBefore.has(record.nip) && beforeScope.has(record.nip)).sort(byName)
    .map(record => ({ record, reason: exitReason(record, current.asOf, retirementAge) }))
  const pairs = [...current.records.filter(record => before.has(record.nip)).map(record => ({ before: before.get(record.nip)!, after: record })), ...renamed].filter(inScope)
  const transfers = pairs.filter(pair => pair.before.division !== pair.after.division || pair.before.directorate !== pair.after.directorate)
  const bandChanges = pairs.filter(pair => pair.before.band != null && pair.after.band != null && pair.before.band !== pair.after.band)
    .map(pair => ({ ...pair, direction: (pair.after.band! > pair.before.band! ? 'naik' : 'turun') as 'naik' | 'turun' }))
  const statusChanges = pairs.filter(pair => pair.before.status !== pair.after.status)
  const headcountBefore = beforeScope.size
  const headcountAfter = afterScope.size
  // PKWT are left out of turnover entirely, so the denominator counts non-PKWT employees only.
  const permanent = (records: Map<string, EmployeeRecord>, scope: Set<string>) => { let count = 0; for (const nip of scope) if (!isContract(records.get(nip)!)) count++; return count }
  const turnoverBase = (permanent(before, beforeScope) + permanent(after, afterScope)) / 2
  const contractEnded = left.filter(item => item.reason === 'Kontrak selesai').length
  const contractExits = left.filter(item => isContract(item.record)).length
  const turnoverExits = left.length - contractExits
  const turnover = turnoverBase ? turnoverExits / turnoverBase : null
  const spanMonths = Math.max(1, monthsBetween(previous.period, current.period))
  const reasons: ExitReason[] = ['Kontrak selesai', 'PKWT berhenti', 'Usia pensiun', 'Tidak diketahui']
  const renamedTo = new Map(renamed.map(pair => [pair.before.nip, pair.after]))
  const contractFollowUps = previous.records
    .filter(record => beforeScope.has(record.nip) && isContract(record) && record.contractEnd && record.contractEnd <= current.asOf)
    .map(record => {
      const later = after.get(record.nip) ?? renamedTo.get(record.nip) ?? null
      return { before: record, after: later, outcome: followUpOutcome(record, later) }
    })
    .sort((a, b) => a.before.contractEnd!.localeCompare(b.before.contractEnd!) || byName(a.before, b.before))
  return {
    from: previous.period, to: current.period, headcountBefore, headcountAfter,
    joined, left, transfers, bandChanges, statusChanges, nipChanges, contractFollowUps,
    turnoverExits, contractExits, contractEnded, turnoverBase, turnover, spanMonths, monthlyTurnover: turnover === null ? null : turnover / spanMonths,
    staleJoins: joined.filter(record => record.joinDate && record.joinDate <= previous.asOf).map(record => record.nip),
    exitReasons: reasons.map(reason => ({ reason, count: left.filter(item => item.reason === reason).length })).filter(item => item.count > 0),
  }
}

/** One point per snapshot (oldest first), each compared with the snapshot before it. */
export function periodSeries(snapshots: EmployeeSnapshot[], filters: WorkforceFilters, retirementAge: number): PeriodPoint[] {
  const ordered = [...snapshots].sort((a, b) => a.period.localeCompare(b.period))
  // Filter each snapshot once; every neighbouring pair reuses the result.
  const filtered = ordered.map(snapshot => filterRecords(snapshot.records, filters, snapshot.asOf))
  const scopes = filtered.map(records => new Set(records.map(record => record.nip)))
  return ordered.map((snapshot, index) => {
    const records = filtered[index]
    const summary = summarize(records, snapshot.asOf)
    const tenures = records.map(record => fullYears(record.joinDate, snapshot.asOf)).filter((value): value is number => value !== null)
    const movement = index > 0 ? compareScoped(ordered[index - 1], snapshot, scopes[index - 1], scopes[index], retirementAge) : null
    return {
      period: snapshot.period, asOf: snapshot.asOf,
      headcount: summary.total, active: summary.active, contracts: records.filter(isContract).length,
      male: summary.male, female: summary.female, averageAge: summary.averageAge, averageTenure: average(tenures),
      joined: movement ? movement.joined.length : null,
      left: movement ? movement.left.length : null,
      contractExits: movement ? movement.contractExits : null,
      turnover: movement ? movement.turnover : null,
      spanMonths: movement ? movement.spanMonths : null,
      monthlyTurnover: movement ? movement.monthlyTurnover : null,
    }
  })
}
