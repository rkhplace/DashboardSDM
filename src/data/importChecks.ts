import { monthLabel } from '../analytics/periods'
import type { EmployeeRecord, EmployeeSnapshot } from '../types/workforce'
import type { ExcelInspection } from './excelAdapter'

export interface ImportNote {
  tone: 'info' | 'warning'
  text: string
}

/** Short content signature: two files with the same signature hold the same employees with the same key fields. */
const cache = new WeakMap<EmployeeRecord[], string>()

export function fingerprint(records: EmployeeRecord[]): string {
  const known = cache.get(records)
  if (known) return known
  const text = records
    .map(record => `${record.nip}|${record.status}|${record.division}|${record.band ?? ''}|${record.joinDate ?? ''}`)
    .sort()
    .join('\n')
  let hash = 5381
  for (let index = 0; index < text.length; index++) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0
  const signature = `${records.length}:${hash.toString(16)}`
  cache.set(records, signature)
  return signature
}

const currentMonth = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

/** Checks about where a file will be stored, shown before saving (single and multi-file upload). */
export function importNotes(inspection: ExcelInspection, period: string, stored: EmployeeSnapshot[], today = currentMonth()): ImportNote[] {
  const notes: ImportNote[] = []
  const sources = inspection.periodSources
  if (sources?.sheet && sources.file && sources.sheet !== sources.file) {
    notes.push({
      tone: 'warning',
      text: `Nama sheet menunjukkan ${monthLabel(sources.sheet)}, nama file menunjukkan ${monthLabel(sources.file)}. Pastikan periodenya benar.`,
    })
  }
  if (inspection.period && period && period !== inspection.period)
    notes.push({ tone: 'info', text: `Periode diubah manual dari ${monthLabel(inspection.period)}.` })
  if (period && period > today)
    notes.push({ tone: 'warning', text: `${monthLabel(period)} berada setelah bulan berjalan (${monthLabel(today)}).` })
  if (stored.some(item => item.period === period))
    notes.push({ tone: 'info', text: `Data ${monthLabel(period)} yang sudah tersimpan akan digantikan.` })
  const signature = fingerprint(inspection.records)
  const same = stored.find(item => item.period !== period && fingerprint(item.records) === signature)
  if (same)
    notes.push({
      tone: 'warning',
      text: `Isinya sama persis dengan data ${monthLabel(same.period)} yang tersimpan. Kemungkinan salah pilih file atau periode.`,
    })
  return notes
}
