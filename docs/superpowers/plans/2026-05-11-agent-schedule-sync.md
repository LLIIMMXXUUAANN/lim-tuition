# Agent Schedule Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the agent updates a student's `class_schedule`, automatically sync Google Calendar events and the Drive Meet doc to match — matching the behaviour of the UI's Save button.

**Architecture:** Extend `updateStudent` in `src/app/api/agent/chat/route.ts` to detect when `class_schedule` is in the updated fields, then call `updateWeeklyClassEvents` (and optionally `updateStudentMeetDoc`) after the DB write. DB save always succeeds first; Google failures are non-fatal warnings. Students with no Calendar set up are silently skipped.

**Tech Stack:** Next.js 16 · `@google/genai` · `googleapis` · Supabase · TypeScript

---

## File Map

| Action | File | Change |
|---|---|---|
| **Modify** | `src/app/api/agent/chat/route.ts` | Add 2 imports; replace `updateStudent` function |

---

## Task 1: Auto-sync Calendar + Drive on schedule change in `update_student`

**Files:**
- Modify: `src/app/api/agent/chat/route.ts`

- [ ] **Step 1: Add `updateWeeklyClassEvents` and `updateStudentMeetDoc` imports**

Find the existing calendar import (line 7):
```typescript
import { createWeeklyClassEvents } from '@/lib/google/calendar'
```
Replace with:
```typescript
import { createWeeklyClassEvents, updateWeeklyClassEvents } from '@/lib/google/calendar'
```

Find the existing drive import (line 8):
```typescript
import { createStudentDriveFolder } from '@/lib/google/drive'
```
Replace with:
```typescript
import { createStudentDriveFolder, updateStudentMeetDoc } from '@/lib/google/drive'
```

- [ ] **Step 2: Replace the `updateStudent` function**

Find and replace the entire `updateStudent` function (currently lines 97–109):

Old:
```typescript
async function updateStudent(
  supabase: Supabase,
  id: string,
  fields: Record<string, unknown>
) {
  const permitted = Object.fromEntries(
    Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_KEYS.has(k))
  )
  if (Object.keys(permitted).length === 0) return { error: 'No valid fields to update' }
  const { error } = await supabase.from('students').update(permitted).eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}
```

New:
```typescript
async function updateStudent(
  supabase: Supabase,
  id: string,
  fields: Record<string, unknown>
) {
  const permitted = Object.fromEntries(
    Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_KEYS.has(k))
  )
  if (Object.keys(permitted).length === 0) return { error: 'No valid fields to update' }

  const { error } = await supabase.from('students').update(permitted).eq('id', id)
  if (error) return { error: error.message }

  // If schedule didn't change, nothing more to do
  if (!('class_schedule' in permitted)) return { success: true }

  // Schedule changed — sync Calendar + Drive if the student has Google set up
  const { data: student } = await supabase
    .from('students')
    .select('name, class_schedule, calendar_event_ids, google_meet_link, google_drive_link')
    .eq('id', id)
    .maybeSingle()

  // Student not found or Google not set up — skip silently
  if (!student?.calendar_event_ids?.length || !student?.google_meet_link) {
    return { success: true }
  }

  let auth: Awaited<ReturnType<typeof getOAuth2Client>>
  try {
    auth = await getOAuth2Client()
  } catch (err) {
    return {
      success: true,
      googleWarning: `Schedule saved but Calendar not updated: ${err instanceof Error ? err.message : 'Google not connected'}`,
    }
  }

  const warnings: string[] = []

  try {
    const { eventIds } = await updateWeeklyClassEvents(
      auth,
      student.name,
      student.class_schedule as ClassSlot[],
      student.calendar_event_ids,
      student.google_meet_link,
    )
    const { error: dbErr } = await supabase
      .from('students')
      .update({ calendar_event_ids: eventIds })
      .eq('id', id)
    if (dbErr) warnings.push(`Calendar updated but event ID save failed: ${dbErr.message}`)
  } catch (err) {
    warnings.push(`Calendar update failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }

  if (student.google_drive_link) {
    try {
      await updateStudentMeetDoc(
        auth,
        student.google_drive_link,
        student.name,
        student.class_schedule as ClassSlot[],
        student.google_meet_link,
      )
    } catch (err) {
      warnings.push(`Drive Meet doc update failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return {
    success: true,
    ...(warnings.length ? { googleWarnings: warnings } : {}),
  }
}
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: clean build, no TypeScript errors. If `updateWeeklyClassEvents` gives a type error, verify the import in Step 1 was applied correctly — the function signature is `updateWeeklyClassEvents(auth, studentName, schedule, existingEventIds, meetLink)`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/agent/chat/route.ts
git commit -m "feat(agent): auto-sync Calendar and Drive when schedule changes via update_student"
```
