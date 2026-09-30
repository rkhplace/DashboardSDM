import type { IncomingMessage, ServerResponse } from 'node:http'
import { answerStatelessChat } from './statelessChat.ts'

const MAX_BODY = 4 * 1024 * 1024
const WINDOW_MS = 60 * 1000
const MAX_REQUESTS = Math.max(1, Number(process.env.CHAT_RATE_LIMIT) || 20)
const MAX_TRACKED_CLIENTS = 5000
type RequestWithBody = IncomingMessage & { body?: unknown }

// Best-effort limiter per instance. Pair it with Vercel WAF / a Gemini budget cap for hard limits.
const hits = new Map<string, { count: number; resetAt: number }>()

function clientIp(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return first || request.socket.remoteAddress || 'unknown'
}

export function rateLimited(key: string, now = Date.now()): boolean {
  if (hits.size > MAX_TRACKED_CLIENTS) {
    for (const [client, entry] of hits) if (entry.resetAt <= now) hits.delete(client)
    if (hits.size > MAX_TRACKED_CLIENTS) hits.clear()
  }
  const entry = hits.get(key)
  if (!entry || entry.resetAt <= now) { hits.set(key, { count: 1, resetAt: now + WINDOW_MS }); return false }
  entry.count++
  return entry.count > MAX_REQUESTS
}

function allowedOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (!origin) return true
  const extra = (process.env.CHAT_ALLOWED_ORIGINS ?? '').split(',').map(item => item.trim()).filter(Boolean)
  if (extra.includes(origin)) return true
  const forwardedHost = request.headers['x-forwarded-host']
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ?? request.headers.host
  try { return new URL(origin).host === host } catch { return false }
}

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
  if (!allowedOrigin(request)) return json(response, 403, { code: 'FORBIDDEN_ORIGIN', message: 'Asal permintaan tidak diizinkan.' })
  if (!request.headers['content-type']?.startsWith('application/json')) return json(response, 415, { code: 'CONTENT_TYPE', message: 'Kirim JSON.' })
  if (rateLimited(clientIp(request))) {
    response.setHeader('Retry-After', String(WINDOW_MS / 1000))
    return json(response, 429, { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' })
  }
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
    console.error('Chat function failed', error instanceof Error ? error.name : typeof error)
    return json(response, 500, { code: 'INTERNAL_ERROR', message: 'Server mengalami kesalahan.' })
  }
}
