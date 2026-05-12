'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const STORAGE_KEY = 'agent_chat_messages'

interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  steps?: string[]
}

function parseAgentReply(content: string): { text: string; studentId: string | null } {
  const match = content.match(/\[student_id:([0-9a-f-]+)\]/i)
  if (!match) return { text: content, studentId: null }
  return { text: content.replace(match[0], '').trim(), studentId: match[1] }
}

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored) as ChatMessage[]
    return parsed.map(m => m.id ? m : { ...m, id: crypto.randomUUID() })
  } catch {
    return []
  }
}

export default function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {}
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (!loading) inputRef.current?.focus()
  }, [loading])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const pendingId = crypto.randomUUID()
    const pendingMsg: ChatMessage = { id: pendingId, role: 'agent', content: '', steps: [] }

    const next = [...messages, userMsg]
    setMessages([...next, pendingMsg])
    setLoading(true)

    try {
      const apiMessages = next.map(m => ({
        role: m.role === 'agent' ? ('model' as const) : ('user' as const),
        content: m.content,
      }))

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'Request failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6).trim()
          if (!json) continue
          const event = JSON.parse(json) as { type: string; content?: string; message?: string }
          if (event.type === 'step') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, steps: [...(m.steps ?? []), event.content!] } : m
            ))
          } else if (event.type === 'chunk') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, content: (m.content ?? '') + event.content! } : m
            ))
          } else if (event.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId
                ? { ...m, content: `Something went wrong: ${event.message}` }
                : m
            ))
          }
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === pendingId
          ? { ...m, content: `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}` }
          : m
      ))
    } finally {
      // Fallback: stream closed without a reply event
      setMessages(prev => prev.map(m =>
        m.id === pendingId && !m.content
          ? { ...m, content: 'No response received — please try again.' }
          : m
      ))
      setLoading(false)
    }
  }

  function clearChat() {
    setMessages([])
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h1 className="text-xl font-bold text-navy">AI Agent</h1>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-xs text-slate-400 hover:text-accentGold transition-colors"
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
              <p className="text-slate-500">"Create student LX, Other Syllabus, Monday 3–5pm, RM 60/hr"</p>
              <p className="text-slate-500">"Update John's fee to RM 80"</p>
              <p className="text-slate-500">"Delete student Wei Ming"</p>
              <p className="text-slate-500">"Search for students named Tan"</p>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const { text: msgText, studentId } = msg.role === 'agent'
            ? parseAgentReply(msg.content)
            : { text: msg.content, studentId: null }
          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'user' ? (
                <div className="bg-navy text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm">
                  {msg.content}
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%] text-sm shadow-sm">
                  {msg.steps && msg.steps.length > 0 && (
                    <div className="text-xs text-slate-400 space-y-0.5 mb-2 pb-2 border-b border-slate-100 break-all">
                      {msg.steps.map((step, j) => (
                        <div key={j}>{step.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '…')}</div>
                      ))}
                    </div>
                  )}
                  {!msg.content ? (
                    <span className="animate-pulse text-slate-400 text-sm">⋯</span>
                  ) : (
                    <>
                      <div className="prose prose-sm max-w-none text-slate-800 [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_th]:text-left [&_th]:font-semibold [&_th]:pb-1 [&_th]:pr-3 [&_td]:py-0.5 [&_td]:pr-3 [&_tr]:border-b [&_tr]:border-slate-100 [&_a]:text-navy [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_blockquote]:my-1">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ href, children }) => {
                              if (href?.startsWith('mailto:')) return <span>{children}</span>
                              return <a href={href} className="text-navy underline">{children}</a>
                            },
                          }}
                        >{msgText}</ReactMarkdown>
                      </div>
                      {studentId && (
                        <div className="flex justify-end mt-2">
                          <Link
                            href={`/admin/students/${studentId}`}
                            className="text-xs font-medium text-navy hover:underline"
                          >
                            View student →
                          </Link>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex gap-2 pt-3 border-t border-slate-100 flex-shrink-0">
        <Input
          ref={inputRef}
          aria-label="Chat input"
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
          className="flex-1 border-slate-200 px-4 py-2.5 focus:ring-navy/20 focus:border-navy/40 bg-white"
        />
        <Button
          onClick={() => void send()}
          disabled={loading || !input.trim()}
          className="bg-navy text-white px-4 py-2.5 hover:bg-navy/90"
        >
          Send
        </Button>
      </div>
    </div>
  )
}
