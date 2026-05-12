# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build + type check
npm run lint     # eslint
```

No test suite. Use `npm run build` to verify type correctness before committing.

## Architecture

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + Auth) · Tailwind CSS v4 · shadcn/ui

### Email (magic link delivery)

Magic link emails are sent via **Gmail SMTP** configured in Supabase Dashboard → Authentication → SMTP Settings. Sender is `limxuan520@gmail.com` using a Gmail App Password (not the account password). Port 587 (TLS). Rate limit: ~500 emails/day. If login link delivery fails, check Supabase → Authentication → Logs.

### Auth

- Two user types: **admin** (tutor) and **students/parents**
- Admin emails are stored in the `tutors` Supabase table (no hardcoded emails in code)
- Student/parent access emails are stored per-student in the `access_emails text[]` column on the `students` table
- Route protection is in `src/proxy.ts` — **not** `middleware.ts`. Next.js 16 renamed the middleware file and export: the file is `proxy.ts` and exports `proxy()` instead of `middleware()`.
- Public routes: `/`, `/admin/login`, `/student/login`, `/auth/*`
- Admin-only routes: `/admin/*` (except `/admin/login`)
- Student-only routes: `/student`
- Unauthenticated users hitting `/admin/*` → redirect to `/admin/login`; hitting `/student` → redirect to `/student/login`
- Logged-in admin hitting `/admin/login` → redirect to `/admin/students`
- Logged-in student hitting `/admin/login` → allowed (so they can see "No access." rather than being silently redirected)
- `proxy.ts` calls `is_tutor()` RPC (SECURITY DEFINER) to determine admin vs student; if RPC errors, fails open (safe — RLS still enforces data access)

### Login pages

- **`src/app/admin/login/page.tsx`** — calls `check_tutor_access(email)` RPC before sending OTP; shows "No access." if email not in `tutors` table
- **`src/app/student/login/page.tsx`** — calls `check_portal_access(email)` RPC before sending OTP; shows "No access." if email not in any student's `access_emails`
- Both pages share identical structure: `bg-softBg` full-screen centred layout, `bg-white rounded-2xl shadow-sm border border-slate-100 p-10` card, `</>` navy/gold brand mark inside the card, `text-accentGold` back link. Do not use a shadcn `<Card>` here — the custom structure keeps styling consistent with the brand.
- Both normalise email with `.trim().toLowerCase()` before RPC + OTP calls
- Favicon is `src/app/icon.svg` (Next.js App Router convention) — navy background with gold `</>`. A copy also lives at `public/favicon.svg`; keep them in sync if updated.

### Route structure

```
src/app/
  page.tsx                        → public landing page (all 13 sections)
  auth/callback/route.ts          → Supabase auth code exchange; supports ?next= param
  admin/
    login/page.tsx                → admin magic link login
    (app)/                        → route group: admin pages share AppNav layout
      layout.tsx                  → renders <AppNav> + <main>
      students/                   → student list (grouped by day), detail, new form
      templates/                  → Supabase-backed editable message templates
      timetable/                  → weekly availability grid + two PNG exports
      agent/                      → AI agent chat UI (v1: students CRUD only)
  student/
    login/page.tsx                → student portal magic link login
    (portal)/                     → route group: portal pages share portal nav layout
      layout.tsx                  → renders portal nav + <main>
      page.tsx                    → student dashboard (schedule, fees, homework, links)
```

### Data layer

Four Supabase tables in the `public` schema:

- **`students`** — one row per student. `class_schedule` is a `jsonb` column storing `ClassSlot[]` (array of `{ day, start, end }`). `access_emails text[]` lists emails that can log in to the student portal. `calendar_event_ids text[]` stores one Google Calendar event ID per class slot, positionally matched to `class_schedule` (index 0 = event that owns the Meet conference). `status` (`Active` | `On Hold` | `Completed`) is the sole active/inactive flag — filter active students with `.eq('status', 'Active')`. `today_homework` is a `text` column (multi-line). RLS: admin (tutor) has full access; students can only SELECT their own row (`auth.email() = ANY(access_emails)`).
- **`templates`** — one row per template, keyed by text `id` (e.g. `payment`, `review_request1`, `first_approach`). `content` is edited in-place from the UI and upserted on Save.
- **`tutors`** — one row per tutor email. RLS enabled (no direct access); accessed only via SECURITY DEFINER functions.
- **`settings`** — key/value store for server-side config. Keys: `google_refresh_token`, `timetable_rules` (free-text scheduling rules), `timetable_buffer_mins` (integer stored as string, default `'15'`). RLS: tutor-only via `is_tutor()`.

Supabase SECURITY DEFINER functions:
- `is_tutor()` — returns true if `auth.email()` is in `tutors` (used in `proxy.ts` and RLS policy)
- `check_tutor_access(p_email)` — returns true if given email is in `tutors` (used in admin login page)
- `check_portal_access(p_email)` — returns true if given email is in any student's `access_emails` (used in student login page)

Supabase clients:
- `src/lib/supabase/client.ts` — browser client (used in `'use client'` components)
- `src/lib/supabase/server.ts` — server client with cookie handling (used in Server Components and Route Handlers). Also exports `requireTutor()`: verifies the request comes from an authenticated tutor and returns `{ supabase, error }` — all tutor-only API routes call this instead of repeating the auth boilerplate.

### Component structure

```
src/components/
  shared/       → AppNav, LogoutButton, StudentPortalView, student-fields   (used across multiple routes)
  students/     → StudentCard, StudentDetail, StudentForm, ClassScheduleEditor, CreateDriveFolderButton, CreateCalendarEventButton, SyncAllButton
  templates/    → TemplatesList, PaymentGenerator
  timetable/    → TimetableSection
  agent/        → AgentChat (chat UI, localStorage persistence, tool step display)
  landing/      → 13 static sections for the public landing page
  ui/           → shadcn/ui primitives (Button, Input, Card, Select, Tabs, etc.)
```

### Landing page (`src/components/landing/`)

13 static TSX components migrated from a separate Vite project. Custom Tailwind colors (`navy`, `navyLight`, `accentGold`, `softBg`, `cardBg`) are declared in `globals.css` via `@theme {}` (Tailwind v4 — not `tailwind.config.js`). Uses `@heroicons/react` for icons.

**Hero (`landing/Hero.tsx`)** — full-width atmospheric section using `public/landing_page_4k.png` as a CSS background image (inline `style` — Tailwind v4 cannot parse `url()` in arbitrary classes). A stacked gradient (`linear-gradient` + `url()` in one `backgroundImage` value) keeps left-side text legible while the robot/flowchart graphic stays visible on the right. `bg-black` is the fallback color (matches the image's dark bottom). A mobile-only `absolute inset-0 bg-black/65 md:hidden` overlay ensures text stays readable when the layout stacks. `backgroundAttachment` is left at the CSS default (`scroll`) — do not set it to `fixed` as that breaks iOS Safari.

**Navbar (`landing/Navbar.tsx`)** — `"use client"` component. Desktop: hidden-on-mobile flex nav. Mobile: hamburger toggle (`Bars3Icon`/`XMarkIcon`) with a dropdown nav, `aria-expanded`, `aria-controls`, and an `Escape` key handler via `useEffect`. The static `NAV_LINKS` array is defined outside the component.

### Key components

- **`shared/student-fields`** — shared display primitives used by `StudentDetail`, `StudentPortalView`, and `StudentCard`: `Row` (inline label + value), `BlockField` (stacked label + `whitespace-pre-wrap` value for multi-line text), `statusBadge` (status → Tailwind class lookup), `ScheduleList` (renders a `ClassSlot[]` as a formatted list, or "No schedule set" when empty), `ExternalLink` (gold-coloured `<a>` for Meet/Drive links). Import from here instead of redefining locally.
- **`students/StudentCard`** — shows name, mode badge, contact person, schedule time, and payment method (bottom-right, muted grey). Accepts `showStatus` prop (default `false`) — pass `showStatus={true}` only on the "All" filter tab where the status badge is informative; on day-filtered tabs it's redundant. Mode badge colours: `'My Python Syllabus'` → `bg-navy/6 text-navy`; `'Other Syllabus'` → `bg-accentGold/15 text-accentGold`. Uses `@heroicons/react` (`ClockIcon`, `CalendarDaysIcon`, `CreditCardIcon`) instead of emoji. When rendered under a specific day (`slot` prop), time and payment method are on the same line; otherwise payment method appears below all schedule lines.
- **`shared/AppNav`** — sticky top nav, client component (needs `usePathname` for active tab highlighting); brand link goes to `/` (landing page)
- **`students/StudentDetail`** — read-only view by default; Edit button toggles to `StudentForm` inline
- **`students/StudentForm`** — on Save, if the student already has `calendar_event_ids` and the schedule changed, automatically calls `update-class-event` before the DB upsert; patches Calendar events (preserving Meet link) and rewrites the Drive "Google Meet Link" doc. If the calendar update produces a warning (API error, missing event IDs, missing Meet link), the form stays open after save so the user can read the amber warning — they close via ← Cancel. "Remove Student" opens a confirmation dialog that hard-deletes the row and calls `delete-student` to trash the Drive folder and delete Calendar events; Google cleanup failure shows an in-dialog amber warning but doesn't block the DB deletion.
- **`students/ClassScheduleEditor`** — dynamic list of day + start/end time slots stored as jsonb
- **`students/SyncAllButton`** — banner at the bottom of the students list; one click syncs all active students' Google Calendar events and Drive Meet docs to match the DB schedule. For students with no `calendar_event_ids`, it searches Calendar by exact name first (backfill), saves the IDs, then patches. Results show per-student status (✓ synced / – skipped / ✗ error). If `invalid_grant` is detected, shows a reconnect link.
- **`templates/TemplatesList`** — receives `initialData` and `students` props from the server; renders a 4-tab layout (Payment · Review · Recommendation · First Approach). The Payment tab contains `PaymentGenerator` followed by the payment templates; the other tabs contain their respective templates. `TEMPLATE_META` is a `Record<string, { title, description }>` — look up by id directly. Save state per card cycles through `idle → saving → saved/error`.
- **`templates/PaymentGenerator`** — client component rendered inside `TemplatesList`'s Payment tab; calculates session dates and fee from the student's `class_schedule` via `/api/generate-payment`
- **`timetable/TimetableSection`** — client component on the Timetable page; renders a 2-tab layout (Weekly Schedule · Slot Availability). The Weekly Schedule tab shows a live `WeeklyScheduleView` HTML grid (navy header, auto-cropped to active hours, class blocks in `NAVY`) plus a **Download Schedule** button. The Slot Availability tab has `keepMounted` so grid state and student availability text survive tab switches. The AI panel has two textareas (scheduling rules pre-loaded from DB, student availability blank), a Save Rules button, a buffer-mins number input with its own Save button, and a **Generate Slots** button. Booked slots are auto-marked red and non-editable. Free slots cycle: unavailable → preferred → normal → unavailable. Grid state is ephemeral; rules and buffer are persisted to the `settings` table.

### Timetable (`src/app/admin/(app)/timetable/page.tsx`)

Server Component that fetches active students' `name` and `class_schedule` plus `timetable_rules` and `timetable_buffer_mins` from the `settings` table in parallel, then passes them as `students`, `initialRules`, and `initialBufferMins` props to `TimetableSection`. Booked slot detection uses interval overlap (`cellStart < slotEnd && cellEnd > slotStart`) to correctly catch classes that start mid-slot. The `bookedSet` is pre-computed once via `useMemo` as a `Set<string>` of `"Day|HH:MM"` keys for O(1) lookup during drag and PNG export.

**UI layout:** Two tabs inside a `<Tabs defaultValue="schedule">` wrapper:
1. **Weekly Schedule tab** — header row + **Download Schedule** button, then `WeeklyScheduleView`: an HTML grid (72px label column + 7 equal day columns, `overflow-hidden rounded-lg`) with a navy header row, alternating row stripes via `repeating-linear-gradient`, and absolutely-positioned navy class blocks showing student name + compact time. Active hour window auto-crops to earliest class − 30 min / latest class + 30 min (same logic as the PNG export). Shared helpers: `computeScheduleWindow()`, `SCHEDULE_CELL_H = 28`, `GRID_COLS = '72px repeat(7, 1fr)'`.
2. **Slot Availability tab** (`keepMounted`) — AI panel (textareas + save controls + Generate button) → divider → legend + **Download Available Slots** button → interactive grid → hint text, all inside a `border rounded-lg p-6` card

**AI slot generator (`src/app/api/timetable/generate-slots/route.ts`):**

- Receives `{ rules, studentAvailability?, bookedSlots, bufferMins }`.
- Buffer zones are computed **in code** via `computeBufferSlots()` (deterministic time arithmetic — not delegated to the LLM). A slot is buffered if the gap between it and any booked class is `< bufferMins`. The booked-cell set (which 30-min TIME_SLOTS overlap with a booked class) is precomputed via `buildBookedCellSet()` and passed to `buildPrompt` — not recomputed inside it.
- Classifiable slots (non-booked, non-buffered) are enumerated and sent to Gemini 2.5 Flash as a prompt. Booked and buffer slots are never sent for classification.
- Gemini classifies each slot as `"preferred"` | `"normal"` | `"unavailable"` using structured output (`responseMimeType: 'application/json'` + `responseSchema`). Response validated with Zod; a post-processing safety net forces any buffer slot that sneaks through to `unavailable`.
- Prompt rule: student availability describes only times they **can** attend — silence does not imply unavailability. Unmentioned times → `normal`, not `unavailable`.
- Prompt rule: unavailable-time end boundaries are **exclusive** — `"08:00 to 10:00 unavailable"` blocks 08:00, 08:30, 09:00, 09:30 but NOT 10:00. The LLM is explicitly told never to apply any margin around unavailability boundaries (only buffer zones around booked student classes apply, and those are computed in code before the prompt is built).
- `src/lib/gemini.ts` — Gemini client factory (`getGeminiModel()`), Zod schemas (`SlotSchema`, `GenerateSlotsResponseSchema`), and `GEMINI_RESPONSE_SCHEMA` for the Gemini `responseSchema` field. Required env var: `GEMINI_API_KEY`.

**Timetable API routes:**
- `src/app/api/timetable/rules/route.ts` — GET/POST `timetable_rules` in `settings` table (tutor-only)
- `src/app/api/timetable/buffer-mins/route.ts` — GET/POST `timetable_buffer_mins` in `settings` table; validated 0–60 (tutor-only)
- `src/app/api/timetable/generate-slots/route.ts` — POST: computes buffer zones, calls Gemini, returns `{ slots }` (tutor-only)

**Two PNG exports in `TimetableSection`:**

- **Download Available Slots** — exports the AI-generated or drag-painted availability grid (preferred/normal/unavailable cells + legend) as `slot_availability.png`. Shows the full 8 AM–10 PM range.
- **Download Schedule** — exports a clean shareable weekly calendar image (`weekly_schedule.png`) showing all active students' class blocks. Auto-crops to the active hour window via `computeScheduleWindow()`. Each student block shows name + compact time (`10:30 – 11:30`). All blocks use the module-level `NAVY = '#0A1A2F'` constant, matching the HTML grid. Canvas is rendered at 2× scale for retina display.

Both exports share `downloadCanvas(canvas, filename)` and the module-level `SCALE = 2` and `NAVY = '#0A1A2F'` constants. `fmt12(time)` is a local helper that formats `"HH:MM"` as `"h:MM"` (no AM/PM) for use inside compact block labels. `LEGEND_ITEMS` is a module-level constant (not recreated per download). Cell keys use the module-level `cellKey(day, ts)` helper which returns `"${day}|${ts}"` — use this everywhere instead of inlining the template. `computeScheduleWindow(students)` returns `{ startMin, endMin, activeSlots }` and is shared by `drawSchedule` and `WeeklyScheduleView`.

### Google Drive + Calendar integration (`src/lib/google/`, `src/app/api/google/`)

Admin-only features for creating a student's Google Drive folder and weekly recurring Google Calendar event.

- **`src/lib/google/auth.ts`** — `getOAuth2Client()`: reads refresh token from `settings` table, returns configured OAuth2 client. `newOAuth2Client()`: constructs a bare OAuth2 client from env vars (no DB read) — used by the one-time OAuth setup routes.
- **`src/lib/google/drive.ts`** — `parseDriveFolderId(url)`: extracts and validates the folder ID from a Drive URL (shared by `updateStudentMeetDoc` and the delete route). `createStudentDriveFolder(auth, studentName, meetLink, classSchedule, mode)`: creates root folder in `GOOGLE_STUDENTS_FOLDER_ID`, sets anyone-with-link reader access, then branches on `mode` — `'My Python Syllabus'` creates 4 subfolders + Meet doc in parallel (`Promise.all`); `'Other Syllabus'` creates only the Meet doc. Atomic: deletes root folder on any failure so retries don't create duplicates. `updateStudentMeetDoc(auth, driveFolderUrl, studentName, schedule, meetLink)`: finds the "Google Meet Link" doc by name and rewrites its HTML content via `drive.files.update` — called automatically on reschedule.
- **`src/lib/google/calendar.ts`** — `createWeeklyClassEvents(auth, studentName, schedule)`: creates a weekly recurring event for each class slot in `GOOGLE_CALENDAR_ID`; returns `{ meetLink, eventCount, eventIds }`. First slot gets a Google Meet conference (one Meet link per student); subsequent slots are created in parallel (`Promise.all`) and reference the same link in their description. Datetime strings are formatted as naive `YYYY-MM-DDTHH:MM:SS` (no Z) with `timeZone: Asia/Kuala_Lumpur` so Google Calendar interprets them as MYT regardless of server timezone. `updateWeeklyClassEvents(auth, studentName, schedule, existingEventIds, meetLink)`: patches existing events positionally (`existingEventIds[i]` → `schedule[i]`) using `events.patch` so `conferenceData` is untouched and the Meet link is preserved; creates new events for added slots and deletes events for removed slots; all ops run in parallel via `Promise.all`. `findRecurringEventIds(auth, studentName)`: searches Calendar for recurring events whose summary exactly matches `studentName`, sorts by creation time (oldest first = index 0 = Meet conference owner), returns their IDs — shared by `sync-all` and any future backfill logic.
- **`src/app/api/google/auth/route.ts`** — One-time OAuth setup: redirects admin to Google consent screen with Drive + Calendar scopes (tutor-only)
- **`src/app/api/google/callback/route.ts`** — OAuth callback: exchanges code for tokens, saves refresh token to `settings` table (tutor-only)
- **`src/app/api/google/create-student-folder/route.ts`** — POST `{ name, meet_link, class_schedule, mode? }`: creates the Drive folder structure (full with 4 subfolders for `'My Python Syllabus'`, Meet doc only for `'Other Syllabus'`), returns `{ url }` (tutor-only). `mode` defaults to `'My Python Syllabus'` if omitted or unrecognised. Requires `meet_link` to be set so the "Google Meet Link" doc is fully populated.
- **`src/app/api/google/create-class-event/route.ts`** — POST `{ name, class_schedule }`: creates weekly recurring Calendar events, returns `{ meetLink, eventCount, eventIds }` (tutor-only)
- **`src/app/api/google/update-class-event/route.ts`** — POST `{ name, class_schedule, event_ids, meet_link, drive_folder_url? }`: patches existing Calendar events via `updateWeeklyClassEvents` (Meet link preserved), then optionally rewrites the Drive "Google Meet Link" doc via `updateStudentMeetDoc`. Calendar failure → 500; Drive failure → non-fatal `driveDocError` in response. Called automatically by `StudentForm` on Save when the schedule has changed.
- **`src/app/api/google/sync-all/route.ts`** — POST, tutor-only: syncs all active students' Google Calendar events and Drive Meet docs to match the DB schedule. For students missing `calendar_event_ids`, calls `findRecurringEventIds` to discover and save them first. All students are processed in parallel via `Promise.all`. Returns per-student `{ name, status, reason }` results. Surfaces `invalid_grant` errors with a reconnect message and stops early. Surfaced via `SyncAllButton` at the bottom of the students list.
- **`src/app/api/google/delete-student/route.ts`** — POST `{ drive_folder_url?, calendar_event_ids? }`: moves the Drive folder to Trash (`files.update({ trashed: true })`) and deletes all Calendar events; both ops run in parallel via `Promise.allSettled`. Both are non-fatal — returns `{ driveError, calendarError }` rather than throwing. Early-returns if both inputs are absent to skip the OAuth DB query. Called by `StudentForm` before hard-deleting the Supabase row.
- **`src/components/students/CreateDriveFolderButton.tsx`** — client button in `StudentForm`; accepts `mode: StudentMode` prop; label reads "Create Google Drive Folder (My Python Syllabus)" or "Create Google Drive Folder (Other Syllabus)" accordingly; disabled until both student name and Google Meet link are filled; on success auto-fills `google_drive_link`
- **`src/components/students/CreateCalendarEventButton.tsx`** — client button in `StudentForm`; disabled until student name and class schedule are filled; on success auto-fills both `google_meet_link` and `calendar_event_ids`
- **`src/components/students/SyncAllButton.tsx`** — always shown at the bottom of the students list; see key components section above

**Intended flow in student form:** fill name + schedule → click **Create Calendar Event** (Meet link + event IDs auto-fill) → click **Create Drive Folder** (doc written with actual Meet link). On subsequent edits, changing the schedule and clicking **Save Changes** automatically patches the Calendar events and rewrites the Drive doc (amber warning shown if Drive update fails, but save still proceeds).

**Required env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_STUDENTS_FOLDER_ID`, `GOOGLE_CALENDAR_ID`. `GOOGLE_LEC_TOPIC1_FILE_ID` is only required for `'My Python Syllabus'` students (validated before any Drive API calls; not needed for `'Other Syllabus'`).

**One-time setup:** visit `/api/google/auth` as admin to store the refresh token with Drive + Calendar scopes. OAuth app must have Drive API + Calendar API enabled in Google Cloud, with the admin email added as a test user.

**OAuth token expiry:** Google expires refresh tokens every 7 days for apps in **Testing** mode. To avoid repeated re-authorisation, publish the app to **In production** in Google Cloud Console → APIs & Services → OAuth consent screen → Publish App. No Google verification is needed for a single-user internal app — the "unverified app" warning only appears to you during the OAuth flow. After publishing, tokens stay valid until the Google account password changes or access is manually revoked.

### Payment generator (`src/app/api/generate-payment/route.ts`)

POST route handler. No external AI — pure JS date arithmetic:
- Groups `class_schedule` slots by day, finds all occurrences of each weekday in the given month
- Fee = `fee_per_hour × duration_hours × session_count` per day, summed across all days
- Template 2 (carryover): deducts `carryover × avg_fee_per_session` from the total (tutor owes student those sessions)
- `formatFee` rounds to 2 d.p. before integer check to avoid floating-point noise

### AI Agent (`src/app/admin/(app)/agent/`, `src/app/api/agent/`, `src/lib/agent/`)

Natural language interface for managing students. Gemini 2.5 Flash drives a function-calling loop that executes against Supabase and Google APIs.

**File structure:**
- **`agent/page.tsx`** — thin server component wrapper; renders `<AgentChat />`
- **`components/agent/AgentChat.tsx`** — client component; see UI section below
- **`api/agent/chat/route.ts`** — stateless POST handler; drives the Gemini loop
- **`lib/agent/tools.ts`** — all 9 tool implementations + `errMsg` helper + `ALLOWED_UPDATE_KEYS`
- **`lib/agent/schema.ts`** — `TOOL_DECLARATIONS` (Gemini function schemas) + `SYSTEM_INSTRUCTION`
- **`lib/agent/eval.ts`** — `selfEval()`: post-mutation DB verification

**Tools (all 9):**

| Tool | Required | Optional | Returns |
|---|---|---|---|
| `search_students` | `query` | — | `{ students: [{ id, name, status, class_schedule }] }` |
| `get_student` | `id` | — | `{ student: <all fields> }` |
| `list_students` | — | `status`, `day` | `{ students: [{ id, name, status, mode, fee_per_hour, class_schedule }] }` |
| `create_student` | `name`, `mode`, `fee_per_hour` | all other fields | `{ student: { id, name }, suggestGoogleSetup?: true }` |
| `update_student` | `id`, `fields` | — | `{ success: true, googleWarnings?: string[], suggestGoogleSetup?: true }` |
| `delete_student` | `id` | — | `{ success: true, warnings?: string[] }` |
| `setup_student_google` | `student_id` | — | `{ result: string }` or `{ error: string }` |
| `sync_all_students` | — | — | `{ results: [...] }` |
| `manage_portal_access` | `student_id`, `action`, `email` | — | `{ result: string }` |

**Function-calling loop (`api/agent/chat/route.ts`):**
- Receives full `messages[]` history on every request (stateless — frontend owns history)
- Maps frontend `role: 'agent'` → Gemini `role: 'model'` before sending
- Returns a `text/event-stream` SSE `Response` (not JSON). SSE event types: `{ type: 'step', content }` for tool calls, `{ type: 'chunk', content }` for streamed text tokens, `{ type: 'done' }` on completion, `{ type: 'error', message }` on failure.
- Runs up to 10 rounds using `generateContentStream` for all rounds. Tool-calling rounds accumulate `FunctionCall[]` from chunks and emit `step` events immediately after each tool fires. The final text-only round (`roundFnCalls.length === 0`) streams `chunk` events token-by-token as Gemini produces them. Guard: text is only emitted while no function calls have appeared in the current round (`roundFnCalls.length === 0` inside the chunk loop).
- After each round, model content (text + fn-call parts) is reconstructed from the accumulated chunks and pushed to `contents` for conversation history.
- Within each tool-calling round, all function calls are executed in parallel via `Promise.all` (Gemini can return multiple calls per round); steps are emitted in call order before parallel execution so display order is stable.
- `gotReply` boolean tracks whether a text round completed; if false after the loop, emits a fallback `chunk` event.
- `lastMutationTool` tracks the final mutation in the loop for `selfEval` (create captures `createdId` from the tool result; update/delete/setup use `MUTATION_TOOLS` set)
- `MUTATION_TOOLS = new Set(['update_student', 'delete_student', 'setup_student_google'])` — named constant at module level; used for both mutation tracking and selfEval dispatch
- `selfEval` result is emitted as a final `step` event before `done`

**Self-evaluation (`lib/agent/eval.ts`):**
- `selfEval(toolName, args, supabase, createdId?)` — runs after the loop completes if any mutation occurred
- `create_student` / `update_student`: SELECT `id` WHERE `id = X` → `✓ verified in DB` or `⚠ could not verify`
- `delete_student`: SELECT `id` WHERE `id = X` → `✓ verified deleted` or `_⚠ student still exists in DB_`
- `setup_student_google`: SELECT `google_meet_link, google_drive_link` → reports which links are set
- Result is appended to `steps[]` (not `reply`) so it appears in the tool-steps section

**Tool implementation notes (`lib/agent/tools.ts`):**
- `ALLOWED_UPDATE_KEYS` Set — allowlist of writable columns for `update_student`; prevents prompt injection from touching any column not in the set
- `update_student` auto-syncs Calendar + Drive when `class_schedule` is in the updated fields: if `calendar_event_ids` + `google_meet_link` are set, calls `updateWeeklyClassEvents` and `updateStudentMeetDoc` in parallel via `Promise.allSettled`; Google failures are non-fatal (returned as `googleWarnings`); if Google is not set up, returns `suggestGoogleSetup: true` instead
- `create_student` returns `suggestGoogleSetup: true` when a `class_schedule` was provided — the system instruction rule 11 tells Gemini to ask the user if they want Google setup
- `manage_portal_access` normalises the email (`.trim().toLowerCase()`) before diffing against the stored `access_emails` array
- `setup_student_google` fetches the student's `mode` from the DB and passes it to `createStudentDriveFolder` — so Other Syllabus students get a Meet-doc-only folder, Python Syllabus students get the full 4-subfolder structure
- `delete_student` attempts Google cleanup (Drive trash + Calendar delete) before the DB delete; Google failure is non-fatal
- `errMsg(err, fallback)` — `err instanceof Error ? err.message : fallback` — use this everywhere instead of inlining

**System instruction rules summary (`lib/agent/schema.ts`):**
1. Reuse UUID from conversation history — only call `search_students` if UUID not already known
2. `delete_student` requires explicit "yes" in conversation; must warn about Calendar/Drive removal first
3. Ask for missing required fields (`mode`, `fee_per_hour`) before calling `create_student`
4. Multiple search matches → list and ask which student
5. No search results for update/delete → say so, offer to create instead
6. After create/update → append `[student_id:UUID]` to reply (UI renders "View student →" link)
7. Formatting rules: tables for lists, bold labels for single records, skip null/empty fields, render Meet/Drive as markdown links, blockquote for notes/homework, list_students for roster queries
8. `sync_all_students` requires explicit confirmation before calling
9. Delete confirmation must mention Google Calendar/Drive removal
10. After `setup_student_google` → also append `[student_id:UUID]`
11. If tool result has `suggestGoogleSetup: true` → ask user if they want Google setup; only call `setup_student_google` on yes

**`[student_id:UUID]` token protocol:**
- Gemini appends `[student_id:UUID]` literally at the end of replies after create/update/setup
- `parseAgentReply(content)` in `AgentChat.tsx` extracts the UUID via regex, strips the token from the display text, and returns `{ text, studentId }`
- If `studentId` is non-null, a "View student →" `<Link>` is rendered bottom-right of the agent bubble

**AgentChat UI (`components/agent/AgentChat.tsx`):**
- `messages` state lazy-initialised from `localStorage` (key: `agent_chat_messages`); persisted on every change via `useEffect`
- Stored messages include `id` (UUID), `role` (`'user'` | `'agent'`), `content`, and `steps[]`
- `loadStoredMessages` migrates old stored messages without `id` by generating UUIDs on load
- **SSE streaming:** on send, a placeholder agent message (`content: ''`, `steps: []`) is added immediately. `send()` reads the SSE response body via `ReadableStream` reader + `TextDecoder` with a line-buffer. `step` events append to the placeholder's `steps[]`; `chunk` events append to `content` (text builds up progressively); `error` events set `content` to the error string. A `received` flag is set on first `chunk` or `error` event; the `finally` block only sets a fallback message if `!received` (avoids a no-op map on every successful request).
- The placeholder bubble shows `⋯` while `content === ''`; it transitions directly to steps + streaming text as events arrive. There is no separate loading bubble.
- Reply rendered via `<ReactMarkdown remarkPlugins={[remarkGfm]}>` — supports GFM tables, bold, blockquotes, links
- Custom `a` renderer: `mailto:` links render as `<span>` (prevents remark-gfm from auto-linking email addresses as clickable mailto links)
- Tool steps rendered above reply in a smaller muted section; UUID regex applied at render time (client-side cosmetic concern, not server-side)
- Input auto-focuses on mount and after each agent response via `useEffect([loading])`; disabled (and not focused) while the agent is executing
- "Clear chat" wipes `messages` state → next send has no history context for Gemini

### Brand theming conventions

- **Primary color token:** `globals.css` sets `--primary: var(--color-navy)` — this brands all shadcn default `<Button>` instances navy without touching individual components. Do not revert this.
- **Navbars** (`AppNav`, student portal layout): `bg-navy border-b border-slate-800`; brand mark `</>` always `text-accentGold font-bold`; nav text `text-slate-100`; active tab `bg-white/20 text-white`; inactive tab `text-white/80`.
- **Page headings:** all `<h1>` on admin and portal pages use `text-navy`.
- **Tabs** (`ui/tabs.tsx`): `TabsList` uses `bg-navy/8`; active `TabsTrigger` is `bg-navy text-white`; inactive is `text-navy/50 hover:text-navy`. Always include `data-active:hover:text-white` to prevent hover from overriding active tab text.
- **Card titles** (`ui/card.tsx`): `CardTitle` includes `text-navy`.
- **External links** (Meet, Drive): always use `ExternalLink` from `shared/student-fields` — renders as gold coloured link with `hover:underline`.
- **Icons:** use `@heroicons/react/24/outline` SVGs throughout; do not use emoji as UI icons.
- **Mode badges on StudentCard:** `'My Python Syllabus'` → `bg-navy/6 text-navy`; `'Other Syllabus'` → `bg-accentGold/15 text-accentGold`.
- **Custom brand colors** (`navy`, `navyLight`, `accentGold`, `softBg`, `cardBg`) are declared in `globals.css` via `@theme {}` (Tailwind v4).

### Patterns

- Pages that need auth data are Server Components fetching via the server Supabase client; interactive state lives in client components passed data as props.
- `StudentDetail` and template cards both use the same view/edit toggle pattern to prevent accidental edits.
- The students list page groups students by weekday using `flatMap` over `class_schedule` — a student with multiple slots appears under each day.
- The shadcn/ui Select in this project uses Base UI (`@base-ui/react/select`), not Radix. `SelectValue` renders the raw value string — use a manual `<span>` inside `SelectTrigger` to show the display label.
- Times are stored as `"HH:MM"` strings in Supabase but displayed in 12-hour format. Use `formatTime` from `src/lib/utils.ts` for all display. Do **not** apply it to `ClassScheduleEditor` inputs or `PaymentGenerator` (those need raw `HH:MM`).
- `DAYS`, `TIME_SLOTS`, `timeToMins`, `DAY_INDEX`, and `MONTH_NAMES` are exported from `src/lib/utils.ts` — import them from there rather than redefining locally. `DAY_INDEX` maps day name → `Date.getDay()` number (Sunday = 0). `MONTH_NAMES` is the 12-element month name array. Never redeclare these constants in route files or components.
- `useClipboard()` hook lives in `src/lib/hooks/useClipboard.ts` — returns `{ copied, copy }`. Use it anywhere a copy-to-clipboard button is needed; it handles the `navigator.clipboard` promise and the reset timer internally.
