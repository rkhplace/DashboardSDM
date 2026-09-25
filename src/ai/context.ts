import { AGE_GROUPS, TENURE_GROUPS, ageGroup, bandMatrix, countBy, educationOf, fullYears, genderOf, summarize, tenureGroup } from '../analytics/workforce'
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
  }
}
