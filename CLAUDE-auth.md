## Auth

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

## Login pages

- **`src/app/admin/login/page.tsx`** — calls `check_tutor_access(email)` RPC before sending OTP; shows "No access." if email not in `tutors` table
- **`src/app/student/login/page.tsx`** — calls `check_portal_access(email)` RPC before sending OTP; shows "No access." if email not in any student's `access_emails`
- Both pages share identical structure: `bg-softBg` full-screen centred layout, `bg-white rounded-2xl shadow-sm border border-slate-100 p-10` card, `</>` navy/gold brand mark inside the card, `text-accentGold` back link. Do not use a shadcn `<Card>` here — the custom structure keeps styling consistent with the brand.
- Both normalise email with `.trim().toLowerCase()` before RPC + OTP calls

## Data layer

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
