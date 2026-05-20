import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { DAYS } from '@/lib/utils'
import { TEMPLATE_META } from '@/lib/templates'
import {
  searchStudents, getStudent, listStudents,
  createStudent, updateStudent, deleteStudent,
  setupStudentGoogle, runSyncAll, managePortalAccess,
  getSchedule, getFeeSummary,
  listTemplates, getTemplate, generatePaymentMessage,
  getTimetableSettings, updateTimetableRules, updateBufferMins,
  generateSlotAvailability, downloadTimetableImage,
  type Supabase,
} from '@/lib/agent/tools'
import type { StudentMode, PaymentMethod, StudentStatus } from '@/lib/types'

// Gemini rejects empty `properties` on OBJECT schemas, so tools with no real
// arguments take an optional `_reason` so the schema is non-empty.
const noArgSchema = z.object({
  _reason: z.string().optional().describe('Optional reason for invoking this tool'),
})

const classSlotSchema = z.object({
  day: z.enum(DAYS as unknown as [string, ...string[]]),
  start: z.string().describe('24-hour HH:MM format, e.g. "15:00"'),
  end: z.string().describe('24-hour HH:MM format, e.g. "17:00"'),
})

export function makeStudentTools(supabase: Supabase) {
  return [
    tool(async ({ query }) => searchStudents(supabase, query), {
      name: 'search_students',
      description:
        'Search for students by name (partial match). Returns id, name, status, class_schedule. Use before update/delete/get to obtain the student ID.',
      schema: z.object({
        query: z.string().describe('Partial or full student name'),
      }),
    }),

    tool(async ({ id }) => getStudent(supabase, id), {
      name: 'get_student',
      description:
        'Fetch full details of a single student by UUID — all fields including fee, notes, homework, contact info, Google links, and portal access emails. Call search_students first to get the UUID.',
      schema: z.object({
        id: z.string().describe('Student UUID obtained from search_students'),
      }),
    }),

    tool(async ({ status }) => listStudents(supabase, { status }), {
      name: 'list_students',
      description:
        'List students with an optional status filter. Use when the user asks to see all students or students with a specific status. For day-based schedule queries ("who do I have on Monday?"), use get_schedule instead.',
      schema: z.object({
        status: z.enum(['Active', 'On Hold', 'Completed']).optional()
          .describe('Filter by student status (optional)'),
      }),
    }),

    tool(async (args) => createStudent(supabase, args as Parameters<typeof createStudent>[1]), {
      name: 'create_student',
      description: 'Create a new student record in the database.',
      schema: z.object({
        name: z.string(),
        mode: z.enum(['My Python Syllabus', 'Other Syllabus']) as z.ZodType<StudentMode>,
        fee_per_hour: z.number().describe('Hourly fee in RM'),
        payment_method: z.enum(['Monthly', 'Weekly']).optional() as z.ZodType<PaymentMethod | undefined>,
        status: z.enum(['Active', 'On Hold', 'Completed']).optional() as z.ZodType<StudentStatus | undefined>,
        class_schedule: z.array(classSlotSchema).optional(),
        contact_person: z.string().optional(),
        contact_phone: z.string().optional(),
        student_phone: z.string().optional(),
        today_homework: z.string().optional(),
        notes: z.string().optional(),
        latest_payment: z.string().optional(),
        access_emails: z.array(z.string()).optional()
          .describe('Portal login emails for the student/parent'),
        google_meet_link: z.string().optional().describe('Google Meet URL'),
        google_drive_link: z.string().optional().describe('Google Drive folder URL'),
      }),
    }),

    tool(async ({ id, fields }) => updateStudent(supabase, id, fields), {
      name: 'update_student',
      description:
        'Update one or more fields on an existing student. You MUST call search_students first to obtain the student UUID.',
      schema: z.object({
        id: z.string().describe('Student UUID obtained from search_students'),
        fields: z.object({
          name: z.string().optional(),
          mode: z.enum(['My Python Syllabus', 'Other Syllabus']).optional(),
          fee_per_hour: z.number().optional(),
          payment_method: z.enum(['Monthly', 'Weekly']).optional(),
          status: z.enum(['Active', 'On Hold', 'Completed']).optional(),
          class_schedule: z.array(classSlotSchema).optional(),
          contact_person: z.string().optional(),
          contact_phone: z.string().optional(),
          student_phone: z.string().optional(),
          today_homework: z.string().optional(),
          notes: z.string().optional(),
          latest_payment: z.string().optional(),
          google_meet_link: z.string().optional(),
          google_drive_link: z.string().optional(),
          access_emails: z.array(z.string()).optional()
            .describe('Full desired list — adds/removes handled automatically by diffing against current list'),
        }).describe('Fields to update. Only include the keys you want to change.'),
      }),
    }),

    tool(async ({ id }) => deleteStudent(supabase, id), {
      name: 'delete_student',
      description:
        'Permanently delete a student record. Only call this AFTER the user has typed "yes" to confirm deletion in this conversation.',
      schema: z.object({
        id: z.string().describe('Student UUID obtained from search_students'),
      }),
    }),

    tool(async ({ student_id }) => setupStudentGoogle(supabase, student_id), {
      name: 'setup_student_google',
      description:
        'Set up Google Calendar weekly events and Drive folder for a student. Creates Calendar events (generating a Meet link) then creates the Drive folder. Skips whichever is already done. You MUST call search_students first to get the student UUID.',
      schema: z.object({
        student_id: z.string().describe('Student UUID obtained from search_students'),
      }),
    }),

    tool(async () => runSyncAll(supabase), {
      name: 'sync_all_students',
      description:
        "Sync all active students' Google Calendar events and Drive Meet docs to match the database schedule. Affects every active student — always confirm with the user before calling.",
      schema: noArgSchema,
    }),

    tool(async ({ student_id, action, email }) => managePortalAccess(supabase, student_id, action, email), {
      name: 'manage_portal_access',
      description:
        "Add or remove an email address from a student's portal access list. Use search_students first to get the student UUID.",
      schema: z.object({
        student_id: z.string().describe('Student UUID obtained from search_students'),
        action: z.enum(['add', 'remove']).describe('Whether to add or remove the email'),
        email: z.string().describe('Email address to add or remove'),
      }),
    }),

    tool(async ({ day }) => getSchedule(supabase, day), {
      name: 'get_schedule',
      description:
        'Get the list of students who have class on a given day of the week. Returns student names and their slot times for that day.',
      schema: z.object({
        day: z.enum(DAYS as unknown as [string, ...string[]]).describe('Day of the week'),
      }),
    }),

    tool(async ({ month, year }) => getFeeSummary(supabase, month, year), {
      name: 'get_fee_summary',
      description:
        'Calculate total monthly tuition fee revenue across all active students. Uses exact session counts for the given month.',
      schema: z.object({
        month: z.number().optional()
          .describe('Month number 1-12 (optional, defaults to current month in MYT)'),
        year: z.number().optional()
          .describe('Year e.g. 2026 (optional, defaults to current year in MYT)'),
      }),
    }),
  ]
}

export function makeTemplateTools(supabase: Supabase) {
  return [
    tool(async () => listTemplates(), {
      name: 'list_templates',
      description:
        'List all message templates with their id, title, and description — no content. Use this only to discover which template ID to use, then call get_template with that ID to fetch the actual content.',
      schema: noArgSchema,
    }),

    tool(async ({ id }) => getTemplate(supabase, id), {
      name: 'get_template',
      description:
        'Fetch a single message template by its id. Call list_templates first if you are unsure which id the user means.',
      schema: z.object({
        id: z.enum(Object.keys(TEMPLATE_META) as [string, ...string[]]).describe('Template id'),
      }),
    }),

    tool(async (args) => generatePaymentMessage(supabase, args as Parameters<typeof generatePaymentMessage>[1]), {
      name: 'generate_payment_message',
      description:
        "Generate a ready-to-send payment reminder message for a student. Automatically calculates session dates and total fee from the student's schedule and fee rate. Defaults to next calendar month if month/year are not specified.",
      schema: z.object({
        student_id: z.string().describe('Student UUID'),
        month: z.number().optional()
          .describe('Month 1-12 (optional, defaults to next month in MYT)'),
        year: z.number().optional()
          .describe("Year e.g. 2026 (optional, defaults to next month's year in MYT)"),
        template_type: z.number().int().optional()
          .describe('Template type: 1 = standard reminder (default), 2 = with carryover sessions deducted from total'),
        carryover: z.number().optional()
          .describe('Number of sessions from the previous month to carry over and deduct (only used when template_type is 2)'),
      }),
    }),
  ]
}

export function makeTimetableTools(supabase: Supabase) {
  return [
    tool(async () => getTimetableSettings(supabase), {
      name: 'get_timetable_settings',
      description:
        'Read the current timetable scheduling rules and buffer minutes from the database. Call this before update_timetable_rules or update_buffer_mins to show the user the current values.',
      schema: noArgSchema,
    }),

    tool(async ({ rules }) => updateTimetableRules(supabase, rules), {
      name: 'update_timetable_rules',
      description:
        'Save new scheduling rules text to the database. These rules guide the AI slot generator (preferred/normal/unavailable classification). Always show the user the new rules before calling.',
      schema: z.object({
        rules: z.string().describe('Full scheduling rules text to save'),
      }),
    }),

    tool(async ({ buffer_mins }) => updateBufferMins(supabase, buffer_mins), {
      name: 'update_buffer_mins',
      description:
        'Save a new buffer duration (in minutes) to the database. Buffer zones block slots immediately before/after booked classes. Valid range: 0-60.',
      schema: z.object({
        buffer_mins: z.number().describe('Buffer duration in minutes (0-60)'),
      }),
    }),

    tool(async ({ student_availability }, config) => {
      const result = await generateSlotAvailability(supabase, student_availability ?? '')
      const writer = (config as LangGraphRunnableConfig | undefined)?.writer
      if ('slots' in result && writer) {
        writer({ slots_ready: result.slots })
      }
      return result
    }, {
      name: 'generate_slot_availability',
      description:
        "Run the AI slot-availability generator. Reads current rules, buffer, and all active students' schedules from the database, then classifies every free 30-minute slot as preferred, normal, or unavailable. Optionally accepts a description of a new student's availability to bias the classification. After the tool completes, a \"Download PNG\" button appears automatically in the chat.",
      schema: z.object({
        student_availability: z.string().optional()
          .describe('Free-text description of when a prospective student can attend (optional). Example: "free Tuesday and Thursday after 4pm".'),
      }),
    }),

    tool(async (_args, config) => {
      const result = await downloadTimetableImage(supabase)
      const writer = (config as LangGraphRunnableConfig | undefined)?.writer
      if ('students' in result && writer) {
        writer({ download_schedule: result.students })
      }
      return result
    }, {
      name: 'download_timetable_image',
      description:
        "Download the weekly schedule as a PNG image showing all active students' class blocks. After the tool completes, a \"Download PNG\" button appears automatically in the chat.",
      schema: noArgSchema,
    }),
  ]
}
