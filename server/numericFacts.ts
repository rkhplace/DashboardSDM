import { fullYears, genderOf } from '../src/analytics/workforce.ts'
import type { EmployeeRecord } from '../src/types/workforce.ts'

type Metric = 'age' | 'tenure'
type Op = 'gt' | 'gte' | 'lt' | 'lte' | 'between'
export type NumericCondition = { metric: Metric; op: Op; min: number; max?: number }

const NUMBER = String.raw`(\d{1,3})`
// Order matters: inclusive forms (>=, minimal, "ke atas") are checked before the strict ones they contain.
const COMPARATORS: [RegExp, Op][] = [
  [new RegExp(String.raw`(?:>=|≥|minimal|min\.?|paling\s+(?:sedikit|rendah)|sekurang-kurangnya|setidaknya)\s*${NUMBER}`), 'gte'],
  [new RegExp(String.raw`(?:<=|≤|maksimal|maks\.?|paling\s+(?:banyak|tinggi)|sebanyak-banyaknya)\s*${NUMBER}`), 'lte'],
  [new RegExp(String.raw`${NUMBER}\s*(?:tahun\s*)?(?:ke\s*atas|keatas)`), 'gte'],
  [new RegExp(String.raw`${NUMBER}\s*(?:tahun\s*)?(?:ke\s*bawah|kebawah)`), 'lte'],
  [new RegExp(String.raw`(?:di\s*atas|lebih\s+dari|lebih\s+tua\s+dari|melebihi|>)\s*${NUMBER}`), 'gt'],
  [new RegExp(String.raw`(?:di\s*bawah|kurang\s+dari|lebih\s+muda\s+dari|<)\s*${NUMBER}`), 'lt'],
]
const BETWEEN = new RegExp(String.raw`antara\s*${NUMBER}\s*(?:tahun\s*)?(?:dan|-|–|sampai|hingga|s/d)\s*${NUMBER}`)
const TENURE_WORDS = /masa\s*kerja|lama\s+(?:bekerja|kerja)|bekerja|masa\s+dinas|berdinas/
const AGE_WORDS = /usia|umur|berumur|berusia|pensiun/

/** Reads one numeric age/tenure threshold from a question such as "berapa karyawan berumur di atas 56 tahun". */
export function parseNumericCondition(message: string): NumericCondition | null {
  const text = message.toLocaleLowerCase('id').replace(/\s+/g, ' ')
  const metric: Metric | null = TENURE_WORDS.test(text) ? 'tenure' : AGE_WORDS.test(text) || /\btahun\b/.test(text) ? 'age' : null
  if (!metric) return null
  const between = text.match(BETWEEN)
  if (between) {
    const [a, b] = [Number(between[1]), Number(between[2])].sort((x, y) => x - y)
    return { metric, op: 'between', min: a, max: b }
  }
  for (const [pattern, op] of COMPARATORS) {
    const match = text.match(pattern)
    if (match) return { metric, op, min: Number(match[1]) }
  }
  return null
}

function test(value: number, condition: NumericCondition): boolean {
  const { op, min, max } = condition
  if (op === 'gt') return value > min
  if (op === 'gte') return value >= min
  if (op === 'lt') return value < min
  if (op === 'lte') return value <= min
  return value >= min && value <= (max ?? min)
}

function describe(condition: NumericCondition): string {
  const noun = condition.metric === 'age' ? 'Usia' : 'Masa kerja'
  const { op, min, max } = condition
  if (op === 'gt') return `${noun} di atas ${min} tahun (${min + 1} tahun ke atas)`
  if (op === 'gte') return `${noun} ${min} tahun ke atas`
  if (op === 'lt') return `${noun} di bawah ${min} tahun (${min - 1} tahun ke bawah)`
  if (op === 'lte') return `${noun} ${min} tahun ke bawah`
  return `${noun} antara ${min} dan ${max} tahun (inklusif)`
}

/** Exact counts for a numeric threshold in the question, so the model never falls back to the coarse age/tenure groups. */
export function numericFacts(message: string, records: EmployeeRecord[], asOf: string): string[] {
  const condition = parseNumericCondition(message)
  if (!condition) return []
  const valueOf = (record: EmployeeRecord) => fullYears(condition.metric === 'age' ? record.birthDate : record.joinDate, asOf)
  const valid = records.filter(record => valueOf(record) !== null)
  const matched = valid.filter(record => test(valueOf(record)!, condition))
  const male = matched.filter(record => genderOf(record) === 'L').length
  const female = matched.filter(record => genderOf(record) === 'P').length
  const lines = [`${describe(condition)}: ${matched.length} dari ${records.length} karyawan pada hasil filter (laki-laki ${male}, perempuan ${female}).`]
  if (condition.op === 'gt' || condition.op === 'lt') {
    const inclusive = valid.filter(record => test(valueOf(record)!, { ...condition, op: condition.op === 'gt' ? 'gte' : 'lte' })).length
    lines.push(`Pembanding jika batasnya ikut dihitung (${condition.op === 'gt' ? `${condition.min} tahun ke atas` : `${condition.min} tahun ke bawah`}): ${inclusive} karyawan.`)
  }
  const missing = records.length - valid.length
  if (missing) lines.push(`${missing} karyawan tanpa tanggal ${condition.metric === 'age' ? 'lahir' : 'masuk'} valid tidak ikut dihitung.`)
  return lines
}
