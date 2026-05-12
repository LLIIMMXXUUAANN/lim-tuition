# Agent SSE Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream AI agent tool-step events and final reply over SSE so the UI updates progressively instead of blocking until the full response is ready.

**Architecture:** The route returns a `ReadableStream` SSE response. During the function-calling loop it emits `step` events immediately as each tool fires; after the loop it emits a single `reply` event with the final text. The frontend adds a placeholder agent message on send, then patches it incrementally as SSE events arrive.

**Tech Stack:** Next.js App Router `ReadableStream` + `Response`, `text/event-stream` SSE, browser `ReadableStreamDefaultReader`, React state patching by message ID.

---

## File Map

| File | Change |
|---|---|
| `src/app/api/agent/chat/route.ts` | Return SSE `Response` instead of `NextResponse.json`; emit `step` / `reply` / `error` events |
| `src/components/agent/AgentChat.tsx` | Read SSE stream in `send()`; add placeholder message on send; patch it incrementally; remove separate `loading` bubble |

---

### Task 1: Convert route to SSE

**Files:**
- Modify: `src/app/api/agent/chat/route.ts`

- [ ] **Step 1: Replace the POST handler body with a streaming version**

Replace the entire contents of `src/app/api/agent/chat/route.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import type { Content } from '@google/genai'
import { requireTutor } from '@/lib/supabase/server'
import {
  errMsg,
  searchStudents, getStudent, listStudents,
  createStudent, updateStudent, deleteStudent,
  setupStudentGoogle, runSyncAll, managePortalAccess,
  type Supabase,
} from '@/lib/agent/tools'
import { TOOL_DECLARATIONS, SYSTEM_INSTRUCTION } from '@/lib/agent/schema'
import { selfEval } from '@/lib/agent/eval'

export const dynamic = 'force-dynamic'

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  supabase: Supabase
): Promise<unknown> {
  switch (name) {
    case 'search_students':
      return searchStudents(supabase, args.query as string)
    case 'get_student':
      return getStudent(supabase, args.id as string)
    case 'list_students':
      return listStudents(supabase, args as { status?: string; day?: string })
    case 'create_student':
      return createStudent(supabase, args as Parameters<typeof createStudent>[1])
    case 'update_student':
      return updateStudent(supabase, args.id as string, args.fields as Record<string, unknown>)
    case 'delete_student':
      return deleteStudent(supabase, args.id as string)
    case 'setup_student_google':
      return setupStudentGoogle(supabase, args.student_id as string)
    case 'sync_all_students':
      return runSyncAll(supabase)
    case 'manage_portal_access':
      return managePortalAccess(supabase, args.student_id as string, args.action as 'add' | 'remove', args.email as string)
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const MUTATION_TOOLS = new Set(['update_student', 'delete_student', 'setup_student_google'])
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as {
    messages?: { role: 'user' | 'model'; content: string }[]
  }

  if (!body.messages?.length) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }

  const contents: Content[] = body.messages.map(m => ({
    role: m.role,
    parts: [{ text: m.content }],
  }))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      let reply = ''
      let lastMutationTool: { name: string; args: Record<string, unknown>; createdId?: string } | null = null

      try {
        for (let round = 0; round < 10; round++) {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
              tools: TOOL_DECLARATIONS,
              systemInstruction: SYSTEM_INSTRUCTION,
            },
          })

          const fnCalls = response.functionCalls ?? []

          if (fnCalls.length === 0) {
            reply = response.text ?? ''
            break
          }

          const modelContent = response.candidates?.[0]?.content
          if (modelContent) contents.push(modelContent)

          const namedCalls = fnCalls.filter(fc => fc.name)
          for (const fc of namedCalls) {
            emit({ type: 'step', content: `🔧 ${fc.name}(${JSON.stringify(fc.args)})` })
          }

          const toolResults = await Promise.all(
            namedCalls.map(fc => executeTool(fc.name!, fc.args as Record<string, unknown>, supabase))
          )

          const fnResponseParts: Array<{
            functionResponse: { name: string; id?: string; response: Record<string, unknown> }
          }> = []

          for (let i = 0; i < namedCalls.length; i++) {
            const fc = namedCalls[i]
            const result = toolResults[i]
            fnResponseParts.push({
              functionResponse: {
                name: fc.name!,
                ...(fc.id ? { id: fc.id } : {}),
                response: { result },
              },
            })
            if (fc.name === 'create_student' && typeof result === 'object' && result !== null && 'student' in result) {
              const created = (result as { student: { id: string } }).student
              lastMutationTool = { name: fc.name, args: fc.args as Record<string, unknown>, createdId: created.id }
            } else if (MUTATION_TOOLS.has(fc.name!)) {
              lastMutationTool = { name: fc.name!, args: fc.args as Record<string, unknown> }
            }
          }

          contents.push({ role: 'user', parts: fnResponseParts })
        }
      } catch (err) {
        emit({ type: 'error', message: errMsg(err, 'Gemini API error') })
        controller.close()
        return
      }

      if (!reply) {
        reply = "I wasn't able to complete that in the allowed steps — please try a simpler request."
      }

      if (lastMutationTool) {
        const verification = await selfEval(
          lastMutationTool.name,
          lastMutationTool.args,
          supabase,
          lastMutationTool.createdId,
        )
        if (verification) emit({ type: 'step', content: verification })
      }

      emit({ type: 'reply', content: reply })
      controller.close()
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
```

- [ ] **Step 2: Verify type correctness**

```bash
npm run build
```

Expected: no TypeScript errors in `route.ts`. (Build may error on other files — only care about this file for now.)

---

### Task 2: Update AgentChat to consume SSE stream

**Files:**
- Modify: `src/components/agent/AgentChat.tsx`

- [ ] **Step 1: Replace `send()` with SSE-reading version**

Replace the entire `send()` function (lines 59–99 in the current file) with:

```typescript
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
        } else if (event.type === 'reply') {
          setMessages(prev => prev.map(m =>
            m.id === pendingId ? { ...m, content: event.content! } : m
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
    // Fallback: if stream closed without a reply event, show error
    setMessages(prev => prev.map(m =>
      m.id === pendingId && !m.content
        ? { ...m, content: "No response received — please try again." }
        : m
    ))
    setLoading(false)
  }
}
```

- [ ] **Step 2: Update the agent bubble render to handle the streaming placeholder**

In the messages map, locate the agent bubble JSX (the `else` branch after `msg.role === 'user'`). Replace it with:

```tsx
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
```

- [ ] **Step 3: Remove the separate loading bubble**

Delete these lines (the standalone loading indicator at the bottom of the messages list):

```tsx
{loading && (
  <div className="flex justify-start">
    <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-400 shadow-sm">
      <span className="animate-pulse text-sm">⋯</span>
    </div>
  </div>
)}
```

The placeholder message now handles this — it shows `⋯` while `content` is empty.

- [ ] **Step 4: Verify type correctness and build**

```bash
npm run build
```

Expected: clean build with no TypeScript errors.

- [ ] **Step 5: Manual smoke test**

Start the dev server (`npm run dev`) and open `/admin/agent`.

Test 1 — no-tool query: type "hello" → agent bubble should appear immediately with `⋯`, then fill with reply text.

Test 2 — single tool: type "list all active students" → `⋯` bubble appears, then `🔧 list_students(...)` step appears, then reply text fills in.

Test 3 — multi-tool: type "search for [known student name] and tell me their fee" → watch steps appear one by one before the reply.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/agent/chat/route.ts src/components/agent/AgentChat.tsx
git commit -m "feat(agent): stream tool steps and reply over SSE"
```
