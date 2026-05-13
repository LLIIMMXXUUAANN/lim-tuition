# Agent Tool Reference

All 14 tools available to the AI agent at `/admin/agent`. Implemented in `src/lib/agent/tools.ts`; Gemini function schemas in `src/lib/agent/schema.ts`.

---

## Table of Contents

| Tool | Type | Summary |
|---|---|---|
| [`search_students`](#search_students) | Read | Find students by name |
| [`get_student`](#get_student) | Read | Fetch all fields for one student |
| [`list_students`](#list_students) | Read | List all students with optional status filter |
| [`create_student`](#create_student) | Write | Create a new student record |
| [`update_student`](#update_student) | Write | Update one or more fields on a student |
| [`delete_student`](#delete_student) | Write | Permanently delete a student |
| [`setup_student_google`](#setup_student_google) | Write | Create Calendar events + Drive folder for a student |
| [`sync_all_students`](#sync_all_students) | Write | Sync all active students' Calendar + Drive to match DB |
| [`manage_portal_access`](#manage_portal_access) | Write | Add/remove a portal login email for a student |
| [`get_schedule`](#get_schedule) | Read | List students who have class on a given day |
| [`get_fee_summary`](#get_fee_summary) | Read | Calculate monthly fee revenue across all active students |
| [`list_templates`](#list_templates) | Read | List all template IDs, titles, and descriptions |
| [`get_template`](#get_template) | Read | Fetch the full content of a single template |
| [`generate_payment_message`](#generate_payment_message) | Read | Generate a ready-to-send payment reminder message |

---

## `search_students`

Search for students by name (partial, case-insensitive).

### Input

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `query` | string | Yes | Partial or full student name |

### Process

Runs a Supabase `ilike` query (`%query%`) against the `name` column. Returns `id`, `name`, `status`, `class_schedule` only — not the full record. Ordered alphabetically by name.

### Output

**Success**
```json
{
  "students": [
    { "id": "uuid", "name": "Alice", "status": "Active", "class_schedule": [...] }
  ]
}
```

**Error**
```json
{ "error": "string" }
```

---

## `get_student`

Fetch every field for a single student by UUID.

### Input

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | string (UUID) | Yes | Obtain from `search_students` first |

### Process

Single Supabase `select` with `.eq('id', id).maybeSingle()`. Returns all columns including Google links, portal access emails, and calendar event IDs.

### Output

**Success**
```json
{
  "student": {
    "id": "uuid",
    "name": "Alice",
    "status": "Active",
    "mode": "My Python Syllabus",
    "fee_per_hour": 80,
    "payment_method": "Monthly",
    "class_schedule": [{ "day": "Monday", "start": "15:00", "end": "17:00" }],
    "contact_person": "Mum",
    "contact_phone": "601x-xxxxxxx",
    "student_phone": null,
    "today_homework": "Finish exercise 3",
    "notes": null,
    "latest_payment": "2026-04",
    "google_meet_link": "https://meet.google.com/...",
    "google_drive_link": "https://drive.google.com/...",
    "calendar_event_ids": ["event-id-1"],
    "access_emails": ["parent@example.com"]
  }
}
```

**Error**
```json
{ "error": "Student not found" }
```

---

## `list_students`

List students with an optional status filter.

### Input

| Parameter | Type | Required | Default | Notes |
|---|---|---|---|---|
| `status` | `"Active"` \| `"On Hold"` \| `"Completed"` | No | All statuses | |

### Process

Supabase `select` returning `id`, `name`, `status`, `mode`, `fee_per_hour`, `class_schedule`. Ordered by name. If `status` is supplied, filters with `.eq('status', status)`.

### Output

**Success**
```json
{
  "students": [
    {
      "id": "uuid",
      "name": "Alice",
      "status": "Active",
      "mode": "My Python Syllabus",
      "fee_per_hour": 80,
      "class_schedule": [...]
    }
  ]
}
```

**Error**
```json
{ "error": "Invalid status: ..." }
```

---

## `create_student`

Create a new student record in the database.

### Input

| Parameter | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | string | Yes | | |
| `mode` | `"My Python Syllabus"` \| `"Other Syllabus"` | Yes | | |
| `fee_per_hour` | number | Yes | | RM per hour |
| `payment_method` | `"Monthly"` \| `"Weekly"` | No | `"Monthly"` | |
| `status` | `"Active"` \| `"On Hold"` \| `"Completed"` | No | `"Active"` | |
| `class_schedule` | `ClassSlot[]` | No | `[]` | Array of `{ day, start, end }` |
| `contact_person` | string | No | null | |
| `contact_phone` | string | No | null | |
| `student_phone` | string | No | null | |
| `today_homework` | string | No | null | |
| `notes` | string | No | null | |
| `latest_payment` | string | No | null | e.g. `"2026-05"` |
| `access_emails` | string[] | No | `[]` | Portal login emails |
| `google_meet_link` | string | No | null | |
| `google_drive_link` | string | No | null | |

### Process

Single Supabase `insert`. If `class_schedule` is provided and non-empty, the response includes `suggestGoogleSetup: true` to prompt the agent to offer Google setup.

### Output

**Success**
```json
{ "student": { "id": "uuid", "name": "Alice" } }
```

**Success (with schedule)**
```json
{ "student": { "id": "uuid", "name": "Alice" }, "suggestGoogleSetup": true }
```

**Error**
```json
{ "error": "string" }
```

---

## `update_student`

Update one or more fields on an existing student.

### Input

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | string (UUID) | Yes | |
| `fields` | object | Yes | Keys must be from the allowlist below |

**Allowed field keys:** `name`, `mode`, `fee_per_hour`, `payment_method`, `status`, `class_schedule`, `contact_person`, `contact_phone`, `student_phone`, `today_homework`, `notes`, `latest_payment`, `google_meet_link`, `google_drive_link`, `access_emails`

Fields not in this allowlist are silently stripped (prevents prompt injection).

### Process

1. Strips disallowed keys from `fields`
2. Normalises `access_emails` entries to lowercase+trimmed if present
3. Runs Supabase `update`
4. If `class_schedule` was updated **and** the student has `calendar_event_ids` + `google_meet_link`: patches Calendar events and rewrites the Drive Meet doc in parallel via `Promise.allSettled` (Google failures are non-fatal)
5. If `class_schedule` was updated but Google isn't set up: returns `suggestGoogleSetup: true`

### Output

**Success**
```json
{ "success": true }
```

**Success with Google warnings**
```json
{
  "success": true,
  "googleWarnings": ["Calendar update failed: ...", "Drive Meet doc update failed: ..."]
}
```

**Success, Google not set up**
```json
{ "success": true, "suggestGoogleSetup": true }
```

**Error**
```json
{ "error": "string" }
```

---

## `delete_student`

Permanently delete a student record and clean up Google resources.

> **Safety:** the agent will not call this without seeing "yes" in the conversation. It will warn the user that Calendar events and the Drive folder will also be removed.

### Input

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | string (UUID) | Yes | |

### Process

1. Fetches `google_drive_link` and `calendar_event_ids` from DB
2. If Google resources exist: moves Drive folder to Trash and deletes all Calendar events in parallel via `Promise.allSettled` (failures are non-fatal — recorded as warnings)
3. Runs Supabase `delete`

### Output

**Success**
```json
{ "success": true }
```

**Success with Google warnings**
```json
{
  "success": true,
  "warnings": ["Drive cleanup warning: ...", "Calendar cleanup warning: ..."]
}
```

**Error**
```json
{ "error": "string" }
```

---

## `setup_student_google`

Create Google Calendar weekly recurring events and/or a Google Drive folder for a student. Skips whichever is already done.

### Input

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `student_id` | string (UUID) | Yes | |

### Process

1. Fetches student fields: `name`, `mode`, `class_schedule`, `calendar_event_ids`, `google_meet_link`, `google_drive_link`
2. Determines what's missing (`needsCalendar`, `needsDrive`)
3. If nothing is missing, returns early with "Already fully set up"
4. **Calendar setup** (if needed): calls `createWeeklyClassEvents` → saves `google_meet_link` + `calendar_event_ids` to DB
5. **Drive setup** (if needed): calls `createStudentDriveFolder` with the student's `mode` (`My Python Syllabus` → full 4-subfolder structure + Meet doc; `Other Syllabus` → root folder + Meet doc only) → saves `google_drive_link` to DB
6. Drive setup requires a Meet link — Calendar must succeed first if it was also needed

### Output

**Success**
```json
{ "result": "Calendar ✓ (2 events created, Meet link saved), Drive ✓ (folder created)" }
```

**Already set up**
```json
{ "result": "Already fully set up — Calendar ✓, Drive ✓. Nothing to do." }
```

**Error**
```json
{ "error": "Student has no class schedule — add a schedule before setting up Google." }
```

---

## `sync_all_students`

Sync every active student's Google Calendar events and Drive "Google Meet Link" doc to match the current DB schedule.

> **Safety:** the agent requires explicit confirmation before calling this — it affects every active student.

### Input

None.

### Process

1. Fetches refresh token from `settings` table via `getOAuth2Client()`
2. For each active student with `calendar_event_ids`: patches Calendar events + rewrites Drive Meet doc
3. For students **without** `calendar_event_ids`: searches Calendar by exact student name (`findRecurringEventIds`), saves the found IDs, then patches
4. All students processed in parallel via `Promise.all`
5. If `invalid_grant` is detected at any point, stops early and returns a reconnect message

### Output

**Success**
```json
{
  "results": [
    { "name": "Alice", "status": "synced" },
    { "name": "Bob", "status": "skipped", "reason": "no calendar events" },
    { "name": "Carol", "status": "error", "reason": "..." }
  ]
}
```

**Auth error**
```json
{ "error": "Google auth expired — reconnect at /api/google/auth" }
```

---

## `manage_portal_access`

Add or remove an email address from a student's portal login list (`access_emails`).

### Input

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `student_id` | string (UUID) | Yes | |
| `action` | `"add"` \| `"remove"` | Yes | |
| `email` | string | Yes | Normalised to lowercase + trimmed |

### Process

1. Fetches current `access_emails` array from DB
2. For `add`: appends the normalised email if not already present
3. For `remove`: filters out the normalised email
4. Runs Supabase `update` with the new array

### Output

**Success**
```json
{ "result": "parent@example.com can now log in to the student portal" }
```

```json
{ "result": "parent@example.com has been removed from portal access" }
```

**No-op**
```json
{ "result": "parent@example.com already has access" }
```

**Error**
```json
{ "error": "Student not found" }
```

---

## `get_schedule`

Get the list of students who have class on a specific day of the week.

### Input

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `day` | `"Monday"` … `"Sunday"` | Yes | |

### Process

Fetches all active students with `id`, `name`, `class_schedule`. Maps each to `{ id, name, slots }` where `slots` is the subset of `class_schedule` entries matching the requested day. Filters out students with no matching slots.

### Output

**Success**
```json
{
  "day": "Monday",
  "students": [
    { "id": "uuid", "name": "Alice", "slots": [{ "start": "15:00", "end": "17:00" }] }
  ]
}
```

`students` is an empty array if no one has class that day.

**Error**
```json
{ "error": "string" }
```

---

## `get_fee_summary`

Calculate monthly tuition fee revenue across all active students.

### Input

| Parameter | Type | Required | Default | Notes |
|---|---|---|---|---|
| `month` | number (1–12) | No | Current month (MYT) | |
| `year` | number | No | Current year (MYT) | |

### Process

1. Fetches all active students: `id`, `name`, `fee_per_hour`, `class_schedule`
2. For each student, groups slots by day via `groupSlotsByDay`, then calls `getWeekdayDates` to find every occurrence of that weekday in the target month
3. Fee per student = Σ (session_count × hours_per_session × fee_per_hour) across all days
4. Raw fees are tracked in a parallel array before rounding to avoid per-student accumulation errors; the total is rounded once at the end

### Output

**Success**
```json
{
  "month": 6,
  "year": 2026,
  "students": [
    { "id": "uuid", "name": "Alice", "fee": 320 },
    { "id": "uuid", "name": "Bob", "fee": 240 }
  ],
  "total": 560
}
```

**Error**
```json
{ "error": "string" }
```

---

## `list_templates`

List all message template IDs, titles, and descriptions. Does not return content.

### Input

None.

### Process

Pure synchronous function — no DB call. Reads from the in-memory `TEMPLATE_META` constant in `src/lib/templates.ts`.

### Output

```json
{
  "templates": [
    { "id": "payment", "title": "Payment Reminder 1", "description": "Standard monthly fee reminder" },
    { "id": "payment2", "title": "Payment Reminder 2", "description": "With carryover session deduction" },
    { "id": "review_request1", "title": "Review Request 1", "description": "..." },
    { "id": "first_approach", "title": "First Approach", "description": "Superprof outreach message" }
  ]
}
```

---

## `get_template`

Fetch the full content of a single message template.

### Input

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | Must be a valid template ID — use `list_templates` to discover IDs |

### Process

Supabase `select` with `.eq('id', id).maybeSingle()`. Merges DB `content` with in-memory `TEMPLATE_META` to return title and description alongside the content.

### Output

**Success**
```json
{
  "template": {
    "id": "payment",
    "title": "Payment Reminder 1",
    "description": "Standard monthly fee reminder",
    "content": "Hi {name}, just a gentle reminder..."
  }
}
```

**Error**
```json
{ "error": "Template \"payment\" not found" }
```

---

## `generate_payment_message`

Generate a ready-to-send payment reminder message for a student. Calculates session dates and total fee automatically from the student's schedule and fee rate.

### Input

| Parameter | Type | Required | Default | Notes |
|---|---|---|---|---|
| `student_id` | string (UUID) | Yes | | |
| `month` | number (1–12) | No | Next month (MYT) | |
| `year` | number | No | Next month's year (MYT) | |
| `template_type` | `1` \| `2` | No | `1` | 1 = standard, 2 = with carryover deduction |
| `carryover` | number | No | `0` | Sessions to deduct; only meaningful for `template_type 2` |

### Process

1. Resolves month/year — defaults to next calendar month in MYT if not supplied
2. Fetches student: `name`, `contact_person`, `class_schedule`, `fee_per_hour`, `status`
3. Groups slots by day via `groupSlotsByDay`; for each day calls `getWeekdayDates` to find every occurrence in the target month
4. Collects all session dates, sorts them, computes `sessionFeeTotal`
5. Resolves `recipient` — uses `contact_person` if set and not `"-"`, otherwise falls back to `name`
6. **Template 1:** `"Hi {recipient}, … {N} sessions in {month} ({dates}), bringing the total to RM{fee}. Thank you 😄"`
7. **Template 2:** deducts `carryover × avg_fee_per_session` from total: `"Hi {recipient}, … With {N} session(s) carried over …, bringing the total to RM{adjusted_fee}. Thank you. 😄"`

Shared helpers used: `formatFee`, `ordinal`, `oxfordList`, `groupSlotsByDay` (all from `src/lib/utils.ts`).

### Output

**Success**
```json
{
  "message": "Hi Mum, just a gentle reminder regarding the tuition fee. There are 4 sessions in June (2nd, 9th, 16th, and 23rd), bringing the total to RM320. Thank you 😄",
  "month": 6,
  "year": 2026,
  "monthName": "June"
}
```

**Error**
```json
{ "error": "Student not found" }
{ "error": "Student is not active" }
{ "error": "No scheduled class days found for this student" }
```
