import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from './repository'
import { decodeHistory, encodeHistory, fitHistory } from './historyPayload'

const july = getPrototypeSnapshot()
const june = { ...july, period: '2026-06', asOf: '2026-06-30', records: july.records.slice(0, 50).map((record, index) => index === 0 ? { ...record, nip: 'GONE-1', name: 'Pegawai Lama' } : record) }
const august = { ...july, period: '2026-08', asOf: '2026-08-31', records: july.records.slice(1) }

describe('period history payload', () => {
  it('round-trips earlier periods and sends names only for people no longer present', () => {
    const payload = encodeHistory([august, june, july], august)
    expect(payload.periods.map(item => item.period)).toEqual(['2026-06', '2026-07'])
    const text = JSON.stringify(payload)
    expect(text).toContain('Pegawai Lama')
    expect(text).toContain(july.records[0].name) // left before August
    expect(text).not.toContain(july.records[5].name) // still in August, resolved on the server
    const decoded = decodeHistory(JSON.parse(text), august)!
    expect(decoded.map(item => item.records.length)).toEqual([50, july.records.length])
    expect(decoded[1].records[5]).toMatchObject({ nip: july.records[5].nip, name: july.records[5].name, division: july.records[5].division, birthDate: july.records[5].birthDate })
  })

  it('rejects malformed payloads and periods that are not earlier than the active one', () => {
    const payload = encodeHistory([june], august)
    expect(decodeHistory({ ...payload, fields: ['nip'] }, august)).toBeNull()
    expect(decodeHistory({ ...payload, periods: [{ ...payload.periods[0], period: '2026-09', asOf: '2026-09-30' }] }, august)).toBeNull()
    expect(decodeHistory({ ...payload, periods: [{ ...payload.periods[0], rows: [['', null]] }] }, august)).toBeNull()
    expect(decodeHistory(undefined, august)).toEqual([])
  })

  it('drops the oldest periods first to fit the size budget', () => {
    const payload = encodeHistory([june, july], august)
    const { payload: fitted, dropped } = fitHistory(payload, JSON.stringify(payload).length - 10)
    expect(dropped).toBe(1)
    expect(fitted.periods.map(item => item.period)).toEqual(['2026-07'])
  })

  it('fits exactly: every budget keeps the most periods that still fit', () => {
    const payload = encodeHistory([june, july], august)
    const full = JSON.stringify(payload).length
    for (const budget of [0, 10, full - JSON.stringify(payload.periods[1]).length - 1, full - 1, full, full + 5]) {
      const { payload: fitted, dropped } = fitHistory(payload, budget)
      const size = JSON.stringify(fitted).length
      expect(size <= budget || fitted.periods.length === 0).toBe(true)
      if (dropped > 0) expect(JSON.stringify({ ...payload, periods: payload.periods.slice(dropped - 1) }).length).toBeGreaterThan(budget)
    }
  })
})
