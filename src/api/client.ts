import type { EmployeeSnapshot, WorkforceFilters } from '../types/workforce'

async function api<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(`/api/v1${path}`, init) }
  catch { throw new Error('Backend tidak terhubung. Jalankan npm run dev dan coba lagi.') }
  const body = await response.json().catch(() => null) as { message?: string } | null
  if (!response.ok) {
    if (!body?.message && [502, 503, 504].includes(response.status)) {
      throw new Error('Backend API tidak terhubung. Jalankan npm run dev, lalu coba upload lagi.')
    }
    throw new Error(body?.message || `Permintaan gagal (${response.status}).`)
  }
  return body as T
}

export async function createSession(snapshot: EmployeeSnapshot): Promise<string> {
  const result = await api<{ sessionId: string }>('/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) })
  return result.sessionId
}

export async function deleteSession(sessionId: string): Promise<void> {
  try { await fetch(`/api/v1/sessions/${sessionId}`, { method: 'DELETE' }) } catch { /* Session expires automatically. */ }
}

export interface ChatReply {
  conversationId: string
  answer: string
  evidence: { metric: string; value: number; period: string }[]
  limitations: string[]
}

export function sendChat(sessionId: string, message: string, filters: WorkforceFilters, query: string, conversationId?: string): Promise<ChatReply> {
  return api<ChatReply>(`/sessions/${sessionId}/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, filters, query, conversationId }) })
}
