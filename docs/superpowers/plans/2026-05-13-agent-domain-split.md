# Agent Domain Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `schema.ts` (TOOL_DECLARATIONS + SYSTEM_INSTRUCTION) into three domain modules — students, templates, timetable — while keeping runtime behaviour identical.

**Architecture:** Create `src/lib/agent/domains/{students,templates,timetable}.ts`, each exporting a `DECLARATIONS` array and a `RULES` string. `schema.ts` becomes a thin composer that spreads the three arrays and concatenates the three rule strings. `tools.ts` and the route handler are untouched.

**Tech Stack:** TypeScript · `@google/genai` (Type, Tool)

---

## File Structure

**Create:**
- `src/lib/agent/domains/students.ts` — 11 student tool declarations + student system rules (rules 1–13)
- `src/lib/agent/domains/templates.ts` — 3 template tool declarations + template system rules (rules 15–16)
- `src/lib/agent/domains/timetable.ts` — 5 timetable tool declarations + timetable system rules (rules 17–18)

**Modify:**
- `src/lib/agent/schema.ts` — replace with thin composer; keeps rule 14 (parallel calls) inline

**Unchanged:**
- `src/lib/agent/tools.ts`
- `src/app/api/agent/chat/route.ts`

Tasks 1–3 are independent and can be done in parallel.

---

### Task 1: Create students domain

**Files:**
- Create: `src/lib/agent/domains/students.ts`

- [ ] **Step 1: Create the file**

```typescript
import { Type } from '@google/genai'

export const STUDENT_DECLARATIONS = [
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
                enum: [
                  'Monday', 'Tuesday', 'Wednesday', 'Thursday',
                  'Friday', 'Saturday', 'Sunday',
                ],
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
          enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agent/domains/students.ts
git commit -m "refactor(agent): extract student domain declarations and rules"
```

---

### Task 2: Create templates domain

**Files:**
- Create: `src/lib/agent/domains/templates.ts`

- [ ] **Step 1: Create the file**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agent/domains/templates.ts
git commit -m "refactor(agent): extract templates domain declarations and rules"
```

---

### Task 3: Create timetable domain

**Files:**
- Create: `src/lib/agent/domains/timetable.ts`

- [ ] **Step 1: Create the file**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agent/domains/timetable.ts
git commit -m "refactor(agent): extract timetable domain declarations and rules"
```

---

### Task 4: Replace schema.ts with thin composer

**Files:**
- Modify: `src/lib/agent/schema.ts`

Complete replacement — the old `TEMPLATE_META` import moves to `domains/templates.ts` (Task 2). Rule 14 (parallel calls) stays inline here as it is cross-domain.

- [ ] **Step 1: Replace `src/lib/agent/schema.ts`**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/agent/schema.ts
git commit -m "refactor(agent): schema.ts becomes thin domain composer"
```

---

### Task 5: Verify build

**Files:** none changed

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: exits 0 with no type errors. Any type error in the spread (`...STUDENT_DECLARATIONS` etc.) means `FunctionDeclaration` type mismatch — check that the `name`, `description`, `parameters` shapes match the SDK's expected type and fix accordingly.

- [ ] **Step 2: Smoke-check agent in browser**

Start dev server (`npm run dev`), open `/admin/agent`, send a test message that exercises one tool from each domain (e.g. "list all students" → students, "show me the payment template" → templates, "what are my timetable settings" → timetable). Confirm normal responses with no errors.
