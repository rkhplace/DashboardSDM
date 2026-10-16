import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from './repository'
import { reviewBatch } from './batchReview'
import type { ExcelInspection } from './excelAdapter'

const july = getPrototypeSnapshot()
const inspection = (records = july.records): ExcelInspection => ({ sheetName: 'S', period: '2026-07', periodSources: { sheet: null, file: null }, headers: [], rowCount: records.length, missingColumns: [], missingOptionalColumns: [], errorCells: [], preview: [], records })

describe('multi-file review', () => {
  it('blocks two files with the same period, flags identical files, and lets the rest through', () => {
    const other = july.records.slice(1)
    const result = reviewBatch([
      { id: 'a', filename: 'juli.xlsx', period: '2026-07', inspection: inspection() },
      { id: 'b', filename: 'juli-copy.xlsx', period: '2026-07', inspection: inspection() },
      { id: 'c', filename: 'agustus.xlsx', period: '2026-08', inspection: inspection(other) },
      { id: 'd', filename: 'rusak.xlsx', period: '', error: 'File tidak dapat dibaca.' },
      { id: 'e', filename: 'tanpa-periode.xlsx', period: '', inspection: inspection(other.slice(1)) },
    ], [])
    expect(result.map(item => item.verdict)).toEqual(['duplicate', 'duplicate', 'ready', 'unreadable', 'no-period'])
    expect(result[0].notes.map(note => note.text).join()).toContain('sama persis dengan juli-copy.xlsx')
  })
})
