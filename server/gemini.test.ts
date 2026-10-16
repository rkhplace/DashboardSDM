import { afterEach, describe, expect, it, vi } from 'vitest'
import { askGemini, toolSafe } from './gemini'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
process.env.GEMINI_RETRY_DELAY_MS = '0'

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

it('retries a 503 with backoff, then reports the status code if Google is still busy', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  let calls = 0
  vi.stubGlobal('fetch', vi.fn(async () => {
    calls++
    return calls === 1
      ? new Response('{"error":{"code":503,"status":"UNAVAILABLE"}}', { status: 503 })
      : new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Pulih.' }] }] }), { status: 200 })
  }))
  expect((await askGemini('tanya')).answer).toBe('Pulih.')
  expect(calls).toBe(2)

  vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })))
  await expect(askGemini('tanya')).rejects.toMatchObject({ code: 'AI_BUSY', message: expect.stringContaining('kode 503') })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('teapot', { status: 418 })))
  await expect(askGemini('tanya')).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', message: expect.stringContaining('kode 418') })
})

it('switches to GEMINI_FALLBACK_MODEL when the main model stays overloaded', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  vi.stubEnv('GEMINI_FALLBACK_MODEL', 'backup-model')
  const models: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const { model } = JSON.parse(String(init.body)) as { model: string }
    models.push(model)
    return model === 'backup-model'
      ? new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Dari cadangan.' }] }] }), { status: 200 })
      : new Response('busy', { status: 503 })
  }))
  expect((await askGemini('tanya')).answer).toBe('Dari cadangan.')
  expect(models).toEqual(['gemini-3.1-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite', 'backup-model'])
})

describe('tool output sanitising', () => {
  it('strips control characters and caps long text from the Excel file', () => {
    const long = 'A'.repeat(500)
    const result = toolSafe({ unit: 'DIV\u0000 A\nB', nested: [{ note: long }], count: 3, flag: null }) as { unit: string; nested: { note: string }[]; count: number; flag: null }
    expect(result.unit).toBe('DIV A B')
    expect(result.nested[0].note.length).toBe(201)
    expect(result.count).toBe(3)
    expect(result.flag).toBeNull()
  })
})

it('reports a failing tool to Gemini instead of failing the whole answer', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const results: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { input: { type: string; result?: { text: string }[] }[] }
    const result = body.input.find(step => step.type === 'function_result')
    if (result) results.push(result.result![0].text)
    const steps = result
      ? [{ type: 'model_output', content: [{ type: 'text', text: 'Angkanya belum tersedia.' }] }]
      : [{ type: 'function_call', name: 'query_workforce', id: 'c1', arguments: { operation: 'count' } }]
    return new Response(JSON.stringify({ steps }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
  const reply = await askGemini('tanya', { runQuery: () => { throw new Error('bug') } })
  expect(reply.answer).toBe('Angkanya belum tersedia.')
  expect(results[0]).toContain('gagal dijalankan')
})

it('keeps trying through a short overload before giving up', async () => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  let calls = 0
  vi.stubGlobal('fetch', vi.fn(async () => {
    calls++
    return calls <= 2
      ? new Response('{"error":{"code":503,"status":"UNAVAILABLE"}}', { status: 503, headers: { 'Retry-After': '0' } })
      : new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Akhirnya.' }] }] }), { status: 200 })
  }))
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  expect((await askGemini('tanya')).answer).toBe('Akhirnya.')
  expect(calls).toBe(3)
})
