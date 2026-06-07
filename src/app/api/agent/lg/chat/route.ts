import { NextRequest, NextResponse } from 'next/server'
import { HumanMessage, AIMessage, SystemMessage, ToolMessage, type BaseMessage, type StoredMessage, mapStoredMessagesToChatMessages, mapChatMessagesToStoredMessages } from '@langchain/core/messages'
import { requireTutor } from '@/services/supabase/server'
import { makeSupervisor } from '@/features/agent/lib/lg/supervisor'
import { pipeLangGraphStream } from '@/features/agent/lib/lg/stream-adapter'
import { getMYTDateString } from '@/lib/utils'
import { stopSignals, requestAbortControllers, isAbortError } from '@/features/agent/lib/stop-signals'
import { SELF_EVAL_MESSAGE_NAME } from '@/features/agent/lib/lg/post-hooks'

export const dynamic = 'force-dynamic'

function isRoutingRelevant(msg: BaseMessage): boolean {
  if (msg instanceof HumanMessage) return true
  if (msg instanceof SystemMessage) return msg.name === SELF_EVAL_MESSAGE_NAME
  if (msg instanceof ToolMessage) {
    const name = msg.name ?? ''
    return name === 'dispatch' || name.startsWith('transfer_back_to_')
  }
  if (AIMessage.isInstance(msg)) {
    const calls = msg.tool_calls
    if (!calls || calls.length === 0) return true
    return calls.some(tc => tc.name === 'dispatch' || tc.name?.startsWith('transfer_back_to_'))
  }
  return false
}

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
    lgHistory?: StoredMessage[]
  }
  if (!body.messages?.length) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }

  const { requestId } = body

  const mytDate = getMYTDateString()

  let messages: BaseMessage[]
  if (body.lgHistory?.length) {
    const latestUserMsg = body.messages[body.messages.length - 1].content
    const restored = mapStoredMessagesToChatMessages(body.lgHistory)
    messages = [...restored, new HumanMessage(latestUserMsg)]
  } else {
    messages = body.messages.map(m =>
      m.role === 'model' ? new AIMessage(m.content) : new HumanMessage(m.content),
    )
  }

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
      let completedNormally = false
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
        completedNormally = await pipeLangGraphStream(lgStream, emit, abortController.signal, requestId,
          async (accumulatedMessages) => {
            const fullHistory = [...messages, ...accumulatedMessages].filter(isRoutingRelevant)
            emit({ type: 'lg_history', messages: mapChatMessagesToStoredMessages(fullHistory) })
          },
        )
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
        // Only emit stopped for a soft-stop that arrived before the stream finished normally.
        if (wasStopped && !req.signal.aborted && !completedNormally) {
          emit({ type: 'stopped' })
        }
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
