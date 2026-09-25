import { describe, expect, it } from 'vitest'
import { AGE_GROUPS, ageGroup, bandMatrix, countBy, educationOf, filterRecords, fullYears, genderOf, summarize, tenureGroup } from './workforce'
import { getPrototypeSnapshot } from '../data/repository'
import { emptyFilters } from '../types/workforce'

const snapshot = getPrototypeSnapshot()
const records = snapshot.records

describe('canonical data rules', () => {
  it('groups every age including exactly 25', () => {
    expect(ageGroup(25)).toBe('≤25')
    expect(ageGroup(26)).toBe('26–30')
    expect(ageGroup(50)).toBe('46–50')
    expect(ageGroup(null)).toBe('Tidak diketahui')
    expect(AGE_GROUPS).toContain('Tidak diketahui')
  })
  it('calculates completed years from dates instead of source labels', () => {
    expect(fullYears('2001-07-31', '2026-07-31')).toBe(25)
    expect(fullYears('2001-08-01', '2026-07-31')).toBe(24)
    expect(fullYears('2001-02-30', '2026-07-31')).toBeNull()
    expect(tenureGroup(4)).toBe('<5')
    expect(tenureGroup(5)).toBe('5–10')
    expect(tenureGroup(11)).toBe('11–15')
    expect(tenureGroup(null)).toBe('Tidak diketahui')
  })
  it('keeps unknown gender separate and maps education code 81', () => {
    expect(genderOf({ genderCode: 1 })).toBe('L')
    expect(genderOf({ genderCode: 2 })).toBe('P')
    expect(genderOf({ genderCode: 9 })).toBe('UNKNOWN')
    expect(educationOf({ educationCode: 81 })).toBe('SLTP')
    expect(educationOf({ educationCode: null })).toBe('Tidak diketahui')
  })
})

describe('July 2026 snapshot reconciliation', () => {
  it('uses 202 unique NIP and exact status counts', () => {
    const summary = summarize(records, snapshot.asOf)
    expect(summary.total).toBe(202)
    expect(summary.active).toBe(52)
    expect(summary.male).toBe(144)
    expect(summary.female).toBe(58)
    expect(summary.male + summary.female + summary.unknownGender).toBe(summary.total)
  })
  it('reconciles status and division aggregations', () => {
    expect(countBy(records, record => record.status).reduce((sum, item) => sum + item.value, 0)).toBe(records.length)
    expect(countBy(records, record => record.division).reduce((sum, item) => sum + item.value, 0)).toBe(records.length)
  })
  it('reconciles age groups and band matrix including missing bands', () => {
    const ageCounts = countBy(records, record => ageGroup(fullYears(record.birthDate, snapshot.asOf)))
    expect(ageCounts.reduce((sum, item) => sum + item.value, 0)).toBe(records.length)
    const matrix = bandMatrix(records)
    expect(matrix.totals.reduce((sum, value) => sum + value, 0)).toBe(records.length)
    expect(matrix.rows.reduce((sum, row) => sum + row.total, 0)).toBe(records.length)
    expect(matrix.totals[matrix.bands.indexOf('Tidak tersedia')]).toBe(107)
  })
  it('combines independent filters on one record set', () => {
    const filtered = filterRecords(records, { ...emptyFilters, directorate: ['DIREKTORAT OPERASI'], gender: ['P'], status: ['Aktif', 'PKWT'] }, snapshot.asOf)
    expect(filtered.every(record => record.directorate === 'DIREKTORAT OPERASI' && record.genderCode === 2 && ['Aktif', 'PKWT'].includes(record.status))).toBe(true)
    expect(filtered.length).toBeGreaterThan(0)
  })
  it('filters masa kerja from the snapshot date', () => {
    const filtered = filterRecords(records, { ...emptyFilters, tenureGroup: ['<5'] }, snapshot.asOf)
    expect(filtered).toHaveLength(123)
    expect(filtered.every(record => tenureGroup(fullYears(record.joinDate, snapshot.asOf)) === '<5')).toBe(true)
  })
})
