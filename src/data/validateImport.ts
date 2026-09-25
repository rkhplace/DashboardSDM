import { EDUCATION, fullYears } from '../analytics/workforce'
import type { ExcelInspection } from './excelAdapter'

export interface ImportIssue { label: string; count: number }
export interface ImportQuality { critical: ImportIssue[]; warnings: ImportIssue[] }

export function validateInspection(inspection: ExcelInspection, asOf: string): ImportQuality {
  const { records, rowCount, missingColumns } = inspection
  const duplicateNip = records.length - new Set(records.map(record => record.nip)).size
  const missingNames = records.filter(record => !record.name).length
  const missingStatus = records.filter(record => !record.status).length
  const invalidBirthDates = records.filter(record => fullYears(record.birthDate, asOf) === null).length
  const invalidJoinDates = records.filter(record => fullYears(record.joinDate, asOf) === null).length
  const unknownEducation = records.filter(record => record.educationCode !== null && !EDUCATION[record.educationCode]).length
  const critical: ImportIssue[] = [
    { label: 'Kolom wajib tidak ditemukan', count: missingColumns.length },
    { label: 'Baris tanpa NIP', count: rowCount - records.length },
    { label: 'NIP duplikat', count: duplicateNip },
    { label: 'Nama kosong', count: missingNames },
    { label: 'Status kosong', count: missingStatus },
  ].filter(issue => issue.count > 0)
  if (records.length === 0) critical.push({ label: 'Tidak ada record pegawai', count: 1 })
  const warnings: ImportIssue[] = [
    { label: 'Tanggal lahir tidak valid / setelah periode', count: invalidBirthDates },
    { label: 'Tanggal masuk tidak valid / setelah periode', count: invalidJoinDates },
    { label: 'Pendidikan kosong', count: records.filter(record => record.educationCode === null).length },
    { label: 'Kode pendidikan tidak dikenal', count: unknownEducation },
    { label: 'Divisi / unit kosong', count: records.filter(record => !record.division).length },
    { label: 'Band tidak tersedia', count: records.filter(record => record.band === null).length },
  ].filter(issue => issue.count > 0)
  return { critical, warnings }
}

export function lastDayOfMonth(period: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return null
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}
