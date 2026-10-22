import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dateString, inspectExcel } from './excelAdapter'
import { lastDayOfMonth, validateInspection } from './validateImport'

describe('Excel adapter against supplied workbook', () => {
  it('reads source headers and all 202 employee records', async () => {
    const bytes = readFileSync(resolve(process.cwd(), '..', 'DATA KARYAWAN DUMMY.xlsx'))
    const file = new File([bytes], 'DATA KARYAWAN DUMMY.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const result = await inspectExcel(file)
    expect(result.period).toBe('2026-07')
    expect(result.missingColumns).toEqual([])
    expect(result.rowCount).toBe(202)
    expect(result.records).toHaveLength(202)
    expect(new Set(result.records.map(record => record.nip)).size).toBe(202)
    const quality = validateInspection(result, '2026-07-31')
    expect(quality.critical).toEqual([])
    expect(quality.warnings.find(issue => issue.label === 'Band tidak tersedia')?.count).toBe(107)
    expect(quality.warnings.find(issue => issue.label === 'Activity kosong')?.count).toBe(100)
    expect(quality.warnings.find(issue => issue.label === 'Band tidak tersedia')?.nips).toHaveLength(107)
    expect(result.errorCells.length).toBeGreaterThanOrEqual(0)
    // Every code in this file is an official HC code, and the SD–S3 flag columns disagree with PENDIDIKAN for 8 people.
    expect(quality.warnings.find(issue => issue.label === 'Kode pendidikan tidak dikenal')).toBeUndefined()
    const mismatch = quality.warnings.find(issue => issue.label === 'Kode PENDIDIKAN tidak sejalan dengan kolom jenjang (SD–S3)')
    expect(mismatch?.count).toBe(8)
    expect(mismatch?.nips).toContain('PP.200506004')
    expect(result.records.find(record => record.nip === 'PP.200506004')).toMatchObject({ educationCode: 88, educationFlags: ['S1'] })
    // 24 SLTA rows have every level column empty (TOTAL 0); the one row without any code is reported as "Pendidikan kosong" instead.
    expect(quality.warnings.find(issue => issue.label === 'Kolom jenjang SD–S3 kosong padahal kode PENDIDIKAN terisi')?.count).toBe(24)
  })
  it('uses the last day of the selected month and requires a valid period', () => {
    expect(lastDayOfMonth('2026-07')).toBe('2026-07-31')
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29')
    expect(lastDayOfMonth('2026-13')).toBeNull()
  })
  it('reads text dates in common Indonesian formats and rejects impossible ones', () => {
    expect(dateString('05.08.2027')).toBe('2027-08-05')
    expect(dateString('5/8/2027')).toBe('2027-08-05')
    expect(dateString('2027-08-05')).toBe('2027-08-05')
    expect(dateString('31.02.2027')).toBeNull()
    expect(dateString('Agustus 2027')).toBeNull()
  })
})
