import { AIMessage, AIMessageChunk, SystemMessage, type BaseMessage, type BaseMessageChunk } from '@langchain/core/messages'
import { SELF_EVAL_MESSAGE_NAME } from './post-hooks'
import { stopSignals, isAbortError } from '@/lib/agent/stop-signals'

type SSEEvent =
  | { type: 'chunk'; content: string }
  | { type: 'step'; content: string }
  | { type: 'error'; message: string }
  | { type: 'download_schedule'; students: unknown }
  | { type: 'slots_ready'; slots: unknown }
  | { type: 'done' }
  | { type: 'stopped' }

export type Emit = (event: SSEEvent) => void

function isAIChunk(m: unknown): m is BaseMessageChunk {
  return typeof m === 'object' && m !== null && '_getType' in m
}

export function extractText(msg: { content: unknown }): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .map(part => (typeof part === 'string' ? part : 'text' in part ? (part as { text?: string }).text ?? '' : ''))
      .join('')
  }
  return ''
}

function shouldSkipToolName(name: string | undefined): boolean {
  if (!name) return true
  return name === 'dispatch' || name.startsWith('transfer_')
}

function emitToolStepsFromMessages(messages: BaseMessage[], emit: Emit) {
  for (const m of messages) {
    if (AIMessage.isInstance(m) && m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        if (shouldSkipToolName(tc.name)) continue
        emit({ type: 'step', content: `🔧 ${tc.name}(${JSON.stringify(tc.args ?? {})})` })
      }
    } else if (m instanceof SystemMessage && m.name === SELF_EVAL_MESSAGE_NAME) {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      emit({ type: 'step', content: text })
    }
  }
}

// Supervisor is a subgraph compiled with name 'supervisor', so its events arrive with
// namespace = ['supervisor:<uuid>'] (or empty at top level). Subagent events have a
// namespace like ['student_agent:<uuid>'].
function isFromSupervisor(namespace: string[] | undefined): boolean {
  if (!namespace || namespace.length === 0) return true
  return namespace[0]?.startsWith('supervisor:') ?? false
}

function isFromAnySubagent(namespace: string[] | undefined): boolean {
  if (!namespace || namespace.length === 0) return false
  return !namespace[0]?.startsWith('supervisor:')
}

// Returns true if the stream completed normally (done emitted), false if aborted/stopped early.
export async function pipeLangGraphStream(
  stream: AsyncIterable<unknown>,
  emit: Emit,
  signal?: AbortSignal,
  requestId?: string,
): Promise<boolean> {
  let streamedAnyText = false
  let lastSupervisorFinalText = ''

  try {
    for await (const raw of stream) {
      // A1: client disconnected (text-round abort) — exit silently
      if (signal?.aborted) return false
      if (!Array.isArray(raw)) continue
      let namespace: string[] | undefined
      let mode: string
      let data: unknown
      if (raw.length === 3) {
        namespace = raw[0] as string[]
        mode = raw[1] as string
        data = raw[2]
      } else if (raw.length === 2) {
        mode = raw[0] as string
        data = raw[1]
      } else {
        continue
      }

      if (mode === 'messages') {
        const [msg] = data as [BaseMessageChunk, unknown]
        if (!isAIChunk(msg)) continue
        const chunk = msg as AIMessageChunk
        if (chunk.tool_calls?.length || chunk.tool_call_chunks?.length) continue
        if (!isFromSupervisor(namespace) || isFromAnySubagent(namespace)) continue
        const text = extractText(chunk)
        if (!text) continue
        emit({ type: 'chunk', content: text })
        streamedAnyText = true
      } else if (mode === 'updates') {
        const updateMap = data as Record<string, { messages?: BaseMessage[] } | undefined>
        for (const update of Object.values(updateMap)) {
          if (!update?.messages?.length) continue
          emitToolStepsFromMessages(update.messages, emit)
          if (isFromSupervisor(namespace) && !isFromAnySubagent(namespace)) {
            for (const m of update.messages) {
              if (AIMessage.isInstance(m) && (!m.tool_calls || m.tool_calls.length === 0)) {
                const text = extractText(m)
                if (text) lastSupervisorFinalText = text
              }
            }
          }
        }
      } else if (mode === 'custom') {
        const obj = data as { download_schedule?: unknown; slots_ready?: unknown }
        if (obj && 'download_schedule' in obj) {
          emit({ type: 'download_schedule', students: obj.download_schedule })
        }
        if (obj && 'slots_ready' in obj) {
          emit({ type: 'slots_ready', slots: obj.slots_ready })
        }
      }

      // Belt-and-suspenders: if LangGraph ignores the abort signal and keeps running,
      // catch the soft-stop flag here between events so the user sees 'Cancelled' promptly.
      if (requestId && stopSignals.get(requestId)) {
        stopSignals.delete(requestId)
        emit({ type: 'stopped' })
        return false
      }
    }

    // Only emit done/fallback if we completed normally (not aborted)
    if (!signal?.aborted) {
      if (!streamedAnyText) {
        emit({ type: 'chunk', content: lastSupervisorFinalText || '(no response from supervisor — check server logs)' })
      }
      emit({ type: 'done' })
      return true
    }
    return false
  } catch (err) {
    if (isAbortError(err)) return false
    emit({ type: 'error', message: err instanceof Error ? err.message : 'Stream error' })
    return false
  }
}
