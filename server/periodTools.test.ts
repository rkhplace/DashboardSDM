import { describe, expect, it } from 'vitest'
import { projectContracts } from '../src/analytics/contracts'
import { compareSnapshots } from '../src/analytics/trends'
import { encodeHistory } from '../src/data/historyPayload'
import { getPrototypeSnapshot } from '../src/data/repository'
import { emptyFilters, type EmployeeSnapshot } from '../src/types/workforce'
import { runContractProjection } from './contractTool'
import { IdentityMap } from './identity'
import { runQualityCheck } from './qualityTool'
import { answerStatelessChat } from './statelessChat'
import { runTrendQuery } from './trendTool'

const base = getPrototypeSnapshot()
const july: EmployeeSnapshot = {
  ...base,
  records: base.records.map((record, index) => ({
    ...record,
    contractEnd: /pkwt/i.test(record.status) ? (index % 3 ? '2027-01-31' : '2026-09-15') : null,
  })),
}
const june: EmployeeSnapshot = {
  ...july,
  period: '2026-06',
  asOf: '2026-06-30',
  records: [...july.records.slice(2), { ...july.records[0], nip: 'OLD-1', name: 'Karyawan Lama Sekali' }],
}
const august: EmployeeSnapshot = {
  ...july,
  period: '2026-08',
  asOf: '2026-08-31',
  records: [
    ...july.records.slice(1).map((record, index) => (index === 3 ? { ...record, division: 'DIVISI BARU' } : record)),
    { ...july.records[2], nip: 'NEW-1', name: 'Karyawan Baru Sekali', joinDate: '2026-08-10' },
  ],
}
const nips = (value: unknown) =>
  [...july.records, ...june.records, ...august.records].filter(record => JSON.stringify(value).includes(record.nip))

describe('query_trends tool', () => {
  const context = { active: august, history: [june, july], filters: emptyFilters, retirementAge: 56 }

  it('compares the same periods as the dashboard and masks people', () => {
    const panel = compareSnapshots(july, august, emptyFilters, 56)
    const result = runTrendQuery({ operation: 'compare', list: 'left', groupBy: 'division' }, context, new IdentityMap()) as Record<
      string,
      unknown
    > & { people: { rows: { ref: string }[] } }
    expect(result).toMatchObject({
      from: '2026-07',
      to: '2026-08',
      joined: panel.joined.length,
      left: panel.left.length,
      transfers: panel.transfers.length,
      sameAsDashboardPanel: true,
    })
    expect(result.people.rows[0].ref).toMatch(/^KARYAWAN_\d+$/)
    expect(nips(result)).toEqual([])
  })

  it('follows the comparison period chosen in the dashboard and returns a full series', () => {
    const chosen = runTrendQuery({ operation: 'compare' }, { ...context, compareWith: '2026-06' }, new IdentityMap()) as {
      from: string
      sameAsDashboardPanel: boolean
    }
    expect(chosen).toMatchObject({ from: '2026-06', sameAsDashboardPanel: true })
    const series = runTrendQuery({ operation: 'series' }, context, new IdentityMap()) as {
      periods: { period: string; joined: number | null }[]
    }
    expect(series.periods.map(point => point.period)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(series.periods[0].joined).toBeNull()
  })

  it('keeps finished contracts out of turnover and reports contract follow-ups like the panel', () => {
    const pkwt = july.records.filter(record => /pkwt/i.test(record.status))
    expect(pkwt.length).toBeGreaterThan(2)
    const due = new Set(pkwt.slice(0, 3).map(record => record.nip))
    const before: EmployeeSnapshot = {
      ...july,
      records: july.records.map(record => (due.has(record.nip) ? { ...record, contractEnd: '2026-08-20' } : record)),
    }
    const [extended, , ended] = pkwt.slice(0, 3).map(record => record.nip)
    const after: EmployeeSnapshot = {
      ...august,
      records: before.records
        .filter(record => record.nip !== ended)
        .map(record => (record.nip === extended ? { ...record, contractEnd: '2027-08-20' } : record)),
    }
    const panel = compareSnapshots(before, after, emptyFilters, 56)
    const result = runTrendQuery(
      { operation: 'compare', list: 'contracts' },
      { active: after, history: [before], filters: emptyFilters, retirementAge: 56 },
      new IdentityMap(),
    ) as Record<string, unknown> & {
      contractFollowUp: { due: number; outcomes: { outcome: string; count: number }[] }
      people: { rows: { ref: string; outcome: string }[] }
    }
    expect(result).toMatchObject({ left: 1, contractExits: 1, contractEnded: 1, turnoverExits: 0, turnoverPercent: 0 })
    expect(result.contractFollowUp.due).toBe(panel.contractFollowUps.length)
    expect(Object.fromEntries(result.contractFollowUp.outcomes.map(item => [item.outcome, item.count]))).toEqual({
      'Belum ada keputusan': 1,
      'Diangkat tetap': 0,
      Diperpanjang: 1,
      Selesai: 1,
    })
    expect(result.people.rows.map(row => row.outcome).sort()).toEqual(['Belum ada keputusan', 'Diperpanjang', 'Selesai'])
    expect(nips(result)).toEqual([])
  })

  it('says so when only one period is stored', () => {
    expect(runTrendQuery({ operation: 'series' }, { ...context, history: [] }, new IdentityMap())).toHaveProperty('error')
  })
})

describe('project_contracts tool', () => {
  it('mirrors the contract panel and can widen the range up to 48 months', () => {
    const panel = projectContracts(july.records, july.asOf, 6)
    const result = runContractProjection({}, july.records, july.records, july.asOf, 6, new IdentityMap()) as {
      endingWithinRange: number
      months: number
      people: { ref: string }[]
    }
    expect(result.endingWithinRange).toBe(panel.endingWithinHorizon)
    expect(result.months).toBe(6)
    expect(nips(result)).toEqual([])
    expect(runContractProjection({ months: 48 }, july.records, july.records, july.asOf, 6, new IdentityMap())).toMatchObject({
      months: 48,
      sameAsDashboardPanel: false,
    })
    expect(runContractProjection({}, base.records, base.records, base.asOf, 6, new IdentityMap())).toMatchObject({ available: false })
  })
})

describe('check_data_quality tool', () => {
  it('reports tenure column mismatches and joins that predate the earlier period', () => {
    const active = {
      ...august,
      records: august.records.map((record, index) =>
        index === 0
          ? { ...record, sourceTenure: 40 }
          : index === 1
            ? { ...record, nip: 'TYPO-1', name: 'Nama Tidak Ada Sebelumnya' }
            : record,
      ),
    }
    const result = runQualityCheck({}, active, july, emptyFilters, 56, new IdentityMap())
    expect(
      runQualityCheck({ maxExamples: 0 }, active, july, emptyFilters, 56, new IdentityMap()).issues.every(
        issue => issue.examples.length === 0,
      ),
    ).toBe(true)
    expect(result.issues.find(issue => issue.issue === 'Kolom MASKER berbeda dari tanggal masuk')?.count).toBeGreaterThanOrEqual(1)
    expect(result.joinedNeedingCheck?.count).toBe(1)
    expect(nips(result).map(record => record.nip)).not.toContain('TYPO-1')
  })
})

describe('chat with saved periods', () => {
  it('offers the period tools, lists the stored periods and masks a former employee named in the question', async () => {
    let prompt = ''
    let offered: string[] = []
    const reply = await answerStatelessChat(
      {
        snapshot: august,
        message: 'Kenapa Karyawan Lama Sekali tidak ada lagi? Bandingkan juga turnover tiap bulan.',
        periods: encodeHistory([june, july], august),
        compareWith: '2026-07',
        contracts: { months: 12 },
      },
      async (text, tools) => {
        prompt = text
        offered = Object.entries(tools ?? {})
          .filter(([, value]) => typeof value === 'function')
          .map(([key]) => key)
        const series = tools?.queryTrends?.({ operation: 'series' }) as { periods: unknown[] }
        return { answer: `Ada ${series.periods.length} periode.` }
      },
    )
    expect(reply.answer).toBe('Ada 3 periode.')
    expect(offered).toEqual(expect.arrayContaining(['queryTrends', 'projectContracts', 'checkDataQuality', 'projectRetirement']))
    expect(prompt).toContain('PERIODE TERSIMPAN: 2026-06, 2026-07, 2026-08 (aktif 2026-08, pembanding di dashboard 2026-07)')
    expect(prompt).toContain('rentang 12 bulan')
    expect(prompt).not.toContain('Karyawan Lama Sekali')
    expect(prompt).toContain('query_trends')
  })
})
