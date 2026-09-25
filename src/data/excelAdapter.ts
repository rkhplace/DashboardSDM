import readExcelFile from 'read-excel-file/browser'
import type { EmployeeRecord } from '../types/workforce'

export const REQUIRED_COLUMNS = ['NIP', 'NAMA', 'JABATAN', 'DIREKTORAT', 'DIVISI', 'STATUS', 'JENIS KELAMIN', 'TANGGAL LAHIR', 'TANGGAL MASUK'] as const

export interface ExcelInspection {
  sheetName: string
  period: string | null
  headers: string[]
  rowCount: number
  missingColumns: string[]
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

function dateString(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    const [day, month, year] = value.split('.')
    return `${year}-${month}-${day}`
  }
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10)
  return null
}

export async function inspectExcel(file: File): Promise<ExcelInspection> {
  const [sheet] = await readExcelFile(file)
  if (!sheet) throw new Error('Workbook tidak memiliki sheet yang dapat dibaca.')
  const rows = sheet.data
  const headers = (rows[0] ?? []).map(value => String(value ?? '').trim())
  const missingColumns = REQUIRED_COLUMNS.filter(column => !headers.includes(column))
  const body = rows.slice(1).filter(row => row.some(value => value !== null && value !== ''))
  const objects = body.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])))
  const text = (row: Record<string, unknown>, key: string) => row[key] == null ? '' : String(row[key]).trim()
  const number = (row: Record<string, unknown>, key: string) => row[key] == null || row[key] === '' ? null : Number(row[key])
  const optional = (row: Record<string, unknown>, key: string) => text(row, key) || null
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
  }))
  return { sheetName: sheet.sheet, period: inferPeriod(sheet.sheet, file.name), headers, rowCount: body.length, missingColumns, preview: objects.slice(0, 5), records }
}
