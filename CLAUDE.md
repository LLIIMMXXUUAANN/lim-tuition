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

### Auth

- Magic link login to a single hardcoded email (`limxuan520@gmail.com`)
- Route protection is in `src/proxy.ts` — **not** `middleware.ts`. Next.js 16 renamed the middleware file and export: the file is `proxy.ts` and exports `proxy()` instead of `middleware()`.
- Unauthenticated users are redirected to `/login`; authenticated users on `/login` are redirected to `/students`

### Route structure

```
src/app/
  page.tsx                  → redirect to /students
  login/page.tsx            → magic link login form
  auth/callback/route.ts    → Supabase auth code exchange
  (app)/                    → route group: all authenticated pages share AppNav layout
    layout.tsx              → renders <AppNav> + <main>
    students/               → student list (grouped by day), detail, new form
    templates/              → Supabase-backed editable message templates
```

### Data layer

Two Supabase tables, both in the `public` schema with RLS (authenticated users only):

- **`students`** — one row per student. `class_schedule` is a `jsonb` column storing `ClassSlot[]` (array of `{ day, start, end }`). Key fields: `name`, `mode`, `status`, `class_schedule`, `contact_person`, `contact_phone`, `student_phone`, `fee_per_hour`, `payment_method`, `latest_payment`, `today_homework`, `notes`, `google_meet_link`, `google_drive_link`, `is_active`.
- **`templates`** — one row per template, keyed by text `id` (e.g. `payment`, `review_request1`). `content` is edited in-place from the UI and upserted on Save.

Supabase clients:
- `src/lib/supabase/client.ts` — browser client (used in `'use client'` components)
- `src/lib/supabase/server.ts` — server client with cookie handling (used in Server Components and Route Handlers)

### Key components

- **`AppNav`** — sticky top nav, client component (needs `usePathname` for active tab highlighting)
- **`StudentDetail`** — read-only view by default; Edit button toggles to `StudentForm` inline
- **`ClassScheduleEditor`** — dynamic list of day + start/end time slots stored as jsonb
- **`TemplatesList`** — receives initial data from server, handles edit/save/copy per template; save state cycles through `idle → saving → saved/error`

### Patterns

- Pages that need auth data are Server Components fetching via the server Supabase client; interactive state lives in client components passed data as props.
- `StudentDetail` and template cards both use the same view/edit toggle pattern to prevent accidental edits.
- The students list page groups students by weekday using `flatMap` over `class_schedule` — a student with multiple slots appears under each day.
