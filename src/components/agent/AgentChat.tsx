'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MicrophoneIcon, StopIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  PNG_W, PNG_H, SCALE,
  cellKey, type SlotType,
  drawSlotsToCtx, drawScheduleToCtx, scheduleCanvasHeight, downloadCanvas,
} from '@/lib/timetable-canvas'

const STORAGE_KEY = 'agent_chat_messages'
const LG_STORAGE_KEY = 'agent_use_lg'

interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  steps?: string[]
  scheduleStudents?: { name: string; class_schedule: { day: string; start: string; end: string }[] }[]
  slotData?: { day: string; time: string; state: string }[]
}

function parseAgentReply(content: string): { text: string; students: { name: string; id: string }[] } {
  const students: { name: string; id: string }[] = []
  // New format: [student_id:NAME:UUID]
  const newFormat = /\[student_id:([^:\]]+):([0-9a-f-]+)\]/gi
  let match
  while ((match = newFormat.exec(content)) !== null) {
    students.push({ name: match[1].trim(), id: match[2] })
  }
  // Legacy format: [student_id:UUID] — present in messages persisted before the NAME:UUID change
  if (students.length === 0) {
    const legacy = content.match(/\[student_id:([0-9a-f-]{36})\]/i)
    if (legacy) students.push({ name: 'student', id: legacy[1] })
  }
  const text = content.replace(/\[student_id:[^\]]+\]/gi, '').trim()
  return { text, students }
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

function downloadSchedulePng(students: { name: string; class_schedule: { day: string; start: string; end: string }[] }[]) {
  const sch_h = scheduleCanvasHeight(students)
  const canvas = document.createElement('canvas')
  canvas.width = PNG_W * SCALE
  canvas.height = sch_h * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(SCALE, SCALE)
  drawScheduleToCtx(ctx, students)
  downloadCanvas(canvas, 'weekly_schedule.png')
}

function downloadSlotsPng(slotData: { day: string; time: string; state: string }[]) {
  const grid = new Map<string, SlotType>()
  for (const s of slotData) {
    if (s.state === 'preferred' || s.state === 'normal') {
      grid.set(cellKey(s.day, s.time), s.state as SlotType)
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = PNG_W * SCALE
  canvas.height = PNG_H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(SCALE, SCALE)
  drawSlotsToCtx(ctx, grid, new Set<string>())
  downloadCanvas(canvas, 'slot_availability.png')
}

export default function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [useLangGraph, setUseLangGraph] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem(LG_STORAGE_KEY) === 'true'
  )
  useEffect(() => {
    setSpeechSupported('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  }, [])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {}
  }, [messages])

  useEffect(() => {
    try {
      localStorage.setItem(LG_STORAGE_KEY, String(useLangGraph))
    } catch {}
  }, [useLangGraph])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (!loading) inputRef.current?.focus()
  }, [loading])

  useEffect(() => () => { recognitionRef.current?.stop() }, [])

  function cleanupRecognition(focus = false) {
    setListening(false)
    recognitionRef.current = null
    if (focus) inputRef.current?.focus()
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setInput(prev => prev ? `${prev} ${transcript}` : transcript)
    }
    recognition.onend = () => cleanupRecognition(true)
    recognition.onerror = () => cleanupRecognition()
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const pendingId = crypto.randomUUID()
    const pendingMsg: ChatMessage = { id: pendingId, role: 'agent', content: '', steps: [] }

    setMessages([...messages, userMsg, pendingMsg])
    setLoading(true)

    let received = false

    try {
      const apiMessages = [...messages, userMsg].map(m => ({
        role: m.role === 'agent' ? ('model' as const) : ('user' as const),
        content: m.content,
      }))

      const endpoint = useLangGraph ? '/api/agent/lg/chat' : '/api/agent/chat'
      const res = await fetch(endpoint, {
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
          const event = JSON.parse(json) as {
            type: string
            content?: string
            message?: string
            students?: { name: string; class_schedule: { day: string; start: string; end: string }[] }[]
            slots?: { day: string; time: string; state: string }[]
          }
          if (event.type === 'step') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, steps: [...(m.steps ?? []), event.content!] } : m
            ))
          } else if (event.type === 'chunk') {
            received = true
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, content: (m.content ?? '') + event.content! } : m
            ))
          } else if (event.type === 'error') {
            received = true
            setMessages(prev => prev.map(m =>
              m.id === pendingId
                ? { ...m, content: `Something went wrong: ${event.message}` }
                : m
            ))
          } else if (event.type === 'download_schedule') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, scheduleStudents: event.students ?? [] } : m
            ))
          } else if (event.type === 'slots_ready') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, slotData: event.slots ?? [] } : m
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
      if (!received) {
        setMessages(prev => prev.map(m =>
          m.id === pendingId ? { ...m, content: 'No response received — please try again.' } : m
        ))
      }
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
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-navy">AI Agent</h1>
          <button
            type="button"
            role="switch"
            aria-checked={useLangGraph}
            onClick={() => setUseLangGraph(v => !v)}
            title={useLangGraph ? 'Switch to classic mode' : 'Switch to LangGraph mode'}
            className="flex items-center gap-1.5 group"
          >
            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${useLangGraph ? 'bg-navy' : 'bg-slate-200'}`}>
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${useLangGraph ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
            <span className={`text-xs font-medium transition-colors ${useLangGraph ? 'text-navy' : 'text-slate-400'}`}>
              LangGraph
            </span>
          </button>
        </div>
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
              <p className="text-slate-500">"Download the weekly schedule image"</p>
              <p className="text-slate-500">"Generate slot availability — student free Tuesday/Thursday after 4pm"</p>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const { text: msgText, students: msgStudents } = msg.role === 'agent'
            ? parseAgentReply(msg.content)
            : { text: msg.content, students: [] }
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
                      <div className="prose prose-sm max-w-none text-slate-800 [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_th]:text-left [&_th]:font-semibold [&_th]:pb-1 [&_th]:pr-3 [&_td]:py-0.5 [&_td]:pr-3 [&_tr]:border-b [&_tr]:border-slate-100 [&_a]:text-navy [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_blockquote]:my-1 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:whitespace-pre-wrap [&_code]:break-words">
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
                      {(msg.scheduleStudents || msg.slotData) && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {msg.scheduleStudents && (
                            <button
                              onClick={() => downloadSchedulePng(msg.scheduleStudents!)}
                              className="text-xs font-medium text-navy border border-navy/30 rounded-lg px-3 py-1.5 hover:bg-navy hover:text-white transition-colors"
                            >
                              ↓ Download Schedule PNG
                            </button>
                          )}
                          {msg.slotData && (
                            <button
                              onClick={() => downloadSlotsPng(msg.slotData!)}
                              className="text-xs font-medium text-navy border border-navy/30 rounded-lg px-3 py-1.5 hover:bg-navy hover:text-white transition-colors"
                            >
                              ↓ Download Slot Availability PNG
                            </button>
                          )}
                        </div>
                      )}
                      {msgStudents.length > 0 && (
                        <div className="flex justify-end gap-3 mt-2">
                          {msgStudents.map(s => (
                            <Link
                              key={s.id}
                              href={`/admin/students/${s.id}`}
                              className="text-xs font-medium text-navy hover:underline"
                            >
                              View {s.name} →
                            </Link>
                          ))}
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
        {speechSupported && (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={loading}
            title={listening ? 'Stop recording' : 'Voice input'}
            className={`flex-shrink-0 p-2.5 rounded-lg transition-colors disabled:opacity-40 ${
              listening
                ? 'text-red-500 bg-red-50 hover:bg-red-100'
                : 'text-slate-400 hover:text-navy hover:bg-slate-100'
            }`}
          >
            {listening
              ? <StopIcon className="w-5 h-5" />
              : <MicrophoneIcon className="w-5 h-5" />
            }
          </button>
        )}
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
