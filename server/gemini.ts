import { workforceTool } from './query.ts'

export interface GeminiReply { answer: string; evidence?: { metric: string; value: number }[] }

type Step = { type?: string; name?: string; id?: string; arguments?: unknown; content?: { type?: string; text?: string }[] }

export async function askGemini(prompt: string, runQuery?: (arguments_: unknown) => unknown): Promise<GeminiReply> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'GEMINI_API_KEY belum diatur pada backend.')
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
  const history: unknown[] = [{ type: 'user_input', content: [{ type: 'text', text: prompt }] }]
  const evidence: { metric: string; value: number }[] = []
  for (let round = 0; round < 3; round++) {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ model, store: false, input: history, ...(runQuery ? { tools: [workforceTool] } : {}) }),
      signal: AbortSignal.timeout(25000),
    })
    if (!response.ok) {
      if (response.status === 429) throw new ServiceError(429, 'AI_RATE_LIMIT', 'Batas penggunaan Gemini tercapai. Coba lagi nanti.')
      throw new ServiceError(502, 'AI_UNAVAILABLE', 'Gemini tidak dapat menjawab saat ini.')
    }
    const result = await response.json() as { steps?: Step[] }
    const steps = result.steps ?? []
    history.push(...steps)
    const calls = steps.filter(step => step.type === 'function_call')
    if (calls.length && runQuery) {
      if (calls.length > 6) throw new ServiceError(502, 'AI_TOOL_LIMIT', 'Analisis membutuhkan terlalu banyak perhitungan sekaligus. Coba pertanyaan yang lebih spesifik.')
      for (const call of calls) {
        const output = call.name === 'query_workforce' ? runQuery(call.arguments) : { error: 'Alat tidak dikenal.' }
        if (output && typeof output === 'object' && !Array.isArray(output)) {
          const data = output as Record<string, unknown>
          const metric = typeof data.operation === 'string' ? data.operation : 'query'
          const value = typeof data.average === 'number' ? data.average : data.matched
          if (typeof value === 'number') evidence.push({ metric, value })
        }
        history.push({ type: 'function_result', name: call.name, call_id: call.id, result: [{ type: 'text', text: JSON.stringify(output) }] })
      }
      continue
    }
    const answer = steps.filter(step => step.type === 'model_output')
      .flatMap(step => step.content ?? []).filter(part => part.type === 'text').map(part => part.text ?? '').join('\n').trim()
    if (answer) return { answer, evidence }
    throw new ServiceError(502, 'AI_EMPTY_RESPONSE', 'Gemini tidak menghasilkan jawaban teks.')
  }
  throw new ServiceError(502, 'AI_TOOL_LIMIT', 'Analisis membutuhkan terlalu banyak langkah. Coba pertanyaan yang lebih spesifik.')
}

export class ServiceError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
