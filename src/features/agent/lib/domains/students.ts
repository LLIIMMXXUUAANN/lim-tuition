import { Type, type FunctionDeclaration } from '@google/genai'
import { DAYS } from '@/lib/utils'

export const STUDENT_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'search_students',
    description:
      'Search for students by name (partial match). Returns id, name, status, class_schedule. Use before update/delete/get to obtain the student ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Partial or full student name' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_student',
    description:
      'Fetch full details of a single student by UUID — all fields including fee, notes, homework, contact info, Google links, and portal access emails. Call search_students first to get the UUID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING, description: 'Student UUID obtained from search_students' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_students',
    description:
      'List students with an optional status filter. Use when the user asks to see all students or students with a specific status. For day-based schedule queries ("who do I have on Monday?"), use get_schedule instead.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: {
          type: Type.STRING,
          enum: ['Active', 'On Hold', 'Completed'],
          description: 'Filter by student status (optional)',
        },
      },
    },
  },
  {
    name: 'create_student',
    description: 'Create a new student record in the database.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        mode: {
          type: Type.STRING,
          enum: ['My Python Syllabus', 'Other Syllabus'],
        },
        fee_per_hour: { type: Type.NUMBER, description: 'Hourly fee in RM' },
        payment_method: { type: Type.STRING, enum: ['Monthly', 'Weekly'] },
        status: {
          type: Type.STRING,
          enum: ['Active', 'On Hold', 'Completed'],
        },
        class_schedule: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              day: {
                type: Type.STRING,
                enum: DAYS,
              },
              start: {
                type: Type.STRING,
                description: '24-hour HH:MM format, e.g. "15:00"',
              },
              end: {
                type: Type.STRING,
                description: '24-hour HH:MM format, e.g. "17:00"',
              },
            },
            required: ['day', 'start', 'end'],
          },
        },
        contact_person: { type: Type.STRING },
        contact_phone: { type: Type.STRING },
        student_phone: { type: Type.STRING },
        today_homework: { type: Type.STRING },
        notes: { type: Type.STRING },
        latest_payment: { type: Type.STRING },
        access_emails: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Portal login emails for the student/parent',
        },
        google_meet_link: { type: Type.STRING, description: 'Google Meet URL' },
        google_drive_link: { type: Type.STRING, description: 'Google Drive folder URL' },
      },
      required: ['name', 'mode', 'fee_per_hour'],
    },
  },
  {
    name: 'update_student',
    description:
      'Update one or more fields on an existing student. You MUST call search_students first to obtain the student UUID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: 'Student UUID obtained from search_students',
        },
        fields: {
          type: Type.OBJECT,
          description:
            'Object of fields to update. Allowed keys: name, mode, fee_per_hour, payment_method, status, class_schedule, contact_person, contact_phone, student_phone, today_homework, notes, latest_payment, google_meet_link, google_drive_link, access_emails. When updating access_emails, provide the full desired list — adds and removes are handled automatically by diffing against the current list.',
        },
      },
      required: ['id', 'fields'],
    },
  },
  {
    name: 'delete_student',
    description:
      'Permanently delete a student record. Only call this AFTER the user has typed "yes" to confirm deletion in this conversation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: 'Student UUID obtained from search_students',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'setup_student_google',
    description:
      'Set up Google Calendar weekly events and Drive folder for a student. Creates Calendar events (generating a Meet link) then creates the Drive folder. Skips whichever is already done. You MUST call search_students first to get the student UUID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        student_id: {
          type: Type.STRING,
          description: 'Student UUID obtained from search_students',
        },
      },
      required: ['student_id'],
    },
  },
  {
    name: 'sync_all_students',
    description:
      "Sync all active students' Google Calendar events and Drive Meet docs to match the database schedule. Affects every active student — always confirm with the user before calling.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'manage_portal_access',
    description:
      "Add or remove an email address from a student's portal access list. Use search_students first to get the student UUID.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        student_id: { type: Type.STRING, description: 'Student UUID obtained from search_students' },
        action: { type: Type.STRING, enum: ['add', 'remove'], description: 'Whether to add or remove the email' },
        email: { type: Type.STRING, description: 'Email address to add or remove' },
      },
      required: ['student_id', 'action', 'email'],
    },
  },
  {
    name: 'get_schedule',
    description:
      'Get the list of students who have class on a given day of the week. Returns student names and their slot times for that day.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        day: {
          type: Type.STRING,
          enum: DAYS,
          description: 'Day of the week',
        },
      },
      required: ['day'],
    },
  },
  {
    name: 'get_fee_summary',
    description:
      'Calculate total monthly tuition fee revenue across all active students. Uses exact session counts for the given month.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        month: {
          type: Type.NUMBER,
          description: 'Month number 1–12 (optional, defaults to current month in MYT)',
        },
        year: {
          type: Type.NUMBER,
          description: 'Year e.g. 2026 (optional, defaults to current year in MYT)',
        },
      },
    },
  },
]

export const STUDENT_RULES = `1. Before calling get_student, update_student, delete_student, setup_student_google, or manage_portal_access, you need the student's UUID. If it already appears earlier in this conversation, reuse it directly — do not call search_students again. Only call search_students if the UUID is not already known.
2. Never call delete_student without first asking: "Are you sure you want to permanently delete [name]? Type yes to confirm." You must see "yes" in the conversation before proceeding.
3. If a create_student command is missing required fields (mode, fee_per_hour), ask for them before calling the tool.
4. If search_students returns multiple matches, list them and ask which student the user means.
5. If search_students returns no results when the user wanted to update/delete, say so and offer to create instead.
6. After successfully creating or updating one or more students, append one token per student at the end of your reply in this exact format: [student_id:NAME:UUID] where NAME is the student's name and UUID is their UUID. Example for two students: [student_id:Lynn:uuid-1] [student_id:Ang:uuid-2]. The UI will render a "View NAME →" link for each token.
7. Keep replies concise and friendly. Always use clean markdown formatting in your replies:
    - Use tables whenever displaying multiple records or multiple fields side by side.
    - Use bold labels for single-record detail views (e.g. **Name:** Ang).
    - Never show raw UUIDs in the reply body — the UI renders a "View student" link separately.
    - Skip fields that are null, empty, or "-" — do not print them at all.
    - Render Google Meet and Drive URLs as markdown links: [Meet link](url), [Drive folder](url).
    - For multi-line fields like notes or homework, use a blockquote (> text).
    - When displaying list_students results, use a table with columns: Name | Mode | Fee/hr | Schedule. Compress schedule into one cell e.g. "Mon 18:45–19:45, Wed 11:00–12:00". Do NOT call get_student for each result.
    - Use list_students (not search_students) whenever the user asks to see all students, active students, or any roster-style query — even if they don't say the word "list". For day-based queries ("who do I have on Monday?"), use get_schedule instead.
    - When displaying a single student's full details, group fields: basic info → contact → schedule → Google → other.
8. Before calling sync_all_students, ask the user: "This will sync Google Calendar and Drive for all active students. Confirm?" and wait for explicit confirmation.
9. When asking the user to confirm deletion (before calling delete_student), state explicitly that their Google Calendar events and Drive folder will also be permanently removed.
10. After a successful setup_student_google, also include the student token in your reply using the same format as Rule 6: [student_id:NAME:UUID]
11. If a tool result contains suggestGoogleSetup: true, ask the user: "Would you like me to also set up Google Calendar and Drive for [student name]?" and wait for their reply. Only call setup_student_google if they say yes.
12. Use get_schedule when the user asks who they have class with on a specific day. The current date is injected at the top of this prompt — use it to resolve "today", "tomorrow", and relative day references to the correct Monday–Sunday day name before calling. Format results as a table: Name | Time (12-hour format, e.g. 3:00 PM – 5:00 PM). If students is empty, say "No classes on [day]."
13. Use get_fee_summary when the user asks about monthly revenue, total fees, income, or earnings — whether for all students or a specific student. If no month or year is specified, omit them from the tool call (the tool defaults to the current month). The tool returns per-student fees; if the user asked about a specific student, find that student in the returned list and report only their fee. Format all-student results as a table: Name | Fee (RM) with a bold **Total** row. For a single-student query, just state their fee directly.`
