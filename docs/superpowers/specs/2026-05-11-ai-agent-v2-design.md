# AI Agent v2 — Student Tab Full Coverage

**Date:** 2026-05-11
**Scope:** Extend the AI agent to cover all student-tab operations, including Google Calendar and Drive, plus a list/filter query tool.

---

## Goals

- Agent can answer roster queries: "list all active students", "who has class on Monday?"
- Agent can set up Google Calendar events and Drive folder for a student via a single command
- Agent can sync all active students' Calendar + Drive in one command
- Agent's delete command cleans up Google (Calendar + Drive) before removing the DB row, matching UI behaviour

## Non-goals

- Templates tab operations
- Timetable tab operations
- Fine-grained Google tools (separate `create_calendar_event` / `create_drive_folder` commands)

---

## Tool Architecture

All 7 tools live in `src/app/api/agent/chat/route.ts`. No new routes.

| Tool | v1/v2 | Description |
|---|---|---|
| `search_students` | v1 | Search by name (partial match) |
| `list_students` | **NEW** | List all students; optional `status` + `day` filters |
| `create_student` | v1 | Create a new student record |
| `update_student` | v1 | Update fields on an existing student |
| `delete_student` | **ENHANCED** | Cleans up Google then deletes DB row |
| `setup_student_google` | **NEW** | Creates Calendar events + Drive folder; saves results to student |
| `sync_all_students` | **NEW** | Syncs all active students' Calendar + Drive |

---

## Tool Specs

### `list_students(status?, day?)`

**Parameters:**
- `status` (optional): `"Active" | "On Hold" | "Completed"`
- `day` (optional): `"Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday"`

**Behaviour:** Queries `students` table. Status filter applied at DB level. Day filter applied in JS (`class_schedule` JSONB array filtered with `.some(slot => slot.day === day)`). No params = all students.

**Returns:** `{ id, name, status, mode, fee_per_hour, class_schedule }[]`

---

### `setup_student_google(student_id)`

**Parameters:**
- `student_id`: UUID (must be obtained from `search_students` first)

**Sequence:**
1. Read student: `name`, `class_schedule`, `calendar_event_ids`, `google_meet_link`, `google_drive_link`
2. If `calendar_event_ids` absent → call `createWeeklyClassEvents(auth, name, class_schedule)` → save `google_meet_link` + `calendar_event_ids` to student
3. If `google_drive_link` absent → call `createStudentDriveFolder(auth, name, meetLink, class_schedule)` → save `google_drive_link` to student
4. Return summary of what was created vs skipped

**Partial setup handling:**
- Both already set up → inform user, do nothing
- Only Calendar missing → create Calendar only
- Only Drive missing → create Drive using existing `google_meet_link`
- Both missing → create Calendar then Drive in sequence

**Calls:** `getOAuth2Client` + lib functions directly (`createWeeklyClassEvents`, `createStudentDriveFolder`) — not via HTTP to own API routes.

---

### `sync_all_students()`

**Parameters:** none

**Behaviour:** Runs the same logic as `src/app/api/google/sync-all/route.ts`. For each active student: finds/saves event IDs if missing, then patches Calendar events and rewrites Drive Meet doc.

**Returns:** Per-student summary (`✓ synced / – skipped / ✗ error`). Surfaces `invalid_grant` with reconnect message if detected.

**No separate self-evaluation** — tool result already contains per-student status.

---

### `delete_student(id)` *(enhanced)*

**Enhanced sequence:**
1. Read student: `google_drive_link`, `calendar_event_ids`
2. If either exists: get OAuth client, run Google cleanup in parallel (trash Drive folder, delete Calendar events)
3. Google cleanup failure is **non-fatal** — warns in reply but proceeds to DB delete
4. Delete DB row
5. Existing self-eval (verify student gone from DB) unchanged

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| No OAuth token in DB | Return: "Google not connected — visit /api/google/auth to set up" |
| Calendar creation fails in `setup_student_google` | Return error; do not attempt Drive (no meet link available) |
| Drive creation fails after Calendar succeeded | Partial success: "Calendar ✓, Drive ✗" — meet link + event IDs already saved |
| `sync_all_students` `invalid_grant` | Surface reconnect message; stop early |
| `delete_student` Google cleanup fails | Warn in reply; proceed with DB delete (non-fatal) |
| `delete_student` DB delete fails | Return error; student unchanged |

---

## System Instruction Additions

Three new rules appended to `SYSTEM_INSTRUCTION`:

1. Before calling `setup_student_google`, always call `search_students` first to obtain the student UUID.
2. Before calling `sync_all_students`, confirm with the user — it affects all active students.
3. When asking the user to confirm deletion, explicitly state that Google Calendar events and Drive folder will also be permanently removed.

---

## Self-Evaluation

| Tool | Self-eval |
|---|---|
| `setup_student_google` | Re-query student; verify `google_meet_link` + `google_drive_link` are now set |
| `sync_all_students` | None — tool result contains per-student status |
| `delete_student` | Existing: verify student gone from DB |
| `list_students` | None — read-only |

---

## Implementation Notes

- `setup_student_google` and the enhanced `delete_student` both need `getOAuth2Client(supabase)` — import from `src/lib/google/auth.ts`
- Google lib imports needed in `route.ts`:
  - `src/lib/google/auth.ts` — `getOAuth2Client`
  - `src/lib/google/calendar.ts` — `createWeeklyClassEvents`, `findRecurringEventIds`, `updateWeeklyClassEvents`
  - `src/lib/google/drive.ts` — `createStudentDriveFolder`, `updateStudentMeetDoc`, `parseDriveFolderId`
- Delete Google cleanup logic (trash Drive + delete Calendar events) currently lives only in `src/app/api/google/delete-student/route.ts` — extract into a `deleteStudentGoogle(auth, driveUrl?, eventIds?)` helper in `src/lib/google/` for reuse by the agent route
- `sync_all_students` logic currently lives in `src/app/api/google/sync-all/route.ts` — extract core logic into `src/lib/google/sync.ts` (or similar) for reuse
