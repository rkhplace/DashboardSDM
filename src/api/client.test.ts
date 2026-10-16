import { afterEach, expect, it, vi } from 'vitest'
import { parseBody } from '../../server/body'
import { decodeHistory, encodeHistory } from '../data/historyPayload'
import { getPrototypeSnapshot } from '../data/repository'
import { emptyFilters, type EmployeeSnapshot } from '../types/workforce'
import { prepareBody, sendChat } from './client'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

async function bodyJson(body: BodyInit | null | undefined) {
  if (body instanceof Blob) return parseBody(Buffer.from(await body.arrayBuffer())) as Promise<Record<string, unknown>>
  return JSON.parse(String(body)) as Record<string, unknown>
}

function month(snapshot: EmployeeSnapshot, period: string): EmployeeSnapshot {
  return { ...snapshot, period, asOf: `${period}-28`, sourceFile: `${period}.xlsx` }
}

it('sends production chat requests to the Vercel function path', async () => {
  vi.stubEnv('PROD', true)
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ conversationId: 'c', answer: 'ok', evidence: [], limitations: [] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  const retirement = { age: 56, horizonYears: 5, statuses: ['Aktif'] }
  await sendChat('session', getPrototypeSnapshot(), 'Berapa karyawan?', emptyFilters, '', [], undefined, retirement)
  expect(fetchMock).toHaveBeenCalledOnce()
  const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(path).toBe('/api/chat')
  expect((await bodyJson(init.body)).retirement).toEqual(retirement)
})

it('compresses large bodies so far more earlier periods fit, and the server reads them back', async () => {
  const active = { ...getPrototypeSnapshot(), period: '2026-12', asOf: '2026-12-31' }
  const earlier = Array.from({ length: 11 }, (_, index) => month(active, `2026-${String(index + 1).padStart(2, '0')}`))
  const prepared = await prepareBody({ message: 'tren' }, active, earlier)
  expect(prepared.body).toBeInstanceOf(Blob)
  expect(prepared.headers['Content-Encoding']).toBe('gzip')
  expect(prepared.periodsSent).toBe(11)
  const json = await bodyJson(prepared.body as Blob)
  expect(json.message).toBe('tren')
  expect(json.periodsDropped).toBe(0)
  expect(decodeHistory(json.periods, active)?.map(item => item.period)).toHaveLength(11)
})

it('drops the oldest periods only when even the compressed body is too large', async () => {
  const active = { ...getPrototypeSnapshot(), period: '2026-12', asOf: '2026-12-31' }
  const earlier = Array.from({ length: 11 }, (_, index) => month(active, `2026-${String(index + 1).padStart(2, '0')}`))
  // A compressor that shrinks nothing: each period then costs its plain size on the wire.
  const weak = async (text: string) => new Blob([text])
  const perPeriod = JSON.stringify(encodeHistory([earlier[0]], active).periods[0]).length
  const prepared = await prepareBody({ message: 'x'.repeat(4 * 1024 * 1024 - 96 * 1024 - perPeriod * 3) }, active, earlier, weak)
  expect(prepared.periodsSent).toBeGreaterThan(0)
  expect(prepared.periodsSent).toBeLessThan(4)
  expect(prepared.periodsSent + prepared.periodsDropped).toBe(11)
  expect((prepared.body as Blob).size).toBeLessThanOrEqual(4 * 1024 * 1024 - 96 * 1024)
})

it('falls back to a plain body trimmed to 4 MB when the browser cannot compress', async () => {
  const active = { ...getPrototypeSnapshot(), period: '2026-12', asOf: '2026-12-31' }
  const earlier = Array.from({ length: 11 }, (_, index) => month(active, `2026-${String(index + 1).padStart(2, '0')}`))
  const perPeriod = JSON.stringify(encodeHistory([earlier[0]], active).periods[0]).length
  const prepared = await prepareBody({ message: 'x'.repeat(4 * 1024 * 1024 - 96 * 1024 - perPeriod * 3) }, active, earlier, async () => null)
  expect(typeof prepared.body).toBe('string')
  expect(prepared.headers['Content-Type']).toBe('application/json')
  expect(prepared.periodsSent).toBeLessThan(11)
  expect(new Blob([prepared.body as string]).size).toBeLessThanOrEqual(4 * 1024 * 1024 - 96 * 1024)
  const json = await bodyJson(prepared.body as string)
  expect(json.periodsDropped).toBe(prepared.periodsDropped)
})
