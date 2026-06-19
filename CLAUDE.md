# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@claude/routing.md
@claude/ui.md
@claude/timetable.md
@claude/google.md
@claude/agent.md

## Documentation files

| File | Covers |
|---|---|
| `docs/decisions.md` | Non-obvious design decisions and the reasoning behind them |
| `claude/routing.md` | Route protection (`proxy.ts`), login pages, Supabase RPC calls, API clients |
| `claude/ui.md` | Component reference, theming conventions, shared patterns |
| `claude/timetable.md` | Timetable page, `TimetableSection`, PNG exports, shared canvas lib |
| `claude/google.md` | Google Drive + Calendar integration (frontend side only) |
| `claude/agent.md` | `AgentChat` UI, SSE handling, `[student_id:NAME:UUID]` token protocol |

Backend documentation: `tuition-api/README.md` and `tuition-api/CLAUDE.md`.

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build + type check
npm run lint     # eslint
```

No test suite. Use `npm run build` to verify type correctness before committing.

## Architecture

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (Postgres + Auth) · Tailwind CSS v4 · shadcn/ui

### Source structure

All business logic, Google services, agent tools, and AI backend live in `tuition-api/` (FastAPI). This Next.js repo contains only the UI, auth middleware, and Supabase client code. Server Components call the backend directly via `fetchFastAPI` (`src/lib/fastapi.ts`); client-side calls use `fetch('/api/...')` which is forwarded to the backend by the catch-all proxy at `src/app/api/[...path]/route.ts`.

```
src/
  app/              → Next.js routes (see Route structure below)
  features/         → feature slices (components only — no lib)
    agent/
      components/   → AgentChat
    students/
      components/   → StudentCard, StudentDetail, StudentForm, ClassScheduleEditor, SyncAllButton
    templates/
      components/   → TemplatesList, PaymentGenerator
    timetable/
      components/   → TimetableSection
    landing/
      components/   → 13 static landing page sections
  services/         → external API clients
    supabase/       → client.ts, server.ts (+ requireTutor())
  shared/           → cross-feature shared code
    components/     → AppNav, LogoutButton, StudentPortalView, student-fields
    ui/             → shadcn/ui primitives
    lib/            → templates.ts, timetable-canvas.ts
  hooks/            → useClipboard.ts
  lib/              → types.ts, utils.ts, fastapi.ts
  proxy.ts          → Next.js middleware (auth + route protection)
```

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
      agent/                      → AI agent chat UI (students CRUD, templates, payment messages)
  student/
    login/page.tsx                → student portal magic link login
    (portal)/                     → route group: portal pages share portal nav layout
      layout.tsx                  → renders portal nav + <main>
      page.tsx                    → student dashboard (schedule, fees, homework, links)
```
