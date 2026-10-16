import { AGE_GROUPS, TENURE_GROUPS, ageGroup, bandMatrix, countBy, educationOf, fullYears, genderOf, summarize, tenureGroup } from '../analytics/workforce'
import { hasContractColumn, projectContracts } from '../analytics/contracts'
import type { EmployeeRecord } from '../types/workforce'

/** The same aggregates used by the dashboard, calculated from the active session. */
export function buildAggregateContext(records: EmployeeRecord[], asOf: string) {
  return {
    asOf,
    summary: summarize(records, asOf),
    status: countBy(records, record => record.status),
    gender: countBy(records, record => genderOf(record)),
    education: countBy(records, record => educationOf(record)),
    division: countBy(records, record => record.division),
    directorate: countBy(records, record => record.directorate),
    activity: countBy(records, record => record.activity?.trim() || '(KOSONG)'),
    ageGroup: countBy(records, record => ageGroup(fullYears(record.birthDate, asOf))),
    tenureGroup: countBy(records, record => tenureGroup(fullYears(record.joinDate, asOf))),
    band: countBy(records, record => record.band == null ? 'Tidak tersedia' : String(record.band)),
    ageByGender: AGE_GROUPS.map(group => {
      const people = records.filter(record => ageGroup(fullYears(record.birthDate, asOf)) === group)
      return { group, male: people.filter(record => genderOf(record) === 'L').length, female: people.filter(record => genderOf(record) === 'P').length, unknown: people.filter(record => genderOf(record) === 'UNKNOWN').length }
    }),
    tenureByGender: TENURE_GROUPS.map(group => {
      const people = records.filter(record => tenureGroup(fullYears(record.joinDate, asOf)) === group)
      return { group, male: people.filter(record => genderOf(record) === 'L').length, female: people.filter(record => genderOf(record) === 'P').length, unknown: people.filter(record => genderOf(record) === 'UNKNOWN').length }
    }),
    bandByDivision: bandMatrix(records),
    pkwtContracts: contractSummary(records, asOf),
  }
}

/** PKWT contract end summary; counts only, no individual dates. */
function contractSummary(records: EmployeeRecord[], asOf: string) {
  if (!hasContractColumn(records)) return { endDateColumnAvailable: false, pkwt: projectContracts(records, asOf, 1).contracts }
  const [in3, in6, in12] = [3, 6, 12].map(months => projectContracts(records, asOf, months))
  return {
    endDateColumnAvailable: true,
    pkwt: in12.contracts,
    missingEndDate: in12.missingEndDate,
    alreadyEnded: in12.expired,
    endingNext3Months: in3.endingWithinHorizon,
    endingNext6Months: in6.endingWithinHorizon,
    endingNext12Months: in12.endingWithinHorizon,
    endingPerMonthNext12: in12.months.map(month => ({ month: month.month, count: month.count })),
  }
}
