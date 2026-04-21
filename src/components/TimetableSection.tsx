'use client'

import React, { useState, useRef, useEffect } from 'react'
import type { ClassSlot, WeekDay } from '@/lib/types'

type SlotType = 'preferred' | 'normal'

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

const DRAW_COLORS = {
  booked:      '#fca5a5',
  preferred:   '#86efac',
  normal:      '#fde68a',
  unavailable: '#f8fafc',
  border:      '#e2e8f0',
  headerBg:    '#f1f5f9',
  text:        '#334155',
  timeLabel:   '#94a3b8',
}

const CELL_CLASSES: Record<string, string> = {
  booked:    'bg-red-200 cursor-default',
  preferred: 'bg-green-300 hover:bg-green-400 cursor-pointer',
  normal:    'bg-yellow-200 hover:bg-yellow-300 cursor-pointer',
  empty:     'bg-slate-100 hover:bg-slate-200 cursor-pointer',
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function checkBooked(day: WeekDay, ts: string, students: { class_schedule: ClassSlot[] }[]) {
  const tsEnd = addMinutes(ts, 30)
  for (const s of students)
    for (const slot of s.class_schedule)
      if (slot.day === day && ts < slot.end && tsEnd > slot.start) return true
  return false
}

function cycleType(current: SlotType | undefined): SlotType | null {
  if (!current) return 'preferred'
  if (current === 'preferred') return 'normal'
  return null
}

function drawAndDownload(grid: Map<string, SlotType>, students: { class_schedule: ClassSlot[] }[]) {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = DRAW_COLORS.headerBg
  ctx.fillRect(0, 0, CANVAS_W, HEADER_H)

  ctx.fillStyle = DRAW_COLORS.text
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  DAY_SHORT.forEach((d, i) => {
    ctx.fillText(d, LABEL_W + i * CELL_W + CELL_W / 2, HEADER_H / 2)
  })

  TIME_SLOTS.forEach((ts, row) => {
    const y = HEADER_H + row * CELL_H
    if (ts.endsWith(':00')) {
      ctx.fillStyle = DRAW_COLORS.timeLabel
      ctx.font = '10px system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(ts, LABEL_W - 4, y + CELL_H / 2)
    }
    DAYS.forEach((day, col) => {
      const x = LABEL_W + col * CELL_W
      let fill = DRAW_COLORS.unavailable
      if (checkBooked(day, ts, students)) {
        fill = DRAW_COLORS.unavailable
      } else {
        const t = grid.get(`${day}|${ts}`)
        if (t === 'preferred') fill = DRAW_COLORS.preferred
        else if (t === 'normal') fill = DRAW_COLORS.normal
      }
      ctx.fillStyle = fill
      ctx.fillRect(x, y, CELL_W, CELL_H)
      ctx.strokeStyle = DRAW_COLORS.border
      ctx.lineWidth = 0.5
      ctx.strokeRect(x, y, CELL_W, CELL_H)
    })
  })

  const link = document.createElement('a')
  link.download = 'timetable.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
}

interface Props {
  students: { name: string; class_schedule: ClassSlot[] }[]
}

export default function TimetableSection({ students }: Props) {
  const [grid, setGrid] = useState<Map<string, SlotType>>(new Map())
  const isDragging = useRef(false)
  const paintType = useRef<SlotType | null>(null)

  useEffect(() => {
    const stop = () => { isDragging.current = false }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  function applyPaint(day: WeekDay, ts: string, paint: SlotType | null) {
    setGrid(prev => {
      const m = new Map(prev)
      if (paint === null) m.delete(`${day}|${ts}`)
      else m.set(`${day}|${ts}`, paint)
      return m
    })
  }

  function handleMouseDown(e: React.MouseEvent, day: WeekDay, ts: string) {
    if (checkBooked(day, ts, students)) return
    e.preventDefault() // prevent text selection while dragging
    const paint = cycleType(grid.get(`${day}|${ts}`))
    paintType.current = paint
    isDragging.current = true
    applyPaint(day, ts, paint)
  }

  function handleMouseEnter(day: WeekDay, ts: string) {
    if (!isDragging.current || checkBooked(day, ts, students)) return
    applyPaint(day, ts, paintType.current)
  }

  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-red-200 rounded-sm" /> Booked</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-green-300 rounded-sm" /> Preferred</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-yellow-200 rounded-sm" /> Normal</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-slate-100 border border-slate-200 rounded-sm" /> Unavailable</span>
        </div>
        <button
          onClick={() => drawAndDownload(grid, students)}
          className="px-4 py-1.5 text-sm bg-navy text-white rounded-md hover:bg-navy/90 transition-colors"
        >
          Download PNG
        </button>
      </div>
      <div className="overflow-x-auto select-none">
        <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 70px)', gap: 1 }}>
          <div />
          {DAY_SHORT.map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-600 pb-1">{d}</div>
          ))}
          {TIME_SLOTS.map(ts => (
            <React.Fragment key={ts}>
              <div className="text-right pr-2 text-xs text-slate-400 leading-5">
                {ts.endsWith(':00') ? ts : ''}
              </div>
              {DAYS.map(day => {
                const booked = checkBooked(day, ts, students)
                const cellKey = booked ? 'booked' : (grid.get(`${day}|${ts}`) ?? 'empty')
                return (
                  <div
                    key={`${day}-${ts}`}
                    onMouseDown={e => handleMouseDown(e, day, ts)}
                    onMouseEnter={() => handleMouseEnter(day, ts)}
                    className={`h-5 rounded-sm transition-colors ${CELL_CLASSES[cellKey]}`}
                  />
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400">Click or drag to paint: unavailable → preferred → normal → unavailable</p>
    </div>
  )
}
