'use client'

import { useRef, useEffect } from 'react'
import type { AvailabilitySlot, ClassSlot, WeekDay } from '@/lib/types'

const DAYS: WeekDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TIME_SLOTS: string[] = []
for (let h = 8; h < 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

const LABEL_W = 52
const CELL_W = 80
const HEADER_H = 28
const CELL_H = 20
const CANVAS_W = LABEL_W + CELL_W * 7
const CANVAS_H = HEADER_H + CELL_H * TIME_SLOTS.length

const COLORS = {
  booked:      '#fca5a5',
  preferred:   '#86efac',
  normal:      '#fde68a',
  unavailable: '#f8fafc',
  border:      '#e2e8f0',
  headerBg:    '#f1f5f9',
  text:        '#334155',
  timeLabel:   '#94a3b8',
}

function isBooked(
  day: WeekDay,
  timeSlot: string,
  students: { class_schedule: ClassSlot[] }[],
): boolean {
  for (const s of students) {
    for (const slot of s.class_schedule) {
      if (slot.day === day && timeSlot >= slot.start && timeSlot < slot.end) return true
    }
  }
  return false
}

function drawTimetable(
  ctx: CanvasRenderingContext2D,
  availability: AvailabilitySlot[],
  students: { name: string; class_schedule: ClassSlot[] }[],
) {
  const availMap = new Map<string, 'preferred' | 'normal'>()
  for (const s of availability) availMap.set(`${s.day}|${s.time_slot}`, s.slot_type)

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(0, 0, CANVAS_W, HEADER_H)

  ctx.fillStyle = COLORS.text
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  DAY_SHORT.forEach((day, i) => {
    ctx.fillText(day, LABEL_W + i * CELL_W + CELL_W / 2, HEADER_H / 2)
  })

  TIME_SLOTS.forEach((ts, row) => {
    const y = HEADER_H + row * CELL_H

    if (ts.endsWith(':00')) {
      ctx.fillStyle = COLORS.timeLabel
      ctx.font = '10px system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(ts, LABEL_W - 4, y + CELL_H / 2)
    }

    DAYS.forEach((day, col) => {
      const x = LABEL_W + col * CELL_W

      let fill = COLORS.unavailable
      if (isBooked(day, ts, students)) {
        fill = COLORS.booked
      } else {
        const atype = availMap.get(`${day}|${ts}`)
        if (atype === 'preferred') fill = COLORS.preferred
        else if (atype === 'normal') fill = COLORS.normal
      }

      ctx.fillStyle = fill
      ctx.fillRect(x, y, CELL_W, CELL_H)

      ctx.strokeStyle = COLORS.border
      ctx.lineWidth = 0.5
      ctx.strokeRect(x, y, CELL_W, CELL_H)
    })
  })
}

interface Props {
  availability: AvailabilitySlot[]
  students: { name: string; class_schedule: ClassSlot[] }[]
}

export default function TimetableCanvas({ availability, students }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawTimetable(ctx, availability, students)
  }, [availability, students])

  function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'timetable.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-medium text-sm">Preview</h3>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#fca5a5' }} /> Booked
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#86efac' }} /> Preferred
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#fde68a' }} /> Normal
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-slate-50 border border-slate-200" /> Unavailable
          </span>
        </div>
      </div>
      <div className="overflow-x-auto border rounded-md">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block"
        />
      </div>
      <button
        onClick={handleDownload}
        className="px-4 py-1.5 text-sm bg-navy text-white rounded-md hover:bg-navy/90 transition-colors"
      >
        Download PNG
      </button>
    </div>
  )
}
