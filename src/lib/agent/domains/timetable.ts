import { Type } from '@google/genai'

export const TIMETABLE_DECLARATIONS = [
  {
    name: 'get_timetable_settings',
    description:
      'Read the current timetable scheduling rules and buffer minutes from the database. Call this before update_timetable_rules or update_buffer_mins to show the user the current values.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'update_timetable_rules',
    description:
      'Save new scheduling rules text to the database. These rules guide the AI slot generator (preferred/normal/unavailable classification). Always show the user the new rules before calling.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        rules: {
          type: Type.STRING,
          description: 'Full scheduling rules text to save',
        },
      },
      required: ['rules'],
    },
  },
  {
    name: 'update_buffer_mins',
    description:
      'Save a new buffer duration (in minutes) to the database. Buffer zones block slots immediately before/after booked classes. Valid range: 0–60.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        buffer_mins: {
          type: Type.NUMBER,
          description: 'Buffer duration in minutes (0–60)',
        },
      },
      required: ['buffer_mins'],
    },
  },
  {
    name: 'generate_slot_availability',
    description:
      "Run the AI slot-availability generator. Reads current rules, buffer, and all active students' schedules from the database, then classifies every free 30-minute slot as preferred, normal, or unavailable. Optionally accepts a description of a new student's availability to bias the classification. After the tool completes, a \"Download PNG\" button appears automatically in the chat.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        student_availability: {
          type: Type.STRING,
          description: 'Free-text description of when a prospective student can attend (optional). Example: "free Tuesday and Thursday after 4pm".',
        },
      },
    },
  },
  {
    name: 'download_timetable_image',
    description:
      "Download the weekly schedule as a PNG image showing all active students' class blocks. After the tool completes, a \"Download PNG\" button appears automatically in the chat.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
]

export const TIMETABLE_RULES = `17. Timetable settings: use get_timetable_settings to read current rules and buffer before updating. When the user asks to update rules, show them the proposed new rules and confirm before calling update_timetable_rules. For update_buffer_mins, validate the value is 0–60 before calling.
18. After calling generate_slot_availability or download_timetable_image, tell the user a download button has appeared in the chat. Do NOT describe the slot counts or classification details unless the user asks — keep the reply brief (one sentence).`
