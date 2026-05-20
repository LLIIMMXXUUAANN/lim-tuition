import { AIMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { selfEval } from '@/lib/agent/eval'
import type { Supabase } from '@/lib/agent/tools'
import type { SubagentPostHook, SubagentStateType, SubagentUpdateType } from './progressive'

export const SELF_EVAL_MESSAGE_NAME = 'self_eval'

const STUDENT_MUTATIONS = new Set([
  'create_student',
  'update_student',
  'delete_student',
  'setup_student_google',
  'manage_portal_access',
])

const TIMETABLE_MUTATIONS = new Set([
  'update_timetable_rules',
  'update_buffer_mins',
])

interface LastMutation {
  name: string
  args: Record<string, unknown>
  toolCallId?: string
}

function findLastMutationCall(messages: BaseMessage[], mutationSet: Set<string>): LastMutation | null {
  // Only search after the last self_eval to avoid re-running on mutations from prior tool rounds
  let searchFrom = messages.length - 1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] instanceof SystemMessage && (messages[i] as SystemMessage).name === SELF_EVAL_MESSAGE_NAME) {
      searchFrom = i - 1
      break
    }
  }
  for (let i = searchFrom; i >= 0; i--) {
    const m = messages[i]
    if (!AIMessage.isInstance(m) || !m.tool_calls?.length) continue
    const call = m.tool_calls.find(tc => tc.name && mutationSet.has(tc.name))
    if (!call) continue
    return {
      name: call.name as string,
      args: (call.args ?? {}) as Record<string, unknown>,
      toolCallId: call.id,
    }
  }
  return null
}

function findCreatedIdInToolResult(messages: BaseMessage[], toolCallId: string | undefined): string | undefined {
  if (!toolCallId) return undefined
  for (const m of messages) {
    if (!(m instanceof ToolMessage) || m.tool_call_id !== toolCallId) continue
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    try {
      const parsed = JSON.parse(content) as { student?: { id?: string } }
      return parsed.student?.id
    } catch {
      return undefined
    }
  }
  return undefined
}

function makePostHook(supabase: Supabase, mutationSet: Set<string>): SubagentPostHook {
  return async function postHook(state: SubagentStateType): Promise<SubagentUpdateType> {
    const last = findLastMutationCall(state.messages, mutationSet)
    if (!last) return {}
    const createdId = last.name === 'create_student'
      ? findCreatedIdInToolResult(state.messages, last.toolCallId)
      : undefined
    const verdict = await selfEval(last.name, last.args, supabase, createdId)
    if (!verdict) return {}
    return {
      messages: [new SystemMessage({ content: verdict, name: SELF_EVAL_MESSAGE_NAME })],
    }
  }
}

export function makeStudentPostHook(supabase: Supabase): SubagentPostHook {
  return makePostHook(supabase, STUDENT_MUTATIONS)
}

export function makeTimetablePostHook(supabase: Supabase): SubagentPostHook {
  return makePostHook(supabase, TIMETABLE_MUTATIONS)
}
