import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from '../data/repository'
import { emptyFilters, type EmployeeRecord, type EmployeeSnapshot } from '../types/workforce'
import { monthsBetween } from './periods'
import { compareSnapshots, matchNipChanges, missingMonths, periodSeries, personKey } from './trends'

const base = getPrototypeSnapshot()
const july: EmployeeSnapshot = {
  ...base,
  records: base.records.slice(0, 6).map((record, index) => (index === 2 ? { ...record, band: 3 } : record)),
}

function august(): EmployeeSnapshot {
  const [a, b, c, d, e] = july.records
  const records: EmployeeRecord[] = [
    a,
    { ...b, division: `${b.division} BARU` },
    { ...c, band: 4 },
    { ...d, status: d.status === 'Aktif' ? 'PKWT' : 'Aktif' },
    // e stays; f left; g is new
    e,
    { ...july.records[0], nip: 'NEW-001', name: 'Karyawan Baru', joinDate: '2026-08-01' },
  ]
  return { period: '2026-08', asOf: '2026-08-31', sourceFile: 'agustus.xlsx', records }
}

describe('compareSnapshots', () => {
  it('detects joins, exits, transfers, band and status changes by NIP', () => {
    const result = compareSnapshots(july, august(), emptyFilters, 56)
    expect(result.joined.map(record => record.nip)).toEqual(['NEW-001'])
    expect(result.left.map(item => item.record.nip)).toEqual([july.records[5].nip])
    expect(result.transfers.map(item => item.after.nip)).toEqual([july.records[1].nip])
    expect(result.bandChanges).toHaveLength(1)
    expect(result.bandChanges[0].direction).toBe('naik')
    expect(result.statusChanges.map(item => item.after.nip)).toEqual([july.records[3].nip])
    expect(result.headcountBefore).toBe(6)
    expect(result.headcountAfter).toBe(6)
    expect(result.turnover).toBeCloseTo(1 / 6)
    expect(result.staleJoins).toEqual([])
  })

  it('flags joins whose join date predates the earlier period', () => {
    const next = august()
    next.records[5] = { ...next.records[5], joinDate: '2023-11-01' }
    expect(compareSnapshots(july, next, emptyFilters, 56).staleJoins).toEqual(['NEW-001'])
  })

  it('labels a PKWT exit after the contract date as "kontrak selesai" and leaves it out of turnover', () => {
    const before = {
      ...july,
      records: july.records.map((record, index) => (index === 5 ? { ...record, status: 'PKWT', contractEnd: '2026-08-15' } : record)),
    }
    const result = compareSnapshots(before, august(), emptyFilters, 56)
    expect(result.left[0].reason).toBe('Kontrak selesai')
    expect(result.left).toHaveLength(1)
    expect(result.contractEnded).toBe(1)
    expect(result.turnoverExits).toBe(0)
    expect(result.turnover).toBe(0)
    expect(periodSeries([before, august()], emptyFilters, 56)[1]).toMatchObject({ left: 1, contractExits: 1, turnover: 0 })
  })

  it('leaves a PKWT who quits before the contract ends (or has no end date) out of turnover too', () => {
    for (const contractEnd of ['2027-03-31', null]) {
      const before = {
        ...july,
        records: july.records.map((record, index) => (index === 5 ? { ...record, status: 'PKWT', contractEnd } : record)),
      }
      const result = compareSnapshots(before, august(), emptyFilters, 56)
      expect(result.left[0].reason).toBe('PKWT berhenti')
      expect(result).toMatchObject({ contractExits: 1, contractEnded: 0, turnoverExits: 0, turnover: 0 })
    }
  })

  it('divides turnover by the average non-PKWT headcount', () => {
    // Two PKWT stay in both periods; the permanent employee f leaves.
    const asPkwt = (record: EmployeeRecord) => ({ ...record, status: 'PKWT', contractEnd: '2027-12-31' })
    const before = { ...july, records: july.records.map((record, index) => (index < 2 ? asPkwt(record) : record)) }
    const next = august()
    const after = {
      ...next,
      records: next.records.map(record =>
        record.nip === july.records[0].nip || record.nip === july.records[1].nip ? asPkwt(record) : record,
      ),
    }
    const result = compareSnapshots(before, after, emptyFilters, 56)
    expect(result.turnoverBase).toBe(4)
    expect(result.turnoverExits).toBe(1)
    expect(result.turnover).toBeCloseTo(1 / 4)
  })

  it('does not call an exit "kontrak selesai" for a permanent employee with a stray contract date', () => {
    const before = {
      ...july,
      records: july.records.map((record, index) => (index === 5 ? { ...record, status: 'Aktif', contractEnd: '2026-08-15' } : record)),
    }
    expect(compareSnapshots(before, august(), emptyFilters, 56).left[0].reason).not.toBe('Kontrak selesai')
  })

  it('tracks the follow-up of every contract due by the later period', () => {
    const contract = (index: number, contractEnd: string) => ({ ...july.records[index], status: 'PKWT', contractEnd })
    const before: EmployeeSnapshot = {
      ...july,
      records: [
        contract(0, '2026-08-10'), // extended
        contract(1, '2026-08-20'), // appointed (same NIP, now permanent)
        contract(2, '2026-08-31'), // still PKWT, same date: no decision recorded
        contract(3, '2026-12-31'), // not due yet
        july.records[4],
        contract(5, '2026-07-31'), // left
      ],
    }
    const after: EmployeeSnapshot = {
      period: '2026-08',
      asOf: '2026-08-31',
      sourceFile: '',
      records: [
        { ...before.records[0], contractEnd: '2027-08-10' },
        { ...before.records[1], status: 'Aktif', contractEnd: null },
        before.records[2],
        before.records[3],
        before.records[4],
      ],
    }
    const result = compareSnapshots(before, after, emptyFilters, 56)
    expect(result.contractFollowUps.map(item => [item.before.nip, item.outcome])).toEqual([
      [july.records[5].nip, 'Selesai'],
      [july.records[0].nip, 'Diperpanjang'],
      [july.records[1].nip, 'Diangkat tetap'],
      [july.records[2].nip, 'Belum ada keputusan'],
    ])
    expect(result.contractEnded).toBe(1)
    expect(result.turnover).toBe(0)
  })

  it('treats a move into the filtered division as a transfer, not a join', () => {
    const next = august()
    const target = next.records[1].division
    const result = compareSnapshots(july, next, { ...emptyFilters, division: [target] }, 56)
    expect(result.joined).toHaveLength(0)
    expect(result.transfers).toHaveLength(1)
    expect(result.headcountBefore).toBe(0)
    expect(result.headcountAfter).toBe(1)
  })
})

describe('periodSeries', () => {
  it('orders periods and leaves the first comparison empty', () => {
    const series = periodSeries([august(), july], emptyFilters, 56)
    expect(series.map(point => point.period)).toEqual(['2026-07', '2026-08'])
    expect(series[0].joined).toBeNull()
    expect(series[1]).toMatchObject({ headcount: 6, joined: 1, left: 1 })
  })
})

describe('NIP changes on appointment', () => {
  const pkwt = {
    ...july.records[1],
    nip: 'PB.202301001',
    name: 'Siti Rahma, S.T.',
    status: 'PKWT Umum',
    birthDate: '1995-04-12',
    genderCode: 2,
  }
  const before: EmployeeSnapshot = { ...july, records: [...july.records, pkwt] }

  it('counts a new NIP with the same name and birth date as a NIP change, not a join and an exit', () => {
    const after: EmployeeSnapshot = {
      period: '2026-08',
      asOf: '2026-08-31',
      sourceFile: '',
      records: [...july.records, { ...pkwt, nip: 'PP.202608001', name: 'SITI RAHMA', status: 'Aktif' }],
    }
    const result = compareSnapshots(before, after, emptyFilters, 56)
    expect(result.joined).toHaveLength(0)
    expect(result.left).toHaveLength(0)
    expect(result.turnover).toBe(0)
    expect(result.nipChanges.map(pair => [pair.before.nip, pair.after.nip])).toEqual([['PB.202301001', 'PP.202608001']])
    // Appointment under a new NIP also closes the contract follow-up once the contract date has passed.
    const due: EmployeeSnapshot = {
      ...before,
      records: before.records.map(record => (record.nip === pkwt.nip ? { ...record, contractEnd: '2026-08-31' } : record)),
    }
    expect(compareSnapshots(due, after, emptyFilters, 56).contractFollowUps.map(item => [item.after?.nip, item.outcome])).toEqual([
      ['PP.202608001', 'Diangkat tetap'],
    ])
    expect(result.statusChanges.map(pair => pair.after.status)).toEqual(['Aktif'])
  })

  it('does not guess when the name is shared, the birth date differs or the gender differs', () => {
    const twin = { ...pkwt, nip: 'PB.202301002' }
    expect(matchNipChanges([pkwt, twin], [{ ...pkwt, nip: 'PP.1' }])).toEqual([])
    expect(matchNipChanges([pkwt], [{ ...pkwt, nip: 'PP.1', birthDate: '1995-04-13' }])).toEqual([])
    expect(matchNipChanges([pkwt], [{ ...pkwt, nip: 'PP.1', genderCode: 1 }])).toEqual([])
    expect(personKey({ name: 'Budi  Santoso, S.Kom.', birthDate: '1990-01-01' })).toBe('budi santoso|1990-01-01')
    expect(personKey({ name: 'Budi', birthDate: null })).toBeNull()
  })
})

describe('periods that are not consecutive', () => {
  it('reports the month span, per-month turnover and the missing months', () => {
    const october: EmployeeSnapshot = { ...august(), period: '2026-10', asOf: '2026-10-31' }
    const series = periodSeries([july, october], emptyFilters, 56)
    expect(series[1].spanMonths).toBe(3)
    expect(series[1].monthlyTurnover).toBeCloseTo(series[1].turnover! / 3)
    expect(compareSnapshots(july, october, emptyFilters, 56).spanMonths).toBe(3)
    expect(missingMonths(['2026-01', '2026-04', '2026-02'])).toEqual(['2026-03'])
    expect(missingMonths(['2025-11', '2026-02'])).toEqual(['2025-12', '2026-01'])
    expect(monthsBetween('2025-12', '2026-01')).toBe(1)
  })
})
