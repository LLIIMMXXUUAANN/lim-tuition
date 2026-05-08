// src/components/agent/AgentChat.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

const STORAGE_KEY = 'agent_chat_messages'

interface ChatMessage {
  role: 'user' | 'agent'
  content: string
  steps?: string[]
}

// Extracts [student_id:UUID] from agent reply, returns text + studentId separately
function parseAgentReply(content: string): { text: string; studentId: string | null } {
  const match = content.match(/\[student_id:([0-9a-f-]+)\]/i)
  if (!match) return { text: content, studentId: null }
  return { text: content.replace(match[0], '').trim(), studentId: match[1] }
}

export default function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setMessages(JSON.parse(stored))
    } catch {}
  }, [])

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {}
  }, [messages])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setLoading(true)

    try {
      // API expects role 'model' for agent turns, 'user' for user turns
      const apiMessages = next.map(m => ({
        role: m.role === 'agent' ? ('model' as const) : ('user' as const),
        content: m.content,
      }))

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      const data = await res.json() as { reply?: string; steps?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Request failed')

      setMessages(prev => [
        ...prev,
        { role: 'agent', content: data.reply ?? '', steps: data.steps ?? [] },
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'agent',
          content: `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function clearChat() {
    setMessages([])
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-800">AI Agent</h1>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 mt-16 space-y-2">
            <p className="text-3xl">✦</p>
            <p className="font-medium text-slate-600">What would you like to do?</p>
            <div className="text-sm space-y-1 mt-4">
              <p className="text-slate-500">"Create student LX, IGCSE, Monday 3–5pm, RM 60/hr"</p>
              <p className="text-slate-500">"Update John's fee to RM 80"</p>
              <p className="text-slate-500">"Delete student Wei Ming"</p>
              <p className="text-slate-500">"Search for students named Tan"</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="bg-navy text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm">
                {msg.content}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%] text-sm shadow-sm">
                {msg.steps && msg.steps.length > 0 && (
                  <div className="text-xs text-slate-400 space-y-0.5 mb-2 pb-2 border-b border-slate-100">
                    {msg.steps.map((step, j) => (
                      <div key={j}>{step}</div>
                    ))}
                  </div>
                )}
                {(() => {
                  const { text, studentId } = parseAgentReply(msg.content)
                  return (
                    <>
                      <p className="whitespace-pre-wrap text-slate-800">{text}</p>
                      {studentId && (
                        <Link
                          href={`/admin/students/${studentId}`}
                          className="inline-block mt-2 text-xs font-medium text-navy hover:underline"
                        >
                          View student →
                        </Link>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-400 shadow-sm">
              <span className="animate-pulse text-sm">⋯</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex gap-2 pt-3 border-t border-slate-100 flex-shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="What would you like to do?"
          disabled={loading}
          className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/40 disabled:opacity-50 bg-white"
        />
        <button
          onClick={() => void send()}
          disabled={loading || !input.trim()}
          className="bg-navy text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-navy/90 disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}
