import { filterTool } from './chatExtras.ts'
import { listTool } from './identity.ts'
import { workforceTool } from './query.ts'
import { retirementTool } from './retirementTool.ts'

export interface GeminiReply { answer: string; evidence?: { metric: string; value: number }[] }

type Step = { type?: string; name?: string; id?: string; arguments?: unknown; content?: { type?: string; text?: string }[] }

type Runner = (arguments_: unknown) => unknown
/** Tool runners for one chat turn; only the ones provided are offered to the model. */
export interface TurnTools { runQuery?: Runner; applyFilters?: Runner; listEmployees?: Runner; projectRetirement?: Runner }
const TOOLS = [
  { name: 'query_workforce', definition: workforceTool, runner: 'runQuery' },
  { name: 'set_dashboard_filters', definition: filterTool, runner: 'applyFilters' },
  { name: 'list_employees', definition: listTool, runner: 'listEmployees' },
  { name: 'project_retirement', definition: retirementTool, runner: 'projectRetirement' },
] as const
const MAX_ROUNDS = 5

export async function askGemini(prompt: string, tools: TurnTools = {}): Promise<GeminiReply> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'GEMINI_API_KEY belum diatur pada backend.')
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
  const history: unknown[] = [{ type: 'user_input', content: [{ type: 'text', text: prompt }] }]
  const evidence: { metric: string; value: number }[] = []
  const offered = TOOLS.filter(tool => tools[tool.runner])
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // The last round goes out without tools so the model must answer with what it already gathered.
    const finalRound = round === MAX_ROUNDS - 1
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ model, store: false, input: history, ...(offered.length && !finalRound ? { tools: offered.map(tool => tool.definition) } : {}) }),
      signal: AbortSignal.timeout(25000),
    })
    if (!response.ok) {
      // Log Google's own error (status + reason) server-side only; it never contains the API key.
      const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600)
      console.error(`[gemini] HTTP ${response.status} (model ${model}): ${detail}`)
      if (response.status === 429) throw new ServiceError(429, 'AI_RATE_LIMIT', 'Batas penggunaan Gemini tercapai. Coba lagi nanti.')
      if (response.status === 400 || response.status === 401 || response.status === 403) throw new ServiceError(502, 'AI_REJECTED', 'Gemini menolak permintaan. Periksa GEMINI_API_KEY dan GEMINI_MODEL di backend.')
      if (response.status === 404) throw new ServiceError(502, 'AI_MODEL_NOT_FOUND', `Model Gemini "${model}" tidak ditemukan. Periksa GEMINI_MODEL di backend.`)
      throw new ServiceError(502, 'AI_UNAVAILABLE', 'Gemini tidak dapat menjawab saat ini.')
    }
    const result = await response.json() as { steps?: Step[] }
    const steps = result.steps ?? []
    history.push(...steps)
    const calls = steps.filter(step => step.type === 'function_call')
    if (calls.length && offered.length) {
      if (calls.length > 8) throw new ServiceError(502, 'AI_TOOL_LIMIT', 'Analisis membutuhkan terlalu banyak perhitungan sekaligus. Coba pertanyaan yang lebih spesifik.')
      for (const call of calls) {
        const runner = offered.find(tool => tool.name === call.name)?.runner
        const output = runner ? tools[runner]!(call.arguments) : { error: 'Alat tidak dikenal.' }
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
