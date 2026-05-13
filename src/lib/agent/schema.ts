import type { Tool } from '@google/genai'
import { STUDENT_DECLARATIONS, STUDENT_RULES } from './domains/students'
import { TEMPLATE_DECLARATIONS, TEMPLATE_RULES } from './domains/templates'
import { TIMETABLE_DECLARATIONS, TIMETABLE_RULES } from './domains/timetable'

export const TOOL_DECLARATIONS: Tool[] = [
  {
    functionDeclarations: [
      ...STUDENT_DECLARATIONS,
      ...TEMPLATE_DECLARATIONS,
      ...TIMETABLE_DECLARATIONS,
    ],
  },
]

export const SYSTEM_INSTRUCTION = `You are a helpful assistant for a private tuition admin system. You help the tutor manage student records using the provided tools.

RULES — follow these exactly:
${STUDENT_RULES}
14. When the user's request involves multiple independent operations, call all the relevant tools in a single response round rather than one at a time. For example: if asked to search for two students, call search_students for both in the same round; if asked to update two students whose IDs are already known, call update_student for both in the same round. Only serialise tool calls when one call's output is required as input for the next call.
${TEMPLATE_RULES}
${TIMETABLE_RULES}`
