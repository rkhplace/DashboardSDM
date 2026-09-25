import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from '../src/data/repository'
import { queryWorkforce, workforceCatalog } from './query'
import { keepQuestionLocal } from './localAnswers'

describe('queryWorkforce', () => {
  it('calculates combinations and averages from the uploaded records', () => {
    const snapshot = getPrototypeSnapshot()
    const { records, asOf } = snapshot
    const average = queryWorkforce({ operation: 'average', field: 'age', filters: [{ field: 'status', operator: 'eq', value: 'Staf Komisaris' }] }, records, asOf)
    expect(average).toMatchObject({ matched: 4, validCount: 4, average: 36 })
    const cross = queryWorkforce({ operation: 'distribution', groupBy: ['division', 'gender'], filters: [{ field: 'age', operator: 'between', min: 26, max: 30 }] }, records, asOf)
    expect(cross).toMatchObject({ matched: 52 })
    expect('groups' in cross && Array.isArray(cross.groups) ? cross.groups.reduce((sum, item) => sum + item.count, 0) : null).toBe(52)
    const activity = queryWorkforce({ operation: 'count', filters: [{ field: 'activity', operator: 'eq', value: 'FRONT LINER' }] }, records, asOf)
    expect(activity).toMatchObject({ matched: 36 })
    const groupedAverage = queryWorkforce({ operation: 'average', field: 'age', groupBy: ['division'] }, records, asOf)
    expect(groupedAverage).toMatchObject({ totalGroups: 10, truncated: false })
    const firstGroup = 'groups' in groupedAverage && Array.isArray(groupedAverage.groups) ? groupedAverage.groups[0] : null
    expect(firstGroup && 'average' in firstGroup ? firstGroup.average : null).toBeGreaterThan(0)
  })

  it('adapts to category values in a different uploaded file', () => {
    const snapshot = getPrototypeSnapshot()
    const records = snapshot.records.slice(0, 3).map(record => ({ ...record, activity: 'LAPANGAN BARU', status: 'Kontrak Khusus' }))
    expect(workforceCatalog(records, snapshot.asOf).categories.activity).toContain('LAPANGAN BARU')
    expect(queryWorkforce({ operation: 'count', filters: [{ field: 'status', operator: 'eq', value: 'Kontrak Khusus' }] }, records, snapshot.asOf)).toMatchObject({ population: 3, matched: 3 })
    expect(queryWorkforce({ operation: 'count', filters: [{ field: 'name', operator: 'eq', value: 'A' }] }, records, snapshot.asOf)).toHaveProperty('error')
  })

  it('allows analytical questions phrased with siapa while keeping employee names local', () => {
    const records = getPrototypeSnapshot().records
    expect(keepQuestionLocal('Siapa divisi dengan rata-rata usia tertinggi?', records)).toBe(false)
    expect(keepQuestionLocal('Siapa saja karyawan berstatus Aktif?', records)).toBe(true)
    expect(keepQuestionLocal(`Bagaimana data ${records[0].name}?`, records)).toBe(true)
  })
})
