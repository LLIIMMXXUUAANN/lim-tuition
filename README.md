# Lim's Programming Tuition

Public landing page + private admin dashboard for managing tuition students, class schedules, payments, and message templates.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Supabase** — Postgres database + magic link auth
- **Tailwind CSS v4** + shadcn/ui + @heroicons/react
- **Gemini 2.5 Flash** (`@google/generative-ai`) — AI slot classification with structured output
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
- **Google Calendar rescheduling** — when a student's class schedule is changed and saved, the existing Calendar events are automatically patched (not recreated) so the Google Meet link is preserved; the "Google Meet Link" doc in the student's Drive folder is also rewritten with the new schedule
- **Google Drive folder creation** — "Create Google Drive Folder (Python Syllabus)" button on the new student form; requires Meet link to be set first; automatically creates the student's folder structure (Teaching Slides shortcut, blank coding notebooks, homework doc, pre-filled Google Meet Link doc) and sets anyone-with-link viewer access
- **Backfill banner** — if existing students have a Meet link but no stored event IDs, a banner appears at the top of the students list with a "Sync Event IDs" button; it searches Calendar by student name, stores the IDs, and dismisses once done
- **Timetable** — two-tab layout: **Weekly Schedule** tab (download shareable schedule image) and **Slot Availability** tab (state preserved across tab switches); the availability tab includes:
  - **AI slot generator** — type scheduling rules (saved to DB) and optional student availability, click **Generate Slots**; Gemini 2.5 Flash classifies every free slot as preferred / normal / unavailable and repaints the grid; buffer zones between booked classes are computed in code (configurable, saved to DB), not by the LLM
  - **Manual override** — after AI generation, drag or click any cell to manually cycle its state
  - **Download Schedule** — clean shareable weekly calendar showing student names and class times (`weekly_schedule.png`); all blocks slate blue-grey; auto-crops to active hours ± 30 min
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
    student/login/                → student portal login
    student/(portal)/             → student dashboard
    api/generate-payment/         → fee calculation API route
    api/google/                   → Google OAuth setup, Drive folder creation/deletion, Calendar event creation/update/backfill/deletion
    api/timetable/                → rules CRUD, buffer-mins CRUD, AI slot generation (Gemini)
    auth/callback/                → Supabase auth code exchange
  components/
    shared/     → AppNav, LogoutButton, StudentPortalView, student-fields (Row, BlockField, statusBadge)
    students/   → StudentCard, StudentDetail, StudentForm, ClassScheduleEditor, CreateDriveFolderButton, CreateCalendarEventButton, BackfillEventIdsButton
    templates/  → TemplatesList, PaymentGenerator
    timetable/  → TimetableSection
    landing/    → 13 public landing page sections
    ui/         → shadcn/ui primitives
  lib/
    supabase/   → browser + server Supabase clients
    google/     → Google OAuth2 client, Drive folder creation/update/deletion, Calendar event creation/update/deletion
    gemini.ts   → Gemini client factory, Zod slot schema, responseSchema for structured output
    types.ts    → shared TypeScript types
    utils.ts    → formatTime, cn, DAYS, TIME_SLOTS, timeToMins
  proxy.ts      → Next.js middleware (auth + route protection)
```

## Commands

```bash
npm run dev      # development server
npm run build    # production build + type check
npm run lint     # eslint
```
