# Timetable Agent Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 timetable tools to the existing AI agent — get settings, update rules, update buffer, generate slot availability (with inline download button), and download the weekly schedule image.

**Architecture:** Extract shared slot-generation logic and canvas drawing code into two new lib files (`timetable-slots.ts`, `timetable-canvas.ts`). Two new API routes generate PNGs server-side using `@napi-rs/canvas` (prebuilt binaries — no native compilation). The agent chat route emits two new SSE event types (`download_schedule`, `slots_ready`) that AgentChat renders as inline download buttons on the message bubble.

**Tech Stack:** Next.js App Router · Supabase · Gemini 2.5 Flash · `@napi-rs/canvas` · Server-Sent Events

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/lib/timetable-slots.ts` | Shared slot-generation logic (buffer calc, prompt, Gemini call) |
| Create | `src/lib/timetable-canvas.ts` | Shared canvas drawing constants + `drawSlotsToCtx` + `drawScheduleToCtx` |
| Create | `src/app/api/timetable/schedule-image/route.ts` | GET → fetch students → PNG via node-canvas |
| Create | `src/app/api/timetable/slots-image/route.ts` | POST `{slots}` → fetch booked set → PNG via node-canvas |
| Modify | `src/components/timetable/TimetableSection.tsx` | Use shared drawing functions; remove inlined constants |
| Modify | `src/app/api/timetable/generate-slots/route.ts` | Import from `timetable-slots.ts` |
| Modify | `src/lib/agent/tools.ts` | Add 5 timetable tool functions |
| Modify | `src/lib/agent/schema.ts` | Add 5 tool declarations + 2 system instruction rules |
| Modify | `src/app/api/agent/chat/route.ts` | Wire new tools; emit `download_schedule`/`slots_ready` SSE events |
| Modify | `src/components/agent/AgentChat.tsx` | Handle new SSE events; render inline download buttons |

---

## Task 1: Create `src/lib/timetable-slots.ts`

Extract the slot-generation logic from `generate-slots/route.ts` into a shared module so both the route and the new agent tool can call it.

**Files:**
- Create: `src/lib/timetable-slots.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/timetable-slots.ts
import { timeToMins, TIME_SLOTS, DAYS } from '@/lib/utils'
import { getGeminiModel, GenerateSlotsResponseSchema } from '@/lib/gemini'

export interface BookedSlot { day: string; start: string; end: string }
export type SlotState = 'preferred' | 'normal' | 'unavailable'
export interface ClassifiedSlot { day: string; time: string; state: SlotState }

export function computeBufferSlots(bookedSlots: BookedSlot[], bufferMins: number): Set<string> {
  const blocked = new Set<string>()
  for (const slot of bookedSlots) {
    const classStart = timeToMins(slot.start)
    const classEnd = timeToMins(slot.end)
    for (const ts of TIME_SLOTS) {
      const slotStart = timeToMins(ts)
      const slotEnd = slotStart + 30
      const gapBefore = classStart - slotEnd
      const gapAfter = slotStart - classEnd
      if ((gapBefore >= 0 && gapBefore < bufferMins) || (gapAfter >= 0 && gapAfter < bufferMins)) {
        blocked.add(`${slot.day}|${ts}`)
      }
    }
  }
  return blocked
}

export function buildBookedCellSet(bookedSlots: BookedSlot[]): Set<string> {
  return new Set(
    bookedSlots.flatMap(slot =>
      TIME_SLOTS.filter(ts => {
        const slotStart = timeToMins(ts)
        const slotEnd = slotStart + 30
        return slotStart < timeToMins(slot.end) && slotEnd > timeToMins(slot.start)
      }).map(ts => `${slot.day}|${ts}`)
    )
  )
}

export function buildSlotPrompt(
  rules: string,
  studentAvailability: string,
  bookedSlots: BookedSlot[],
  bufferSlots: Set<string>,
  bookedCellSet: Set<string>,
): string {
  const bookedLines = bookedSlots.length
    ? bookedSlots.map(s => `  ${s.day} ${s.start}–${s.end}`).join('\n')
    : '  (none)'

  const classifiableSlots = DAYS.flatMap(day =>
    TIME_SLOTS
      .filter(ts => !bookedCellSet.has(`${day}|${ts}`) && !bufferSlots.has(`${day}|${ts}`))
      .map(ts => `${day} ${ts}`)
  ).join(', ')

  return `You are a scheduling assistant for a private tutor. Classify every listed slot as "preferred", "normal", or "unavailable".

TUTOR'S SCHEDULING RULES:
${rules}

STUDENT'S AVAILABILITY:
${studentAvailability}

CURRENTLY BOOKED SLOTS (already taken — do not include in response):
${bookedLines}

SLOTS TO CLASSIFY (return exactly these, no others — buffer zones are already excluded):
${classifiableSlots}

INSTRUCTIONS:
- Classify every slot in the list above as "preferred", "normal", or "unavailable".
- "preferred" — tutor prefers this day AND the student EXPLICITLY mentioned they are available at that time
- "normal" — tutor day is normal (Wed/Sat/Sun), OR student did not mention this time, OR no student availability was provided
- "unavailable" — blocked by tutor rules (restricted hours, day limits) OR student EXPLICITLY said they cannot attend
- Time-range boundaries are EXCLUSIVE at the end: "08:00 to 10:00 unavailable" blocks the 08:00, 08:30, 09:00, and 09:30 slots but NOT 10:00 — the 10:00 slot starts after the block ends and is fully available. Never apply any extra margin around unavailability boundaries.

CRITICAL — how to interpret student availability:
- Student availability describes only times they CAN attend. They do NOT list times they cannot.
- Example: "free Thursday 12pm–6pm" confirms Thu 12:00–18:00 as available. Thu before 12pm or after 6pm is UNCLEAR, not unavailable → mark normal (subject to tutor blocked times).
- Never infer unavailability from silence. Only mark "unavailable" if tutor rules block it.`
}

export async function runSlotGeneration(
  rules: string,
  studentAvailability: string,
  bookedSlots: BookedSlot[],
  bufferMins: number,
): Promise<ClassifiedSlot[]> {
  const bufferSlots = computeBufferSlots(bookedSlots, bufferMins)
  const bookedCellSet = buildBookedCellSet(bookedSlots)
  const prompt = buildSlotPrompt(
    rules,
    studentAvailability || 'No student availability provided — classify slots based on tutor rules only.',
    bookedSlots,
    bufferSlots,
    bookedCellSet,
  )

  const model = getGeminiModel()
  const result = await model.generateContent(prompt)
  const raw = JSON.parse(result.response.text())
  const parsed = GenerateSlotsResponseSchema.parse(raw)

  return parsed.slots.map(s =>
    bufferSlots.has(`${s.day}|${s.time}`) ? { ...s, state: 'unavailable' as const } : s
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/timetable-slots.ts
git commit -m "feat(timetable): extract slot generation logic to shared lib"
```

---

## Task 2: Update `generate-slots/route.ts` to import from shared lib

Replace the inlined functions with imports from `timetable-slots.ts`.

**Files:**
- Modify: `src/app/api/timetable/generate-slots/route.ts`

- [ ] **Step 1: Replace the file content**

```typescript
// src/app/api/timetable/generate-slots/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/lib/supabase/server'
import { runSlotGeneration, computeBufferSlots, buildBookedCellSet, type BookedSlot } from '@/lib/timetable-slots'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as {
    rules?: string
    studentAvailability?: string
    bookedSlots?: BookedSlot[]
    bufferMins?: number
  }

  if (!body.rules?.trim()) {
    return NextResponse.json({ error: 'rules is required' }, { status: 400 })
  }

  const bookedSlots = body.bookedSlots ?? []
  const bufferMins = typeof body.bufferMins === 'number' ? body.bufferMins : 15

  try {
    const slots = await runSlotGeneration(
      body.rules.trim(),
      body.studentAvailability?.trim() ?? '',
      bookedSlots,
      bufferMins,
    )
    return NextResponse.json({ slots })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gemini API error'
    console.error('[generate-slots]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Run build to confirm no regressions**

```bash
npm run build
```

Expected: zero TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/timetable/generate-slots/route.ts
git commit -m "refactor(timetable): import slot generation from shared lib"
```

---

## Task 3: Create `src/lib/timetable-canvas.ts`

Extract canvas drawing constants and functions from `TimetableSection.tsx` into a shared module usable by both the browser component and server-side Node.js routes.

**Files:**
- Create: `src/lib/timetable-canvas.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/timetable-canvas.ts
// Shared canvas drawing logic — compatible with both browser Canvas2D and @napi-rs/canvas.
import { TIME_SLOTS, DAYS, timeToMins, formatTime } from '@/lib/utils'

export const NAVY = '#0A1A2F'
export const SCALE = 2

export const PNG_PAD      = 24
export const PNG_LABEL_W  = 56
export const PNG_CELL_W   = 86
export const PNG_CELL_H   = 22
export const PNG_TITLE_H  = 32
export const PNG_LEGEND_H = 30
export const PNG_GAP      = 12
export const PNG_HEADER_H = 30
export const SCHEDULE_CELL_H = 28

export const PNG_W = PNG_PAD + PNG_LABEL_W + PNG_CELL_W * 7 + PNG_PAD
export const PNG_H = PNG_PAD + PNG_TITLE_H + PNG_LEGEND_H + PNG_GAP + PNG_HEADER_H + PNG_CELL_H * TIME_SLOTS.length + PNG_PAD

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const LEGEND_ITEMS = [
  { color: '#4ade80', label: 'Preferred available', border: undefined },
  { color: '#fde047', label: 'Normal available', border: undefined },
  { color: '#f1f5f9', label: 'Unavailable', border: '#cbd5e1' },
]

export type SlotType = 'preferred' | 'normal'

export function cellKey(day: string, ts: string): string {
  return `${day}|${ts}`
}

export interface ScheduleStudent {
  name: string
  class_schedule: { day: string; start: string; end: string }[]
}

export function computeScheduleWindow(students: ScheduleStudent[]): {
  startMin: number
  endMin: number
  activeSlots: string[]
} {
  let minMin = 22 * 60, maxMin = 8 * 60
  for (const s of students)
    for (const slot of s.class_schedule) {
      minMin = Math.min(minMin, timeToMins(slot.start))
      maxMin = Math.max(maxMin, timeToMins(slot.end))
    }
  if (minMin >= maxMin) { minMin = 8 * 60; maxMin = 22 * 60 }
  const startMin = Math.max(8 * 60, Math.floor((minMin - 30) / 30) * 30)
  const endMin   = Math.min(22 * 60, Math.ceil((maxMin + 30) / 30) * 30)
  const activeSlots = TIME_SLOTS.filter(ts => {
    const m = timeToMins(ts)
    return m >= startMin && m < endMin
  })
  return { startMin, endMin, activeSlots }
}

export function scheduleCanvasHeight(students: ScheduleStudent[]): number {
  const { activeSlots } = computeScheduleWindow(students)
  return PNG_PAD + PNG_TITLE_H + PNG_GAP + PNG_HEADER_H + SCHEDULE_CELL_H * activeSlots.length + PNG_PAD
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtx = any

export function drawSlotsToCtx(
  ctx: AnyCtx,
  grid: Map<string, SlotType>,
  bookedSet: Set<string>,
) {
  const gridX   = PNG_PAD + PNG_LABEL_W
  const headerY = PNG_PAD + PNG_TITLE_H + PNG_LEGEND_H + PNG_GAP
  const gridY   = headerY + PNG_HEADER_H

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PNG_W, PNG_H)

  ctx.fillStyle = NAVY
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('Weekly Availability', gridX, PNG_PAD + PNG_TITLE_H / 2)

  const swatchSize   = 13
  const swatchRadius = 4
  const legendMidY   = PNG_PAD + PNG_TITLE_H + PNG_LEGEND_H / 2
  ctx.font = '11px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  let lx = gridX
  for (const item of LEGEND_ITEMS) {
    ctx.fillStyle = item.color
    ctx.beginPath()
    ctx.roundRect(lx, legendMidY - swatchSize / 2, swatchSize, swatchSize, swatchRadius)
    ctx.fill()
    if (item.border) {
      ctx.strokeStyle = item.border
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(lx, legendMidY - swatchSize / 2, swatchSize, swatchSize, swatchRadius)
      ctx.stroke()
    }
    ctx.fillStyle = '#475569'
    ctx.textAlign = 'left'
    ctx.fillText(item.label, lx + swatchSize + 5, legendMidY)
    lx += swatchSize + 5 + ctx.measureText(item.label).width + 22
  }

  ctx.fillStyle = NAVY
  ctx.beginPath()
  ctx.roundRect(gridX, headerY, PNG_CELL_W * 7, PNG_HEADER_H, [6, 6, 0, 0])
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  DAY_SHORT.forEach((d, i) => {
    ctx.fillText(d, gridX + i * PNG_CELL_W + PNG_CELL_W / 2, headerY + PNG_HEADER_H / 2)
  })

  const CELL_RADIUS = 6
  TIME_SLOTS.forEach((ts, row) => {
    const y = gridY + row * PNG_CELL_H
    if (row % 2 === 0) {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(PNG_PAD, y, PNG_LABEL_W + PNG_CELL_W * 7, PNG_CELL_H)
    }
    if (ts.endsWith(':00')) {
      ctx.fillStyle = '#64748b'
      ctx.font = '11px system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(ts, gridX - 6, y + PNG_CELL_H / 2)
    }
    DAYS.forEach((day, col) => {
      const x = gridX + col * PNG_CELL_W
      let fill = '#f1f5f9'
      if (!bookedSet.has(cellKey(day, ts))) {
        const t = grid.get(cellKey(day, ts))
        if (t === 'preferred') fill = '#4ade80'
        else if (t === 'normal') fill = '#fde047'
      }
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.roundRect(x + 1, y + 1, PNG_CELL_W - 2, PNG_CELL_H - 2, CELL_RADIUS)
      ctx.fill()
    })
  })
}

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`
}

export function drawScheduleToCtx(ctx: AnyCtx, students: ScheduleStudent[]) {
  const { startMin, activeSlots: ACTIVE_SLOTS } = computeScheduleWindow(students)
  const SCH_H = scheduleCanvasHeight(students)

  const gridX      = PNG_PAD + PNG_LABEL_W
  const headerY    = PNG_PAD + PNG_TITLE_H + PNG_GAP
  const gridY      = headerY + PNG_HEADER_H
  const gridW      = PNG_CELL_W * 7
  const gridBottom = gridY + SCHEDULE_CELL_H * ACTIVE_SLOTS.length

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PNG_W, SCH_H)

  ctx.fillStyle = NAVY
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('Weekly Schedule', gridX, PNG_PAD + PNG_TITLE_H / 2)

  ctx.fillStyle = NAVY
  ctx.beginPath()
  ctx.roundRect(gridX, headerY, gridW, PNG_HEADER_H, [6, 6, 0, 0])
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  DAY_SHORT.forEach((d, i) =>
    ctx.fillText(d, gridX + i * PNG_CELL_W + PNG_CELL_W / 2, headerY + PNG_HEADER_H / 2)
  )

  ACTIVE_SLOTS.forEach((ts, row) => {
    const y = gridY + row * SCHEDULE_CELL_H
    if (row % 2 === 0) {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(PNG_PAD, y, PNG_LABEL_W + gridW, SCHEDULE_CELL_H)
    }
    if (ts.endsWith(':00')) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '10px system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(formatTime(ts), gridX - 6, y + SCHEDULE_CELL_H / 2)
    }
  })

  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(gridX, gridY, gridW, SCHEDULE_CELL_H * ACTIVE_SLOTS.length, [0, 0, 6, 6])
  ctx.stroke()
  for (let i = 1; i < 7; i++) {
    const x = gridX + i * PNG_CELL_W
    ctx.beginPath()
    ctx.moveTo(x, gridY)
    ctx.lineTo(x, gridBottom)
    ctx.stroke()
  }

  for (const student of students) {
    for (const slot of student.class_schedule) {
      const dayIdx = DAYS.indexOf(slot.day)
      if (dayIdx === -1) continue
      const sMin = timeToMins(slot.start)
      const eMin = timeToMins(slot.end)
      const startOffset   = (sMin - startMin) / 30
      const durationSlots = (eMin - sMin) / 30
      if (startOffset < 0 || durationSlots <= 0) continue

      const x = gridX + dayIdx * PNG_CELL_W + 2
      const y = gridY + startOffset * SCHEDULE_CELL_H + 2
      const w = PNG_CELL_W - 4
      const h = Math.min(durationSlots * SCHEDULE_CELL_H - 4, gridBottom - y - 2)
      if (h <= 0) continue

      ctx.fillStyle = NAVY
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, 5)
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.clip()
      ctx.textAlign = 'center'

      if (durationSlots >= 2) {
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 11px system-ui, sans-serif'
        ctx.fillText(student.name, x + w / 2, y + h / 2 - 8)
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.font = '10px system-ui, sans-serif'
        ctx.fillText(`${fmt12(slot.start)} – ${fmt12(slot.end)}`, x + w / 2, y + h / 2 + 8)
      } else {
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 10px system-ui, sans-serif'
        ctx.textBaseline = 'middle'
        ctx.fillText(student.name, x + w / 2, y + h / 2)
      }
      ctx.restore()
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/timetable-canvas.ts
git commit -m "feat(timetable): add shared canvas drawing library"
```

---

## Task 4: Refactor `TimetableSection.tsx` to use shared canvas lib

Replace the inlined drawing logic and constants with imports from `timetable-canvas.ts`.

**Files:**
- Modify: `src/components/timetable/TimetableSection.tsx`

- [ ] **Step 1: Add import line at the top of TimetableSection.tsx** (after the existing utils import)

Old:
```typescript
import { formatTime, DAYS, TIME_SLOTS, timeToMins } from '@/lib/utils'
```

New:
```typescript
import { formatTime, DAYS, TIME_SLOTS, timeToMins } from '@/lib/utils'
import {
  NAVY, SCALE, PNG_PAD, PNG_LABEL_W, PNG_CELL_W, PNG_CELL_H, PNG_TITLE_H,
  PNG_LEGEND_H, PNG_GAP, PNG_HEADER_H, PNG_W, PNG_H, SCHEDULE_CELL_H,
  DAY_SHORT, LEGEND_ITEMS, SlotType as CanvasSlotType,
  cellKey as canvasCellKey, computeScheduleWindow, scheduleCanvasHeight,
  drawSlotsToCtx, drawScheduleToCtx,
} from '@/lib/timetable-canvas'
```

- [ ] **Step 2: Remove the constants and functions that are now imported**

Delete these from `TimetableSection.tsx` (they are now in `timetable-canvas.ts`):
- `const NAVY = '#0A1A2F'`
- `const SCALE = 2`
- All `const PNG_*` constants
- `const SCHEDULE_CELL_H = 28`
- `const DAY_SHORT = [...]`
- `const LEGEND_ITEMS = [...]`
- `function computeScheduleWindow(...)`
- `function fmt12(...)`

Keep the `TimetableSection`-local type aliases (`SlotType`, `CellKey`) — they differ slightly from the canvas lib's types.

- [ ] **Step 3: Replace `drawAndDownload` to use shared function**

Old:
```typescript
function drawAndDownload(grid: Map<string, SlotType>, bookedSet: Set<string>) {
  const canvas = document.createElement('canvas')
  canvas.width = PNG_W * SCALE
  canvas.height = PNG_H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(SCALE, SCALE)
  // ... ~80 lines of drawing code ...
  downloadCanvas(canvas, 'slot_availability.png')
}
```

New:
```typescript
function drawAndDownload(grid: Map<string, SlotType>, bookedSet: Set<string>) {
  const canvas = document.createElement('canvas')
  canvas.width = PNG_W * SCALE
  canvas.height = PNG_H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(SCALE, SCALE)
  drawSlotsToCtx(ctx, grid as Map<CanvasSlotType, CanvasSlotType>, bookedSet)
  downloadCanvas(canvas, 'slot_availability.png')
}
```

Wait — the grid Map type in TimetableSection is `Map<string, SlotType>` where `string` is the key (cell key like `"Monday|09:00"`). The value is `SlotType` (`'preferred' | 'normal'`). That matches the shared lib. No cast needed:

```typescript
function drawAndDownload(grid: Map<string, SlotType>, bookedSet: Set<string>) {
  const canvas = document.createElement('canvas')
  canvas.width = PNG_W * SCALE
  canvas.height = PNG_H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(SCALE, SCALE)
  drawSlotsToCtx(ctx, grid, bookedSet)
  downloadCanvas(canvas, 'slot_availability.png')
}
```

- [ ] **Step 4: Replace `drawSchedule` to use shared function**

Old:
```typescript
function drawSchedule(students: { name: string; class_schedule: ClassSlot[] }[]) {
  const { startMin, activeSlots: ACTIVE_SLOTS } = computeScheduleWindow(students)
  const SCH_H = PNG_PAD + PNG_TITLE_H + PNG_GAP + PNG_HEADER_H
              + SCHEDULE_CELL_H * ACTIVE_SLOTS.length
              + PNG_PAD
  const canvas = document.createElement('canvas')
  canvas.width  = PNG_W * SCALE
  canvas.height = SCH_H * SCALE
  // ... ~90 lines of drawing code ...
  downloadCanvas(canvas, 'weekly_schedule.png')
}
```

New:
```typescript
function drawSchedule(students: { name: string; class_schedule: ClassSlot[] }[]) {
  const sch_h = scheduleCanvasHeight(students)
  const canvas = document.createElement('canvas')
  canvas.width  = PNG_W * SCALE
  canvas.height = sch_h * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(SCALE, SCALE)
  drawScheduleToCtx(ctx, students)
  downloadCanvas(canvas, 'weekly_schedule.png')
}
```

- [ ] **Step 5: Replace `cellKey` usages**

`TimetableSection` has its own local `cellKey` function. Keep it — the function signature is identical so this is a zero-change refactor. (Or remove the local one and import `canvasCellKey` instead — either is fine.)

Actually: the import already aliases it as `canvasCellKey`. Keep the local `cellKey` to avoid touching many call sites.

- [ ] **Step 6: Replace `computeScheduleWindow` usage in `WeeklyScheduleView`**

`WeeklyScheduleView` calls `computeScheduleWindow`. Since it's now imported from the canvas lib, the import in Step 1 covers this — no code change needed in `WeeklyScheduleView` itself.

- [ ] **Step 7: Run build**

```bash
npm run build
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/timetable/TimetableSection.tsx
git commit -m "refactor(timetable): use shared canvas lib in TimetableSection"
```

---

## Task 5: Install `@napi-rs/canvas` and create `/api/timetable/schedule-image`

**Files:**
- Create: `src/app/api/timetable/schedule-image/route.ts`

- [ ] **Step 1: Install the package**

```bash
npm install @napi-rs/canvas
```

Expected: installs without errors (uses prebuilt binaries — no native compilation required).

- [ ] **Step 2: Create the route**

```typescript
// src/app/api/timetable/schedule-image/route.ts
import { createCanvas } from '@napi-rs/canvas'
import { requireTutor } from '@/lib/supabase/server'
import type { ClassSlot } from '@/lib/types'
import { PNG_W, SCALE, scheduleCanvasHeight, drawScheduleToCtx } from '@/lib/timetable-canvas'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const { data, error: dbErr } = await supabase
    .from('students')
    .select('name, class_schedule')
    .eq('status', 'Active')
    .order('name')

  if (dbErr) return new Response('DB error', { status: 500 })

  const students = (data ?? []).map(s => ({
    name: s.name as string,
    class_schedule: (s.class_schedule as ClassSlot[]) ?? [],
  }))

  const sch_h = scheduleCanvasHeight(students)
  const canvas = createCanvas(PNG_W * SCALE, sch_h * SCALE)
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  drawScheduleToCtx(ctx, students)

  const buffer = await canvas.encode('png')

  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename="weekly_schedule.png"',
      'Cache-Control': 'no-store',
    },
  })
}
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/timetable/schedule-image/route.ts package.json package-lock.json
git commit -m "feat(timetable): add schedule-image PNG endpoint"
```

---

## Task 6: Create `/api/timetable/slots-image`

**Files:**
- Create: `src/app/api/timetable/slots-image/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/timetable/slots-image/route.ts
import { NextRequest } from 'next/server'
import { createCanvas } from '@napi-rs/canvas'
import { requireTutor } from '@/lib/supabase/server'
import type { ClassSlot } from '@/lib/types'
import { PNG_W, PNG_H, SCALE, cellKey, drawSlotsToCtx, type SlotType } from '@/lib/timetable-canvas'
import { buildBookedCellSet, type ClassifiedSlot } from '@/lib/timetable-slots'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as { slots?: ClassifiedSlot[] }
  if (!Array.isArray(body.slots)) {
    return new Response('slots is required', { status: 400 })
  }

  // Fetch active students to compute booked cells
  const { data } = await supabase
    .from('students')
    .select('class_schedule')
    .eq('status', 'Active')

  const bookedSlots = (data ?? []).flatMap(s =>
    ((s.class_schedule as ClassSlot[]) ?? []).map(slot => ({
      day: slot.day,
      start: slot.start,
      end: slot.end,
    }))
  )
  const bookedSet = buildBookedCellSet(bookedSlots)

  // Build grid map from classified slots (preferred/normal only; unavailable = absent)
  const grid = new Map<string, SlotType>()
  for (const s of body.slots) {
    if (s.state === 'preferred' || s.state === 'normal') {
      grid.set(cellKey(s.day, s.time), s.state)
    }
  }

  const canvas = createCanvas(PNG_W * SCALE, PNG_H * SCALE)
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  drawSlotsToCtx(ctx, grid, bookedSet)

  const buffer = await canvas.encode('png')

  return new Response(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename="slot_availability.png"',
      'Cache-Control': 'no-store',
    },
  })
}
```

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/timetable/slots-image/route.ts
git commit -m "feat(timetable): add slots-image PNG endpoint"
```

---

## Task 7: Add timetable tool functions to `src/lib/agent/tools.ts`

**Files:**
- Modify: `src/lib/agent/tools.ts`

- [ ] **Step 1: Add import for shared slot generation**

At the top of `tools.ts`, add:

```typescript
import { runSlotGeneration, buildBookedCellSet, type ClassifiedSlot } from '@/lib/timetable-slots'
import type { ClassSlot } from '@/lib/types'
```

- [ ] **Step 2: Add `getTimetableSettings`**

Append to the bottom of `tools.ts`:

```typescript
export async function getTimetableSettings(supabase: Supabase) {
  const [rulesRow, bufferRow] = await Promise.all([
    supabase.from('settings').select('value').eq('key', 'timetable_rules').maybeSingle(),
    supabase.from('settings').select('value').eq('key', 'timetable_buffer_mins').maybeSingle(),
  ])
  return {
    rules: rulesRow.data?.value ?? '',
    bufferMins: bufferRow.data ? parseInt(bufferRow.data.value, 10) : 15,
  }
}
```

- [ ] **Step 3: Add `updateTimetableRules`**

```typescript
export async function updateTimetableRules(supabase: Supabase, rules: string) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'timetable_rules', value: rules }, { onConflict: 'key' })
  if (error) return { error: error.message }
  return { ok: true }
}
```

- [ ] **Step 4: Add `updateBufferMins`**

```typescript
export async function updateBufferMins(supabase: Supabase, bufferMins: number) {
  if (bufferMins < 0 || bufferMins > 60) return { error: 'bufferMins must be 0–60' }
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'timetable_buffer_mins', value: String(bufferMins) }, { onConflict: 'key' })
  if (error) return { error: error.message }
  return { ok: true }
}
```

- [ ] **Step 5: Add `generateSlotAvailability`**

```typescript
export async function generateSlotAvailability(
  supabase: Supabase,
  studentAvailability: string,
): Promise<{ slots: ClassifiedSlot[]; summary: string } | { error: string }> {
  const [rulesRow, bufferRow, studentsRow] = await Promise.all([
    supabase.from('settings').select('value').eq('key', 'timetable_rules').maybeSingle(),
    supabase.from('settings').select('value').eq('key', 'timetable_buffer_mins').maybeSingle(),
    supabase.from('students').select('class_schedule').eq('status', 'Active'),
  ])

  const rules = rulesRow.data?.value ?? ''
  if (!rules.trim()) return { error: 'No timetable rules configured. Use update_timetable_rules first.' }

  const bufferMins = bufferRow.data ? parseInt(bufferRow.data.value, 10) : 15

  const bookedSlots = (studentsRow.data ?? []).flatMap(s =>
    ((s.class_schedule as ClassSlot[]) ?? []).map(slot => ({
      day: slot.day,
      start: slot.start,
      end: slot.end,
    }))
  )

  try {
    const slots = await runSlotGeneration(rules, studentAvailability, bookedSlots, bufferMins)
    const preferred = slots.filter(s => s.state === 'preferred').length
    const normal    = slots.filter(s => s.state === 'normal').length
    const unavailable = slots.filter(s => s.state === 'unavailable').length
    const summary = `Generated ${slots.length} slots: ${preferred} preferred, ${normal} normal, ${unavailable} unavailable.`
    return { slots, summary }
  } catch (err) {
    return { error: errMsg(err, 'Slot generation failed') }
  }
}
```

- [ ] **Step 6: Add `downloadTimetableImage`**

This tool's only job is to signal readiness — the actual PNG is generated by the `/api/timetable/schedule-image` endpoint.

```typescript
export function downloadTimetableImage() {
  return { downloadReady: true }
}
```

- [ ] **Step 7: Run build**

```bash
npm run build
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/agent/tools.ts
git commit -m "feat(agent): add 5 timetable tool implementations"
```

---

## Task 8: Add tool declarations and system instruction rules to `schema.ts`

**Files:**
- Modify: `src/lib/agent/schema.ts`

- [ ] **Step 1: Add the 5 tool declarations inside the existing `functionDeclarations` array**

After the last declaration (`generate_payment_message`), add:

```typescript
      {
        name: 'get_timetable_settings',
        description:
          'Read the current timetable scheduling rules and buffer minutes from the database. Call this before update_timetable_rules or update_buffer_mins to show the user the current values.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'update_timetable_rules',
        description:
          'Save new scheduling rules text to the database. These rules guide the AI slot generator (preferred/normal/unavailable classification). Always show the user the new rules before calling.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            rules: {
              type: Type.STRING,
              description: 'Full scheduling rules text to save',
            },
          },
          required: ['rules'],
        },
      },
      {
        name: 'update_buffer_mins',
        description:
          'Save a new buffer duration (in minutes) to the database. Buffer zones block slots immediately before/after booked classes. Valid range: 0–60.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            buffer_mins: {
              type: Type.NUMBER,
              description: 'Buffer duration in minutes (0–60)',
            },
          },
          required: ['buffer_mins'],
        },
      },
      {
        name: 'generate_slot_availability',
        description:
          'Run the AI slot-availability generator. Reads current rules, buffer, and all active students\' schedules from the database, then classifies every free 30-minute slot as preferred, normal, or unavailable. Optionally accepts a description of a new student\'s availability to bias the classification. After the tool completes, a "Download PNG" button appears automatically in the chat.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            student_availability: {
              type: Type.STRING,
              description: 'Free-text description of when a prospective student can attend (optional). Example: "free Tuesday and Thursday after 4pm".',
            },
          },
        },
      },
      {
        name: 'download_timetable_image',
        description:
          'Download the weekly schedule as a PNG image showing all active students\' class blocks. After the tool completes, a "Download PNG" button appears automatically in the chat.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
```

- [ ] **Step 2: Add two rules to `SYSTEM_INSTRUCTION`**

Append to the end of the `SYSTEM_INSTRUCTION` string (before the closing backtick):

```
17. Timetable settings: use get_timetable_settings to read current rules and buffer before updating. When the user asks to update rules, show them the proposed new rules and confirm before calling update_timetable_rules. For update_buffer_mins, validate the value is 0–60 before calling.
18. After calling generate_slot_availability or download_timetable_image, tell the user a download button has appeared in the chat. Do NOT describe the slot counts or classification details unless the user asks — keep the reply brief (one sentence).`
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/schema.ts
git commit -m "feat(agent): add timetable tool declarations and system rules"
```

---

## Task 9: Wire timetable tools in `api/agent/chat/route.ts`

**Files:**
- Modify: `src/app/api/agent/chat/route.ts`

- [ ] **Step 1: Add imports for the 5 new tool functions**

In the import block from `@/lib/agent/tools`, add:

```typescript
import {
  errMsg,
  searchStudents, getStudent, listStudents,
  createStudent, updateStudent, deleteStudent,
  setupStudentGoogle, runSyncAll, managePortalAccess,
  getSchedule, getFeeSummary,
  listTemplates, getTemplate, generatePaymentMessage,
  getTimetableSettings, updateTimetableRules, updateBufferMins,
  generateSlotAvailability, downloadTimetableImage,
  type Supabase,
} from '@/lib/agent/tools'
```

- [ ] **Step 2: Add 5 cases to the `executeTool` switch**

After the `generate_payment_message` case:

```typescript
    case 'get_timetable_settings':
      return getTimetableSettings(supabase)
    case 'update_timetable_rules':
      return updateTimetableRules(supabase, args.rules as string)
    case 'update_buffer_mins':
      return updateBufferMins(supabase, args.buffer_mins as number)
    case 'generate_slot_availability':
      return generateSlotAvailability(supabase, (args.student_availability as string | undefined) ?? '')
    case 'download_timetable_image':
      return downloadTimetableImage()
```

- [ ] **Step 3: Emit download SSE events after tool execution**

In the loop that processes tool results (the `for (let i = 0; i < namedCalls.length; i++)` block), after pushing to `fnResponseParts` and before the closing brace, add:

```typescript
            // Emit download signals so AgentChat can render inline buttons
            if (fc.name === 'download_timetable_image') {
              emit({ type: 'download_schedule' })
            }
            if (fc.name === 'generate_slot_availability') {
              const r = result as { slots?: unknown[]; summary?: string } | { error?: string }
              if ('slots' in r && Array.isArray(r.slots)) {
                emit({ type: 'slots_ready', slots: r.slots })
              }
            }
```

The full block after the change looks like:

```typescript
          for (let i = 0; i < namedCalls.length; i++) {
            const fc = namedCalls[i]
            const result = toolResults[i]
            fnResponseParts.push({
              functionResponse: {
                name: fc.name!,
                ...(fc.id ? { id: fc.id } : {}),
                response: { result },
              },
            })
            if (fc.name === 'create_student' && typeof result === 'object' && result !== null && 'student' in result) {
              const created = (result as { student: { id: string } }).student
              lastMutationTool = { name: fc.name, args: fc.args as Record<string, unknown>, createdId: created.id }
            } else if (MUTATION_TOOLS.has(fc.name!)) {
              lastMutationTool = { name: fc.name!, args: fc.args as Record<string, unknown> }
            }
            if (fc.name === 'download_timetable_image') {
              emit({ type: 'download_schedule' })
            }
            if (fc.name === 'generate_slot_availability') {
              const r = result as { slots?: unknown[] } | { error?: string }
              if ('slots' in r && Array.isArray(r.slots)) {
                emit({ type: 'slots_ready', slots: r.slots })
              }
            }
          }
```

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent/chat/route.ts
git commit -m "feat(agent): wire timetable tools and emit download SSE events"
```

---

## Task 10: Update `AgentChat.tsx` to handle download events and render buttons

**Files:**
- Modify: `src/components/agent/AgentChat.tsx`

- [ ] **Step 1: Extend `ChatMessage` interface**

```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  steps?: string[]
  scheduleDownload?: boolean
  slotData?: { day: string; time: string; state: string }[]
}
```

- [ ] **Step 2: Add download helper function** (outside the component, below `loadStoredMessages`)

```typescript
async function downloadPng(url: string, filename: string, body?: object) {
  const res = await fetch(url, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined
  )
  if (!res.ok) return
  const blob = await res.blob()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
```

- [ ] **Step 3: Handle `download_schedule` and `slots_ready` SSE events in the `send()` function**

In the SSE event handler (`if (event.type === 'step') { ... } else if (event.type === 'chunk') { ... } else if (event.type === 'error') { ... }`), add two more `else if` branches:

```typescript
          } else if (event.type === 'download_schedule') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, scheduleDownload: true } : m
            ))
          } else if (event.type === 'slots_ready') {
            const evt = event as { type: string; slots?: { day: string; time: string; state: string }[] }
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, slotData: evt.slots ?? [] } : m
            ))
          }
```

The full event handler after the change:

```typescript
          const event = JSON.parse(json) as { type: string; content?: string; message?: string }
          if (event.type === 'step') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, steps: [...(m.steps ?? []), event.content!] } : m
            ))
          } else if (event.type === 'chunk') {
            received = true
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, content: (m.content ?? '') + event.content! } : m
            ))
          } else if (event.type === 'error') {
            received = true
            setMessages(prev => prev.map(m =>
              m.id === pendingId
                ? { ...m, content: `Something went wrong: ${event.message}` }
                : m
            ))
          } else if (event.type === 'download_schedule') {
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, scheduleDownload: true } : m
            ))
          } else if (event.type === 'slots_ready') {
            const evt = event as { type: string; slots?: { day: string; time: string; state: string }[] }
            setMessages(prev => prev.map(m =>
              m.id === pendingId ? { ...m, slotData: evt.slots ?? [] } : m
            ))
          }
```

- [ ] **Step 4: Render download buttons in the message bubble**

In the agent message rendering (inside the `msg.role !== 'user'` branch), add download buttons between the markdown content and the student links:

```tsx
                      {/* Download buttons */}
                      {(msg.scheduleDownload || msg.slotData) && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {msg.scheduleDownload && (
                            <button
                              onClick={() => void downloadPng('/api/timetable/schedule-image', 'weekly_schedule.png')}
                              className="text-xs font-medium text-navy border border-navy/30 rounded-lg px-3 py-1.5 hover:bg-navy hover:text-white transition-colors"
                            >
                              ↓ Download Schedule PNG
                            </button>
                          )}
                          {msg.slotData && (
                            <button
                              onClick={() => void downloadPng('/api/timetable/slots-image', 'slot_availability.png', { slots: msg.slotData })}
                              className="text-xs font-medium text-navy border border-navy/30 rounded-lg px-3 py-1.5 hover:bg-navy hover:text-white transition-colors"
                            >
                              ↓ Download Slot Availability PNG
                            </button>
                          )}
                        </div>
                      )}
```

Place it directly before the `{msgStudents.length > 0 && (` block.

- [ ] **Step 5: Run build**

```bash
npm run build
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/agent/AgentChat.tsx
git commit -m "feat(agent): render inline download buttons for timetable images"
```

---

## Task 11: Add example prompts and verify end-to-end

- [ ] **Step 1: Update the empty-state prompt examples in `AgentChat.tsx`**

Find the existing example prompts block:

```tsx
            <div className="text-sm space-y-1 mt-4">
              <p className="text-slate-500">"Create student LX, Other Syllabus, Monday 3–5pm, RM 60/hr"</p>
              <p className="text-slate-500">"Update John's fee to RM 80"</p>
              <p className="text-slate-500">"Delete student Wei Ming"</p>
              <p className="text-slate-500">"Search for students named Tan"</p>
            </div>
```

Add two timetable examples:

```tsx
            <div className="text-sm space-y-1 mt-4">
              <p className="text-slate-500">"Create student LX, Other Syllabus, Monday 3–5pm, RM 60/hr"</p>
              <p className="text-slate-500">"Update John's fee to RM 80"</p>
              <p className="text-slate-500">"Delete student Wei Ming"</p>
              <p className="text-slate-500">"Search for students named Tan"</p>
              <p className="text-slate-500">"Download the weekly schedule image"</p>
              <p className="text-slate-500">"Generate slot availability — student free Tuesday/Thursday after 4pm"</p>
            </div>
```

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Manual test — schedule download**

1. Open `http://localhost:3000/admin/agent`
2. Type: `"Download the weekly schedule image"`
3. Verify: agent calls `download_timetable_image` tool (shown in steps), reply says button appeared, "↓ Download Schedule PNG" button renders on the bubble
4. Click the button — verify `weekly_schedule.png` downloads and shows the correct grid

- [ ] **Step 4: Manual test — settings**

1. Type: `"Show me the current timetable settings"`
2. Verify: agent calls `get_timetable_settings`, displays rules and buffer value correctly

- [ ] **Step 5: Manual test — generate slot availability**

1. Type: `"Generate slot availability — student can do Tuesday or Thursday after 4pm"`
2. Verify: agent calls `generate_slot_availability` with `student_availability` arg, steps show tool call, brief reply, "↓ Download Slot Availability PNG" button appears
3. Click button — verify `slot_availability.png` downloads with correct grid (green preferred/yellow normal/grey unavailable)

- [ ] **Step 6: Final build check**

```bash
npm run build
```

Expected: zero errors, zero warnings about missing types.

- [ ] **Step 7: Commit**

```bash
git add src/components/agent/AgentChat.tsx
git commit -m "feat(agent): add timetable prompt examples in empty state"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| Get timetable settings (rules + buffer) | Task 7 (`getTimetableSettings`), Task 8 (declaration) |
| Update rules | Task 7 (`updateTimetableRules`), Task 8 (declaration) |
| Update buffer | Task 7 (`updateBufferMins`), Task 8 (declaration) |
| Generate slot availability | Task 7 (`generateSlotAvailability`), Task 8 (declaration) |
| Download schedule image (server-side PNG) | Task 5 (route), Task 7 (`downloadTimetableImage`), Task 9 (SSE) |
| Download slots image (server-side PNG) | Task 6 (route), Task 9 (SSE emit), Task 10 (button) |
| Download only after generate — enforced by UI | Task 10 (button only renders when `slotData` set) |
| Inline download buttons on message bubble | Task 10 |
| System instruction rules | Task 8 (rules 17–18) |
| Shared canvas lib (no duplication) | Tasks 3–4 |

**No placeholders detected.**

**Type consistency:** `ClassifiedSlot` defined in `timetable-slots.ts` and used consistently in `tools.ts`, `slots-image/route.ts`, and `AgentChat.tsx`. `SlotType` from `timetable-canvas.ts` used consistently in `TimetableSection.tsx` and `slots-image/route.ts`.
