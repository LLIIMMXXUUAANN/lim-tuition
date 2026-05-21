import { NextRequest, NextResponse } from 'next/server'
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages'
import { requireTutor } from '@/lib/supabase/server'
import { makeSupervisor } from '@/lib/agent/lg/supervisor'
import { pipeLangGraphStream } from '@/lib/agent/lg/stream-adapter'
import { getMYTDateString } from '@/lib/utils'
import { stopSignals, requestAbortControllers, isAbortError } from '@/lib/agent/stop-signals'

export const dynamic = 'force-dynamic'

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
    requestId?: string
  }
  if (!body.messages?.length) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }

  const { requestId } = body

  const mytDate = getMYTDateString()

  const messages: BaseMessage[] = body.messages.map(m =>
    m.role === 'model' ? new AIMessage(m.content) : new HumanMessage(m.content),
  )

  // Per-request controller: fires on client disconnect (req.signal) OR soft-stop (stop endpoint)
  const abortController = new AbortController()
  req.signal.addEventListener('abort', () => abortController.abort(), { once: true })
  if (requestId) requestAbortControllers.set(requestId, abortController)

  const supervisor = makeSupervisor(supabase, mytDate)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }
      try {
        const lgStream = await supervisor.stream(
          { messages },
          {
            streamMode: ['messages', 'updates', 'custom'],
            subgraphs: true,
            recursionLimit: 50,
            signal: abortController.signal,
          },
        )
        await pipeLangGraphStream(lgStream, emit, abortController.signal, requestId)
      } catch (err) {
        if (!isAbortError(err)) {
          emit({ type: 'error', message: err instanceof Error ? err.message : 'Supervisor error' })
        }
      } finally {
        const wasStopped = requestId ? (stopSignals.get(requestId) ?? false) : false
        if (requestId) {
          requestAbortControllers.delete(requestId)
          stopSignals.delete(requestId)
        }
        // Only emit 'stopped' if it was a soft-stop, not a client disconnect
        if (wasStopped && !req.signal.aborted) {
          emit({ type: 'stopped' })
        }
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
