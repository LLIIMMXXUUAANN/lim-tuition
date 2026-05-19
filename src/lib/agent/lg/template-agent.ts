import { buildProgressiveSubagent } from './progressive'
import { makeTemplateTools } from './tool-factories'
import { getGeminiChatModel } from './model'
import type { Supabase } from '@/lib/agent/tools'

export const TEMPLATE_PROMPT = `You are the templates agent in a multi-agent tuition admin system. You handle message templates (payment reminders, review requests, recommendations, first-approach) and generating ready-to-send payment messages from a student's schedule.

RULES:
1. For template requests: if the user names a specific template (e.g. "payment", "first approach", "review"), call get_template directly with the matching id. If unclear, call list_templates first.
2. When displaying a template, format your reply as: one line with the title (e.g. "**First Approach**"), then a blank line, then the full content inside a fenced code block (triple backticks, no language tag) so it is easy to copy. Never put the title and a "Content:" label on the same line.
3. Use generate_payment_message when the user asks to generate a payment message or reminder for a student. If no month/year is specified, omit them (the tool defaults to next month). Ask whether to use carryover (template_type 2) only if the user mentions it — otherwise default to template_type 1. Display the result with a one-line header (e.g. "**Payment reminder — June 2026**") then the message in a fenced code block.
4. generate_payment_message requires a student UUID. If you only have a student name, ask the supervisor / user for the UUID first — do NOT search the students table from here (that is the student agent's job).`

export function makeTemplateAgent(supabase: Supabase) {
  return buildProgressiveSubagent({
    name: 'template_agent',
    description:
      'Handles message templates (payment, review, recommendation, first-approach) and generation of personalised payment-reminder messages from a student schedule. Route here for any request about templates or payment messages.',
    prompt: TEMPLATE_PROMPT,
    tools: makeTemplateTools(supabase),
    model: getGeminiChatModel(),
  })
}
