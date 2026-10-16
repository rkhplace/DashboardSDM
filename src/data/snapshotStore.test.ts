import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from './repository'
import { createMemoryStore } from './snapshotStore'

describe('memory snapshot store', () => {
  it('keeps one snapshot per period, sorted oldest first', async () => {
    const store = createMemoryStore()
    const july = getPrototypeSnapshot()
    const august = { ...july, period: '2026-08', asOf: '2026-08-31', sourceFile: 'agustus.xlsx', records: july.records.slice(0, 10) }
    await store.save(august)
    await store.save(july)
    await store.save({ ...august, sourceFile: 'agustus-revisi.xlsx' })
    const periods = await store.list()
    expect(periods.map(item => item.period)).toEqual(['2026-07', '2026-08'])
    expect(periods[1]).toMatchObject({ sourceFile: 'agustus-revisi.xlsx', rowCount: 10 })
    expect((await store.getAll()).map(item => item.period)).toEqual(['2026-07', '2026-08'])
    await store.remove('2026-07')
    expect(await store.get('2026-07')).toBeNull()
    expect((await store.list()).map(item => item.period)).toEqual(['2026-08'])
  })
})
