# Lim's Programming Tuition

Public landing page + private admin dashboard for managing tuition students, class schedules, payments, and message templates.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Supabase** — Postgres database + magic link auth
- **Tailwind CSS v4** + shadcn/ui + @heroicons/react

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

Open [http://localhost:3000](http://localhost:3000) to see the public landing page. Click **Admin** in the navbar (or go to `/login`), enter your email, and a magic link will be sent to your inbox.

## Features

### Public
- **Landing page** — publicly accessible at `/`; sections: Hero, About, What I Offer, How Lessons Work, Student Backgrounds & Languages, Pricing, Scheduling, Payment Methods, Communication Platforms, Other Details, Testimonials

### Admin (authenticated only)
- **Students** — add and manage student records (contact info, class schedule, fee, payment status, homework, notes)
- **Schedule view** — dashboard groups students by day of week based on their class slots
- **Status filter** — filter students by Active / On Hold / Completed
- **Templates** — editable message templates stored in Supabase (payment reminders, review requests, recommendation requests)
- **Payment generator** — auto-calculates session dates and fees for a given student and month; supports carryover session deductions

## Deployment

Deployed on Vercel at `https://lim-tuition.vercel.app`. Push to `main` to redeploy automatically.

After deploying, add the Vercel URL to Supabase → Authentication → Redirect URLs:
```
https://lim-tuition.vercel.app/**
```

## Commands

```bash
npm run dev      # development server
npm run build    # production build + type check
npm run lint     # eslint
```
