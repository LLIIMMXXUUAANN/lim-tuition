## Route protection (`src/proxy.ts`)

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

**Supabase RPC functions called by the frontend:**
- `is_tutor()` — returns true if `auth.email()` is in `tutors`; used in `proxy.ts` and RLS policies
- `check_tutor_access(p_email)` — returns true if given email is in `tutors`; used in admin login page
- `check_portal_access(p_email)` — returns true if given email is in any student's `access_emails`; used in student login page

## Login pages

- **`src/app/admin/login/page.tsx`** — calls `check_tutor_access(email)` RPC before sending OTP; shows "No access." if email not in `tutors` table
- **`src/app/student/login/page.tsx`** — calls `check_portal_access(email)` RPC before sending OTP; shows "No access." if email not in any student's `access_emails`
- Both pages share identical structure: `bg-softBg` full-screen centred layout, `bg-white rounded-2xl shadow-sm border border-slate-100 p-10` card, `</>` navy/gold brand mark inside the card, `text-accentGold` back link. Do not use a shadcn `<Card>` here — the custom structure keeps styling consistent with the brand.
- Both normalise email with `.trim().toLowerCase()` before RPC + OTP calls

## API clients

**Supabase:**
- `src/services/supabase/client.ts` — browser client (used in `'use client'` components)
- `src/services/supabase/server.ts` — server client with cookie handling. Also exports `requireTutor()`: verifies the request comes from an authenticated tutor and returns `{ supabase, error }` — called by the catch-all proxy for all protected routes.

**Backend (FastAPI):**
- `src/lib/fastapi.ts` — exports `fetchFastAPI(path, init?)`: prepends `FASTAPI_BASE_URL` and injects the `X-Internal-Secret` header. Used by **Server Components** to call the backend directly (not via the proxy, which is only for browser requests).
- `src/app/api/[...path]/route.ts` — catch-all proxy that forwards all `/api/*` browser requests to the FastAPI backend. Injects `X-Internal-Secret`, calls `requireTutor()` for paths in the `AUTH_REQUIRED` set, preserves query strings, streams response bodies unchanged. Handles GET, POST, PUT, DELETE. One URL mismatch is mapped via `PATH_MAP`: `generate-payment` → `payment/generate`.
