import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { getPrototypeSnapshot } from '../src/data/repository'
import { answerStatelessChat } from './statelessChat'
import handler, { rateLimited } from './vercelChat'

describe('Vercel stateless chat', () => {
  it('answers from the submitted snapshot and keeps identity turns out of Gemini history', async () => {
    const snapshot = getPrototypeSnapshot()
    let prompt = ''
    const reply = await answerStatelessChat({ snapshot, message: 'Bandingkan rata-rata usia per divisi.', history: [
      { role: 'user', text: `Bagaimana data ${snapshot.records[0].name}?` },
      { role: 'assistant', text: `${snapshot.records[0].name} bekerja di ${snapshot.records[0].division}.` },
    ] }, async (text, runQuery, applyFilters) => {
      prompt = text
      const result = runQuery?.({ operation: 'average', field: 'age', groupBy: ['division'] }) as { totalGroups: number }
      applyFilters?.({ status: ['Aktif'] })
      return { answer: `Ada ${result.totalGroups} divisi untuk dibandingkan.` }
    })
    expect(reply.answer).toContain('10 divisi')
    expect(reply.charts?.[0]?.title).toBe('Rata-rata usia per divisi')
    expect(reply.suggestedFilters?.status).toEqual(['Aktif'])
    expect(prompt).not.toContain(snapshot.records[0].name)
    expect(prompt).toContain('query_workforce')
  })

  it('serves the Vercel route and rejects unsupported methods', async () => {
    const server = createServer(handler)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat`
    try {
      const unsupported = await fetch(url)
      expect(unsupported.status).toBe(405)
      const snapshot = getPrototypeSnapshot()
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot, message: `Bagaimana data ${snapshot.records[0].name}?` }) })
      expect(response.status).toBe(200)
      expect((await response.json() as { answer: string }).answer).toContain(snapshot.records[0].name)
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })

  it('rejects cross-origin callers', async () => {
    const server = createServer(handler)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat`
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' })
      expect(response.status).toBe(403)
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })

  it('rate limits a single client per window', () => {
    const now = 1_000_000
    const results = Array.from({ length: 25 }, () => rateLimited('203.0.113.9', now))
    expect(results.slice(0, 20).every(limited => !limited)).toBe(true)
    expect(results.slice(20).every(Boolean)).toBe(true)
    expect(rateLimited('203.0.113.9', now + 61_000)).toBe(false)
  })
})
