import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from '../src/data/repository'
import { chartFromQuery, createTurnTools, resolveFilterSuggestion } from './chatExtras'
import { queryWorkforce } from './query'

const snapshot = getPrototypeSnapshot()

describe('chat extras', () => {
  it('builds a bar chart from grouped query output only', () => {
    const grouped = queryWorkforce({ operation: 'distribution', groupBy: ['status'] }, snapshot.records, snapshot.asOf)
    const chart = chartFromQuery(grouped)!
    expect(chart.title).toBe('Jumlah karyawan per status')
    expect(chart.unit).toBe('orang')
    expect(chart.data[0]).toEqual({ label: 'Aktif', value: 52 })
    expect(chart.data.length).toBeLessThanOrEqual(15)
    const average = chartFromQuery(queryWorkforce({ operation: 'average', field: 'age', groupBy: ['directorate'] }, snapshot.records, snapshot.asOf))!
    expect(average.title).toBe('Rata-rata usia per direktorat')
    expect(average.unit).toBe('tahun')
    expect(chartFromQuery(queryWorkforce({ operation: 'count' }, snapshot.records, snapshot.asOf))).toBeNull()
  })

  it('maps suggested filters onto categories present in the file', () => {
    const result = resolveFilterSuggestion({ status: ['pkwt umum', 'Tidak ada'], gender: ['Perempuan'], ageGroup: ['26-30'] }, snapshot.records)
    expect('filters' in result && result.filters).toMatchObject({ status: ['PKWT Umum'], gender: ['P'], ageGroup: ['26–30'], division: [] })
    expect('rejected' in result && result.rejected).toEqual(['status: Tidak ada'])
    expect(resolveFilterSuggestion({ division: ['DIVISI FIKTIF'] }, snapshot.records)).toHaveProperty('error')
  })

  it('collects charts and the last filter suggestion for one turn', () => {
    const tools = createTurnTools(args => queryWorkforce(args, snapshot.records, snapshot.asOf), snapshot.records)
    tools.runQuery({ operation: 'distribution', groupBy: ['gender'] })
    tools.runQuery({ operation: 'count' })
    tools.applyFilters({ status: ['Aktif'] })
    const extras = tools.extras()
    expect(extras.charts).toHaveLength(1)
    expect(extras.suggestedFilters?.status).toEqual(['Aktif'])
  })
})

describe('grouped counts and answer cleanup', () => {
  it('returns groups for count + groupBy so a chart can be built', () => {
    const output = queryWorkforce({ operation: 'count', groupBy: ['division'] }, snapshot.records, snapshot.asOf)
    const chart = chartFromQuery(output)!
    expect(chart.title).toBe('Jumlah karyawan per divisi')
    expect(chart.data.reduce((sum, item) => sum + item.value, 0)).toBe(202)
  })
})
