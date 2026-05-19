# Lim's Programming Tuition

Public landing page + private admin dashboard for managing tuition students, class schedules, payments, and message templates.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Supabase** — Postgres database + magic link auth
- **Tailwind CSS v4** + shadcn/ui + @heroicons/react
- **Gemini 2.5 Flash** (`@google/generative-ai`) — AI slot classification with structured output
- **Gemini 2.5 Flash** (`@google/genai` v1.x) — classic AI agent (single-model function-calling loop)
- **LangChain + LangGraph** (`@langchain/google`, `@langchain/langgraph`) — multi-agent supervisor/subagent backend (opt-in via toggle)
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
- **Google Calendar rescheduling** — when a student's class schedule is changed and saved, the route searches Calendar by name to find all events (including any rogue ones not tracked in the DB), merges them with the stored event IDs, then applies nuke-and-repave: the event that owns the Google Meet conference is patched to the new schedule, all others are deleted, and fresh events are created for any remaining slots. The Meet link is always preserved; if the primary event was accidentally deleted, a new one with a fresh Meet link is auto-generated and the new link is saved to the DB and Drive doc. An amber warning is shown if Drive update fails, but the save still proceeds
- **Google Drive folder creation** — button label adapts to the student's mode: **"Create Google Drive Folder (My Python Syllabus)"** creates the full folder structure (Teaching Slides shortcut, coding notebooks, homework folders, Google Meet Link doc); **"Create Google Drive Folder (Other Syllabus)"** creates the root folder with only the Google Meet Link doc. Both require the Meet link to be set first and set anyone-with-link viewer access
- **Sync Google** — a **Sync Google** button at the bottom of the students list syncs all active students' Calendar events and Drive "Google Meet Link" docs to match the DB schedule. Always searches Calendar by student name and merges any discovered events with the stored IDs (catches rogue events from previous bad syncs). Applies nuke-and-repave per student: keep the Meet-conference event, delete everything else, recreate cleanly. If the primary event was deleted, a new Meet link is generated and saved automatically. Results show per-student (✓ synced / – skipped / ✗ error); if Google auth has expired, a reconnect link is shown
- **AI Agent** — natural language interface at `/admin/agent` with two backends toggled via the **LangGraph** switch in the header. See [`docs/agent-tools.md`](docs/agent-tools.md) for the full input/process/output reference for all 19 tools. Both backends share the same tool implementations and SSE event format.
  - **Classic mode** (default): Gemini 2.5 Flash drives a single-model function-calling loop (up to 10 rounds) via `@google/genai`. Tool calls run in parallel within each round; a timing step shows `⏱ parallel ×N — tool1 Xms, tool2 Yms (total Zms)`. After mutations a `selfEval` DB query appends a `✓` / `⚠` step.
  - **LangGraph mode** (toggle on): supervisor + 3 specialist subagents via `@langchain/langgraph`. Supervisor routes to `student_agent`, `template_agent`, or `timetable_agent`. Each subagent uses a two-phase tool-selection loop (slim catalog → full schema for selected tool) that reliably forces Gemini to call the correct tool. Post-hook self-eval runs inside each subagent after mutations. Both backends are stateless — full message history is sent on every request.
  - **19 tools** (fine-grained reads, coarse-grained writes): `search_students`, `get_student`, `list_students` (optional status filter), `create_student`, `update_student`, `delete_student`, `setup_student_google`, `sync_all_students`, `manage_portal_access`, `get_schedule` (students by day of week), `get_fee_summary` (monthly revenue per student + total), `list_templates` (discover template ids/titles), `get_template` (fetch a single template's content by id), `generate_payment_message` (generate a ready-to-send payment reminder for a student; defaults to next month), `get_timetable_settings` (read scheduling rules + buffer mins), `update_timetable_rules` (save new rules text), `update_buffer_mins` (0–60 min buffer around booked classes), `generate_slot_availability` (AI-classify every free slot using Gemini), `download_timetable_image` (fetch students for schedule PNG)
  - **SSE streaming:** both routes return `text/event-stream`. Tool steps appear immediately as each tool fires; the final reply streams token-by-token. The frontend patches a placeholder message in place as events arrive.
  - **Auto Google sync:** updating a student's `class_schedule` via the agent automatically patches Calendar events and rewrites the Drive Meet doc (parallel, non-fatal)
  - **Google setup suggestion:** creating a student with a schedule, or updating a schedule when Google isn't set up, triggers a `suggestGoogleSetup` flag — Gemini asks the user if they want Google setup before calling `setup_student_google`
  - **Timetable via agent:** `generate_slot_availability` runs the same Gemini slot-classifier as the timetable tab and triggers a **Download Slot Availability PNG** button in the chat; `download_timetable_image` triggers a **Download Schedule PNG** button — both render client-side using the shared `timetable-canvas.ts` lib
  - **Safety:** `delete_student` requires explicit "yes" in conversation + warns about Calendar/Drive removal; `update_student` uses `ALLOWED_UPDATE_KEYS` allowlist to prevent prompt injection; `sync_all_students` requires explicit confirmation; `update_timetable_rules` shows proposed rules and confirms before writing
  - **UI:** markdown-rendered replies (tables, bold, blockquotes via `react-markdown` + `remark-gfm`); tool steps shown above each reply; one `"View NAME →"` link per affected student rendered from `[student_id:NAME:UUID]` tokens; inline PNG download buttons after timetable tool calls; voice input via Web Speech API (Chrome/Edge/Safari)
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
    api/agent/chat/               → classic Gemini function-calling loop (max 10 rounds, SSE streaming, parallel tool execution)
    api/agent/lg/chat/            → LangGraph supervisor+subagent backend (SSE streaming, same event format)
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
    agent/      → tools.ts (19 tool implementations), schema.ts (thin composer), domains/ (students · templates · timetable), eval.ts (selfEval)
    agent/lg/   → LangGraph multi-agent: model.ts, handoff.ts, progressive.ts, custom-supervisor.ts, supervisor.ts, *-agent.ts, tool-factories.ts, post-hooks.ts, stream-adapter.ts
    templates.ts → TEMPLATE_META (shared id→title/description map) + templateMeta() helper — used by TemplatesList and agent tools
    gemini.ts   → Gemini client factory, Zod slot schema, responseSchema for structured output
    types.ts    → shared TypeScript types (Student, ClassSlot, etc.)
    utils.ts    → formatTime, cn, DAYS, TIME_SLOTS, timeToMins, DAY_INDEX, MONTH_NAMES, getWeekdayDates, getMYTDateString, formatFee, ordinal, oxfordList, groupSlotsByDay
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
