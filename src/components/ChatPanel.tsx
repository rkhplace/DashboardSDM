import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Filter, Send } from 'lucide-react'
import { sendChat } from '../api/client'
import { describeFilters } from '../analytics/filters'
import type { RetirementSettings } from '../analytics/retirement'
import { useWorkforceSession } from '../data/useWorkforceSession'
import type { ChatChart, WorkforceFilters } from '../types/workforce'
import { ChatChartView } from './ChatChartView'
import { ChatMarkdown } from './ChatMarkdown'

type Message =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; charts?: ChatChart[]; suggestedFilters?: WorkforceFilters | null; applied?: boolean }
  | { role: 'note'; text: string }

type Props = { sessionId: string; filters: WorkforceFilters; query: string; count: number; retirement?: RetirementSettings; onApplyFilters: (filters: WorkforceFilters) => void }

export function ChatPanel({ sessionId, filters, query, count, retirement, onApplyFilters }: Props) {
  const { snapshot } = useWorkforceSession()
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string>()
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const messageList = useRef<HTMLDivElement>(null)
  const filterKey = `${JSON.stringify(filters)}:${query}`
  const previousFilterKey = useRef(filterKey)

  useEffect(() => {
    if (messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight
  }, [messages, busy])

  // Keep the conversation when dashboard filters change, but mark the point where the data scope changed.
  useEffect(() => {
    if (previousFilterKey.current === filterKey) return
    previousFilterKey.current = filterKey
    const active = describeFilters(filters)
    setMessages(current => current.length ? [...current, { role: 'note' as const, text: `Filter diubah${active.length ? ` (${active.join(' · ')})` : ' ke semua data'}. Jawaban berikutnya memakai ${count.toLocaleString('id-ID')} karyawan.` }].slice(-100) : current)
  }, [filterKey, filters, count])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = input.trim()
    if (!message || busy) return
    setInput('')
    setError('')
    setBusy(true)
    const history = messages.filter((item): item is Extract<Message, { role: 'user' | 'assistant' }> => item.role !== 'note').map(item => ({ role: item.role, text: item.text }))
    setMessages(current => [...current, { role: 'user' as const, text: message }].slice(-100))
    try {
      const reply = await sendChat(sessionId, snapshot!, message, filters, query, history, conversationId, retirement)
      setConversationId(reply.conversationId)
      setMessages(current => [...current, { role: 'assistant' as const, text: reply.answer, charts: reply.charts, suggestedFilters: reply.suggestedFilters }].slice(-100))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chatbot gagal merespons.')
    } finally {
      setBusy(false)
    }
  }

  function apply(index: number, next: WorkforceFilters) {
    setMessages(current => current.map((item, position) => position === index && item.role === 'assistant' ? { ...item, applied: true } : item))
    onApplyFilters(next)
  }

  return <div className="workforce-chat">
    <div className="workforce-chat-messages" ref={messageList} role="log" aria-live="polite">
      {messages.length ? messages.map((message, index) => {
        if (message.role === 'user') return <p key={index} className="workforce-chat-message user">{message.text}</p>
        if (message.role === 'note') return <p key={index} className="workforce-chat-divider">{message.text}</p>
        const suggestion = message.suggestedFilters ? describeFilters(message.suggestedFilters) : []
        return <div key={index} className="workforce-chat-message assistant">
          <ChatMarkdown text={message.text}/>
          {message.charts?.map(chart => <ChatChartView key={chart.title} chart={chart}/>)}
          {message.suggestedFilters && suggestion.length > 0 && <button type="button" className="chat-filter-button" disabled={message.applied} onClick={() => apply(index, message.suggestedFilters!)}>
            <Filter size={13}/><span>{message.applied ? 'Filter diterapkan' : 'Terapkan filter'}: {suggestion.join(' · ')}</span>
          </button>}
        </div>
      }) : <p className="workforce-chat-placeholder">{count < 5 ? 'Tanyakan status, divisi, atau karyawan pada hasil filter ini.' : 'Coba: “bandingkan jumlah karyawan per divisi” atau “tampilkan PKWT perempuan”.'}</p>}
      {busy && <p className="workforce-chat-placeholder">AI sedang menjawab...</p>}
    </div>
    {error && <p className="workforce-chat-error" role="alert">{error}</p>}
    <form onSubmit={event => { void submit(event) }} className="workforce-chat-form">
      <input aria-label="Pertanyaan untuk chatbot" value={input} onChange={event => setInput(event.target.value)} maxLength={500} placeholder="Tanya data atau istilah SDM..." disabled={busy}/>
      <button type="submit" aria-label="Kirim pertanyaan" disabled={busy || !input.trim()}><Send size={14}/></button>
    </form>
    <p className="workforce-chat-note">Jawaban mengikuti file dan filter aktif. Chat berakhir saat sesi data ditutup.</p>
  </div>
}
