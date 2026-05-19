import { NextRequest, NextResponse } from 'next/server'
import { HumanMessage, AIMessage, type BaseMessage } from '@langchain/core/messages'
import { requireTutor } from '@/lib/supabase/server'
import { makeSupervisor } from '@/lib/agent/lg/supervisor'
import { pipeLangGraphStream } from '@/lib/agent/lg/stream-adapter'
import { getMYTDateString } from '@/lib/utils'

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
  }
  if (!body.messages?.length) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }

  const mytDate = getMYTDateString()

  const messages: BaseMessage[] = body.messages.map(m =>
    m.role === 'model' ? new AIMessage(m.content) : new HumanMessage(m.content),
  )

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
          },
        )
        await pipeLangGraphStream(lgStream, emit)
      } catch (err) {
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Supervisor error' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
