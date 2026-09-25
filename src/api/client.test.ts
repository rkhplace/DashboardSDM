import { afterEach, expect, it, vi } from 'vitest'
import { getPrototypeSnapshot } from '../data/repository'
import { emptyFilters } from '../types/workforce'
import { sendChat } from './client'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('sends production chat requests to the Vercel function path', async () => {
  vi.stubEnv('PROD', true)
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ conversationId: 'c', answer: 'ok', evidence: [], limitations: [] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
  await sendChat('session', getPrototypeSnapshot(), 'Berapa karyawan?', emptyFilters, '', [])
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(fetchMock.mock.calls[0][0]).toBe('/api/chat')
})
