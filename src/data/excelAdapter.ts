import readExcelFile from 'read-excel-file/browser'
import type { EmployeeRecord } from '../types/workforce'

export const REQUIRED_COLUMNS = ['NIP', 'NAMA', 'JABATAN', 'DIREKTORAT', 'DIVISI', 'STATUS', 'JENIS KELAMIN', 'TANGGAL LAHIR', 'TANGGAL MASUK'] as const
export const OPTIONAL_COLUMNS = ['BAND', 'JENIS JABATAN', 'BAGIAN', 'AGAMA', 'ACTIVITY', 'FUNGSI BISNIS', 'PENDIDIKAN', 'INSTITUTE', 'JURUSAN'] as const
import { CONTRACT_END_COLUMNS } from './columns'
export { CONTRACT_END_COLUMNS }
const EXCEL_ERROR = /^#(?:N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!)$/i

export interface ExcelInspection {
  /** Period read from the sheet name and from the file name separately, to spot files whose two names disagree. */
  periodSources?: { sheet: string | null; file: string | null }
  sheetName: string
  period: string | null
  headers: string[]
  rowCount: number
  missingColumns: string[]
  missingOptionalColumns: string[]
  /** Cells holding Excel error values such as #N/A, per column. */
  errorCells: { column: string; count: number; nips: string[] }[]
  /** Cells in numeric columns (BAND, PENDIDIKAN, ...) that are not numbers, per column; they are read as empty. */
  invalidNumbers?: { column: string; count: number; nips: string[] }[]
  /** Header used for the contract end date, or null when the file has none. */
  contractEndColumn?: string | null
  /** NIPs whose contract end cell is filled but not a readable date. */
  invalidContractEnd?: string[]
  preview: Record<string, unknown>[]
  records: EmployeeRecord[]
}

const MONTHS: Record<string, string> = {
  jan: '01', januari: '01', january: '01', feb: '02', februari: '02', february: '02',
  mar: '03', maret: '03', march: '03', apr: '04', april: '04', mei: '05', may: '05',
  jun: '06', juni: '06', june: '06', jul: '07', juli: '07', july: '07', agu: '08', agt: '08',
  agustus: '08', aug: '08', august: '08', sep: '09', sept: '09', september: '09',
  okt: '10', oktober: '10', oct: '10', october: '10', nov: '11', november: '11',
  des: '12', desember: '12', dec: '12', december: '12',
}

export function inferPeriod(...sources: string[]): string | null {
  for (const source of sources) {
    const numeric = source.match(/(?:^|\D)(20\d{2})[-_. /](0?[1-9]|1[0-2])(?:\D|$)/)
    if (numeric) return `${numeric[1]}-${numeric[2].padStart(2, '0')}`
    const named = source.toLowerCase().match(/(?:^|[^a-z])([a-z]+)[\s._/-]*(20\d{2}|\d{2})(?=$|[^a-z0-9])/)
    if (named && MONTHS[named[1]]) {
      const year = named[2].length === 2 ? `20${named[2]}` : named[2]
      return `${year}-${MONTHS[named[1]]}`
    }
  }
  return null
}

function realDate(year: string, month: string, day: string): string | null {
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso ? iso : null
}

/** Reads Excel dates and text dates written as dd.mm.yyyy, dd/mm/yyyy, dd-mm-yyyy, or yyyy-mm-dd. */
export function dateString(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10)
  if (typeof value !== 'string') return null
  const text = value.trim()
  const dayFirst = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dayFirst) return realDate(dayFirst[3], dayFirst[2], dayFirst[1])
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return realDate(iso[1], iso[2], iso[3])
  return null
}

/** Header lookup key: letter case and extra spaces do not matter ("Tanggal  Masuk" = "TANGGAL MASUK"). */
export const headerKey = (value: unknown) => String(value ?? '').toLocaleUpperCase('id').replace(/\s+/g, ' ').trim()
const NUMERIC_COLUMNS = ['BAND', 'USIA', 'MASKER', 'POSITION', 'JENIS KELAMIN', 'PENDIDIKAN', 'TOTAL'] as const

export async function inspectExcel(file: File): Promise<ExcelInspection> {
  const sheets = await readExcelFile(file)
  // Use the first sheet that has an NIP column, so a cover or legend sheet in front does not break the import.
  const sheet = sheets.find(item => (item.data[0] ?? []).some(value => headerKey(value) === 'NIP')) ?? sheets[0]
  if (!sheet) throw new Error('Workbook tidak memiliki sheet yang dapat dibaca.')
  const rows = sheet.data
  const headers = (rows[0] ?? []).map(value => String(value ?? '').trim())
  const keys = headers.map(headerKey)
  const missingColumns = REQUIRED_COLUMNS.filter(column => !keys.includes(column))
  const body = rows.slice(1).filter(row => row.some(value => value !== null && value !== ''))
  const objects = body.map(row => Object.fromEntries(keys.map((key, index) => [key, row[index] ?? null])))
  const text = (row: Record<string, unknown>, key: string) => row[key] == null ? '' : String(row[key]).trim()
  const invalidNumbers = new Map<string, string[]>()
  const number = (row: Record<string, unknown>, key: string) => {
    if (row[key] == null || row[key] === '') return null
    const value = Number(typeof row[key] === 'string' ? (row[key] as string).trim() : row[key])
    if (Number.isFinite(value)) return value
    if (!EXCEL_ERROR.test(String(row[key]).trim())) invalidNumbers.set(key, [...invalidNumbers.get(key) ?? [], text(row, 'NIP')])
    return null
  }
  const optional = (row: Record<string, unknown>, key: string) => text(row, key) || null
  const normalHeader = (value: string) => value.toLocaleUpperCase('id').replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim()
  const contractIndex = headers.findIndex(header => (CONTRACT_END_COLUMNS as readonly string[]).includes(normalHeader(header)))
  const contractEndColumn = contractIndex >= 0 ? headers[contractIndex] : null
  const contractKey = contractIndex >= 0 ? keys[contractIndex] : null
  const records: EmployeeRecord[] = missingColumns.length ? [] : objects.filter(row => text(row, 'NIP')).map(row => ({
    nip: text(row, 'NIP'), name: text(row, 'NAMA'), band: number(row, 'BAND'),
    positionType: optional(row, 'JENIS JABATAN'), position: text(row, 'JABATAN'),
    directorate: text(row, 'DIREKTORAT'), division: text(row, 'DIVISI'), section: text(row, 'BAGIAN'),
    religion: optional(row, 'AGAMA'), activity: optional(row, 'ACTIVITY'), businessFunction: optional(row, 'FUNGSI BISNIS'),
    birthDate: dateString(row['TANGGAL LAHIR']), sourceAge: number(row, 'USIA'), sourceAgeGroup: optional(row, 'USIA 1'),
    sourceTenure: number(row, 'MASKER'), sourceTenureGroup: optional(row, 'MASKER 1'),
    status: text(row, 'STATUS'), institution: optional(row, 'INSTITUTE'), major: optional(row, 'JURUSAN'),
    positionCode: number(row, 'POSITION'), genderCode: number(row, 'JENIS KELAMIN'), genderLabel: optional(row, 'JENIS KELAMIN 1'),
    educationCode: number(row, 'PENDIDIKAN'), joinDate: dateString(row['TANGGAL MASUK']), sourceTotal: number(row, 'TOTAL'),
    ...(contractKey ? { contractEnd: dateString(row[contractKey]) } : {}),
  }))
  const invalidContractEnd = contractKey
    ? objects.filter(row => text(row, 'NIP') && text(row, contractKey) && !dateString(row[contractKey])).map(row => text(row, 'NIP'))
    : []
  const errors = new Map<string, { count: number; nips: string[] }>()
  for (const row of objects) {
    keys.forEach((key, index) => {
      if (!key || typeof row[key] !== 'string' || !EXCEL_ERROR.test((row[key] as string).trim())) return
      const item = errors.get(headers[index]) ?? { count: 0, nips: [] }
      item.count++
      if (text(row, 'NIP')) item.nips.push(text(row, 'NIP'))
      errors.set(headers[index], item)
    })
  }
  const errorCells = [...errors].map(([column, item]) => ({ column, ...item })).sort((a, b) => b.count - a.count)
  const missingOptionalColumns: string[] = OPTIONAL_COLUMNS.filter(column => !keys.includes(column))
  if (!contractEndColumn) missingOptionalColumns.push(CONTRACT_END_COLUMNS[0])
  const notNumbers = NUMERIC_COLUMNS.filter(column => invalidNumbers.has(column)).map(column => ({ column, count: invalidNumbers.get(column)!.length, nips: invalidNumbers.get(column)!.filter(Boolean) }))
  return { sheetName: sheet.sheet, period: inferPeriod(sheet.sheet, file.name), periodSources: { sheet: inferPeriod(sheet.sheet), file: inferPeriod(file.name) }, headers, rowCount: body.length, missingColumns, missingOptionalColumns, errorCells, invalidNumbers: notNumbers, contractEndColumn, invalidContractEnd, preview: objects.slice(0, 5), records }
}
