import { hasContractColumn } from '../src/analytics/contracts.ts'
import { compareSnapshots } from '../src/analytics/trends.ts'
import { CONTRACT_END_COLUMNS } from '../src/data/columns.ts'
import { validateInspection, type ImportIssue } from '../src/data/validateImport.ts'
import type { EmployeeSnapshot, WorkforceFilters } from '../src/types/workforce.ts'
import type { IdentityMap } from './identity.ts'

const MAX_EXAMPLES = 8

export const qualityTool = {
  type: 'function',
  name: 'check_data_quality',
  description: 'Periksa kualitas data file periode aktif dengan aturan yang sama seperti pemeriksaan saat upload: tanggal lahir/masuk tidak valid, usia tidak wajar, kolom USIA atau MASKER (masa kerja) yang tidak cocok dengan tanggal, kode jenis kelamin/pendidikan tidak dikenal, label beda penulisan, PKWT tanpa tanggal selesai atau kontrak yang sudah lewat, serta karyawan "masuk" yang tanggal masuknya sebelum periode pembanding (kemungkinan salah tulis NIP). Contoh karyawan dikembalikan sebagai kode KARYAWAN_n. Pakai untuk pertanyaan tentang data yang aneh, perlu dicek, atau perlu diperbaiki.',
  parameters: {
    type: 'object',
    properties: {
      maxExamples: { type: 'integer', description: 'Jumlah contoh karyawan per temuan (0–8). Kosongkan untuk 8; isi 0 jika hanya butuh jumlah.' },
    },
  },
} as const

export function runQualityCheck(input: unknown, active: EmployeeSnapshot, previous: EmployeeSnapshot | undefined, filters: WorkforceFilters, retirementAge: number, identities: IdentityMap) {
  const args = typeof input === 'object' && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const limit = typeof args.maxExamples === 'number' && Number.isInteger(args.maxExamples) ? Math.min(Math.max(args.maxExamples, 0), MAX_EXAMPLES) : MAX_EXAMPLES
  const byNip = new Map(active.records.map(record => [record.nip, record]))
  const examples = (nips: string[] = []) => nips.slice(0, limit).map(nip => byNip.get(nip)).filter(record => record !== undefined).map(record => identities.refFor(record))
  const quality = validateInspection({
    sheetName: '', period: active.period, headers: [], rowCount: active.records.length, missingColumns: [], missingOptionalColumns: [], errorCells: [],
    contractEndColumn: hasContractColumn(active.records) ? CONTRACT_END_COLUMNS[0] : null, invalidContractEnd: [], preview: [], records: active.records,
  }, active.asOf)
  const describe = (level: 'kritis' | 'peringatan') => (issue: ImportIssue) => ({ level, issue: issue.label, count: issue.count, hint: issue.hint ?? null, examples: examples(issue.nips) })
  const movement = previous ? compareSnapshots(previous, active, filters, retirementAge) : null
  return {
    period: active.period, checkedRecords: active.records.length,
    contractEndColumnAvailable: hasContractColumn(active.records),
    issues: [...quality.critical.map(describe('kritis')), ...quality.warnings.map(describe('peringatan'))],
    joinedNeedingCheck: movement ? { comparedWith: previous!.period, count: movement.staleJoins.length, examples: examples(movement.staleJoins) } : null,
    note: 'Pemeriksaan sel Excel (#N/A, kolom hilang) hanya tersedia saat upload; di sini yang diperiksa isi data karyawan.',
  }
}
