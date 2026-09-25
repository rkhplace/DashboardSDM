import type { EmployeeSnapshot, WorkforceFilters } from '../types/workforce'

async function api<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(`/api/v1${path}`, init) }
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
  const result = await api<{ sessionId: string }>('/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) })
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
}

export function sendChat(sessionId: string, snapshot: EmployeeSnapshot, message: string, filters: WorkforceFilters, query: string, history: { role: 'user' | 'assistant'; text: string }[], conversationId?: string): Promise<ChatReply> {
  if (import.meta.env.PROD) {
    return api<ChatReply>('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot, message, filters, query, history: history.slice(-8), conversationId }) })
  }
  return api<ChatReply>(`/sessions/${sessionId}/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, filters, query, conversationId }) })
}
