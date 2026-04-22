'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import type { ClassSlot, WeekDay } from '@/lib/types'

type SlotType = 'preferred' | 'normal'
type CellKey = 'booked' | 'preferred' | 'normal' | 'empty'

const DAYS: WeekDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TIME_SLOTS: string[] = []
for (let h = 8; h < 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

// PNG layout constants
const PNG_PAD      = 24
const PNG_LABEL_W  = 56
const PNG_CELL_W   = 86
const PNG_CELL_H   = 22
const PNG_TITLE_H  = 32
const PNG_LEGEND_H = 30
const PNG_GAP      = 12
const PNG_HEADER_H = 30
const PNG_W = PNG_PAD + PNG_LABEL_W + PNG_CELL_W * 7 + PNG_PAD
const PNG_H = PNG_PAD + PNG_TITLE_H + PNG_LEGEND_H + PNG_GAP + PNG_HEADER_H + PNG_CELL_H * TIME_SLOTS.length + PNG_PAD

const CELL_CLASSES: Record<CellKey, string> = {
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

function buildBookedSet(students: { class_schedule: ClassSlot[] }[]): Set<string> {
  const s = new Set<string>()
  for (const student of students)
    for (const slot of student.class_schedule)
      for (const ts of TIME_SLOTS) {
        const tsEnd = addMinutes(ts, 30)
        if (slot.day === ts.slice(0, 0) || true) // always check
          if (ts < slot.end && tsEnd > slot.start)
            s.add(`${slot.day}|${ts}`)
      }
  return s
}

function cycleType(current: SlotType | undefined): SlotType | null {
  if (!current) return 'preferred'
  if (current === 'preferred') return 'normal'
  return null
}

function drawAndDownload(grid: Map<string, SlotType>, bookedSet: Set<string>) {
  const SCALE = 2
  const canvas = document.createElement('canvas')
  canvas.width = PNG_W * SCALE
  canvas.height = PNG_H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(SCALE, SCALE)

  const gridX   = PNG_PAD + PNG_LABEL_W
  const headerY = PNG_PAD + PNG_TITLE_H + PNG_LEGEND_H + PNG_GAP
  const gridY   = headerY + PNG_HEADER_H

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PNG_W, PNG_H)

  // Title
  ctx.fillStyle = '#0f2942'
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('Weekly Availability', gridX, PNG_PAD + PNG_TITLE_H / 2)

  // Legend row (top, below title)
  const LEGEND_ITEMS = [
    { color: '#4ade80', label: 'Preferred available' },
    { color: '#fde047', label: 'Available (normal)' },
    { color: '#f1f5f9', label: 'Unavailable', border: '#cbd5e1' },
  ]
  const swatchSize = 13
  const swatchRadius = 4
  const legendMidY = PNG_PAD + PNG_TITLE_H + PNG_LEGEND_H / 2
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

  // Day header bar (navy, rounded top corners)
  ctx.fillStyle = '#0f2942'
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

  // Grid cells
  const CELL_RADIUS = 6
  TIME_SLOTS.forEach((ts, row) => {
    const y = gridY + row * PNG_CELL_H

    // Alternating row tint
    if (row % 2 === 0) {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(PNG_PAD, y, PNG_LABEL_W + PNG_CELL_W * 7, PNG_CELL_H)
    }

    // Hour label
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
      if (!bookedSet.has(`${day}|${ts}`)) {
        const t = grid.get(`${day}|${ts}`)
        if (t === 'preferred') fill = '#4ade80'
        else if (t === 'normal') fill = '#fde047'
      }
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.roundRect(x + 1, y + 1, PNG_CELL_W - 2, PNG_CELL_H - 2, CELL_RADIUS)
      ctx.fill()
    })
  })

  const link = document.createElement('a')
  link.download = 'slot_availability.png'
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

  const bookedSet = useMemo(() => buildBookedSet(students), [students])

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
    if (bookedSet.has(`${day}|${ts}`)) return
    e.preventDefault()
    const paint = cycleType(grid.get(`${day}|${ts}`))
    paintType.current = paint
    isDragging.current = true
    applyPaint(day, ts, paint)
  }

  function handleMouseEnter(day: WeekDay, ts: string) {
    if (!isDragging.current || bookedSet.has(`${day}|${ts}`)) return
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
          onClick={() => drawAndDownload(grid, bookedSet)}
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
                const cellKey: CellKey = bookedSet.has(`${day}|${ts}`) ? 'booked' : (grid.get(`${day}|${ts}`) ?? 'empty')
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
      <p className="text-xs text-slate-400">Click or drag to cycle: unavailable → preferred → normal → unavailable</p>
    </div>
  )
}
