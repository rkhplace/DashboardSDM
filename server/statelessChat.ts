import { randomUUID } from 'node:crypto'
import { prepareTurn, presentAnswer, type Turn, validateFilters, validateSnapshot } from './app.ts'
import { askGemini, ServiceError } from './gemini.ts'

type Generate = typeof askGemini

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateHistory(value: unknown): Turn[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 8 || value.some(turn => !object(turn) || !['user', 'assistant'].includes(String(turn.role)) || typeof turn.text !== 'string' || turn.text.length > 1000)) {
    throw new ServiceError(400, 'INVALID_HISTORY', 'Riwayat percakapan tidak valid.')
  }
  return value.map(turn => ({ role: turn.role, text: turn.text }) as Turn)
}

export async function answerStatelessChat(input: unknown, generate: Generate = askGemini) {
  if (!object(input) || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 500
    || input.conversationId !== undefined && (typeof input.conversationId !== 'string' || input.conversationId.length > 100)
    || input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 100)) {
    throw new ServiceError(400, 'INVALID_MESSAGE', 'Pesan harus berisi 1–500 karakter.')
  }
  const snapshot = validateSnapshot(input.snapshot)
  const filters = validateFilters(input.filters)
  const turns = validateHistory(input.history)
  const search = (input.query as string | undefined)?.toLocaleLowerCase('id').trim()
  const message = input.message.trim()
  const { prompt, tools, identities } = prepareTurn(snapshot, filters, search, message, turns, input)
  const reply = await generate(prompt, tools)
  const evidence = reply.evidence?.map(item => ({ ...item, period: snapshot.period })) ?? []
  return { conversationId: input.conversationId || randomUUID(), answer: identities.restore(presentAnswer(reply.answer)), evidence, ...tools.extras(),
    limitations: ['Jawaban mengikuti data periode dan filter aktif.'], generatedAt: new Date().toISOString() }
}
