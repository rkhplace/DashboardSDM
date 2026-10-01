import { describe, expect, it } from 'vitest'
import { projectRetirement } from '../src/analytics/retirement'
import { getPrototypeSnapshot } from '../src/data/repository'
import { IdentityMap } from './identity'
import { runRetirementProjection, validateRetirementSettings } from './retirementTool'
import { answerStatelessChat } from './statelessChat'

describe('project_retirement tool', () => {
  const snapshot = getPrototypeSnapshot()
  const statuses = [...new Set(snapshot.records.map(record => record.status))].slice(0, 3)

  it('mirrors the dashboard panel for the panel settings and masks people', () => {
    const settings = { age: 56, horizonYears: 5, statuses }
    const panel = projectRetirement(snapshot.records, snapshot.asOf, settings)
    const result = runRetirementProjection({}, snapshot.records, snapshot.asOf, settings, new IdentityMap())
    expect(result.counted).toBe(panel.counted)
    expect(result.retiringWithinHorizon).toBe(panel.candidates.length - panel.overdue)
    expect(result.alreadyPastRetirementAge).toBe(panel.overdue)
    expect(result.excludedEmployees).toBe(snapshot.records.length - panel.counted)
    for (const record of snapshot.records) expect(JSON.stringify(result)).not.toContain(record.nip)
    expect(runRetirementProjection({ age: 58 }, snapshot.records, snapshot.asOf, settings, new IdentityMap()).settings).toMatchObject({ age: 58, sameAsDashboardPanel: false })
  })

  it('accepts only sane panel settings and known statuses', () => {
    expect(validateRetirementSettings({ age: 57, horizonYears: 3, statuses: [statuses[0], 'TIDAK ADA'] }, snapshot.records)).toEqual({ age: 57, horizonYears: 3, statuses: [statuses[0]] })
    expect(validateRetirementSettings({ age: 'x', horizonYears: 99 }, snapshot.records)).toMatchObject({ age: 56, horizonYears: 5 })
  })

  it('passes the panel settings from the dashboard into the prompt and the tool', async () => {
    let prompt = ''
    let retiring = -1
    await answerStatelessChat({ snapshot, message: 'Ada berapa orang yang akan pensiun dalam 5 tahun?', retirement: { age: 56, horizonYears: 5, statuses } }, async (text, tools) => {
      prompt = text
      const result = tools?.projectRetirement?.({}) as { retiringWithinHorizon: number } | undefined
      retiring = result?.retiringWithinHorizon ?? -1
      return { answer: `${retiring} orang.` }
    })
    const panel = projectRetirement(snapshot.records, snapshot.asOf, { age: 56, horizonYears: 5, statuses })
    expect(retiring).toBe(panel.candidates.length - panel.overdue)
    expect(prompt).toContain('PENGATURAN PANEL PROYEKSI PENSIUN SAAT INI: usia pensiun 56 tahun, rentang 5 tahun')
    expect(prompt).toContain('project_retirement')
  })
})
