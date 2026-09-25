import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectExcel } from './excelAdapter'
import { lastDayOfMonth, validateInspection } from './validateImport'

describe('Excel adapter against supplied workbook', () => {
  it('reads source headers and all 202 employee records', async () => {
    const bytes = readFileSync(resolve(process.cwd(), '..', 'DATA KARYAWAN DUMMY.xlsx'))
    const file = new File([bytes], 'DATA KARYAWAN DUMMY.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const result = await inspectExcel(file)
    expect(result.period).toBe('2026-07')
    expect(result.missingColumns).toEqual([])
    expect(result.rowCount).toBe(202)
    expect(result.records).toHaveLength(202)
    expect(new Set(result.records.map(record => record.nip)).size).toBe(202)
    const quality = validateInspection(result, '2026-07-31')
    expect(quality.critical).toEqual([])
    expect(quality.warnings.find(issue => issue.label === 'Band tidak tersedia')?.count).toBe(107)
  })
  it('uses the last day of the selected month and requires a valid period', () => {
    expect(lastDayOfMonth('2026-07')).toBe('2026-07-31')
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29')
    expect(lastDayOfMonth('2026-13')).toBeNull()
  })
})
