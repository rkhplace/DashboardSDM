import { describe, expect, it } from 'vitest'
import { projectContracts } from '../analytics/contracts'
import { projectRetirement } from '../analytics/retirement'
import { compareSnapshots, periodSeries } from '../analytics/trends'
import { getPrototypeSnapshot } from '../data/repository'
import { emptyFilters, type EmployeeSnapshot } from '../types/workforce'
import { buildReport } from './reportData'

const base = getPrototypeSnapshot()
const july: EmployeeSnapshot = {
  ...base,
  records: base.records.map((record, index) =>
    index < 3 ? { ...record, status: 'PKWT', contractEnd: index === 0 ? '2026-08-15' : '2027-02-28' } : { ...record, contractEnd: null },
  ),
}
const august: EmployeeSnapshot = { ...july, period: '2026-08', asOf: '2026-08-31', records: july.records.slice(1) }
const settings = { age: 56, horizonYears: 5, statuses: ['Aktif'] }

describe('report', () => {
  it('includes the contract and trend sections and the contract end column when the data has them', () => {
    const movement = compareSnapshots(july, august, emptyFilters, 56)
    const report = buildReport(august, emptyFilters, august.records, projectRetirement(august.records, august.asOf, settings), settings, {
      contracts: {
        months: 12,
        projection: projectContracts(august.records, august.asOf, 12),
        followUp: { from: july.period, items: movement.contractFollowUps, hasContractColumn: true },
      },
      trend: { series: periodSeries([july, august], emptyFilters, 56), movement },
    })
    expect(report.contracts?.list.rows.length).toBe(2)
    expect(report.contracts?.followUp?.rows.map(row => row[4])).toEqual(['Selesai'])
    expect(report.trend?.periods.rows).toHaveLength(2)
    expect(report.trend?.movements.rows.map(row => [row[0], row[6]])).toEqual([['Keluar', 'Kontrak selesai']])
    expect(report.kpis.map(([key]) => key)).toEqual(expect.arrayContaining(['PKWT berakhir ≤1 tahun', 'Turnover non-PKWT vs Jul 2026']))
    const column = report.employees.headers.indexOf('Selesai kontrak')
    expect(column).toBeGreaterThan(0)
    expect(report.employees.rows[0][column]).toBe('2027-02-28')
  })

  it('leaves the sections out when there is no contract column or only one period', () => {
    const report = buildReport(base, emptyFilters, base.records, projectRetirement(base.records, base.asOf, settings), settings)
    expect(report.contracts).toBeNull()
    expect(report.trend).toBeNull()
    expect(report.employees.headers).not.toContain('Selesai kontrak')
  })
})
