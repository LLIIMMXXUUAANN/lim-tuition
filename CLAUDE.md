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
