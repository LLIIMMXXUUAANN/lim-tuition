## Component structure

```
src/
  features/
    agent/
      components/ → AgentChat (chat UI, localStorage persistence, tool step display, edit latest user message)
    students/
      components/ → StudentCard, StudentDetail, StudentForm, ClassScheduleEditor, SyncAllButton
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
- **`features/students/components/StudentForm`** — on Save, calls `/api/students/{id}` PUT (update) or `/api/students` POST (create). The backend handles Google Calendar sync automatically when `class_schedule` changes and the student already has `calendar_event_ids` (nuke-and-repave + Drive Meet doc rewrite). If the response contains `googleWarning`, the form stays open displaying the amber warning — they close via ← Cancel. "Remove Student" opens a confirmation dialog that calls `/api/students/{id}` DELETE; the backend trashes the Drive folder and deletes Calendar events. Delete response contains `driveError` / `calendarError` fields; Google cleanup failure shows an in-dialog amber warning but doesn't block the DB deletion. Meet and Drive links are shown as read-only `ExternalLink` displays in the form if set (not editable here — set via the Sync All button or the agent's `sync_all_students` tool).
- **`features/students/components/SyncAllButton`** — banner at the bottom of the students list; one click syncs all active students' Google Calendar events and Drive Meet docs to match the DB schedule via `POST /api/google/sync-all`. Results show per-student status (✓ synced / – skipped / ✗ error). If `invalid_grant` is detected, shows a reconnect link. All sync logic (Calendar search, nuke-and-repave, Meet link recovery) runs in the backend — see `tuition-api/CLAUDE.md`.
- **`features/templates/components/TemplatesList`** — receives `initialData` and `students` props from the server; renders a 4-tab layout (Payment · Review · Recommendation · First Approach). The Payment tab contains `PaymentGenerator` followed by the payment templates; the other tabs contain their respective templates. `TEMPLATE_META` is imported from `src/shared/lib/templates.ts` — a `Record<string, { title, description }>`, look up by id directly. Template saves call `PUT /api/templates/{id}` via the catch-all proxy. Save state per card cycles through `idle → saving → saved/error`.
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

- **Data fetching:** Server Components fetch from the backend via `fetchFastAPI` (`src/lib/fastapi.ts`) and pass data as props to client components. Client components call the backend via `fetch('/api/...')` which goes through the catch-all proxy.
- The students list page groups students by weekday using `flatMap` over `class_schedule` — a student with multiple slots appears under each day.
- The shadcn/ui Select in this project uses Base UI (`@base-ui/react/select`), not Radix. `SelectValue` renders the raw value string — use a manual `<span>` inside `SelectTrigger` to show the display label.
- Times are stored as `"HH:MM"` strings in Supabase but displayed in 12-hour format. Use `formatTime` from `src/lib/utils.ts` for all display. Do **not** apply it to `ClassScheduleEditor` inputs or `PaymentGenerator` (those need raw `HH:MM`).
- `DAYS`, `TIME_SLOTS`, `timeToMins` are exported from `src/lib/utils.ts` — import them from there rather than redefining locally. Never redeclare any of these in route files or components.
- `useClipboard()` hook lives in `src/hooks/useClipboard.ts` — returns `{ copied, copy }`. Use it anywhere a copy-to-clipboard button is needed; it handles the `navigator.clipboard` promise and the reset timer internally.
- Shared TypeScript types (`src/lib/types.ts`): `Student`, `StudentInsert`, `StudentUpdate`, `StudentStatus`, `ClassSlot`, `StudentMode`. Import from here — never redefine locally.
