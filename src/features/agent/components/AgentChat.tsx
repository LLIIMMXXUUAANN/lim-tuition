'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MicrophoneIcon, StopIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import {
  PNG_W, PNG_H, SCALE,
  cellKey, type SlotType,
  drawSlotsToCtx, drawScheduleToCtx, scheduleCanvasHeight, downloadCanvas,
} from '@/shared/lib/timetable-canvas'
import { camelizeKeys } from '@/lib/utils'

const TYPEWRITER_CHARS = 3
const TYPEWRITER_MS = 30

interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  isError?: boolean
  steps?: string[]
  scheduleStudents?: { name: string; classSchedule: { day: string; start: string; end: string }[] }[]
  slotData?: { day: string; time: string; state: string }[]
  students?: { name: string; id: string }[]
  timestamp?: string
}

const MYT_TZ = 'Asia/Kuala_Lumpur'
const MYT_DATE_KEY_OPTS: Intl.DateTimeFormatOptions = { timeZone: MYT_TZ, year: 'numeric', month: 'numeric', day: 'numeric' }
const MYT_TIME_OPTS: Intl.DateTimeFormatOptions = { timeZone: MYT_TZ, hour: 'numeric', minute: '2-digit', hour12: true }
const MYT_DAY_MONTH_OPTS: Intl.DateTimeFormatOptions = { timeZone: MYT_TZ, month: 'short', day: 'numeric' }

function formatMessageTime(iso: string, now: Date): string {
  const date = new Date(iso)
  const timeStr = date.toLocaleTimeString('en-MY', MYT_TIME_OPTS)
  const toDateKey = (d: Date) => d.toLocaleDateString('en-MY', MYT_DATE_KEY_OPTS)
  if (toDateKey(date) === toDateKey(now)) return timeStr
  const dayMonth = date.toLocaleDateString('en-MY', MYT_DAY_MONTH_OPTS)
  return date.getFullYear() === now.getFullYear()
    ? `${dayMonth}, ${timeStr}`
    : `${dayMonth} ${date.getFullYear()}, ${timeStr}`
}

function downloadSchedulePng(students: { name: string; classSchedule: { day: string; start: string; end: string }[] }[]) {
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
  const renderNow = new Date()
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const latestUserMsgId = useMemo(() =>
    [...messages].reverse().find(m => m.role === 'user')?.id ?? null,
  [messages])
  const latestAgentMsgId = useMemo(() =>
    [...messages].reverse().find(m => m.role === 'agent')?.id ?? null,
  [messages])

  const conversationQuery = useQuery({
    queryKey: ['agent', 'conversation', 'current'],
    queryFn: async () => {
      const res = await fetch('/api/agent/conversations/current')
      return res.json() as Promise<{ id: string; messages: ChatMessage[] }>
    },
    staleTime: Infinity, // driven by explicit invalidation after a turn completes, not time-based staleness
  })
  const conversationId = conversationQuery.data?.id ?? null
  // hydrated == "the initial load attempt has settled, success or failure" —
  // matches the original try/catch/finally-equivalent (chat stays usable even
  // if the load failed, per the prior "non-fatal — chat stays empty" comment).
  const hydrated = conversationQuery.isFetched

  useEffect(() => {
    if (conversationQuery.data) setMessages(conversationQuery.data.messages)
  }, [conversationQuery.data])

  useEffect(() => {
    setSpeechSupported('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  }, [])

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef<string>('')
  const receivedChunkRef = useRef<boolean>(false)
  const pendingIdRef = useRef<string>('')
  const typewriterQueueRef = useRef<string>('')
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamDoneRef = useRef(false)
  const onDrainRef = useRef<(() => void) | null>(null)
  const shouldReloadRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus()
      if (shouldReloadRef.current && conversationId) {
        shouldReloadRef.current = false
        void queryClient.invalidateQueries({ queryKey: ['agent', 'conversation', 'current'] })
      }
    }
  }, [loading, conversationId, queryClient])

  useEffect(() => () => { recognitionRef.current?.stop() }, [])
  useEffect(() => () => { stopTypewriter() }, [])

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

  function startTypewriter(pid: string) {
    if (typewriterIntervalRef.current) return
    typewriterIntervalRef.current = setInterval(() => {
      if (!typewriterQueueRef.current) {
        if (streamDoneRef.current) {
          streamDoneRef.current = false
          stopTypewriter()
          onDrainRef.current?.()
          onDrainRef.current = null
        }
        return
      }
      const chars = typewriterQueueRef.current.slice(0, TYPEWRITER_CHARS)
      typewriterQueueRef.current = typewriterQueueRef.current.slice(TYPEWRITER_CHARS)
      setMessages(prev => prev.map(m =>
        m.id === pid ? { ...m, content: (m.content ?? '') + chars } : m
      ))
    }, TYPEWRITER_MS)
  }

  function stopTypewriter() {
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current)
      typewriterIntervalRef.current = null
    }
  }

  function flushTypewriter(pid: string) {
    stopTypewriter()
    const remaining = typewriterQueueRef.current
    typewriterQueueRef.current = ''
    if (remaining) {
      setMessages(prev => prev.map(m =>
        m.id === pid ? { ...m, content: (m.content ?? '') + remaining } : m
      ))
    }
  }

  async function send(retryMsgId?: string, editPayload?: { userMsgId: string; newContent: string }) {
    if (loading) return
    if ((retryMsgId || editPayload) && !conversationId) return
    stopTypewriter()
    typewriterQueueRef.current = ''

    let pendingId: string
    let bodyPayload: Record<string, unknown>

    if (retryMsgId) {
      const errorIdx = messages.findIndex(m => m.id === retryMsgId)
      if (errorIdx === -1) return
      pendingId = retryMsgId
      setMessages(prev => prev.map(m =>
        m.id === pendingId
          ? { ...m, content: '', steps: [], isError: false, scheduleStudents: undefined, slotData: undefined }
          : m
      ))
      bodyPayload = { conversation_id: conversationId, retry_message_id: retryMsgId }
    } else if (editPayload) {
      const userMsgIdx = messages.findIndex(m => m.id === editPayload.userMsgId)
      if (userMsgIdx === -1) return
      const truncated = messages.slice(0, userMsgIdx)
      const newUserMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: editPayload.newContent, timestamp: new Date().toISOString() }
      pendingId = crypto.randomUUID()
      const pendingMsg: ChatMessage = { id: pendingId, role: 'agent', content: '', steps: [], timestamp: new Date().toISOString() }
      setMessages([...truncated, newUserMsg, pendingMsg])
      bodyPayload = { conversation_id: conversationId, edit_user_message_id: editPayload.userMsgId, new_content: editPayload.newContent }
    } else {
      const text = input.trim()
      if (!text) return
      setInput('')
      setEditingMsgId(null)
      setEditDraft('')
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date().toISOString() }
      pendingId = crypto.randomUUID()
      const pendingMsg: ChatMessage = { id: pendingId, role: 'agent', content: '', steps: [], timestamp: new Date().toISOString() }
      setMessages([...messages, userMsg, pendingMsg])
      bodyPayload = { conversation_id: conversationId, message: text }
    }

    pendingIdRef.current = pendingId
    setLoading(true)

    let received = false
    let loadingDeferredToTypewriter = false
    const markError = () => setMessages(prev => prev.map(m =>
      m.id === pendingId ? { ...m, isError: true } : m
    ))

    try {
      const controller = new AbortController()
      abortControllerRef.current = controller
      const requestId = crypto.randomUUID()
      requestIdRef.current = requestId
      receivedChunkRef.current = false

      const endpoint = '/api/agent/chat'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bodyPayload, request_id: requestId }),
        signal: controller.signal,
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
          const event = camelizeKeys(JSON.parse(json)) as {
            type: string
            content?: string
            message?: string
            action?: string
            payload?: {
              students?: { name: string; classSchedule: { day: string; start: string; end: string }[] }[]
              slots?: { day: string; time: string; state: string }[]
              studentLinks?: { name: string; id: string }[]
            }
          }
          if (event.type === 'step') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, steps: [...(m.steps ?? []), event.content!] } : m
            ))
          } else if (event.type === 'chunk') {
            received = true
            receivedChunkRef.current = true
            typewriterQueueRef.current += event.content!
            startTypewriter(pendingId)
          } else if (event.type === 'done') {
            received = true
            shouldReloadRef.current = true
            if (typewriterIntervalRef.current) {
              loadingDeferredToTypewriter = true
              streamDoneRef.current = true
              onDrainRef.current = () => {
                setLoading(false)
                abortControllerRef.current = null
              }
            }
          } else if (event.type === 'stopped') {
            received = true
            flushTypewriter(pendingId)
            markError()
          } else if (event.type === 'error') {
            received = true
            stopTypewriter()
            typewriterQueueRef.current = ''
            setMessages(prev => prev.map(m =>
              m.id === pendingId
                ? { ...m, content: `Something went wrong: ${event.message}`, isError: true }
                : m
            ))
          } else if (event.type === 'ui_action' && event.action === 'download_schedule') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, scheduleStudents: event.payload?.students ?? [] } : m
            ))
          } else if (event.type === 'ui_action' && event.action === 'slots_ready') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, slotData: event.payload?.slots ?? [] } : m
            ))
          } else if (event.type === 'ui_action' && event.action === 'student_links') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, students: event.payload?.studentLinks ?? [] } : m
            ))
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        received = true
        flushTypewriter(pendingId)
        markError()
      } else {
        stopTypewriter()
        typewriterQueueRef.current = ''
        setMessages(prev => prev.map(m =>
          m.id === pendingId
            ? { ...m, content: `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}`, isError: true }
            : m
        ))
      }
    } finally {
      if (!received) {
        setMessages(prev => {
          const pending = prev.find(m => m.id === pendingId)
          if (pending?.isError) return prev
          return prev.map(m =>
            m.id === pendingId ? { ...m, content: 'No response received — please try again.', isError: true } : m
          )
        })
      }
      if (!loadingDeferredToTypewriter) {
        stopTypewriter()
        typewriterQueueRef.current = ''
        setLoading(false)
        abortControllerRef.current = null
      }
    }
  }

  const clearMutation = useMutation({
    mutationFn: async (convId: string) => {
      await fetch(`/api/agent/conversations/${convId}/clear`, { method: 'POST' })
    },
    onMutate: () => {
      setMessages([])
      setEditingMsgId(null)
      setEditDraft('')
    },
  })

  const stopMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await fetch('/api/agent/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      })
    },
  })

  function clearChat() {
    if (!conversationId) return
    clearMutation.mutate(conversationId)
  }

  function stop() {
    // Optimistic update — instant visual feedback regardless of server timing
    setMessages(prev => prev.map(m =>
      m.id === pendingIdRef.current ? { ...m, isError: true } : m
    ))
    if (receivedChunkRef.current) {
      abortControllerRef.current?.abort()
    } else {
      stopMutation.mutate(requestIdRef.current)
    }
  }

  function retry(msgId: string) {
    const errorIdx = messages.findIndex(m => m.id === msgId)
    if (errorIdx <= 0) return
    const userMsg = messages.slice(0, errorIdx).reverse().find(m => m.role === 'user')
    if (!userMsg) return
    void send(msgId)
  }

  function confirmEdit() {
    if (!editingMsgId || !editDraft.trim()) return
    const msgId = editingMsgId
    const content = editDraft.trim()
    setEditingMsgId(null)
    setEditDraft('')
    void send(undefined, { userMsgId: msgId, newContent: content })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] max-w-2xl mx-auto px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-navy">AI Agent</h1>
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
          const msgText = msg.content
          const msgStudents = msg.role === 'agent' ? (msg.students ?? []) : []
          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.role === 'user' ? (
                  editingMsgId === msg.id ? (
                    <div className="flex flex-col gap-1.5 w-full">
                      <textarea
                        autoFocus
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmEdit() }
                          if (e.key === 'Escape') { setEditingMsgId(null) }
                        }}
                        rows={3}
                        className="w-full rounded-2xl rounded-tr-sm border border-navy px-4 py-2.5 text-sm text-navy resize-none focus:outline-none bg-white"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingMsgId(null)}
                          className="text-xs text-slate-400 hover:text-navy transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={confirmEdit}
                          disabled={!editDraft.trim()}
                          className="text-xs bg-navy text-white rounded-lg px-2.5 py-1 hover:bg-navy/80 disabled:opacity-40 transition-colors"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-navy text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
                      {msg.content}
                    </div>
                  )
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm shadow-sm">
                    {msg.steps && msg.steps.length > 0 && (
                      <div className="text-xs text-slate-400 space-y-0.5 mb-2 pb-2 border-b border-slate-100 break-all">
                        {msg.steps.map((step, j) => (
                          <div key={j}>{step}</div>
                        ))}
                      </div>
                    )}
                    {!msg.content ? (
                      msg.isError ? (
                        <span className="text-slate-400 text-sm">⋯</span>
                      ) : (
                        <span className="inline-flex items-end gap-0.5 h-5">
                          {['0ms', '200ms', '400ms'].map((delay) => (
                            <span key={delay} className="w-1 h-1 bg-slate-400 rounded-full" style={{ animation: 'dot-jump 1s ease-in-out infinite', animationDelay: delay }} />
                          ))}
                        </span>
                      )
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
                {editingMsgId !== msg.id && (msg.timestamp || msg.isError || (msg.role === 'user' && msg.id === latestUserMsgId && !loading)) && (
                  <div className={`flex items-center w-full mt-1 px-1 min-w-[10rem] ${msg.role === 'user' ? 'justify-end' : 'justify-between'}`}>
                    {msg.timestamp && (
                      <span className="text-xs text-slate-400">
                        {formatMessageTime(msg.timestamp, renderNow)}
                      </span>
                    )}
                    {msg.role === 'user' && msg.id === latestUserMsgId && !loading && (
                      <button
                        type="button"
                        onClick={() => { setEditingMsgId(msg.id); setEditDraft(msg.content) }}
                        className="text-slate-400 hover:text-navy transition-colors ml-2.5"
                        aria-label="Edit message"
                      >
                        <PencilSquareIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {msg.isError && msg.id === latestAgentMsgId && (
                      <button
                        type="button"
                        onClick={() => retry(msg.id)}
                        disabled={loading || editingMsgId !== null}
                        className="text-xs text-slate-400 hover:text-navy transition-colors disabled:opacity-40"
                      >
                        ↻ Try again
                      </button>
                    )}
                  </div>
                )}
              </div>
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
        {loading ? (
          <Button
            onClick={stop}
            className="bg-slate-100 text-slate-600 px-4 py-2.5 hover:bg-slate-200 border border-slate-200"
          >
            ■ Stop
          </Button>
        ) : (
          <Button
            onClick={() => void send()}
            disabled={!input.trim() || !hydrated}
            className="bg-navy text-white px-4 py-2.5 hover:bg-navy/90"
          >
            Send
          </Button>
        )}
      </div>
    </div>
  )
}
