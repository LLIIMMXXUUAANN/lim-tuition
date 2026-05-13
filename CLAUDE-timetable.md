## Timetable (`src/app/admin/(app)/timetable/page.tsx`)

Server Component that fetches active students' `name` and `class_schedule` plus `timetable_rules` and `timetable_buffer_mins` from the `settings` table in parallel, then passes them as `students`, `initialRules`, and `initialBufferMins` props to `TimetableSection`. Booked slot detection uses interval overlap (`cellStart < slotEnd && cellEnd > slotStart`) to correctly catch classes that start mid-slot. The `bookedSet` is pre-computed once via `useMemo` as a `Set<string>` of `"Day|HH:MM"` keys for O(1) lookup during drag and PNG export.

**`timetable/TimetableSection`** — client component on the Timetable page; renders a 2-tab layout (Weekly Schedule · Slot Availability). The Weekly Schedule tab shows a live `WeeklyScheduleView` HTML grid (navy header, auto-cropped to active hours, class blocks in `NAVY`) plus a **Download Schedule** button. The Slot Availability tab has `keepMounted` so grid state and student availability text survive tab switches. The AI panel has two textareas (scheduling rules pre-loaded from DB, student availability blank), a Save Rules button, a buffer-mins number input with its own Save button, and a **Generate Slots** button. Booked slots are auto-marked red and non-editable. Free slots cycle: unavailable → preferred → normal → unavailable. Grid state is ephemeral; rules and buffer are persisted to the `settings` table.

**UI layout:** Two tabs inside a `<Tabs defaultValue="schedule">` wrapper:
1. **Weekly Schedule tab** — header row + **Download Schedule** button, then `WeeklyScheduleView`: an HTML grid (72px label column + 7 equal day columns, `overflow-hidden rounded-lg`) with a navy header row, alternating row stripes via `repeating-linear-gradient`, and absolutely-positioned navy class blocks showing student name + compact time. Active hour window auto-crops to earliest class − 30 min / latest class + 30 min (same logic as the PNG export). Shared helpers: `computeScheduleWindow()`, `SCHEDULE_CELL_H = 28`, `GRID_COLS = '72px repeat(7, 1fr)'`.
2. **Slot Availability tab** (`keepMounted`) — AI panel (textareas + save controls + Generate button) → divider → legend + **Download Available Slots** button → interactive grid → hint text, all inside a `border rounded-lg p-6` card

**AI slot generator (`src/app/api/timetable/generate-slots/route.ts`):**

- Receives `{ rules, studentAvailability?, bookedSlots, bufferMins }`.
- Buffer zones are computed **in code** via `computeBufferSlots()` (deterministic time arithmetic — not delegated to the LLM). A slot is buffered if the gap between it and any booked class is `< bufferMins`. The booked-cell set (which 30-min TIME_SLOTS overlap with a booked class) is precomputed via `buildBookedCellSet()` and passed to `buildPrompt` — not recomputed inside it.
- Classifiable slots (non-booked, non-buffered) are enumerated and sent to Gemini 2.5 Flash as a prompt. Booked and buffer slots are never sent for classification.
- Gemini classifies each slot as `"preferred"` | `"normal"` | `"unavailable"` using structured output (`responseMimeType: 'application/json'` + `responseSchema`). Response validated with Zod; a post-processing safety net forces any buffer slot that sneaks through to `unavailable`.
- Prompt rule: student availability describes only times they **can** attend — silence does not imply unavailability. Unmentioned times → `normal`, not `unavailable`.
- Prompt rule: unavailable-time end boundaries are **exclusive** — `"08:00 to 10:00 unavailable"` blocks 08:00, 08:30, 09:00, 09:30 but NOT 10:00. The LLM is explicitly told never to apply any margin around unavailability boundaries (only buffer zones around booked student classes apply, and those are computed in code before the prompt is built).
- `src/lib/gemini.ts` — Gemini client factory (`getGeminiModel()`), Zod schemas (`SlotSchema`, `GenerateSlotsResponseSchema`), and `GEMINI_RESPONSE_SCHEMA` for the Gemini `responseSchema` field. Required env var: `GEMINI_API_KEY`.

**Timetable API routes:**
- `src/app/api/timetable/rules/route.ts` — GET/POST `timetable_rules` in `settings` table (tutor-only)
- `src/app/api/timetable/buffer-mins/route.ts` — GET/POST `timetable_buffer_mins` in `settings` table; validated 0–60 (tutor-only)
- `src/app/api/timetable/generate-slots/route.ts` — POST: computes buffer zones, calls Gemini, returns `{ slots }` (tutor-only)

**Two PNG exports in `TimetableSection`:**

- **Download Available Slots** — exports the AI-generated or drag-painted availability grid (preferred/normal/unavailable cells + legend) as `slot_availability.png`. Shows the full 8 AM–10 PM range.
- **Download Schedule** — exports a clean shareable weekly calendar image (`weekly_schedule.png`) showing all active students' class blocks. Auto-crops to the active hour window via `computeScheduleWindow()`. Each student block shows name + compact time (`10:30 – 11:30`). All blocks use the module-level `NAVY = '#0A1A2F'` constant, matching the HTML grid. Canvas is rendered at 2× scale for retina display.

Cell keys use the module-level `cellKey(day, ts)` helper — use this everywhere instead of inlining the template. `computeScheduleWindow(students)` is shared by `drawSchedule` and `WeeklyScheduleView`.
