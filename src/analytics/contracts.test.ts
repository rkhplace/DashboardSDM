import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from '../data/repository'
import type { EmployeeRecord } from '../types/workforce'
import { hasContractColumn, projectContracts, shiftMonth } from './contracts'

const base = getPrototypeSnapshot().records[0]
const person = (nip: string, status: string, contractEnd: string | null, division = 'DIV A'): EmployeeRecord => ({ ...base, nip, name: nip, status, contractEnd, division })

describe('projectContracts', () => {
  const records = [
    person('1', 'PKWT Proyek', '2026-08-10'),
    person('2', 'PKWT', '2026-08-31', 'DIV B'),
    person('3', 'PKWT TKB', '2026-12-01'),
    person('4', 'PKWT Umum', '2027-06-30'),
    person('5', 'PKWT', '2026-07-15'),
    person('6', 'PKWT', null),
    person('7', 'Aktif', '2026-08-01'),
  ]

  it('counts PKWT contracts ending per calendar month after the period', () => {
    const result = projectContracts(records, '2026-07-31', 6)
    expect(result.contracts).toBe(6)
    expect(result.missingEndDate).toBe(1)
    expect(result.expired).toBe(1)
    expect(result.endingWithinHorizon).toBe(3)
    expect(result.months.map(month => month.month)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'])
    expect(result.months[0].count).toBe(2)
    expect(result.months[4].count).toBe(1)
    expect(result.divisions[0]).toEqual({ division: 'DIV A', contracts: 5, ending: 2 })
  })

  it('ignores non-PKWT statuses', () => {
    expect(projectContracts(records, '2026-07-31', 12).list.some(item => item.record.nip === '7')).toBe(false)
  })
})

describe('contract helpers', () => {
  it('shifts months across years', () => {
    expect(shiftMonth('2026-11', 3)).toBe('2027-02')
  })

  it('tells files with the column apart from older snapshots', () => {
    expect(hasContractColumn([base])).toBe(false)
    expect(hasContractColumn([{ ...base, contractEnd: null }])).toBe(true)
  })
})
