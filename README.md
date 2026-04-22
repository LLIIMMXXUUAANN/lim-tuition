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

Open [http://localhost:3000](http://localhost:3000) to see the public landing page. Click **Admin** in the navbar (or go to `/admin/login`), enter your email, and a magic link will be sent to your inbox.

## Features

### Public
- **Landing page** — publicly accessible at `/`; sections: Hero, About, What I Offer, How Lessons Work, Student Backgrounds & Languages, Pricing, Scheduling, Payment Methods, Communication Platforms, Other Details, Testimonials
- **Hero** — full-width atmospheric background image (`public/landing_page_4k.png`) with left-aligned content, stacked CSS gradient overlay for text legibility, and a mobile dark overlay for readability; responsive navbar with hamburger menu on mobile

### Admin (authenticated only)
- **Students** — add and manage student records (contact info, class schedule, fee, payment status, homework, notes, portal access emails)
- **Schedule view** — dashboard groups students by day of week; each card shows payment method (Weekly/Monthly) at the bottom right
- **Status filter** — filter students by Active / On Hold / Completed
- **Templates** — editable message templates stored in Supabase (payment reminders, review requests, recommendation requests)
- **Payment generator** — auto-calculates session dates and fees for a given student and month; supports carryover session deductions
- **Timetable** — weekly availability grid (Mon–Sun, 8am–10pm); drag to paint slots as preferred/normal; student bookings auto-marked as unavailable; exports a HD PNG (`slot_availability.png`) with legend and colour-coded cells

### Student portal (authenticated students/parents)
- **Student portal** — students and parents log in at `/student/login` with a magic link; they see their own schedule, fees, homework, notes, and Google Meet/Drive links
- Access is controlled per student via `access_emails` array — admin adds emails in the student edit form

## Deployment

Deployed on Vercel at `https://lim-tuition.vercel.app`. Push to `main` to redeploy automatically.

After deploying, add the Vercel URL to Supabase → Authentication → Redirect URLs:
```
https://lim-tuition.vercel.app/**
```

## Project structure

```
src/
  app/
    page.tsx                      → public landing page
    admin/login/                  → admin magic link login
    admin/(app)/students/         → student list, detail, new form
    admin/(app)/templates/        → message templates + payment generator
    admin/(app)/timetable/        → weekly availability grid
    student/login/                → student portal login
    student/(portal)/             → student dashboard
    api/generate-payment/         → fee calculation API route
    auth/callback/                → Supabase auth code exchange
  components/
    shared/     → AppNav, LogoutButton, StudentPortalView
    students/   → StudentCard, StudentDetail, StudentForm, ClassScheduleEditor
    templates/  → TemplatesList, PaymentGenerator
    timetable/  → TimetableSection
    landing/    → 13 public landing page sections
    ui/         → shadcn/ui primitives
  lib/
    supabase/   → browser + server Supabase clients
    types.ts    → shared TypeScript types
    utils.ts    → formatTime, cn
  proxy.ts      → Next.js middleware (auth + route protection)
```

## Commands

```bash
npm run dev      # development server
npm run build    # production build + type check
npm run lint     # eslint
```
