# Lim's Programming Tuition

Public landing page + private admin dashboard for managing tuition students, class schedules, payments, and message templates.

## Documentation

| File | Covers |
|---|---|
| `README.md` | Project overview, features, deployment, project structure |
| `docs/decisions.md` | Non-obvious design decisions and the reasoning behind them |
| `CLAUDE.md` | AI assistant guidance — includes all `claude/` sub-docs |
| `claude/routing.md` | Route protection, login pages, Supabase RPC calls, API clients |
| `claude/ui.md` | Component reference, theming conventions, shared patterns |
| `claude/timetable.md` | Timetable page, TimetableSection, PNG exports |
| `claude/google.md` | Google Drive + Calendar integration (frontend side) |
| `claude/agent.md` | AgentChat UI, SSE handling, `[student_id:NAME:UUID]` token protocol |

Backend repo: https://github.com/LLIIMMXXUUAANN/tuition-api — for backend documentation see `README.md` and `CLAUDE.md`.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Supabase** — Postgres database + magic link auth
- **Tailwind CSS v4** + shadcn/ui + @heroicons/react
- **FastAPI backend** (`tuition-api/`) — all business logic, Google services, AI agent, timetable slot generation

## Getting Started

Copy the environment variables:

```bash
cp .env.example .env.local
# Fill in your Supabase URL and anon key
# Also start the FastAPI backend (tuition-api/) — see tuition-api/README.md
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
- **Google Calendar + Drive** — Google Calendar events and Drive folders are set up via the AI agent (`setup_student_google` tool). When a student's schedule is changed and saved, the backend automatically patches Calendar events (nuke-and-repave) and rewrites the Drive Meet doc; an amber warning is shown if the Google update fails but the save still proceeds.
- **Sync Google** — a **Sync Google** button at the bottom of the students list bulk-syncs all active students' Calendar events and Drive Meet docs to match the DB schedule. Results show per-student (✓ synced / – skipped / ✗ error); if Google auth has expired, a reconnect link is shown.
- **AI Agent** — natural language interface at `/admin/agent` with two backends toggled via the **Single · LangGraph** switch in the header (LangGraph on by default). See `tuition-api/docs/agent-tools.md` for the full tool reference. UI: markdown-rendered replies (`react-markdown` + `remark-gfm`); tool steps shown above each reply; one `"View NAME →"` link per affected student; inline PNG download buttons after timetable tool calls; voice input (Chrome/Edge/Safari); timestamps in MYT; retry button on failed messages; edit latest user message; animated loading dots; Stop button (aborts connection mid-text, or POSTs to `/api/agent/stop` during tool calls)
- **Timetable** — two-tab layout:
  - **Weekly Schedule tab** — live HTML grid showing all current class blocks (navy `#0A1A2F`, auto-cropped to active hours) with a **Download Schedule** button that exports the same view as a PNG (`weekly_schedule.png`)
  - **Slot Availability tab** (state preserved across tab switches):
    - **AI slot generator** — type scheduling rules (saved to DB) and optional student availability, click **Generate Slots**; the backend classifies every free slot as preferred / normal / unavailable and repaints the grid; buffer zones between booked classes are configurable and saved to DB
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

## Project structure

```
src/
  app/
    page.tsx                → public landing page
    admin/login/            → admin magic link login
    admin/(app)/students/   → student list, detail, new form
    admin/(app)/templates/  → message templates + payment generator
    admin/(app)/timetable/  → weekly availability grid
    admin/(app)/agent/      → AI agent chat UI
    api/[...path]/          → catch-all proxy — forwards /api/* to tuition-api/ backend
    student/login/          → student portal login
    student/(portal)/       → student dashboard
    auth/callback/          → Supabase auth code exchange
  features/
    agent/
      components/ → AgentChat (chat UI, localStorage persistence, react-markdown rendering, stop button)
    students/
      components/ → StudentCard, StudentDetail, StudentForm, ClassScheduleEditor, SyncAllButton
    templates/
      components/ → TemplatesList, PaymentGenerator
    timetable/
      components/ → TimetableSection
    landing/
      components/ → 13 public landing page sections
  services/
    supabase/   → browser + server Supabase clients; server also exports requireTutor()
  shared/
    components/ → AppNav, LogoutButton, StudentPortalView, student-fields (Row, BlockField, statusBadge, ScheduleList, ExternalLink)
    ui/         → shadcn/ui primitives
    lib/
      timetable-canvas.ts → shared PNG drawing helpers (drawScheduleToCtx, drawSlotsToCtx, computeScheduleWindow, downloadCanvas, NAVY, SCALE, PNG_* constants) — used by TimetableSection and AgentChat
  hooks/
    useClipboard.ts → copy-to-clipboard hook with reset timer and silent error handling
  lib/
    types.ts    → shared TypeScript types (Student, ClassSlot, etc.)
    utils.ts    → formatTime, cn, DAYS, TIME_SLOTS, timeToMins, DAY_INDEX, MONTH_NAMES, getWeekdayDates, getMYTDateString, formatFee, ordinal, oxfordList, groupSlotsByDay
  proxy.ts      → Next.js middleware (auth + route protection)
```

## Commands

```bash
npm run dev      # development server
npm run build    # production build + type check
npm run lint     # eslint
```
