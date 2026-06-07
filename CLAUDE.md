# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@claude/auth.md
@claude/components.md
@claude/timetable.md
@claude/google.md
@claude/agent.md

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

```
src/
  app/              → Next.js routes (see Route structure below)
  features/         → feature slices (components + feature-specific lib)
    agent/
      components/   → AgentChat
      lib/          → tools/ (student-tools · template-tools · timetable-tools · shared), schema.ts, eval.ts, stop-signals.ts, domains/, lg/
    students/
      components/   → StudentCard, StudentDetail, StudentForm, ClassScheduleEditor, CreateDriveFolderButton, CreateCalendarEventButton, SyncAllButton
    templates/
      components/   → TemplatesList, PaymentGenerator
    timetable/
      components/   → TimetableSection
      lib/          → timetable-slots.ts
    landing/
      components/   → 13 static landing page sections
  services/         → external API clients
    supabase/       → client.ts, server.ts (+ requireTutor())
    google/         → auth.ts, calendar.ts, drive.ts, cleanup.ts, sync.ts
    gemini/         → index.ts (runGeminiSlotGeneration)
  shared/           → cross-feature shared code
    components/     → AppNav, LogoutButton, StudentPortalView, student-fields
    ui/             → shadcn/ui primitives
    lib/            → payment.ts, templates.ts, timetable-canvas.ts
  hooks/            → useClipboard.ts
  lib/              → types.ts, utils.ts (universal primitives only)
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
