import type { EmployeeRecord } from '../types/workforce'
import { monthLabel, monthsBetween, shiftMonth } from './periods'

/** Fixed-term contract statuses: "PKWT", "PKWT Proyek", "PKWT TKB", ... */
export const isContract = (record: Pick<EmployeeRecord, 'status'>) => /pkwt/i.test(record.status)

/** True when the snapshot came from a file with a contract end date column (null = column present, cell empty). */
export const hasContractColumn = (records: Pick<EmployeeRecord, 'contractEnd'>[]) =>
  records.some(record => record.contractEnd !== undefined)

export interface ContractEnding {
  record: EmployeeRecord
  endsOn: string
  /** Whole calendar months from the period month to the end month (0 = ends in the period month). */
  monthsLeft: number
  expired: boolean
}

export interface ContractProjection {
  contracts: number
  withEndDate: number
  missingEndDate: number
  /** End date on or before the period date while the employee is still listed. */
  expired: number
  /** Ends after the period date, up to the last month of the horizon. */
  endingWithinHorizon: number
  list: ContractEnding[]
  months: { month: string; label: string; count: number }[]
  divisions: { division: string; contracts: number; ending: number }[]
}

/** PKWT contracts ending after the period date (asOf), grouped per calendar month for the next `horizonMonths` months. */
export function projectContracts(records: EmployeeRecord[], asOf: string, horizonMonths: number): ContractProjection {
  const period = asOf.slice(0, 7)
  const lastMonth = shiftMonth(period, horizonMonths)
  const contracts = records.filter(isContract)
  const dated = contracts.filter(record => record.contractEnd)
  const list: ContractEnding[] = dated
    .map(record => ({
      record,
      endsOn: record.contractEnd!,
      monthsLeft: monthsBetween(period, record.contractEnd!.slice(0, 7)),
      expired: record.contractEnd! <= asOf,
    }))
    .filter(item => item.expired || item.endsOn.slice(0, 7) <= lastMonth)
    .sort((a, b) => a.endsOn.localeCompare(b.endsOn) || a.record.name.localeCompare(b.record.name, 'id'))
  const upcoming = list.filter(item => !item.expired)
  const months = Array.from({ length: horizonMonths }, (_, index) => {
    const month = shiftMonth(period, index + 1)
    return { month, label: monthLabel(month), count: upcoming.filter(item => item.endsOn.slice(0, 7) === month).length }
  })
  // Contracts ending later in the period month itself (asOf is normally the last day, so this is rare).
  const inPeriod = upcoming.filter(item => item.endsOn.slice(0, 7) === period).length
  if (inPeriod) months[0] = { ...months[0], count: months[0].count + inPeriod }
  const byDivision = new Map<string, { contracts: number; ending: number }>()
  for (const record of contracts) {
    const division = record.division || 'Tidak diketahui'
    const item = byDivision.get(division) ?? { contracts: 0, ending: 0 }
    item.contracts++
    byDivision.set(division, item)
  }
  for (const item of upcoming) byDivision.get(item.record.division || 'Tidak diketahui')!.ending++
  return {
    contracts: contracts.length,
    withEndDate: dated.length,
    missingEndDate: contracts.length - dated.length,
    expired: list.filter(item => item.expired).length,
    endingWithinHorizon: upcoming.length,
    list,
    months,
    divisions: [...byDivision]
      .map(([division, item]) => ({ division, ...item }))
      .filter(item => item.ending > 0)
      .sort((a, b) => b.ending - a.ending || a.division.localeCompare(b.division, 'id')),
  }
}
