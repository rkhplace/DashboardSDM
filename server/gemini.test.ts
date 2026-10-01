import { afterEach, expect, it, vi } from 'vitest'
import { askGemini } from './gemini'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('drops the tools on the last round so a looping model still answers', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  const bodies: { tools?: unknown[] }[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { tools?: unknown[] }
    bodies.push(body)
    const steps = body.tools
      ? [{ type: 'function_call', name: 'query_workforce', id: `c${bodies.length}`, arguments: { operation: 'count' } }]
      : [{ type: 'model_output', content: [{ type: 'text', text: 'Jawaban akhir.' }] }]
    return new Response(JSON.stringify({ steps }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
  const reply = await askGemini('tanya', { runQuery: () => ({ operation: 'count', matched: 3 }) })
  expect(reply.answer).toBe('Jawaban akhir.')
  expect(bodies.length).toBe(5)
  expect(bodies.slice(0, 4).every(body => Array.isArray(body.tools))).toBe(true)
  expect(bodies[4].tools).toBeUndefined()
})
