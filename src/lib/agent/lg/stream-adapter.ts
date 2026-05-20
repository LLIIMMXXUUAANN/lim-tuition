import { AIMessage, AIMessageChunk, SystemMessage, type BaseMessage, type BaseMessageChunk } from '@langchain/core/messages'
import { SELF_EVAL_MESSAGE_NAME } from './post-hooks'

type SSEEvent =
  | { type: 'chunk'; content: string }
  | { type: 'step'; content: string }
  | { type: 'error'; message: string }
  | { type: 'download_schedule'; students: unknown }
  | { type: 'slots_ready'; slots: unknown }
  | { type: 'done' }

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
  return name === 'select_tool' || name === 'dispatch' || name.startsWith('transfer_')
}

function emitToolStepsFromMessages(messages: BaseMessage[], emit: Emit) {
  for (const m of messages) {
    if ((m instanceof AIMessage || m instanceof AIMessageChunk) && m.tool_calls?.length) {
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

export async function pipeLangGraphStream(
  stream: AsyncIterable<unknown>,
  emit: Emit,
): Promise<void> {
  let streamedAnyText = false
  let lastSupervisorFinalText = ''

  try {
    for await (const raw of stream) {
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
              if ((m instanceof AIMessage || m instanceof AIMessageChunk) && (!m.tool_calls || m.tool_calls.length === 0)) {
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
    }

    // Fallback: if streaming never emitted any chunk but we captured a final supervisor reply,
    // emit it as a single chunk so the user always sees the answer.
    if (!streamedAnyText) {
      emit({ type: 'chunk', content: lastSupervisorFinalText || '(no response from supervisor — check server logs)' })
    }

    emit({ type: 'done' })
  } catch (err) {
    emit({ type: 'error', message: err instanceof Error ? err.message : 'Stream error' })
  }
}
