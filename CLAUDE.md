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
- `/` and `/login` and `/auth/*` are public; everything else requires auth.
- Unauthenticated users hitting protected routes are redirected to `/login`; authenticated users on `/login` are redirected to `/students`.

### Login page (`src/app/login/page.tsx`)

- User types their email — if it matches `ALLOWED_EMAIL` the OTP is sent; otherwise shows "Unauthorized user."
- `ALLOWED_EMAIL` is a client-side constant (visible in the JS bundle) — this is a UX guard only, not a security boundary. Security is enforced server-side: the OTP is always sent to the hardcoded email regardless of user input.
- Success state shows "Check your inbox" without revealing the email address.
- Favicon is `src/app/icon.svg` (Next.js App Router convention) — navy background with gold `</>`. A copy also lives at `public/favicon.svg`; keep them in sync if updated.

### Route structure

```
src/app/
  page.tsx                  → public landing page (all 13 sections)
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

### Landing page (`src/components/landing/`)

13 static TSX components migrated from a separate Vite project. Custom Tailwind colors (`navy`, `navyLight`, `accentGold`, `softBg`, `cardBg`) are declared in `globals.css` via `@theme {}` (Tailwind v4 — not `tailwind.config.js`). Uses `@heroicons/react` for icons.

### Key components

- **`AppNav`** — sticky top nav, client component (needs `usePathname` for active tab highlighting); brand link goes to `/` (landing page)
- **`StudentDetail`** — read-only view by default; Edit button toggles to `StudentForm` inline
- **`ClassScheduleEditor`** — dynamic list of day + start/end time slots stored as jsonb
- **`TemplatesList`** — receives initial data from server, handles edit/save/copy per template; save state cycles through `idle → saving → saved/error`
- **`PaymentGenerator`** — client component on the Templates page; calculates session dates and fee from the student's `class_schedule` via `/api/generate-payment`

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
