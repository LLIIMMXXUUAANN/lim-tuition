# Agent: Schedule & Fee Summary Tools

**Date:** 2026-05-12

## Overview

Add two new tools to the AI agent: `get_schedule` (query students by class day) and `get_fee_summary` (calculate monthly revenue across active students). Both are read-only and require no new DB tables or API routes.

---

## Tool 1: `get_schedule`

### Behaviour
- Input: `day` — enum of `Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday`
- Fetches all active students, filters to those with at least one `ClassSlot` matching the requested day
- Returns `{ day, students: [{ id, name, slots: [{ start, end }] }] }`
- If no students have class on that day, returns `{ day, students: [] }`

### Natural language resolution
Gemini resolves "today", "tomorrow", "this Friday" etc. to the correct day name **before** calling the tool. To enable this, the current date and day are injected into the system instruction at request time (in `chat/route.ts`):
```
Today is {dayName}, {date} (Malaysia Time).
```
This line is prepended to `SYSTEM_INSTRUCTION` dynamically on each request.

### Implementation
- New `getSchedule(supabase, day: string)` in `src/lib/agent/tools.ts`
- Queries `.select('id, name, class_schedule').eq('status', 'Active')`
- Filters in JS: `students.filter(s => s.class_schedule?.some(slot => slot.day === day))`
- Maps each matched student to `{ id, name, slots: schedule filtered to that day }`

---

## Tool 2: `get_fee_summary`

### Behaviour
- Input: optional `month` (1–12) and `year` (e.g. 2026); defaults to current month/year in MYT
- Fetches all active students with `id`, `name`, `fee_per_hour`, `class_schedule`
- For each student, calculates exact monthly fee:
  - Group `class_schedule` slots by day
  - For each day, count actual occurrences of that weekday in the month (using `DAY_INDEX` from `utils.ts`)
  - Fee per day = `fee_per_hour × duration_hours × session_count`
  - Sum across all days
- Returns `{ month, year, students: [{ id, name, fee }], total }`
- Students with no schedule or zero sessions are included with `fee: 0`

### Implementation
- New `getFeeSummary(supabase, month?: number, year?: number)` in `src/lib/agent/tools.ts`
- Inline `getWeekdayDates(year, month, weekday)` helper (~10 lines) — same logic as `generate-payment/route.ts`, not extracted to a shared file (small enough, avoids over-abstraction)
- Current month/year resolved via `Intl.DateTimeFormat` with `Asia/Kuala_Lumpur`

---

## Schema changes (`src/lib/agent/schema.ts`)

Two new entries in `TOOL_DECLARATIONS[0].functionDeclarations`:

**`get_schedule`**
```
description: "Get the list of students who have class on a given day of the week."
parameters: { day: enum[Monday..Sunday], required }
```

**`get_fee_summary`**
```
description: "Calculate total monthly tuition fee revenue across all active students."
parameters: { month: number (optional), year: number (optional) }
```

Two new rules appended to `SYSTEM_INSTRUCTION`:
- Rule 12: Use `get_schedule` when the user asks who they have class with on a specific day. Format results as a **Name | Time** table (times in 12-hour format). If `students` is empty, say "No classes on [day]."
- Rule 13: Use `get_fee_summary` when the user asks about monthly revenue, total fees, or income. Format results as a **Name | Fee (RM)** table with a bold **Total** row at the bottom. If no month/year specified, omit them from the tool call (defaults to current month).

---

## Route changes (`src/app/api/agent/chat/route.ts`)

1. Import `getSchedule` and `getFeeSummary` from `tools`
2. Compute current MYT date string at the top of the `POST` handler and prepend to `SYSTEM_INSTRUCTION`:
   ```ts
   const myt = new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())
   const systemInstruction = `Today is ${myt} (Malaysia Time).\n\n${SYSTEM_INSTRUCTION}`
   ```
3. Add two cases to `executeTool`:
   - `'get_schedule'` → `getSchedule(supabase, args.day as string)`
   - `'get_fee_summary'` → `getFeeSummary(supabase, args.month as number | undefined, args.year as number | undefined)`

---

## Files changed

| File | Change |
|---|---|
| `src/lib/agent/tools.ts` | Add `getSchedule()` and `getFeeSummary()` |
| `src/lib/agent/schema.ts` | Add 2 tool declarations + 2 system instruction rules |
| `src/app/api/agent/chat/route.ts` | Inject date into system instruction; add 2 tool cases |

No new files. No DB migrations. No new API routes.
