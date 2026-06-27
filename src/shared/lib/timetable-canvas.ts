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
  { color: '#4ade80', label: 'Preferred available', border: undefined as string | undefined },
  { color: '#fde047', label: 'Normal available', border: undefined as string | undefined },
  { color: '#f1f5f9', label: 'Unavailable', border: '#cbd5e1' as string | undefined },
]

export type SlotType = 'preferred' | 'normal'

export function cellKey(day: string, ts: string): string {
  return `${day}|${ts}`
}

export interface ScheduleStudent {
  name: string
  classSchedule: { day: string; start: string; end: string }[]
}

export function computeScheduleWindow(students: ScheduleStudent[]): {
  startMin: number
  endMin: number
  activeSlots: string[]
} {
  let minMin = 22 * 60, maxMin = 8 * 60
  for (const s of students)
    for (const slot of s.classSchedule) {
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

export function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a')
  link.download = filename
  link.href = canvas.toDataURL('image/png')
  link.click()
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
    for (const slot of student.classSchedule) {
      const dayIdx = DAYS.indexOf(slot.day as (typeof DAYS)[number])
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
