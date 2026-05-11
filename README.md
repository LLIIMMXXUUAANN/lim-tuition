# Lim's Programming Tuition

Public landing page + private admin dashboard for managing tuition students, class schedules, payments, and message templates.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Supabase** — Postgres database + magic link auth
- **Tailwind CSS v4** + shadcn/ui + @heroicons/react
- **Gemini 2.5 Flash** (`@google/generative-ai`) — AI slot classification with structured output
- **Gemini 2.5 Flash** (`@google/genai` v1.x) — AI agent function calling for student management
- **Zod** — runtime validation of AI responses

## Getting Started

Copy the environment variables:

```bash
cp .env.example .env.local
# Fill in your Supabase URL, anon key, Google OAuth credentials, and GEMINI_API_KEY
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the public landing page. Click **Admin** in the navbar (or go to `/admin/login`), enter your email, and a magic link will be sent to your inbox.

## Features

### Public
- **Landing page** — publicly accessible at `/`; sections: Hero, About, What I Offer, How Lessons Work, Student Backgrounds & Languages, Pricing, Scheduling, Payment Methods, Communication Platforms, Other Details, Testimonials
- **Hero** — full-width atmospheric background image (`public/landing_page_4k.png`) with left-aligned content, stacked CSS gradient overlay for text legibility, and a mobile dark overlay for readability; responsive navbar with hamburger menu on mobile

### Admin (authenticated only)
- **Students** — add, manage, and permanently delete student records (contact info, class schedule, fee, payment status, homework, notes, portal access emails); deletion shows a confirmation dialog and hard-deletes the DB row, Drive folder, and all Calendar events
- **Schedule view** — dashboard groups students by day of week; each card shows payment method (Weekly/Monthly) at the bottom right
- **Status filter** — filter students by Active / On Hold / Completed
- **Templates** — editable message templates stored in Supabase, organised into 4 sub-tabs: **Payment** (payment reminder templates + payment generator), **Review** (review request templates), **Recommendation** (recommendation request templates), **First Approach** (Superprof outreach template)
- **Payment generator** — lives inside the Payment tab; auto-calculates session dates and fees for a given student and month; supports carryover session deductions
- **Google Calendar event creation** — "Create Google Calendar Event" button on the new student form; creates a weekly recurring event in the Superprof calendar for each class slot, auto-generates a Google Meet link, and auto-fills the `google_meet_link` field. Event IDs are stored per-slot so the same Meet link can be reused on reschedule.
- **Google Calendar rescheduling** — when a student's class schedule is changed and saved, the existing Calendar events are automatically patched (not recreated) so the Google Meet link is preserved; the "Google Meet Link" doc in the student's Drive folder is also rewritten with the new schedule. If the auto-update can't run (missing event IDs, missing Meet link, API error), an amber warning is shown and the form stays open so it's readable
- **Google Drive folder creation** — button label adapts to the student's mode: **"Create Google Drive Folder (My Python Syllabus)"** creates the full folder structure (Teaching Slides shortcut, coding notebooks, homework folders, Google Meet Link doc); **"Create Google Drive Folder (Other Syllabus)"** creates the root folder with only the Google Meet Link doc. Both require the Meet link to be set first and set anyone-with-link viewer access
- **Sync Google** — a **Sync Google** button at the bottom of the students list syncs all active students' Calendar events and Drive "Google Meet Link" docs to match the DB schedule. For students with no stored event IDs it first searches Calendar by name to find and save them, then patches. Results show per-student (✓ synced / – skipped / ✗ error); if Google auth has expired, a reconnect link is shown
- **AI Agent** — natural language interface at `/admin/agent` powered by Gemini 2.5 Flash function calling. Type commands like "Create student LX, Other Syllabus, Monday 3–5pm, RM 60/hr", "Update John's fee to RM 80", or "Show all active Monday students". Gemini drives a multi-round tool loop (up to 10 rounds) that executes against Supabase and Google APIs, then self-evaluates that mutations persisted. Conversation history is sent on every request and persisted to localStorage across page refreshes.
  - **9 tools:** `search_students`, `get_student`, `list_students`, `create_student`, `update_student`, `delete_student`, `setup_student_google`, `sync_all_students`, `manage_portal_access`
  - **Auto Google sync:** updating a student's `class_schedule` via the agent automatically patches Calendar events and rewrites the Drive Meet doc (parallel, non-fatal)
  - **Google setup suggestion:** creating a student with a schedule, or updating a schedule when Google isn't set up, triggers a `suggestGoogleSetup` flag — Gemini asks the user if they want Google setup before calling `setup_student_google`
  - **Safety:** `delete_student` requires explicit "yes" in conversation + warns about Calendar/Drive removal; `update_student` uses `ALLOWED_UPDATE_KEYS` allowlist to prevent prompt injection; `sync_all_students` requires explicit confirmation
  - **Self-evaluation:** after every mutation, a post-loop DB query verifies the change persisted and appends a `✓` or `⚠` status to the tool steps display
  - **UI:** markdown-rendered replies (tables, bold, blockquotes via `react-markdown` + `remark-gfm`); tool steps shown above each reply; "View student →" link rendered from `[student_id:UUID]` token Gemini appends to replies
- **Timetable** — two-tab layout:
  - **Weekly Schedule tab** — live HTML grid showing all current class blocks (navy `#0A1A2F`, auto-cropped to active hours) with a **Download Schedule** button that exports the same view as a PNG (`weekly_schedule.png`)
  - **Slot Availability tab** (state preserved across tab switches):
    - **AI slot generator** — type scheduling rules (saved to DB) and optional student availability, click **Generate Slots**; Gemini 2.5 Flash classifies every free slot as preferred / normal / unavailable and repaints the grid; buffer zones between booked classes are computed in code (configurable, saved to DB), not by the LLM. Time-range end boundaries in rules are exclusive: `"08:00 to 10:00 unavailable"` leaves the 10:00 slot fully available
    - **Manual override** — after AI generation, drag or click any cell to manually cycle its state
    - **Download Available Slots** — colour-coded availability grid with legend (`slot_availability.png`)

### Student portal (authenticated students/parents)
- **Student portal** — students and parents log in at `/student/login` with a magic link; they see their own schedule, fees, homework, notes, and Google Meet/Drive links
- Access is controlled per student via `access_emails` array — admin adds emails in the student edit form

## Deployment

Deployed on Vercel at `https://lim-tuition.vercel.app`. Push to `main` to redeploy automatically.

After deploying, add the Vercel URL to Supabase → Authentication → Redirect URLs:
```
https://lim-tuition.vercel.app/**
```

## Email (magic link delivery)

Magic link emails are sent via Gmail SMTP. Configured in Supabase Dashboard → Authentication → SMTP Settings:

| Field | Value |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `587` |
| Sender | `limxuan520@gmail.com` |
| Password | Gmail App Password (not the account password) |

To regenerate: Google Account → Security → search "App Passwords".

## Project structure

```
src/
  app/
    page.tsx                      → public landing page
    admin/login/                  → admin magic link login
    admin/(app)/students/         → student list, detail, new form
    admin/(app)/templates/        → message templates + payment generator
    admin/(app)/timetable/        → weekly availability grid
    admin/(app)/agent/            → AI agent chat UI
    api/agent/                    → Gemini function-calling loop (max 10 rounds, parallel tool execution)
    student/login/                → student portal login
    student/(portal)/             → student dashboard
    api/generate-payment/         → fee calculation API route
    api/google/                   → Google OAuth setup, Drive folder creation/deletion, Calendar event creation/update/sync-all/deletion
    api/timetable/                → rules CRUD, buffer-mins CRUD, AI slot generation (Gemini)
    auth/callback/                → Supabase auth code exchange
  components/
    shared/     → AppNav, LogoutButton, StudentPortalView, student-fields (Row, BlockField, statusBadge, ScheduleList, ExternalLink)
    students/   → StudentCard, StudentDetail, StudentForm, ClassScheduleEditor, CreateDriveFolderButton, CreateCalendarEventButton, SyncAllButton
    templates/  → TemplatesList, PaymentGenerator
    timetable/  → TimetableSection
    agent/      → AgentChat (chat UI, localStorage persistence, react-markdown rendering)
    landing/    → 13 public landing page sections
    ui/         → shadcn/ui primitives
  lib/
    supabase/   → browser + server Supabase clients; server also exports requireTutor() used by all tutor-only API routes
    google/     → getOAuth2Client() (with DB), newOAuth2Client() (bare); Drive folder creation/update/deletion (parallel); Calendar event creation/update/deletion (parallel)
    hooks/      → useClipboard() — copy-to-clipboard hook with reset timer and silent error handling
    agent/      → tools.ts (9 tool implementations), schema.ts (TOOL_DECLARATIONS + SYSTEM_INSTRUCTION), eval.ts (selfEval)
    gemini.ts   → Gemini client factory, Zod slot schema, responseSchema for structured output
    types.ts    → shared TypeScript types (Student, ClassSlot, etc.)
    utils.ts    → formatTime, cn, DAYS, TIME_SLOTS, timeToMins, DAY_INDEX, MONTH_NAMES
  proxy.ts      → Next.js middleware (auth + route protection)
```

## Google OAuth

One-time setup: visit `/api/google/auth` as admin → complete Google consent → refresh token is saved to the `settings` table.

**Avoid 7-day token expiry:** Google expires refresh tokens every 7 days for apps in Testing mode. Publish the app to **In production** in Google Cloud Console → APIs & Services → OAuth consent screen → Publish App. No verification needed for a single-user app — you'll just see an "unverified app" warning during your own OAuth flow.

If you see `invalid_grant` errors, re-visit `/api/google/auth` to re-authorize. After publishing to production, this should only happen if you change your Google account password or manually revoke access.

## Commands

```bash
npm run dev      # development server
npm run build    # production build + type check
npm run lint     # eslint
```
