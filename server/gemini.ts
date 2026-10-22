import { filterTool } from './chatExtras.ts'
import { contractTool } from './contractTool.ts'
import { listTool } from './identity.ts'
import { qualityTool } from './qualityTool.ts'
import { workforceTool } from './query.ts'
import { retirementTool } from './retirementTool.ts'
import { trendTool } from './trendTool.ts'

export interface GeminiReply {
  answer: string
  evidence?: { metric: string; value: number }[]
}

type Step = { type?: string; name?: string; id?: string; arguments?: unknown; content?: { type?: string; text?: string }[] }

type Runner = (arguments_: unknown) => unknown
/** Tool runners for one chat turn; only the ones provided are offered to the model. */
export interface TurnTools {
  runQuery?: Runner
  applyFilters?: Runner
  listEmployees?: Runner
  projectRetirement?: Runner
  projectContracts?: Runner
  queryTrends?: Runner
  checkDataQuality?: Runner
}
const TOOLS = [
  { name: 'query_workforce', definition: workforceTool, runner: 'runQuery' },
  { name: 'set_dashboard_filters', definition: filterTool, runner: 'applyFilters' },
  { name: 'list_employees', definition: listTool, runner: 'listEmployees' },
  { name: 'project_retirement', definition: retirementTool, runner: 'projectRetirement' },
  { name: 'project_contracts', definition: contractTool, runner: 'projectContracts' },
  { name: 'query_trends', definition: trendTool, runner: 'queryTrends' },
  { name: 'check_data_quality', definition: qualityTool, runner: 'checkDataQuality' },
] as const
const MAX_ROUNDS = 5
const RETRYABLE = new Set([500, 502, 503, 504])
/** Pauses before each retry, as multiples of GEMINI_RETRY_DELAY_MS (default 1 s): about 1 s, then 3 s. */
const RETRY_STEPS = [1, 3]

/** Waits as long as Google asks (Retry-After, capped at 8 s) or the next backoff step, with a little jitter. */
function retryDelay(response: Response, attempt: number): number {
  const base = Number(process.env.GEMINI_RETRY_DELAY_MS ?? 1000)
  const asked = Number(response.headers.get('retry-after'))
  if (Number.isFinite(asked) && asked > 0) return Math.min(asked * 1000, 8000)
  const step = base * RETRY_STEPS[Math.min(attempt, RETRY_STEPS.length - 1)]
  return Math.round(step * (0.8 + Math.random() * 0.4))
}

export async function askGemini(prompt: string, tools: TurnTools = {}): Promise<GeminiReply> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new ServiceError(503, 'AI_NOT_CONFIGURED', 'GEMINI_API_KEY belum diatur pada backend.')
  let model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
  const history: unknown[] = [{ type: 'user_input', content: [{ type: 'text', text: prompt }] }]
  const evidence: { metric: string; value: number }[] = []
  const offered = TOOLS.filter(tool => tools[tool.runner])
  // Gemini 3 reasons at "high" when no level is given, which can take many seconds per round. Answers here come from
  // tool results, so "low" is enough; GEMINI_THINKING_LEVEL overrides it, and an empty value sends no level at all.
  const thinking = (process.env.GEMINI_THINKING_LEVEL ?? 'low').trim()
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // The last round goes out without tools so the model must answer with what it already gathered.
    const finalRound = round === MAX_ROUNDS - 1
    const send = (useModel: string) =>
      fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          model: useModel,
          store: false,
          input: history,
          ...(offered.length && !finalRound ? { tools: offered.map(tool => tool.definition) } : {}),
          ...(thinking ? { generation_config: { thinking_level: thinking } } : {}),
        }),
        signal: AbortSignal.timeout(25000),
      })
    let response = await send(model)
    // 5xx from Google is usually a short overload ("high demand"): retry with growing pauses,
    // then switch to the fallback model (with one retry of its own) if one is set.
    for (let attempt = 0; RETRYABLE.has(response.status) && attempt < RETRY_STEPS.length; attempt++) {
      const wait = retryDelay(response, attempt)
      console.error(
        `[gemini] HTTP ${response.status} (model ${model}), retry ${attempt + 1}/${RETRY_STEPS.length} in ${wait} ms: ${(await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}`,
      )
      await new Promise(resolve => setTimeout(resolve, wait))
      response = await send(model)
    }
    const fallback = process.env.GEMINI_FALLBACK_MODEL?.trim()
    if (RETRYABLE.has(response.status) && fallback && fallback !== model) {
      console.error(`[gemini] HTTP ${response.status} (model ${model}) still failing, switching to fallback ${fallback}`)
      model = fallback
      response = await send(model)
      if (RETRYABLE.has(response.status)) {
        await new Promise(resolve => setTimeout(resolve, retryDelay(response, 0)))
        response = await send(model)
      }
    }
    if (!response.ok) {
      // Log Google's own error (status + reason) server-side only; it never contains the API key.
      const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600)
      console.error(`[gemini] HTTP ${response.status} (model ${model}): ${detail}`)
      if (response.status === 429) throw new ServiceError(429, 'AI_RATE_LIMIT', 'Batas penggunaan Gemini tercapai. Coba lagi nanti.')
      if (response.status === 400 || response.status === 401 || response.status === 403)
        throw new ServiceError(502, 'AI_REJECTED', 'Gemini menolak permintaan. Periksa GEMINI_API_KEY dan GEMINI_MODEL di backend.')
      if (response.status === 404)
        throw new ServiceError(502, 'AI_MODEL_NOT_FOUND', `Model Gemini "${model}" tidak ditemukan. Periksa GEMINI_MODEL di backend.`)
      if (RETRYABLE.has(response.status))
        throw new ServiceError(503, 'AI_BUSY', `Layanan Gemini sedang sibuk (kode ${response.status}). Coba lagi beberapa saat.`)
      throw new ServiceError(502, 'AI_UNAVAILABLE', `Gemini tidak dapat menjawab saat ini (kode ${response.status}).`)
    }
    const result = (await response.json()) as { steps?: Step[] }
    const steps = result.steps ?? []
    history.push(...steps)
    const calls = steps.filter(step => step.type === 'function_call')
    if (calls.length && offered.length) {
      if (calls.length > 8)
        throw new ServiceError(
          502,
          'AI_TOOL_LIMIT',
          'Analisis membutuhkan terlalu banyak perhitungan sekaligus. Coba pertanyaan yang lebih spesifik.',
        )
      for (const call of calls) {
        const runner = offered.find(tool => tool.name === call.name)?.runner
        let output: unknown
        try {
          output = runner ? tools[runner]!(call.arguments) : { error: 'Alat tidak dikenal.' }
        } catch (error) {
          // A failing tool should not sink the whole answer; Gemini can explain that the figure is unavailable.
          console.error(`[gemini] tool ${call.name} failed`, error instanceof Error ? error.message : typeof error)
          output = { error: 'Perhitungan ini gagal dijalankan. Sampaikan bahwa angkanya belum tersedia.' }
        }
        if (output && typeof output === 'object' && !Array.isArray(output)) {
          const data = output as Record<string, unknown>
          const metric = typeof data.operation === 'string' ? data.operation : 'query'
          const value = typeof data.average === 'number' ? data.average : data.matched
          if (typeof value === 'number') evidence.push({ metric, value })
        }
        history.push({
          type: 'function_result',
          name: call.name,
          call_id: call.id,
          result: [{ type: 'text', text: JSON.stringify(toolSafe(output)) }],
        })
      }
      continue
    }
    const answer = steps
      .filter(step => step.type === 'model_output')
      .flatMap(step => step.content ?? [])
      .filter(part => part.type === 'text')
      .map(part => part.text ?? '')
      .join('\n')
      .trim()
    if (answer) return { answer, evidence }
    throw new ServiceError(502, 'AI_EMPTY_RESPONSE', 'Gemini tidak menghasilkan jawaban teks.')
  }
  throw new ServiceError(502, 'AI_TOOL_LIMIT', 'Analisis membutuhkan terlalu banyak langkah. Coba pertanyaan yang lebih spesifik.')
}

const MAX_TOOL_TEXT = 200

/**
 * Tool results carry text straight from the Excel file (unit names, positions, statuses). Strip control
 * characters and cap each string so a cell cannot smuggle long instructions or break the result apart.
 */
export function toolSafe(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    const clean = value
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return clean.length > MAX_TOOL_TEXT ? `${clean.slice(0, MAX_TOOL_TEXT)}…` : clean
  }
  if (depth > 12 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => toolSafe(item, depth + 1))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [toolSafe(key, depth + 1) as string, toolSafe(item, depth + 1)]))
}

export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}
