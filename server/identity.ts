import { educationOf, fullYears, genderOf } from '../src/analytics/workforce.ts'
import type { EmployeeRecord } from '../src/types/workforce.ts'
import { matchesFilters, validFilters } from './query.ts'

const MAX_ROWS = 50
const REF = /\b(NIP_)?KARYAWAN_(\d{1,4})\b/gi

/**
 * Names and NIPs never reach Gemini. Each employee who appears in a question, the chat history or a
 * list_employees result is swapped for a code (KARYAWAN_n); the model writes those codes and
 * restore() puts the real names back into the answer on our server.
 */
export class IdentityMap {
  private byNip = new Map<string, string>()
  private records: EmployeeRecord[] = []

  refFor(record: EmployeeRecord): string {
    let ref = this.byNip.get(record.nip)
    if (!ref) {
      this.records.push(record)
      ref = `KARYAWAN_${this.records.length}`
      this.byNip.set(record.nip, ref)
    }
    return ref
  }

  recordFor(ref: string): EmployeeRecord | undefined {
    const index = Number(ref.replace(/^KARYAWAN_/i, '')) - 1
    return Number.isInteger(index) ? this.records[index] : undefined
  }

  /** Replaces every employee name or NIP that appears in free text with its code. */
  redact(text: string, allRecords: EmployeeRecord[]): string {
    let result = text
    const candidates = allRecords
      .flatMap(record => [{ record, token: record.name }, { record, token: record.nip }])
      .filter(item => item.token && item.token.length >= 3)
      .sort((a, b) => b.token.length - a.token.length)
    for (const { record, token } of candidates) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'giu')
      if (pattern.test(result)) result = result.replace(pattern, (_, before: string) => `${before}${this.refFor(record)}`)
    }
    return result
  }

  /** Puts names (or NIPs for NIP_KARYAWAN_n) back into the model's answer. Unknown codes stay as written. */
  restore(text: string): string {
    return text.replace(REF, (code, nipPrefix: string | undefined, digits: string) => {
      const record = this.recordFor(`KARYAWAN_${digits}`)
      if (!record) return code
      return nipPrefix ? record.nip : record.name
    })
  }
}

export const listTool = {
  type: 'function',
  name: 'list_employees',
  description: 'Ambil daftar karyawan individual pada file dan filter aktif, untuk pertanyaan "siapa", "sebutkan nama", "daftar karyawan", atau detail seorang karyawan. Nama dan NIP disamarkan sebagai kode KARYAWAN_n; tulis kode itu persis di jawaban dan sistem menggantinya dengan nama asli (NIP_KARYAWAN_n untuk NIP). Isi refs untuk karyawan yang sudah disebut dengan kode, atau filters untuk sekelompok karyawan.',
  parameters: {
    type: 'object',
    properties: {
      refs: { type: 'array', items: { type: 'string' }, description: 'Kode karyawan yang sudah muncul, misalnya ["KARYAWAN_1"].' },
      filters: { type: 'array', description: 'Filter sama seperti query_workforce, misalnya [{"field":"age","operator":"gte","min":51}].', items: { type: 'object', properties: {
        field: { type: 'string' },
        operator: { type: 'string', enum: ['eq', 'contains', 'gte', 'lte', 'between'] },
        value: { type: 'string' },
        min: { type: 'number' },
        max: { type: 'number' },
      }, required: ['field', 'operator'] } },
    },
  },
} as const

/** Runs list_employees: de-identified rows for the model, names stay in the IdentityMap. */
export function listEmployees(input: unknown, records: EmployeeRecord[], asOf: string, identities: IdentityMap) {
  const args = typeof input === 'object' && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {}
  let matched: EmployeeRecord[]
  if (Array.isArray(args.refs) && args.refs.length) {
    matched = args.refs.filter((ref): ref is string => typeof ref === 'string').map(ref => identities.recordFor(ref)).filter((record): record is EmployeeRecord => Boolean(record))
  } else {
    const filters = validFilters(args.filters ?? [])
    if (!filters) return { error: 'Parameter filter tidak valid. Gunakan field dan operator yang sama seperti query_workforce.' }
    matched = records.filter(record => matchesFilters(record, filters, asOf))
  }
  const rows = matched.slice(0, MAX_ROWS).map(record => ({
    ref: identities.refFor(record),
    gender: genderOf(record) === 'L' ? 'Laki-laki' : genderOf(record) === 'P' ? 'Perempuan' : 'Tidak diketahui',
    age: fullYears(record.birthDate, asOf),
    tenure: fullYears(record.joinDate, asOf),
    position: record.position,
    positionType: record.positionType,
    division: record.division,
    section: record.section,
    status: record.status,
    band: record.band,
    education: educationOf(record),
  }))
  return { matched: matched.length, shown: rows.length, truncated: matched.length > rows.length, rows }
}
