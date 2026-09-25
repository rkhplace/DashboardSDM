import { randomUUID } from 'node:crypto'
import { filterRecords } from '../src/analytics/workforce.ts'
import { type EmployeeRecord } from '../src/types/workforce.ts'
import { makePrompt, presentAnswer, type Turn, validateFilters, validateSnapshot } from './app.ts'
import { askGemini, ServiceError } from './gemini.ts'
import { answerFromSession, keepQuestionLocal } from './localAnswers.ts'
import { queryWorkforce } from './query.ts'

type Generate = typeof askGemini

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateHistory(value: unknown, records: EmployeeRecord[]): Turn[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 8 || value.some(turn => !object(turn) || !['user', 'assistant'].includes(String(turn.role)) || typeof turn.text !== 'string' || turn.text.length > 1000)) {
    throw new ServiceError(400, 'INVALID_HISTORY', 'Riwayat percakapan tidak valid.')
  }
  let privateTurn = false
  return value.map(turn => {
    if (turn.role === 'user') privateTurn = keepQuestionLocal(turn.text, records)
    return { role: turn.role, text: turn.text, private: privateTurn || keepQuestionLocal(turn.text, records) } as Turn
  })
}

export async function answerStatelessChat(input: unknown, generate: Generate = askGemini) {
  if (!object(input) || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 500
    || input.conversationId !== undefined && (typeof input.conversationId !== 'string' || input.conversationId.length > 100)
    || input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 100)) {
    throw new ServiceError(400, 'INVALID_MESSAGE', 'Pesan harus berisi 1–500 karakter.')
  }
  const snapshot = validateSnapshot(input.snapshot)
  const filters = validateFilters(input.filters)
  const turns = validateHistory(input.history, snapshot.records)
  const search = (input.query as string | undefined)?.toLocaleLowerCase('id').trim()
  const filtered = filterRecords(snapshot.records, filters, snapshot.asOf)
  const records = search ? filtered.filter(record => `${record.nip} ${record.name} ${record.position} ${record.directorate} ${record.division} ${record.section} ${record.status} ${record.activity ?? ''}`.toLocaleLowerCase('id').includes(search)) : filtered
  const message = input.message.trim()
  const privateTurn = keepQuestionLocal(message, snapshot.records)
  const previousQuestions = turns.filter(turn => turn.role === 'user').map(turn => turn.text)
  const localAnswer = privateTurn ? answerFromSession(message, records, snapshot.asOf, previousQuestions) : null
  const reply = privateTurn
    ? { answer: localAnswer?.answer ?? 'Saya belum bisa menemukan jawaban itu dari data karyawan pada hasil filter. Coba sebutkan nama, NIP, status, atau divisi yang ingin dicari.' }
    : await generate(makePrompt(snapshot, records, message, turns), args => queryWorkforce(args, records, snapshot.asOf))
  const evidence = localAnswer
    ? localAnswer.evidence.map(item => ({ ...item, period: snapshot.period }))
    : reply.evidence?.map(item => ({ ...item, period: snapshot.period })) ?? []
  return { conversationId: input.conversationId || randomUUID(), answer: presentAnswer(reply.answer), evidence,
    limitations: ['Jawaban mengikuti data periode dan filter aktif.'], generatedAt: new Date().toISOString() }
}
