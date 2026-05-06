'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import type { ClassSlot, WeekDay } from '@/lib/types'
import { formatTime, DAYS, TIME_SLOTS } from '@/lib/utils'

type SlotType = 'preferred' | 'normal'
type CellKey = 'booked' | 'preferred' | 'normal' | 'empty'
type SaveStatus = 'idle' | 'saved' | 'error'

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const SCALE = 2

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
        if (ts < slot.end && tsEnd > slot.start)
          s.add(`${slot.day}|${ts}`)
      }
  return s
}

function saveLabel(saving: boolean, status: SaveStatus, label: string): string {
  if (saving) return 'Saving…'
  if (status === 'saved') return 'Saved!'
  if (status === 'error') return 'Save failed'
  return label
}

function cycleType(current: SlotType | undefined): SlotType | null {
  if (!current) return 'preferred'
  if (current === 'preferred') return 'normal'
  return null
}

function drawAndDownload(grid: Map<string, SlotType>, bookedSet: Set<string>) {
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
    { color: '#fde047', label: 'Normal available' },
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

  downloadCanvas(canvas, 'slot_availability.png')
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a')
  link.download = filename
  link.href = canvas.toDataURL('image/png')
  link.click()
}

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`
}

function drawSchedule(students: { name: string; class_schedule: ClassSlot[] }[]) {
  const SCH_CELL_H  = 28
  const BLOCK_COLOR = '#6b7fa3'

  // Auto-crop: find active hour window, round to 30-min boundaries
  let minMin = 22 * 60, maxMin = 8 * 60
  for (const s of students)
    for (const slot of s.class_schedule) {
      const [sh, sm] = slot.start.split(':').map(Number)
      const [eh, em] = slot.end.split(':').map(Number)
      minMin = Math.min(minMin, sh * 60 + sm)
      maxMin = Math.max(maxMin, eh * 60 + em)
    }
  if (minMin >= maxMin) { minMin = 8 * 60; maxMin = 22 * 60 }
  const startMin = Math.max(8 * 60,  Math.floor((minMin - 30) / 30) * 30)
  const endMin   = Math.min(22 * 60, Math.ceil((maxMin  + 30) / 30) * 30)
  const ACTIVE_SLOTS = TIME_SLOTS.filter(ts => {
    const [h, m] = ts.split(':').map(Number)
    const min = h * 60 + m
    return min >= startMin && min < endMin
  })

  const SCH_H = PNG_PAD + PNG_TITLE_H + PNG_GAP + PNG_HEADER_H
              + SCH_CELL_H * ACTIVE_SLOTS.length
              + PNG_PAD

  const canvas = document.createElement('canvas')
  canvas.width  = PNG_W * SCALE
  canvas.height = SCH_H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(SCALE, SCALE)

  const gridX      = PNG_PAD + PNG_LABEL_W
  const headerY    = PNG_PAD + PNG_TITLE_H + PNG_GAP
  const gridY      = headerY + PNG_HEADER_H
  const gridW      = PNG_CELL_W * 7
  const gridBottom = gridY + SCH_CELL_H * ACTIVE_SLOTS.length

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PNG_W, SCH_H)

  ctx.fillStyle = '#0f2942'
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('Weekly Schedule', gridX, PNG_PAD + PNG_TITLE_H / 2)

  ctx.fillStyle = '#0f2942'
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
    const y = gridY + row * SCH_CELL_H
    if (row % 2 === 0) {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(PNG_PAD, y, PNG_LABEL_W + gridW, SCH_CELL_H)
    }
    if (ts.endsWith(':00')) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '10px system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(formatTime(ts), gridX - 6, y + SCH_CELL_H / 2)
    }
  })

  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(gridX, gridY, gridW, SCH_CELL_H * ACTIVE_SLOTS.length, [0, 0, 6, 6])
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
      const [sh, sm] = slot.start.split(':').map(Number)
      const [eh, em] = slot.end.split(':').map(Number)
      const startOffset   = (sh * 60 + sm - startMin) / 30
      const durationSlots = (eh * 60 + em - sh * 60 - sm) / 30
      if (startOffset < 0 || durationSlots <= 0) continue

      const x = gridX + dayIdx * PNG_CELL_W + 2
      const y = gridY + startOffset * SCH_CELL_H + 2
      const w = PNG_CELL_W - 4
      const h = Math.min(durationSlots * SCH_CELL_H - 4, gridBottom - y - 2)
      if (h <= 0) continue

      ctx.fillStyle = BLOCK_COLOR
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, 5)
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.clip()
      ctx.textAlign = 'center'

      if (durationSlots >= 2) {
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 11px system-ui, sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillText(student.name, x + w / 2, y + 6)
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.font = '10px system-ui, sans-serif'
        ctx.fillText(`${fmt12(slot.start)} – ${fmt12(slot.end)}`, x + w / 2, y + 20)
      } else {
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 10px system-ui, sans-serif'
        ctx.textBaseline = 'middle'
        ctx.fillText(student.name, x + w / 2, y + h / 2)
      }
      ctx.restore()
    }
  }

  downloadCanvas(canvas, 'weekly_schedule.png')
}

interface Props {
  students: { name: string; class_schedule: ClassSlot[] }[]
  initialRules?: string
  initialBufferMins?: number
}

export default function TimetableSection({ students, initialRules = '', initialBufferMins = 15 }: Props) {
  const [grid, setGrid] = useState<Map<string, SlotType>>(new Map())
  const isDragging = useRef(false)
  const paintType = useRef<SlotType | null>(null)
  const saveTimers = useRef<Record<'rules' | 'buffer', ReturnType<typeof setTimeout> | null>>({ rules: null, buffer: null })

  const [rules, setRules] = useState(initialRules)
  const [bufferMins, setBufferMins] = useState(initialBufferMins)
  const [studentAvailability, setStudentAvailability] = useState('')
  const [isSaving, setIsSaving] = useState<Record<'rules' | 'buffer', boolean>>({ rules: false, buffer: false })
  const [saveStatus, setSaveStatus] = useState<Record<'rules' | 'buffer', SaveStatus>>({ rules: 'idle', buffer: 'idle' })
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const bookedSet = useMemo(() => buildBookedSet(students), [students])
  const bookedSlots = useMemo(() => students.flatMap(s => s.class_schedule), [students])

  useEffect(() => {
    const stop = () => { isDragging.current = false }
    window.addEventListener('mouseup', stop)
    const timers = saveTimers.current
    return () => {
      window.removeEventListener('mouseup', stop)
      if (timers.rules) clearTimeout(timers.rules)
      if (timers.buffer) clearTimeout(timers.buffer)
    }
  }, [])

  async function saveSetting(key: 'rules' | 'buffer', endpoint: string, payload: object) {
    setIsSaving(prev => ({ ...prev, [key]: true }))
    setSaveStatus(prev => ({ ...prev, [key]: 'idle' }))
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]!)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const status: SaveStatus = res.ok ? 'saved' : 'error'
      setSaveStatus(prev => ({ ...prev, [key]: status }))
    } catch {
      setSaveStatus(prev => ({ ...prev, [key]: 'error' }))
    } finally {
      setIsSaving(prev => ({ ...prev, [key]: false }))
      saveTimers.current[key] = setTimeout(() => setSaveStatus(prev => ({ ...prev, [key]: 'idle' })), 2500)
    }
  }

  async function generateSlots() {
    setIsGenerating(true)
    setAiError(null)
    try {
      const res = await fetch('/api/timetable/generate-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules, studentAvailability, bookedSlots, bufferMins }),
      })
      const data = await res.json()
      if (!res.ok) { setAiError(data.error ?? 'Generation failed'); return }

      const newGrid = new Map<string, SlotType>()
      for (const slot of data.slots as { day: string; time: string; state: string }[]) {
        if (slot.state === 'preferred') newGrid.set(`${slot.day}|${slot.time}`, 'preferred')
        else if (slot.state === 'normal') newGrid.set(`${slot.day}|${slot.time}`, 'normal')
      }
      setGrid(newGrid)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setIsGenerating(false)
    }
  }

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
    <div className="space-y-4">
      <div className="border rounded-lg p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-slate-700">Weekly Schedule</p>
          <p className="text-xs text-slate-400 mt-1">Clean image of student class times for sharing</p>
        </div>
        <button
          onClick={() => drawSchedule(students)}
          className="shrink-0 px-4 py-1.5 text-sm bg-navy text-white rounded-md hover:bg-navy/90 transition-colors"
        >
          Download Schedule
        </button>
      </div>

      <div className="border rounded-lg p-6 space-y-4">
        <div>
          <p className="text-base font-semibold text-slate-700">Slot Availability</p>
          <p className="text-xs text-slate-400 mt-1">Generate available slots with AI, then download for sharing</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600">Your Scheduling Rules</label>
            <textarea
              value={rules}
              onChange={e => setRules(e.target.value)}
              rows={5}
              placeholder="e.g. 15-min buffer between classes. Mon–Fri preferred, Sat–Sun normal. Monday before 12pm unavailable. Friday after 4:30pm unavailable..."
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => saveSetting('rules', '/api/timetable/rules', { rules })}
                disabled={isSaving.rules}
                className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors disabled:opacity-50"
              >
                {saveLabel(isSaving.rules, saveStatus.rules, 'Save Rules')}
              </button>
              <div className="flex items-center gap-1.5 ml-auto">
                <label className="text-xs text-slate-500 whitespace-nowrap">Buffer between classes</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={bufferMins}
                  onChange={e => setBufferMins(Number(e.target.value))}
                  className="w-14 text-xs border border-slate-200 rounded-md px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-navy/30"
                />
                <span className="text-xs text-slate-500">mins</span>
                <button
                  onClick={() => saveSetting('buffer', '/api/timetable/buffer-mins', { bufferMins })}
                  disabled={isSaving.buffer}
                  className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors disabled:opacity-50"
                >
                  {saveLabel(isSaving.buffer, saveStatus.buffer, 'Save')}
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600">Student Availability</label>
            <textarea
              value={studentAvailability}
              onChange={e => setStudentAvailability(e.target.value)}
              rows={5}
              placeholder="e.g. Free on weekday afternoons after 3pm, whole day Saturday, Sunday morning only..."
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
          </div>
        </div>
        {aiError && <p className="text-xs text-red-500">{aiError}</p>}
        <button
          onClick={generateSlots}
          disabled={isGenerating || !rules.trim()}
          className="px-4 py-2 text-sm bg-navy text-white rounded-md hover:bg-navy/90 transition-colors disabled:opacity-50"
        >
          {isGenerating ? 'Generating…' : 'Generate Slots'}
        </button>

        <div className="border-t border-slate-100 pt-4 flex items-center justify-between flex-wrap gap-3">
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
            Download Available Slots
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
    </div>
  )
}
