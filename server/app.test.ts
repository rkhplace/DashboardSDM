import { type AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from '../src/data/repository'
import { createApp } from './app'

describe('AI session API', () => {
  it('sends aggregate questions to AI with a query tool scoped to the active file and filter', async () => {
    const prompts: string[] = []
    const server = createApp(async (prompt, runQuery) => {
      prompts.push(prompt)
      const result = runQuery?.({ operation: 'average', field: 'age', filters: [{ field: 'status', operator: 'eq', value: 'Staf Komisaris' }] }) as { average: number; matched: number }
      return { answer: `Rata-rata usia ${result.matched} staf komisaris adalah ${result.average} tahun.`, evidence: [{ metric: 'averageAge', value: result.average }] }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const base = `http://127.0.0.1:${port}/api/v1`
    const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    try {
      const snapshot = getPrototypeSnapshot()
      const created = await post('/sessions', snapshot)
      expect(created.status).toBe(201)
      const { sessionId } = await created.json() as { sessionId: string }
      const first = await post(`/sessions/${sessionId}/ai/chat`, { message: 'Rata-rata umur staf komisaris berapa?' })
      expect(first.status).toBe(200)
      const reply = await first.json() as { conversationId: string; answer: string; evidence: { metric: string; value: number }[] }
      expect(reply.answer).toContain('36')
      expect(reply.evidence).toEqual([{ metric: 'averageAge', value: 36, period: snapshot.period }])
      expect(prompts).toHaveLength(1)
      expect(prompts[0]).toContain('Staf Komisaris')
      expect(prompts[0]).not.toContain(snapshot.records[0].name)
      expect(prompts[0]).not.toContain(snapshot.records[0].nip)

      const filtered = await post(`/sessions/${sessionId}/ai/chat`, { filters: { division: ['DEKOM'] }, message: 'Bagaimana rata-rata usia staf komisaris?' })
      expect(filtered.status).toBe(200)
      expect(prompts).toHaveLength(2)
      expect(prompts[1]).toContain('"total":1')

      const personal = await post(`/sessions/${sessionId}/ai/chat`, { message: `Bagaimana data ${snapshot.records[0].name}?` })
      expect(personal.status).toBe(200)
      const personalReply = await personal.json() as { answer: string; conversationId: string }
      expect(personalReply.answer).toContain(snapshot.records[0].name)
      expect(prompts).toHaveLength(2)

      const followup = await post(`/sessions/${sessionId}/ai/chat`, { conversationId: reply.conversationId, message: 'Bagaimana dibandingkan dengan semua karyawan?' })
      expect(followup.status).toBe(200)
      expect(prompts[2]).toContain('Rata-rata usia 4 staf komisaris')

      const afterPersonal = await post(`/sessions/${sessionId}/ai/chat`, { conversationId: personalReply.conversationId, message: 'Jelaskan sebaran status.' })
      expect(afterPersonal.status).toBe(200)
      expect(prompts[3]).not.toContain(snapshot.records[0].name)
      expect(prompts[3]).not.toContain(snapshot.records[0].nip)

      const deleted = await fetch(`${base}/sessions/${sessionId}`, { method: 'DELETE' })
      expect(deleted.status).toBe(204)
      expect((await post(`/sessions/${sessionId}/ai/chat`, { message: 'Berapa totalnya?' })).status).toBe(404)
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
