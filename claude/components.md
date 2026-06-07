## Component structure

```
src/
  features/
    agent/
      components/ → AgentChat (chat UI, localStorage persistence, tool step display, edit latest user message)
    students/
      components/ → StudentCard, StudentDetail, StudentForm, ClassScheduleEditor, CreateDriveFolderButton, CreateCalendarEventButton, SyncAllButton
    templates/
      components/ → TemplatesList, PaymentGenerator
    timetable/
      components/ → TimetableSection
    landing/
      components/ → 13 static sections for the public landing page
  shared/
    components/ → AppNav, LogoutButton, StudentPortalView, student-fields   (used across multiple routes)
    ui/         → shadcn/ui primitives (Button, Input, Card, Select, Tabs, etc.)
```

## Landing page (`src/features/landing/components/`)

13 static TSX components. Custom Tailwind colors (`navy`, `navyLight`, `accentGold`, `softBg`, `cardBg`) are declared in `globals.css` via `@theme {}` (Tailwind v4 — not `tailwind.config.js`). Uses `@heroicons/react` for icons.

**Hero (`landing/Hero.tsx`)** — full-width atmospheric section using `public/landing_page_4k.png` as a CSS background image (inline `style` — Tailwind v4 cannot parse `url()` in arbitrary classes). A stacked gradient (`linear-gradient` + `url()` in one `backgroundImage` value) keeps left-side text legible while the robot/flowchart graphic stays visible on the right. `bg-black` is the fallback color (matches the image's dark bottom). A mobile-only `absolute inset-0 bg-black/65 md:hidden` overlay ensures text stays readable when the layout stacks. `backgroundAttachment` is left at the CSS default (`scroll`) — do not set it to `fixed` as that breaks iOS Safari.

## Key components

- **`shared/components/student-fields`** — shared display primitives used by `StudentDetail`, `StudentPortalView`, and `StudentCard`: `Row` (inline label + value), `BlockField` (stacked label + `whitespace-pre-wrap` value for multi-line text), `statusBadge` (status → Tailwind class lookup), `ScheduleList` (renders a `ClassSlot[]` as a formatted list, or "No schedule set" when empty), `ExternalLink` (gold-coloured `<a>` for Meet/Drive links). Import from here instead of redefining locally.
- **`features/students/components/StudentCard`** — shows name, mode badge, contact person, schedule time, and payment method (bottom-right, muted grey). Accepts `showStatus` prop (default `false`) — pass `showStatus={true}` only on the "All" filter tab where the status badge is informative; on day-filtered tabs it's redundant. Mode badge colours: `'My Python Syllabus'` → `bg-navy/6 text-navy`; `'Other Syllabus'` → `bg-accentGold/15 text-accentGold`. Uses `@heroicons/react` (`ClockIcon`, `CalendarDaysIcon`, `CreditCardIcon`) instead of emoji. When rendered under a specific day (`slot` prop), time and payment method are on the same line; otherwise payment method appears below all schedule lines.
- **`features/students/components/StudentForm`** — on Save, if the student already has `calendar_event_ids` and the schedule changed, automatically calls `update-class-event` before the DB upsert; searches Calendar by name, merges found IDs with stored ones, applies nuke-and-repave (Meet link preserved), and rewrites the Drive "Google Meet Link" doc. If the primary Calendar event was deleted, a new Meet link is generated — the form's Meet link field updates live and the new link is included in the DB upsert. If the calendar update produces a warning (API error, missing event IDs, missing Meet link), the form stays open after save so the user can read the amber warning — they close via ← Cancel. "Remove Student" opens a confirmation dialog that hard-deletes the row and calls `delete-student` to trash the Drive folder and delete Calendar events; Google cleanup failure shows an in-dialog amber warning but doesn't block the DB deletion.
- **`features/students/components/SyncAllButton`** — banner at the bottom of the students list; one click syncs all active students' Google Calendar events and Drive Meet docs to match the DB schedule. Always searches Calendar by exact name and merges discovered IDs with stored ones (catches rogue events from previous bad syncs). Applies nuke-and-repave per student: keeps the event that owns the Meet conference, deletes everything else, recreates cleanly. If the primary event was deleted, a new Meet link is generated and saved to DB automatically. Results show per-student status (✓ synced / – skipped / ✗ error). If `invalid_grant` is detected, shows a reconnect link.
- **`features/templates/components/TemplatesList`** — receives `initialData` and `students` props from the server; renders a 4-tab layout (Payment · Review · Recommendation · First Approach). The Payment tab contains `PaymentGenerator` followed by the payment templates; the other tabs contain their respective templates. `TEMPLATE_META` is imported from `src/shared/lib/templates.ts` (shared with the agent tools) — a `Record<string, { title, description }>`, look up by id directly. Save state per card cycles through `idle → saving → saved/error`.
- **`features/templates/components/PaymentGenerator`** — client component rendered inside `TemplatesList`'s Payment tab; calculates session dates and fee from the student's `class_schedule` via `/api/generate-payment`

## Brand theming conventions

- **Primary color token:** `globals.css` sets `--primary: var(--color-navy)` — this brands all shadcn default `<Button>` instances navy without touching individual components. Do not revert this.
- **Navbars** (`AppNav`, student portal layout): `bg-navy border-b border-slate-800`; brand mark `</>` always `text-accentGold font-bold`; nav text `text-slate-100`; active tab `bg-white/20 text-white`; inactive tab `text-white/80`.
- **Page headings:** all `<h1>` on admin and portal pages use `text-navy`.
- **Tabs** (`ui/tabs.tsx`): `TabsList` uses `bg-navy/8`; active `TabsTrigger` is `bg-navy text-white`; inactive is `text-navy/50 hover:text-navy`. Always include `data-active:hover:text-white` to prevent hover from overriding active tab text.
- **Card titles** (`ui/card.tsx`): `CardTitle` includes `text-navy`.
- **External links** (Meet, Drive): always use `ExternalLink` from `shared/components/student-fields` — renders as gold coloured link with `hover:underline`.
- **Icons:** use `@heroicons/react/24/outline` SVGs throughout; do not use emoji as UI icons.
- **Mode badges on StudentCard:** `'My Python Syllabus'` → `bg-navy/6 text-navy`; `'Other Syllabus'` → `bg-accentGold/15 text-accentGold`.
- **Custom brand colors** (`navy`, `navyLight`, `accentGold`, `softBg`, `cardBg`) are declared in `globals.css` via `@theme {}` (Tailwind v4).

## Patterns

- Pages that need auth data are Server Components fetching via the server Supabase client; interactive state lives in client components passed data as props.
- The students list page groups students by weekday using `flatMap` over `class_schedule` — a student with multiple slots appears under each day.
- The shadcn/ui Select in this project uses Base UI (`@base-ui/react/select`), not Radix. `SelectValue` renders the raw value string — use a manual `<span>` inside `SelectTrigger` to show the display label.
- Times are stored as `"HH:MM"` strings in Supabase but displayed in 12-hour format. Use `formatTime` from `src/lib/utils.ts` for all display. Do **not** apply it to `ClassScheduleEditor` inputs or `PaymentGenerator` (those need raw `HH:MM`).
- `DAYS`, `TIME_SLOTS`, `timeToMins`, `DAY_INDEX`, `MONTH_NAMES`, `getWeekdayDates`, `formatFee`, `ordinal`, `oxfordList`, and `groupSlotsByDay` are exported from `src/lib/utils.ts` — import them from there rather than redefining locally. `formatFee` rounds to 2 d.p. and strips trailing `.00`. Never redeclare any of these in route files or components.
- `useClipboard()` hook lives in `src/hooks/useClipboard.ts` — returns `{ copied, copy }`. Use it anywhere a copy-to-clipboard button is needed; it handles the `navigator.clipboard` promise and the reset timer internally.
