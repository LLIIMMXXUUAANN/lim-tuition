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
      timetable/                  → weekly availability grid + PNG export
  student/
    login/page.tsx                → student portal magic link login
    (portal)/                     → route group: portal pages share portal nav layout
      layout.tsx                  → renders portal nav + <main>
      page.tsx                    → student dashboard (schedule, fees, homework, links)
```

### Data layer

Four Supabase tables in the `public` schema:

- **`students`** — one row per student. `class_schedule` is a `jsonb` column storing `ClassSlot[]` (array of `{ day, start, end }`). `access_emails text[]` lists emails that can log in to the student portal. RLS: admin (tutor) has full access; students can only SELECT their own row (`auth.email() = ANY(access_emails)`).
- **`templates`** — one row per template, keyed by text `id` (e.g. `payment`, `review_request1`, `first_approach`). `content` is edited in-place from the UI and upserted on Save.
- **`tutors`** — one row per tutor email. RLS enabled (no direct access); accessed only via SECURITY DEFINER functions.
- **`settings`** — key/value store for server-side config. Currently stores `google_refresh_token`. RLS: tutor-only via `is_tutor()`.

Supabase SECURITY DEFINER functions:
- `is_tutor()` — returns true if `auth.email()` is in `tutors` (used in `proxy.ts` and RLS policy)
- `check_tutor_access(p_email)` — returns true if given email is in `tutors` (used in admin login page)
- `check_portal_access(p_email)` — returns true if given email is in any student's `access_emails` (used in student login page)

Supabase clients:
- `src/lib/supabase/client.ts` — browser client (used in `'use client'` components)
- `src/lib/supabase/server.ts` — server client with cookie handling (used in Server Components and Route Handlers)

### Component structure

```
src/components/
  shared/       → AppNav, LogoutButton, StudentPortalView   (used across multiple routes)
  students/     → StudentCard, StudentDetail, StudentForm, ClassScheduleEditor, CreateDriveFolderButton, CreateCalendarEventButton
  templates/    → TemplatesList, PaymentGenerator
  timetable/    → TimetableSection
  landing/      → 13 static sections for the public landing page
  ui/           → shadcn/ui primitives (Button, Input, Card, Select, etc.)
```

### Landing page (`src/components/landing/`)

13 static TSX components migrated from a separate Vite project. Custom Tailwind colors (`navy`, `navyLight`, `accentGold`, `softBg`, `cardBg`) are declared in `globals.css` via `@theme {}` (Tailwind v4 — not `tailwind.config.js`). Uses `@heroicons/react` for icons.

**Hero (`landing/Hero.tsx`)** — full-width atmospheric section using `public/landing_page_4k.png` as a CSS background image (inline `style` — Tailwind v4 cannot parse `url()` in arbitrary classes). A stacked gradient (`linear-gradient` + `url()` in one `backgroundImage` value) keeps left-side text legible while the robot/flowchart graphic stays visible on the right. `bg-black` is the fallback color (matches the image's dark bottom). A mobile-only `absolute inset-0 bg-black/65 md:hidden` overlay ensures text stays readable when the layout stacks. `backgroundAttachment` is left at the CSS default (`scroll`) — do not set it to `fixed` as that breaks iOS Safari.

**Navbar (`landing/Navbar.tsx`)** — `"use client"` component. Desktop: hidden-on-mobile flex nav. Mobile: hamburger toggle (`Bars3Icon`/`XMarkIcon`) with a dropdown nav, `aria-expanded`, `aria-controls`, and an `Escape` key handler via `useEffect`. The static `NAV_LINKS` array is defined outside the component.

### Key components

- **`students/StudentCard`** — shows name, status/mode badges, contact person, schedule time, and payment method (bottom-right, muted grey). When rendered under a specific day (`slot` prop), time and payment method are on the same line; otherwise payment method appears below all schedule lines.
- **`shared/AppNav`** — sticky top nav, client component (needs `usePathname` for active tab highlighting); brand link goes to `/` (landing page)
- **`students/StudentDetail`** — read-only view by default; Edit button toggles to `StudentForm` inline
- **`students/ClassScheduleEditor`** — dynamic list of day + start/end time slots stored as jsonb
- **`templates/TemplatesList`** — receives initial data from server, handles edit/save/copy per template; save state cycles through `idle → saving → saved/error`
- **`templates/PaymentGenerator`** — client component on the Templates page; calculates session dates and fee from the student's `class_schedule` via `/api/generate-payment`
- **`timetable/TimetableSection`** — client component on the Timetable page; interactive 7×28 drag-to-paint grid (Mon–Sun, 8am–10pm in 30-min slots). Booked slots (from active students' `class_schedule`) are auto-marked red and non-editable. Free slots cycle: unavailable → preferred → normal → unavailable. "Download PNG" renders an offscreen 2× canvas and saves `slot_availability.png`. No DB persistence — state is ephemeral.

### Timetable (`src/app/admin/(app)/timetable/page.tsx`)

Server Component that fetches active students' `name` and `class_schedule`, then passes them to `TimetableSection`. No extra tables — booked slots are derived from existing student data at render time. Booked slot detection uses interval overlap (`cellStart < slotEnd && cellEnd > slotStart`) to correctly catch classes that start mid-slot. The `bookedSet` is pre-computed once via `useMemo` as a `Set<string>` of `"Day|HH:MM"` keys for O(1) lookup during drag and PNG export.

### Google Drive + Calendar integration (`src/lib/google/`, `src/app/api/google/`)

Admin-only features for creating a student's Google Drive folder and weekly recurring Google Calendar event.

- **`src/lib/google/auth.ts`** — `getOAuth2Client()`: reads refresh token from `settings` table, returns configured OAuth2 client
- **`src/lib/google/drive.ts`** — `createStudentDriveFolder(auth, studentName, meetLink, classSchedule)`: creates root folder in `GOOGLE_STUDENTS_FOLDER_ID`, creates 4 subfolders with content (Teaching Slides shortcut, 2× empty `.ipynb`, blank Google Doc), writes a pre-filled "Google Meet Link" Google Doc (student name, schedule, timezone, Meet link), sets anyone-with-link viewer permission. Atomic: deletes root folder on any failure so retries don't create duplicates.
- **`src/lib/google/calendar.ts`** — `createWeeklyClassEvents(auth, studentName, schedule)`: creates a weekly recurring event for each class slot in `GOOGLE_CALENDAR_ID`. First slot gets a Google Meet conference (one Meet link per student); subsequent slots reference the same link in their description. Datetime strings are formatted as naive `YYYY-MM-DDTHH:MM:SS` (no Z) with `timeZone: Asia/Kuala_Lumpur` so Google Calendar interprets them as MYT regardless of server timezone.
- **`src/app/api/google/auth/route.ts`** — One-time OAuth setup: redirects admin to Google consent screen with Drive + Calendar scopes (tutor-only)
- **`src/app/api/google/callback/route.ts`** — OAuth callback: exchanges code for tokens, saves refresh token to `settings` table (tutor-only)
- **`src/app/api/google/create-student-folder/route.ts`** — POST `{ name, meet_link, class_schedule }`: creates the full Drive folder structure, returns `{ url }` (tutor-only). Requires `meet_link` to be set so the "Google Meet Link" doc is fully populated.
- **`src/app/api/google/create-class-event/route.ts`** — POST `{ name, class_schedule }`: creates weekly recurring Calendar events, returns `{ meetLink, eventCount }` (tutor-only)
- **`src/components/students/CreateDriveFolderButton.tsx`** — client button in `StudentForm`; disabled until both student name and Google Meet link are filled; on success auto-fills `google_drive_link`
- **`src/components/students/CreateCalendarEventButton.tsx`** — client button in `StudentForm`; disabled until student name and class schedule are filled; on success auto-fills `google_meet_link`

**Intended flow in student form:** fill name + schedule → click **Create Calendar Event** (Meet link auto-fills) → click **Create Drive Folder** (doc written with actual Meet link).

**Required env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_STUDENTS_FOLDER_ID`, `GOOGLE_LEC_TOPIC1_FILE_ID`, `GOOGLE_CALENDAR_ID`

**One-time setup:** visit `/api/google/auth` as admin to store the refresh token with Drive + Calendar scopes. OAuth app must have Drive API + Calendar API enabled in Google Cloud, with the admin email added as a test user.

### Payment generator (`src/app/api/generate-payment/route.ts`)

POST route handler. No external AI — pure JS date arithmetic:
- Groups `class_schedule` slots by day, finds all occurrences of each weekday in the given month
- Fee = `fee_per_hour × duration_hours × session_count` per day, summed across all days
- Template 2 (carryover): deducts `carryover × avg_fee_per_session` from the total (tutor owes student those sessions)
- `formatFee` rounds to 2 d.p. before integer check to avoid floating-point noise

### Patterns

- Pages that need auth data are Server Components fetching via the server Supabase client; interactive state lives in client components passed data as props.
- `StudentDetail` and template cards both use the same view/edit toggle pattern to prevent accidental edits.
- The students list page groups students by weekday using `flatMap` over `class_schedule` — a student with multiple slots appears under each day.
- The shadcn/ui Select in this project uses Base UI (`@base-ui/react/select`), not Radix. `SelectValue` renders the raw value string — use a manual `<span>` inside `SelectTrigger` to show the display label.
- Times are stored as `"HH:MM"` strings in Supabase but displayed in 12-hour format. Use `formatTime` from `src/lib/utils.ts` for all display. Do **not** apply it to `ClassScheduleEditor` inputs or `PaymentGenerator` (those need raw `HH:MM`).
