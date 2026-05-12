# Agent Schedule & Fee Summary Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `get_schedule` and `get_fee_summary` tools to the AI agent so the tutor can ask "who do I have class with on Friday?" and "what's my total revenue for June?"

**Architecture:** Two pure read-only functions added to `tools.ts`, two new Gemini function declarations + system instruction rules in `schema.ts`, and three wiring changes in `chat/route.ts` (imports, dynamic date injection into system prompt, two new `executeTool` cases).

**Tech Stack:** Next.js App Router, TypeScript, Supabase, `@google/genai` (Gemini 2.5 Flash), `DAY_INDEX` + `timeToMins` from `src/lib/utils.ts`.

---

## File Map

| File | Change |
|---|---|
| `src/lib/agent/tools.ts` | Add `getSchedule()` and `getFeeSummary()` + import `timeToMins`, `DAY_INDEX` |
| `src/lib/agent/schema.ts` | Add 2 `functionDeclarations` entries + 2 system instruction rules |
| `src/app/api/agent/chat/route.ts` | Import new functions, inject MYT date into system instruction, add 2 `executeTool` cases |

---

## Task 1: Add `getSchedule` and `getFeeSummary` to tools.ts

**Files:**
- Modify: `src/lib/agent/tools.ts`

- [ ] **Step 1: Add the import for `timeToMins` and `DAY_INDEX`**

Open `src/lib/agent/tools.ts`. The current import block starts with:
```typescript
import { createClient } from '@/lib/supabase/server'
import type { StudentMode, PaymentMethod, StudentStatus, ClassSlot } from '@/lib/types'
```

Add one line after the second import:
```typescript
import { timeToMins, DAY_INDEX } from '@/lib/utils'
```

- [ ] **Step 2: Add the `getWeekdayDates` helper and `getSchedule` function**

Append to the end of `src/lib/agent/tools.ts`:

```typescript
function getWeekdayDates(year: number, month: number, weekday: string): number[] {
  const dayIndex = DAY_INDEX[weekday]
  if (dayIndex === undefined) return []
  const dates: number[] = []
  const d = new Date(year, month - 1, 1)
  while (d.getDay() !== dayIndex) d.setDate(d.getDate() + 1)
  while (d.getMonth() === month - 1) {
    dates.push(d.getDate())
    d.setDate(d.getDate() + 7)
  }
  return dates
}

export async function getSchedule(supabase: Supabase, day: string) {
  const { data, error } = await supabase
    .from('students')
    .select('id, name, class_schedule')
    .eq('status', 'Active')
  if (error) return { error: error.message }

  const students = (data ?? [])
    .filter(s => s.class_schedule?.some((slot: ClassSlot) => slot.day === day))
    .map(s => ({
      id: s.id,
      name: s.name,
      slots: (s.class_schedule as ClassSlot[])
        .filter(slot => slot.day === day)
        .map(slot => ({ start: slot.start, end: slot.end })),
    }))

  return { day, students }
}
```

- [ ] **Step 3: Add `getFeeSummary` function**

Append directly after `getSchedule` in `src/lib/agent/tools.ts`:

```typescript
export async function getFeeSummary(supabase: Supabase, month?: number, year?: number) {
  const myt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }))
  const resolvedMonth = month ?? (myt.getMonth() + 1)
  const resolvedYear = year ?? myt.getFullYear()

  const { data, error } = await supabase
    .from('students')
    .select('id, name, fee_per_hour, class_schedule')
    .eq('status', 'Active')
  if (error) return { error: error.message }

  const students = (data ?? []).map(s => {
    const schedule = (s.class_schedule as ClassSlot[]) ?? []
    const slotsByDay = new Map<string, ClassSlot[]>()
    for (const slot of schedule) {
      slotsByDay.set(slot.day, [...(slotsByDay.get(slot.day) ?? []), slot])
    }
    let fee = 0
    for (const [day, slots] of slotsByDay) {
      const dates = getWeekdayDates(resolvedYear, resolvedMonth, day)
      const hoursPerSession = slots.reduce(
        (sum, slot) => sum + (timeToMins(slot.end) - timeToMins(slot.start)) / 60,
        0,
      )
      fee += dates.length * hoursPerSession * s.fee_per_hour
    }
    return { id: s.id, name: s.name, fee: Math.round(fee * 100) / 100 }
  })

  const total = Math.round(students.reduce((sum, s) => sum + s.fee, 0) * 100) / 100
  return { month: resolvedMonth, year: resolvedYear, students, total }
}
```

- [ ] **Step 4: Verify types compile**

```bash
npm run build
```

Expected: no TypeScript errors related to the new functions. (Other pre-existing errors, if any, are irrelevant.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/tools.ts
git commit -m "feat(agent): add getSchedule and getFeeSummary tool functions"
```

---

## Task 2: Add tool declarations and system instruction rules to schema.ts

**Files:**
- Modify: `src/lib/agent/schema.ts`

- [ ] **Step 1: Add `get_schedule` and `get_fee_summary` to `TOOL_DECLARATIONS`**

Open `src/lib/agent/schema.ts`. Find the closing of the last existing `functionDeclarations` entry (`manage_portal_access`). It ends like this:

```typescript
      {
        name: 'manage_portal_access',
        ...
        },
      },
    ],
  },
]
```

Insert the two new declarations **before** the final `],` that closes `functionDeclarations`:

```typescript
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
```

- [ ] **Step 2: Add rules 12 and 13 to `SYSTEM_INSTRUCTION`**

The `SYSTEM_INSTRUCTION` string ends with:
```
11. If a tool result contains suggestGoogleSetup: true, ask the user: "Would you like me to also set up Google Calendar and Drive for [student name]?" and wait for their reply. Only call setup_student_google if they say yes.\``
```

Change that closing backtick to append two more rules:

```typescript
11. If a tool result contains suggestGoogleSetup: true, ask the user: "Would you like me to also set up Google Calendar and Drive for [student name]?" and wait for their reply. Only call setup_student_google if they say yes.
12. Use get_schedule when the user asks who they have class with on a specific day. The current date is injected at the top of this prompt — use it to resolve "today", "tomorrow", and relative day references to the correct Monday–Sunday day name before calling. Format results as a table: Name | Time (12-hour format, e.g. 3:00 PM – 5:00 PM). If students is empty, say "No classes on [day]."
13. Use get_fee_summary when the user asks about monthly revenue, total fees, income, or earnings. If no month or year is specified, omit them from the tool call (the tool defaults to the current month). Format results as a table: Name | Fee (RM), with a bold **Total** row at the bottom showing the grand total.`
```

- [ ] **Step 3: Verify types compile**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/schema.ts
git commit -m "feat(agent): add get_schedule and get_fee_summary tool declarations and rules"
```

---

## Task 3: Wire up new tools in chat/route.ts

**Files:**
- Modify: `src/app/api/agent/chat/route.ts`

- [ ] **Step 1: Add imports for the two new functions**

Open `src/app/api/agent/chat/route.ts`. The current import from `tools` reads:

```typescript
import {
  errMsg,
  searchStudents, getStudent, listStudents,
  createStudent, updateStudent, deleteStudent,
  setupStudentGoogle, runSyncAll, managePortalAccess,
  type Supabase,
} from '@/lib/agent/tools'
```

Add `getSchedule` and `getFeeSummary` to that import:

```typescript
import {
  errMsg,
  searchStudents, getStudent, listStudents,
  createStudent, updateStudent, deleteStudent,
  setupStudentGoogle, runSyncAll, managePortalAccess,
  getSchedule, getFeeSummary,
  type Supabase,
} from '@/lib/agent/tools'
```

- [ ] **Step 2: Inject the current MYT date into the system instruction**

Inside the `POST` handler, the Gemini call currently passes `systemInstruction: SYSTEM_INSTRUCTION` as a static string. Add a dynamic date line at the top of the `POST` function body (after the auth check and body parse, before the `contents` mapping):

```typescript
const mytDate = new Intl.DateTimeFormat('en-MY', {
  timeZone: 'Asia/Kuala_Lumpur',
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}).format(new Date())
const systemInstruction = `Today is ${mytDate} (Malaysia Time).\n\n${SYSTEM_INSTRUCTION}`
```

Then in the `generateContentStream` call, change:
```typescript
systemInstruction: SYSTEM_INSTRUCTION,
```
to:
```typescript
systemInstruction,
```

- [ ] **Step 3: Add two cases to `executeTool`**

Inside `executeTool`, add the two new cases before the `default:` case:

```typescript
    case 'get_schedule':
      return getSchedule(supabase, args.day as string)
    case 'get_fee_summary':
      return getFeeSummary(supabase, args.month as number | undefined, args.year as number | undefined)
```

- [ ] **Step 4: Verify types compile**

```bash
npm run build
```

Expected: clean build with no errors.

- [ ] **Step 5: Smoke test in the browser**

Start the dev server:
```bash
npm run dev
```

Open `http://localhost:3000/admin/agent` and log in as admin. Try these prompts:

1. `"Who do I have class with on Monday?"` — should call `get_schedule` with `day: "Monday"`, return a Name | Time table or "No classes on Monday."
2. `"Who do I have class with today?"` — Gemini should resolve today's day and call `get_schedule`.
3. `"What's my total revenue for this month?"` — should call `get_fee_summary` with no args, return a Name | Fee table with a Total row.
4. `"What's my total revenue for June 2026?"` — should call `get_fee_summary` with `month: 6, year: 2026`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/agent/chat/route.ts
git commit -m "feat(agent): wire get_schedule and get_fee_summary into chat route"
```
