import type { IncomingMessage, ServerResponse } from 'node:http'
import { answerStatelessChat } from './statelessChat.ts'

const MAX_BODY = 4 * 1024 * 1024
type RequestWithBody = IncomingMessage & { body?: unknown }

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

async function readBody(request: RequestWithBody): Promise<unknown> {
  if (request.body !== undefined) return request.body
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY) throw Object.assign(new Error('Data melebihi batas 4 MB.'), { status: 413, code: 'REQUEST_TOO_LARGE' })
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export default async function handler(request: RequestWithBody, response: ServerResponse) {
  if (request.method !== 'POST') return json(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak didukung.' })
  if (!request.headers['content-type']?.startsWith('application/json')) return json(response, 415, { code: 'CONTENT_TYPE', message: 'Kirim JSON.' })
  try {
    const contentLength = Number(request.headers['content-length'] ?? 0)
    if (contentLength > MAX_BODY) return json(response, 413, { code: 'REQUEST_TOO_LARGE', message: 'Data melebihi batas 4 MB.' })
    const body = await readBody(request)
    return json(response, 200, await answerStatelessChat(body))
  } catch (error) {
    if (error instanceof SyntaxError) return json(response, 400, { code: 'INVALID_JSON', message: 'JSON tidak valid.' })
    if (error instanceof Error && error.name === 'TimeoutError') return json(response, 504, { code: 'AI_TIMEOUT', message: 'Gemini terlalu lama merespons.' })
    if (error && typeof error === 'object' && 'status' in error && 'code' in error && 'message' in error
      && typeof error.status === 'number' && typeof error.code === 'string' && typeof error.message === 'string') {
      return json(response, error.status, { code: error.code, message: error.message })
    }
    console.error('Chat function failed', error)
    return json(response, 500, { code: 'INTERNAL_ERROR', message: 'Server mengalami kesalahan.' })
  }
}
