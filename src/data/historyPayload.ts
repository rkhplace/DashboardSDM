import type { EmployeeRecord, EmployeeSnapshot } from '../types/workforce'

/*
 * Earlier periods travel with each chat request as compact rows (one array per employee) so the AI's
 * period tools can work without a server database. Only the columns the trend, contract and quality
 * tools need are sent; names are sent only for people who are no longer in the active snapshot
 * (everyone else is resolved from the active snapshot on the server).
 */

const HISTORY_FIELDS = [
  'nip',
  'name',
  'directorate',
  'division',
  'section',
  'position',
  'positionType',
  'status',
  'band',
  'genderCode',
  'educationCode',
  'birthDate',
  'joinDate',
  'contractEnd',
] as const
type Field = (typeof HISTORY_FIELDS)[number]
type Cell = string | number | null

export interface HistoryPayload {
  fields: readonly string[]
  periods: { period: string; asOf: string; rows: Cell[][] }[]
}

const MAX_PERIODS = 24
const MAX_ROWS = 10000

export function encodeHistory(snapshots: EmployeeSnapshot[], active: EmployeeSnapshot): HistoryPayload {
  const current = new Set(active.records.map(record => record.nip))
  const periods = snapshots
    .filter(snapshot => snapshot.period < active.period)
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-MAX_PERIODS)
    .map(snapshot => ({
      period: snapshot.period,
      asOf: snapshot.asOf,
      rows: snapshot.records.map(record =>
        HISTORY_FIELDS.map(field => (field === 'name' && current.has(record.nip) ? null : ((record[field] ?? null) as Cell))),
      ),
    }))
  return { fields: HISTORY_FIELDS, periods }
}

/** Keeps the newest periods that fit within `maxBytes` of JSON. */
export function fitHistory(payload: HistoryPayload, maxBytes: number): { payload: HistoryPayload; dropped: number } {
  // Measure each period once (plus its separating comma) instead of re-serialising the whole payload per drop.
  const sizes = payload.periods.map(item => JSON.stringify(item).length)
  let total =
    JSON.stringify({ ...payload, periods: [] }).length + sizes.reduce((sum, size) => sum + size, 0) + Math.max(sizes.length - 1, 0)
  let dropped = 0
  while (dropped < sizes.length && total > maxBytes) {
    total -= sizes[dropped] + (dropped < sizes.length - 1 ? 1 : 0)
    dropped++
  }
  return { payload: { ...payload, periods: payload.periods.slice(dropped) }, dropped }
}

/** Keeps only the newest `keep` periods; used when the compressed body still turns out too large. */
export function keepNewest(payload: HistoryPayload, keep: number): HistoryPayload {
  return { ...payload, periods: keep > 0 ? payload.periods.slice(-keep) : [] }
}

const isDate = (value: unknown) => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
const isText = (value: unknown, max = 200) => value === null || (typeof value === 'string' && value.length <= max)
const isNumber = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value))
const CHECKS: Record<Field, (value: unknown) => boolean> = {
  nip: value => typeof value === 'string' && value.trim().length > 0 && value.length <= 60,
  name: value => isText(value, 120),
  directorate: isText,
  division: isText,
  section: isText,
  position: isText,
  positionType: isText,
  status: value => typeof value === 'string' && value.length <= 100,
  band: isNumber,
  genderCode: isNumber,
  educationCode: isNumber,
  birthDate: isDate,
  joinDate: isDate,
  contractEnd: isDate,
}

/** Server side: validates the payload and rebuilds snapshots older than the active one. Returns null when invalid. */
export function decodeHistory(input: unknown, active: EmployeeSnapshot): EmployeeSnapshot[] | null {
  if (input === undefined || input === null) return []
  if (typeof input !== 'object' || Array.isArray(input)) return null
  const payload = input as Partial<HistoryPayload>
  if (
    !Array.isArray(payload.fields) ||
    payload.fields.length !== HISTORY_FIELDS.length ||
    payload.fields.some((field, index) => field !== HISTORY_FIELDS[index])
  )
    return null
  if (!Array.isArray(payload.periods) || payload.periods.length > MAX_PERIODS) return null
  const names = new Map(active.records.map(record => [record.nip, record.name]))
  const seen = new Set<string>()
  const snapshots: EmployeeSnapshot[] = []
  for (const item of payload.periods) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.period !== 'string' ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(item.period) ||
      typeof item.asOf !== 'string' ||
      !item.asOf.startsWith(item.period) ||
      !isDate(item.asOf) ||
      item.period >= active.period ||
      seen.has(item.period) ||
      !Array.isArray(item.rows) ||
      item.rows.length > MAX_ROWS
    )
      return null
    seen.add(item.period)
    const nips = new Set<string>()
    const records: EmployeeRecord[] = []
    for (const row of item.rows) {
      if (!Array.isArray(row) || row.length !== HISTORY_FIELDS.length) return null
      const value = Object.fromEntries(HISTORY_FIELDS.map((field, index) => [field, row[index]])) as Record<Field, unknown>
      if (HISTORY_FIELDS.some(field => !CHECKS[field](value[field])) || nips.has(value.nip as string)) return null
      nips.add(value.nip as string)
      records.push({
        nip: value.nip as string,
        name: (value.name as string | null) ?? names.get(value.nip as string) ?? '',
        directorate: (value.directorate as string | null) ?? '',
        division: (value.division as string | null) ?? '',
        section: (value.section as string | null) ?? '',
        position: (value.position as string | null) ?? '',
        positionType: value.positionType as string | null,
        status: value.status as string,
        band: value.band as number | null,
        genderCode: value.genderCode as number | null,
        educationCode: value.educationCode as number | null,
        birthDate: value.birthDate as string | null,
        joinDate: value.joinDate as string | null,
        contractEnd: value.contractEnd as string | null,
        religion: null,
        activity: null,
        businessFunction: null,
        sourceAge: null,
        sourceAgeGroup: null,
        sourceTenure: null,
        sourceTenureGroup: null,
        institution: null,
        major: null,
        positionCode: null,
        genderLabel: null,
        sourceTotal: null,
      })
    }
    snapshots.push({ period: item.period, asOf: item.asOf, sourceFile: '', records })
  }
  return snapshots.sort((a, b) => a.period.localeCompare(b.period))
}
