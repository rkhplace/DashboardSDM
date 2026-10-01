import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { getPrototypeSnapshot } from '../src/data/repository'
import { answerStatelessChat } from './statelessChat'
import handler, { rateLimited } from './vercelChat'

describe('Vercel stateless chat', () => {
  it('answers from the submitted snapshot and masks names in Gemini history', async () => {
    const snapshot = getPrototypeSnapshot()
    let prompt = ''
    const reply = await answerStatelessChat({ snapshot, message: 'Bandingkan rata-rata usia per divisi.', history: [
      { role: 'user', text: `Bagaimana data ${snapshot.records[0].name}?` },
      { role: 'assistant', text: `${snapshot.records[0].name} bekerja di ${snapshot.records[0].division}.` },
    ] }, async (text, tools) => {
      prompt = text
      const result = tools?.runQuery?.({ operation: 'average', field: 'age', groupBy: ['division'] }) as { totalGroups: number }
      tools?.applyFilters?.({ status: ['Aktif'] })
      return { answer: `Ada ${result.totalGroups} divisi untuk dibandingkan.` }
    })
    expect(reply.answer).toContain('10 divisi')
    expect(reply.charts?.[0]?.title).toBe('Rata-rata usia per divisi')
    expect(reply.suggestedFilters?.status).toEqual(['Aktif'])
    expect(prompt).not.toContain(snapshot.records[0].name)
    expect(prompt).toContain('Bagaimana data KARYAWAN_1?')
    expect(prompt).toContain('query_workforce')
  })

  it('lets the AI list people by code and restores the real names only in the answer', async () => {
    const snapshot = getPrototypeSnapshot()
    let prompt = ''
    let toolOutput = ''
    const reply = await answerStatelessChat({ snapshot, message: 'Siapa saja nama karyawan berusia di atas 50 tahun?' }, async (text, tools) => {
      prompt = text
      const listed = tools?.listEmployees?.({ filters: [{ field: 'age', operator: 'gte', min: 51 }] }) as { matched: number; rows: { ref: string }[] }
      toolOutput = JSON.stringify(listed)
      return { answer: `Ada ${listed.matched} karyawan: ${listed.rows.map(row => row.ref).join(', ')}.` }
    })
    const older = snapshot.records.filter(record => (Number(snapshot.asOf.slice(0, 4)) - Number(record.birthDate?.slice(0, 4))) > 51)
    expect(older.length).toBeGreaterThan(0)
    for (const record of snapshot.records) {
      expect(prompt).not.toContain(record.nip)
      expect(toolOutput).not.toContain(record.nip)
    }
    expect(toolOutput).not.toContain(older[0].name)
    expect(reply.answer).toContain(older[0].name)
    expect(reply.answer).not.toMatch(/KARYAWAN_\d/)
  })

  it('serves the Vercel route and rejects unsupported methods', async () => {
    const server = createServer(handler)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat`
    try {
      const unsupported = await fetch(url)
      expect(unsupported.status).toBe(405)
      const snapshot = getPrototypeSnapshot()
      const key = process.env.GEMINI_API_KEY
      delete process.env.GEMINI_API_KEY
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot, message: `Bagaimana data ${snapshot.records[0].name}?` }) })
      if (key) process.env.GEMINI_API_KEY = key
      // Every question now goes to the AI; without a key the route reports that instead of a canned answer.
      expect(response.status).toBe(503)
      expect((await response.json() as { code: string }).code).toBe('AI_NOT_CONFIGURED')
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
