# Lim's Tuition

Private admin dashboard for tracking tuition students, class schedules, payments, and message templates.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Supabase** — Postgres database + magic link auth
- **Tailwind CSS v4** + shadcn/ui

## Getting Started

Copy the environment variables:

```bash
cp .env.example .env.local
# Fill in your Supabase URL and anon key
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to the login page — enter your email to receive a magic link.

## Features

- **Students** — add and manage student records (contact info, class schedule, fee, payment status, homework, notes)
- **Schedule view** — dashboard groups students by day of week based on their class slots
- **Status filter** — filter students by Active / On Hold / Completed
- **Templates** — editable message templates stored in Supabase (payment reminders, review requests, recommendation requests)

## Commands

```bash
npm run dev      # development server
npm run build    # production build + type check
npm run lint     # eslint
```
