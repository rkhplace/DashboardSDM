import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from '../data/repository'
import type { EmployeeRecord } from '../types/workforce'
import { addYears, defaultRetirementStatuses, projectRetirement, retirementDate } from './retirement'

const base = getPrototypeSnapshot().records[0]
const person = (nip: string, birthDate: string | null, extra: Partial<EmployeeRecord> = {}): EmployeeRecord => ({ ...base, nip, name: nip, status: 'Aktif', division: 'DIV A', positionType: null, birthDate, ...extra })

describe('retirement projection', () => {
  it('computes retirement dates including leap days', () => {
    expect(retirementDate('1970-08-15', 56)).toBe('2026-08-15')
    expect(retirementDate('1972-02-29', 56)).toBe('2028-02-29')
    expect(addYears('2024-02-29', 1)).toBe('2025-03-01')
    expect(retirementDate('1970-02-30', 56)).toBeNull()
  })
  it('excludes contract and board statuses by default', () => {
    const statuses = defaultRetirementStatuses(getPrototypeSnapshot().records)
    expect(statuses).toContain('Aktif')
    expect(statuses.some(status => /pkwt|direksi|komisaris|cltp/i.test(status))).toBe(false)
  })
  it('buckets retirees per year and flags division risk', () => {
    const records = [
      person('A', '1970-08-15'), // retires 2026-08-15 → window 1
      person('B', '1972-01-10', { positionType: 'JABATAN STRUKTURAL' }), // 2028-01-10 → window 2, key
      person('C', '1965-01-01'), // already past 56 → overdue
      person('D', '1990-01-01'),
      person('E', null),
      person('F', '1970-08-15', { status: 'PKWT' }),
      person('G', '1985-01-01', { division: 'DIV B' }),
    ]
    const result = projectRetirement(records, '2026-07-31', { age: 56, horizonYears: 5, statuses: ['Aktif'] })
    expect(result.counted).toBe(6)
    expect(result.invalidBirthDate).toBe(1)
    expect(result.candidates.map(candidate => candidate.record.nip)).toEqual(['C', 'A', 'B'])
    expect(result.overdue).toBe(1)
    expect(result.keyRetiring).toBe(1)
    expect(result.windows.map(window => window.count)).toEqual([1, 1, 0, 0, 0])
    expect(result.divisions).toEqual([{ division: 'DIV A', counted: 5, retiring: 3, keyRetiring: 1, share: 0.6, risk: 'Tinggi' }])
  })
})
