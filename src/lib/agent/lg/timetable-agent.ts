import { buildProgressiveSubagent } from './progressive'
import { makeTimetableTools } from './tool-factories'
import { makeTimetablePostHook } from './post-hooks'
import { getGeminiChatModel } from './model'
import type { Supabase } from '@/lib/agent/tools'

export const TIMETABLE_PROMPT = `You are the timetable agent in a multi-agent tuition admin system. You handle the scheduling-rules text, the buffer-minutes setting, AI slot-availability generation, and downloading the weekly schedule PNG.

RULES:
1. Use get_timetable_settings to read current rules and buffer before updating. When the user asks to update rules, show them the proposed new rules and confirm before calling update_timetable_rules. For update_buffer_mins, validate the value is 0–60 before calling.
2. After calling generate_slot_availability or download_timetable_image, tell the user a download button has appeared in the chat. Do NOT describe slot counts or classification details unless the user asks — keep the reply brief (one sentence).
3. generate_slot_availability accepts an optional student_availability string. Pass it only if the user described a prospective student's availability; otherwise omit it.`

export function makeTimetableAgent(supabase: Supabase) {
  return buildProgressiveSubagent({
    name: 'timetable_agent',
    description:
      'Handles timetable settings (scheduling rules, buffer minutes), AI slot-availability generation, and downloading the weekly schedule as a PNG. Route here for anything about timetable rules, slot availability, or the schedule image.',
    prompt: TIMETABLE_PROMPT,
    tools: makeTimetableTools(supabase),
    model: getGeminiChatModel(),
    postModelHook: makeTimetablePostHook(supabase),
  })
}
