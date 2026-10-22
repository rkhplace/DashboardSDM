import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from './repository'
import { fingerprint, importNotes } from './importChecks'
import type { ExcelInspection } from './excelAdapter'

const july = getPrototypeSnapshot()
const inspection = (overrides: Partial<ExcelInspection> = {}): ExcelInspection => ({
  sheetName: 'Jul26',
  period: '2026-07',
  periodSources: { sheet: '2026-07', file: '2026-07' },
  headers: [],
  rowCount: july.records.length,
  missingColumns: [],
  missingOptionalColumns: [],
  errorCells: [],
  preview: [],
  records: july.records,
  ...overrides,
})

describe('import checks', () => {
  it('ignores row order but notices a changed status', () => {
    expect(fingerprint([...july.records].reverse())).toBe(fingerprint(july.records))
    expect(fingerprint([{ ...july.records[0], status: 'X' }, ...july.records.slice(1)])).not.toBe(fingerprint(july.records))
  })

  it('warns about conflicting names, future periods, replacement and identical content', () => {
    const texts = (notes: { text: string }[]) => notes.map(note => note.text).join(' | ')
    expect(importNotes(inspection(), '2026-07', [], '2026-10')).toEqual([])
    expect(texts(importNotes(inspection({ periodSources: { sheet: '2026-07', file: '2026-08' } }), '2026-07', [], '2026-10'))).toContain(
      'Nama sheet menunjukkan Jul 2026, nama file menunjukkan Agu 2026',
    )
    expect(texts(importNotes(inspection(), '2026-11', [], '2026-10'))).toContain('setelah bulan berjalan')
    expect(texts(importNotes(inspection(), '2026-07', [july], '2026-10'))).toContain('akan digantikan')
    expect(texts(importNotes(inspection(), '2026-08', [july], '2026-10'))).toContain('sama persis dengan data Jul 2026')
  })
})
