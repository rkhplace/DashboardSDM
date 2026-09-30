import { EDUCATION, fullYears } from '../analytics/workforce'
import type { EmployeeRecord } from '../types/workforce'
import type { ExcelInspection } from './excelAdapter'

export interface ImportIssue {
  label: string
  count: number
  /** How to fix or what the dashboard will do with it. */
  hint?: string
  /** Affected NIPs, for the downloadable findings list. */
  nips?: string[]
}
export interface ImportQuality { critical: ImportIssue[]; warnings: ImportIssue[] }

function issue(label: string, matched: EmployeeRecord[], hint?: string): ImportIssue {
  return { label, count: matched.length, hint, nips: matched.map(record => record.nip) }
}

const normalLabel = (value: string) => value.toLocaleLowerCase('id').replace(/\s+/g, ' ').trim()

/** Labels that differ only by letter case or spacing, e.g. "Teknisi" vs "TEKNISI". */
export function inconsistentLabels(records: EmployeeRecord[]) {
  const fields = [['division', 'Divisi'], ['section', 'Bagian'], ['position', 'Jabatan'], ['status', 'Status'], ['directorate', 'Direktorat']] as const
  const findings: { field: string; variants: string[]; nips: string[] }[] = []
  for (const [key, name] of fields) {
    const groups = new Map<string, Set<string>>()
    for (const record of records) {
      const value = record[key]
      if (!value) continue
      const group = groups.get(normalLabel(value)) ?? new Set<string>()
      group.add(value)
      groups.set(normalLabel(value), group)
    }
    for (const variants of groups.values()) {
      if (variants.size < 2) continue
      const list = [...variants]
      findings.push({ field: name, variants: list, nips: records.filter(record => list.includes(record[key] ?? '')).map(record => record.nip) })
    }
  }
  return findings
}

export function validateInspection(inspection: ExcelInspection, asOf: string): ImportQuality {
  const { records, rowCount, missingColumns } = inspection
  const seen = new Set<string>()
  const duplicates = records.filter(record => seen.has(record.nip) || !seen.add(record.nip))
  const critical: ImportIssue[] = [
    { label: 'Kolom wajib tidak ditemukan', count: missingColumns.length, hint: missingColumns.join(', ') },
    { label: 'Baris tanpa NIP', count: rowCount - records.length, hint: 'Setiap baris karyawan wajib punya NIP.' },
    issue('NIP duplikat', duplicates, 'NIP harus unik agar headcount tidak ganda.'),
    issue('Nama kosong', records.filter(record => !record.name)),
    issue('Status kosong', records.filter(record => !record.status)),
  ].filter(item => item.count > 0)
  if (records.length === 0) critical.push({ label: 'Tidak ada record pegawai', count: 1 })

  const age = (record: EmployeeRecord) => fullYears(record.birthDate, asOf)
  const labelFindings = inconsistentLabels(records)
  const errorCells = inspection.errorCells ?? []
  const missingOptional = inspection.missingOptionalColumns ?? []
  const warnings: ImportIssue[] = [
    issue('Tanggal lahir tidak valid / setelah periode', records.filter(record => age(record) === null), 'Karyawan ini tidak masuk hitungan usia dan proyeksi pensiun.'),
    issue('Tanggal masuk tidak valid / setelah periode', records.filter(record => fullYears(record.joinDate, asOf) === null), 'Karyawan ini tidak masuk hitungan masa kerja.'),
    issue('Usia di luar rentang wajar (<17 atau >65 tahun)', records.filter(record => { const value = age(record); return value !== null && (value < 17 || value > 65) }), 'Periksa kembali tanggal lahir.'),
    issue('Tanggal masuk sebelum usia 17 tahun', records.filter(record => {
      const joined = fullYears(record.birthDate, record.joinDate ?? '')
      return record.joinDate !== null && joined !== null && joined < 17
    }), 'Kemungkinan tanggal lahir atau tanggal masuk tertukar.'),
    issue('Kolom USIA berbeda dari tanggal lahir', records.filter(record => { const value = age(record); return value !== null && record.sourceAge !== null && Math.abs(record.sourceAge - value) > 1 }), 'Dashboard memakai usia hasil hitung dari tanggal lahir.'),
    issue('Kode jenis kelamin tidak dikenal', records.filter(record => record.genderCode !== 1 && record.genderCode !== 2), 'Kode yang dikenali: 1 = laki-laki, 2 = perempuan.'),
    issue('Pendidikan kosong', records.filter(record => record.educationCode === null)),
    issue('Kode pendidikan tidak dikenal', records.filter(record => record.educationCode !== null && !EDUCATION[record.educationCode]), `Kode yang dikenali: ${Object.entries(EDUCATION).map(([code, name]) => `${code}=${name}`).join(', ')}.`),
    issue('Divisi / unit kosong', records.filter(record => !record.division)),
    issue('Band tidak tersedia', records.filter(record => record.band === null), 'Dihitung pada kolom "Tidak tersedia" di matriks band.'),
    issue('Activity kosong', records.filter(record => !record.activity), 'Tampil sebagai (KOSONG) pada grafik activity.'),
    issue('Jenis jabatan kosong', records.filter(record => !record.positionType), 'Posisi struktural dipakai untuk risiko suksesi; baris kosong dianggap non-struktural.'),
    { label: 'Sel berisi error Excel (#N/A, #REF!, dll.)', count: errorCells.reduce((sum, item) => sum + item.count, 0), hint: errorCells.map(item => `${item.column} (${item.count})`).join(', '), nips: [...new Set(errorCells.flatMap(item => item.nips))] },
    { label: 'Label beda penulisan (huruf besar/spasi)', count: labelFindings.length, hint: labelFindings.slice(0, 4).map(item => `${item.field}: ${item.variants.join(' / ')}`).join('; ') + (labelFindings.length > 4 ? '; …' : ''), nips: [...new Set(labelFindings.flatMap(item => item.nips))] },
    { label: 'Kolom opsional tidak ada', count: missingOptional.length, hint: missingOptional.join(', ') },
  ].filter(item => item.count > 0)
  return { critical, warnings }
}

export function qualityCsv(quality: ImportQuality, records: EmployeeRecord[]): string {
  const names = new Map(records.map(record => [record.nip, record.name]))
  const rows = [['Tingkat', 'Temuan', 'NIP', 'Nama', 'Keterangan']]
  for (const [level, items] of [['Kritis', quality.critical], ['Peringatan', quality.warnings]] as const) {
    for (const item of items) {
      if (item.nips?.length) for (const nip of item.nips) rows.push([level, item.label, nip, names.get(nip) ?? '', item.hint ?? ''])
      else rows.push([level, item.label, '', '', `${item.count} temuan. ${item.hint ?? ''}`.trim()])
    }
  }
  return rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
}

export function lastDayOfMonth(period: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return null
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}
