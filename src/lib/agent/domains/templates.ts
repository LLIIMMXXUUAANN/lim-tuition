import { Type } from '@google/genai'
import { TEMPLATE_META } from '@/lib/templates'

export const TEMPLATE_DECLARATIONS = [
  {
    name: 'list_templates',
    description:
      'List all message templates with their id, title, and description — no content. Use this only to discover which template ID to use, then call get_template with that ID to fetch the actual content.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'get_template',
    description:
      'Fetch a single message template by its id. Call list_templates first if you are unsure which id the user means.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          enum: Object.keys(TEMPLATE_META),
          description: 'Template id',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'generate_payment_message',
    description:
      "Generate a ready-to-send payment reminder message for a student. Automatically calculates session dates and total fee from the student's schedule and fee rate. Defaults to next calendar month if month/year are not specified.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        student_id: { type: Type.STRING, description: 'Student UUID' },
        month: {
          type: Type.NUMBER,
          description: 'Month 1–12 (optional, defaults to next month in MYT)',
        },
        year: {
          type: Type.NUMBER,
          description: "Year e.g. 2026 (optional, defaults to next month's year in MYT)",
        },
        template_type: {
          type: Type.NUMBER,
          description: '1 = standard reminder, 2 = with carryover sessions deducted from total (optional, defaults to 1)',
        },
        carryover: {
          type: Type.NUMBER,
          description: 'Number of sessions from the previous month to carry over and deduct (only used when template_type is 2)',
        },
      },
      required: ['student_id'],
    },
  },
]

export const TEMPLATE_RULES = `15. For template requests: if the user names a specific template (e.g. "payment", "first approach", "review"), call get_template directly with the matching id. If it is unclear which template they mean, call list_templates first. When displaying a template, format your reply as: one line with the title (e.g. "**First Approach**"), then a blank line, then the full content inside a fenced code block (triple backticks, no language tag) so it is easy to copy. Never put the title and "Content:" label on the same line.
16. Use generate_payment_message when the user asks to generate a payment message or reminder for a student. If no month or year is specified, omit them (the tool defaults to next month). Ask whether to use carryover (template_type 2) only if the user mentions it — otherwise default to template_type 1. Display the result with a one-line header (e.g. "**Payment reminder — June 2026**") then the message in a fenced code block for easy copying.`
