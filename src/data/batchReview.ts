import type { EmployeeSnapshot } from '../types/workforce'
import type { ExcelInspection } from './excelAdapter'
import { fingerprint, importNotes, type ImportNote } from './importChecks'
import { lastDayOfMonth, validateInspection, type ImportQuality } from './validateImport'

export interface BatchItem { id: string; filename: string; period: string; inspection?: ExcelInspection; error?: string }

type Verdict = 'ready' | 'reading' | 'unreadable' | 'no-period' | 'critical' | 'duplicate'
export interface ReviewedItem extends BatchItem { verdict: Verdict; quality: ImportQuality | null; notes: ImportNote[]; asOf: string | null }

/** Decides, per file, whether it can be saved; files that share a period block each other until one is fixed or removed. */
export function reviewBatch(items: BatchItem[], stored: EmployeeSnapshot[]): ReviewedItem[] {
  const periodCount = new Map<string, number>()
  for (const item of items) if (item.inspection && item.period) periodCount.set(item.period, (periodCount.get(item.period) ?? 0) + 1)
  const signatures = new Map<string, string[]>()
  for (const item of items) if (item.inspection) {
    const key = fingerprint(item.inspection.records)
    signatures.set(key, [...signatures.get(key) ?? [], item.filename])
  }
  return items.map(item => {
    const asOf = lastDayOfMonth(item.period)
    if (item.error) return { ...item, verdict: 'unreadable', quality: null, notes: [], asOf }
    if (!item.inspection) return { ...item, verdict: 'reading', quality: null, notes: [], asOf }
    const quality = asOf ? validateInspection(item.inspection, asOf) : null
    const notes = asOf ? importNotes(item.inspection, item.period, stored) : []
    const twins = (signatures.get(fingerprint(item.inspection.records)) ?? []).filter(name => name !== item.filename)
    if (twins.length) notes.push({ tone: 'warning', text: `Isinya sama persis dengan ${twins.join(', ')}.` })
    const verdict: Verdict = !asOf ? 'no-period' : quality!.critical.length ? 'critical' : (periodCount.get(item.period) ?? 0) > 1 ? 'duplicate' : 'ready'
    return { ...item, verdict, quality, notes, asOf }
  })
}

