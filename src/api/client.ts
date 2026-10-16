import type { RetirementSettings } from '../analytics/retirement'
import type { ChatChart, EmployeeSnapshot, WorkforceFilters } from '../types/workforce'
import { encodeHistory, fitHistory, keepNewest } from '../data/historyPayload'

async function api<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(path, init) }
  catch { throw new Error('Layanan chatbot tidak terhubung. Coba lagi beberapa saat.') }
  const body = await response.json().catch(() => null) as { message?: string } | null
  if (!response.ok) {
    if (!body?.message && [502, 503, 504].includes(response.status)) {
      throw new Error('Layanan chatbot sedang tidak tersedia. Coba lagi beberapa saat.')
    }
    throw new Error(body?.message || `Permintaan gagal (${response.status}).`)
  }
  return body as T
}

export async function createSession(snapshot: EmployeeSnapshot): Promise<string> {
  if (import.meta.env.PROD) return crypto.randomUUID()
  const { body, headers } = await prepareBody(snapshot as unknown as Record<string, unknown>, snapshot, undefined)
  const result = await api<{ sessionId: string }>('/api/v1/sessions', { method: 'POST', headers, body })
  return result.sessionId
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (import.meta.env.PROD) return
  try { await fetch(`/api/v1/sessions/${sessionId}`, { method: 'DELETE' }) } catch { /* Session expires automatically. */ }
}

export interface ChatReply {
  conversationId: string
  answer: string
  evidence: { metric: string; value: number; period: string }[]
  limitations: string[]
  charts?: ChatChart[]
  suggestedFilters?: WorkforceFilters | null
}

/** Dashboard state the AI tools mirror, plus the saved earlier periods for period-to-period questions. */
export interface ChatContext { contractMonths?: number; compareWith?: string; periods?: EmployeeSnapshot[] }

const MAX_BODY_BYTES = 4 * 1024 * 1024
/** The server refuses bodies that inflate past 64 MB; stay well below it. */
const MAX_INFLATED_BYTES = 48 * 1024 * 1024
const BODY_MARGIN = 96 * 1024
const WIRE_LIMIT = MAX_BODY_BYTES - BODY_MARGIN
/** Below this size compression is not worth the effort. */
const COMPRESS_FROM = 64 * 1024

type Compress = (text: string) => Promise<Blob | null>

/** gzip in the browser; null when CompressionStream is missing (older browsers), so the body goes uncompressed. */
export const gzip: Compress = async text => {
  if (typeof CompressionStream === 'undefined') return null
  try { return await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob() }
  catch { return null }
}

export interface PreparedBody { body: string | Blob; headers: Record<string, string>; periodsSent: number; periodsDropped: number }

/**
 * Builds the request body with as many earlier periods as fit. Compressed, the 4 MB request limit holds
 * many more periods; the oldest periods are dropped only when even the compressed body is too large.
 */
export async function prepareBody(base: Record<string, unknown>, snapshot: EmployeeSnapshot, periods: EmployeeSnapshot[] | undefined, compress: Compress = gzip): Promise<PreparedBody> {
  const encoded = periods?.length ? encodeHistory(periods, snapshot) : null
  const total = encoded?.periods.length ?? 0
  const serialise = (history: ReturnType<typeof encodeHistory> | null) => {
    const sent = history?.periods.length ?? 0
    const extra = history && (sent || total) ? { periods: history, periodsDropped: total - sent } : {}
    return { text: JSON.stringify({ ...base, ...extra }), sent }
  }
  const baseSize = JSON.stringify(base).length + 64
  const plainBody = (limit: number) => {
    let history = encoded ? fitHistory(encoded, Math.max(limit - baseSize, 0)).payload : null
    let result = serialise(history)
    // JSON length counts characters; non-ASCII names take more bytes, so check the real size.
    while (history && history.periods.length && new Blob([result.text]).size > limit) {
      history = keepNewest(history, history.periods.length - 1)
      result = serialise(history)
    }
    return result
  }
  const plain = (result: { text: string; sent: number }): PreparedBody => ({ body: result.text, headers: { 'Content-Type': 'application/json' }, periodsSent: result.sent, periodsDropped: total - result.sent })

  let candidate = plainBody(MAX_INFLATED_BYTES)
  if (candidate.text.length < COMPRESS_FROM) return plain(candidate)
  let packed = await compress(candidate.text)
  if (!packed) return plain(plainBody(WIRE_LIMIT))
  while (packed.size > WIRE_LIMIT && encoded && candidate.sent > 0) {
    // Estimate how many periods fit from the compression achieved so far, then step down one at a time.
    const estimate = Math.floor(candidate.sent * (WIRE_LIMIT / packed.size) * 0.97)
    candidate = serialise(keepNewest(encoded, Math.min(candidate.sent - 1, Math.max(estimate, 0))))
    const next = await compress(candidate.text)
    if (!next) return plain(plainBody(WIRE_LIMIT))
    packed = next
  }
  return { body: packed, headers: { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'gzip' }, periodsSent: candidate.sent, periodsDropped: total - candidate.sent }
}

export async function sendChat(sessionId: string, snapshot: EmployeeSnapshot, message: string, filters: WorkforceFilters, query: string, history: { role: 'user' | 'assistant'; text: string }[], conversationId?: string, retirement?: RetirementSettings, context: ChatContext = {}): Promise<ChatReply> {
  const settings = { contracts: context.contractMonths ? { months: context.contractMonths } : undefined, compareWith: context.compareWith }
  const stateless = import.meta.env.PROD
  const base = stateless
    ? { snapshot, message, filters, query, history: history.slice(-8), conversationId, retirement, ...settings }
    : { message, filters, query, conversationId, retirement, ...settings }
  const { body, headers } = await prepareBody(base, snapshot, context.periods)
  return api<ChatReply>(stateless ? '/api/chat' : `/api/v1/sessions/${sessionId}/ai/chat`, { method: 'POST', headers, body })
}
