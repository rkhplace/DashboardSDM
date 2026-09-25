import { answerStatelessChat } from '../server/statelessChat.ts'
import { ServiceError } from '../server/gemini.ts'

const MAX_BODY = 4 * 1024 * 1024

function failure(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') return failure(405, 'METHOD_NOT_ALLOWED', 'Metode tidak didukung.')
    if (!request.headers.get('content-type')?.startsWith('application/json')) return failure(415, 'CONTENT_TYPE', 'Kirim JSON.')
    try {
      const raw = await request.text()
      if (raw.length > MAX_BODY) return failure(413, 'REQUEST_TOO_LARGE', 'Data melebihi batas 4 MB.')
      const result = await answerStatelessChat(JSON.parse(raw) as unknown)
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      if (error instanceof SyntaxError) return failure(400, 'INVALID_JSON', 'JSON tidak valid.')
      if (error instanceof ServiceError) return failure(error.status, error.code, error.message)
      if (error instanceof Error && error.name === 'TimeoutError') return failure(504, 'AI_TIMEOUT', 'Gemini terlalu lama merespons.')
      return failure(500, 'INTERNAL_ERROR', 'Server mengalami kesalahan.')
    }
  },
}
