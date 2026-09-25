import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import { sendChat } from '../api/client'
import { useWorkforceSession } from '../data/useWorkforceSession'
import type { WorkforceFilters } from '../types/workforce'
import { ChatMarkdown } from './ChatMarkdown'

type Message = { role: 'user' | 'assistant'; text: string }

export function ChatPanel({ sessionId, filters, query, count }: { sessionId: string; filters: WorkforceFilters; query: string; count: number }) {
  const { snapshot } = useWorkforceSession()
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string>()
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const messageList = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight
  }, [messages, busy])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = input.trim()
    if (!message || busy) return
    setInput('')
    setError('')
    setBusy(true)
    setMessages(current => [...current, { role: 'user' as const, text: message }].slice(-100))
    try {
      const reply = await sendChat(sessionId, snapshot!, message, filters, query, messages, conversationId)
      setConversationId(reply.conversationId)
      setMessages(current => [...current, { role: 'assistant' as const, text: reply.answer }].slice(-100))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chatbot gagal merespons.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="workforce-chat">
    <div className="workforce-chat-messages" ref={messageList} role="log" aria-live="polite">
      {messages.length ? messages.map((message, index) => message.role === 'assistant'
        ? <div key={index} className="workforce-chat-message assistant"><ChatMarkdown text={message.text}/></div>
        : <p key={index} className="workforce-chat-message user">{message.text}</p>)
        : <p className="workforce-chat-placeholder">{count < 5 ? 'Tanyakan status, divisi, atau karyawan pada hasil filter ini.' : 'Tanyakan ringkasan, status, divisi, atau karyawan pada data.'}</p>}
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
