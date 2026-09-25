import { describe, expect, it } from 'vitest'
import { getPrototypeSnapshot } from '../src/data/repository'
import { answerStatelessChat } from './statelessChat'
import handler from '../api/chat'

describe('Vercel stateless chat', () => {
  it('answers from the submitted snapshot and keeps identity turns out of Gemini history', async () => {
    const snapshot = getPrototypeSnapshot()
    let prompt = ''
    const reply = await answerStatelessChat({ snapshot, message: 'Bandingkan rata-rata usia per divisi.', history: [
      { role: 'user', text: `Bagaimana data ${snapshot.records[0].name}?` },
      { role: 'assistant', text: `${snapshot.records[0].name} bekerja di ${snapshot.records[0].division}.` },
    ] }, async (text, runQuery) => {
      prompt = text
      const result = runQuery?.({ operation: 'average', field: 'age', groupBy: ['division'] }) as { totalGroups: number }
      return { answer: `Ada ${result.totalGroups} divisi untuk dibandingkan.` }
    })
    expect(reply.answer).toContain('10 divisi')
    expect(prompt).not.toContain(snapshot.records[0].name)
    expect(prompt).toContain('query_workforce')
  })

  it('serves the Vercel route and rejects unsupported methods', async () => {
    const unsupported = await handler.fetch(new Request('https://example.test/api/chat'))
    expect(unsupported.status).toBe(405)
    const snapshot = getPrototypeSnapshot()
    const response = await handler.fetch(new Request('https://example.test/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot, message: `Bagaimana data ${snapshot.records[0].name}?` }) }))
    expect(response.status).toBe(200)
    expect((await response.json() as { answer: string }).answer).toContain(snapshot.records[0].name)
  })
})
