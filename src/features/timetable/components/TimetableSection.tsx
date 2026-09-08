'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ClassSlot, WeekDay } from '@/lib/types'
import { formatTime, DAYS, TIME_SLOTS, timeToMins, decamelizeKeys } from '@/lib/utils'
import {
  NAVY, SCALE, PNG_W, PNG_H, SCHEDULE_CELL_H,
  DAY_SHORT, fmt12,
  computeScheduleWindow, scheduleCanvasHeight,
  drawSlotsToCtx, drawScheduleToCtx, downloadCanvas,
} from '@/shared/lib/timetable-canvas'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs'
import { HttpError, parseRetryAfterMs } from '@/shared/lib/httpError'

type SlotType = 'preferred' | 'normal'
type CellKey = 'booked' | 'preferred' | 'normal' | 'empty'
type SaveStatus = 'idle' | 'saved' | 'error'

const GRID_COLS = '72px repeat(7, 1fr)'

function cellKey(day: string, ts: string): string {
  return `${day}|${ts}`
}


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

function buildBookedSet(students: { classSchedule: ClassSlot[] }[]): Set<string> {
  const s = new Set<string>()
  for (const student of students)
    for (const slot of student.classSchedule)
      for (const ts of TIME_SLOTS) {
        const tsEnd = addMinutes(ts, 30)
        if (ts < slot.end && tsEnd > slot.start)
          s.add(cellKey(slot.day, ts))
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
  drawSlotsToCtx(ctx, grid, bookedSet)
  downloadCanvas(canvas, 'slot_availability.png')
}


function drawSchedule(students: { name: string; classSchedule: ClassSlot[] }[]) {
  const sch_h = scheduleCanvasHeight(students)
  const canvas = document.createElement('canvas')
  canvas.width = PNG_W * SCALE
  canvas.height = sch_h * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(SCALE, SCALE)
  drawScheduleToCtx(ctx, students)
  downloadCanvas(canvas, 'weekly_schedule.png')
}

function WeeklyScheduleView({ students }: { students: { name: string; classSchedule: ClassSlot[] }[] }) {
  const { startMin, activeSlots } = computeScheduleWindow(students)
  const gridHeight = activeSlots.length * SCHEDULE_CELL_H
  const stripeGradient = `repeating-linear-gradient(to bottom, #f8fafc 0px, #f8fafc ${SCHEDULE_CELL_H}px, #ffffff ${SCHEDULE_CELL_H}px, #ffffff ${SCHEDULE_CELL_H * 2}px)`

  const byDay: Record<string, { name: string; start: string; end: string }[]> = {}
  for (const day of DAYS) byDay[day] = []
  for (const s of students)
    for (const slot of s.classSchedule)
      byDay[slot.day]?.push({ name: s.name, start: slot.start, end: slot.end })

  if (!students.some(s => s.classSchedule.length > 0))
    return <p className="text-sm text-slate-400 text-center py-8">No classes scheduled yet.</p>

  return (
    <div className="select-none rounded-lg border border-slate-200 overflow-hidden">
      <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS }}>
        <div className="bg-[#0A1A2F]" />
        {DAY_SHORT.map(d => (
          <div key={d} className="bg-[#0A1A2F] text-white text-xs font-semibold text-center py-2">{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS }}>
        <div className="bg-white relative" style={{ height: gridHeight }}>
          {activeSlots.map((ts, row) => ts.endsWith(':00') ? (
            <div key={ts} style={{ position: 'absolute', top: row * SCHEDULE_CELL_H, right: 8, height: SCHEDULE_CELL_H }} className="text-xs text-slate-400 flex items-center justify-end whitespace-nowrap">
              {formatTime(ts)}
            </div>
          ) : null)}
        </div>
        {DAYS.map(day => (
          <div key={day} className="relative border-l border-slate-100" style={{ height: gridHeight, background: stripeGradient }}>
            {byDay[day].map(({ name, start, end }) => {
              const sMin = timeToMins(start)
              const eMin = timeToMins(end)
              const top = (sMin - startMin) / 30 * SCHEDULE_CELL_H + 2
              const height = (eMin - sMin) / 30 * SCHEDULE_CELL_H - 4
              if (top < 0 || height <= 0) return null
              const durationSlots = (eMin - sMin) / 30
              return (
                <div
                  key={`${name}|${start}`}
                  style={{ position: 'absolute', top, left: 2, right: 2, height, background: NAVY, borderRadius: 5, overflow: 'hidden', zIndex: 1 }}
                  className="flex flex-col items-center justify-center px-1"
                >
                  {durationSlots >= 2 ? (
                    <>
                      <span className="text-white font-semibold text-xs leading-tight w-full text-center truncate">{name}</span>
                      <span className="text-white/85 text-[10px]">{fmt12(start)} – {fmt12(end)}</span>
                    </>
                  ) : (
                    <span className="text-white font-semibold text-[10px] leading-tight w-full text-center truncate">{name}</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  students: { name: string; classSchedule: ClassSlot[] }[]
  initialRules?: string
  initialBufferMins?: number
}

export default function TimetableSection({ students, initialRules = '', initialBufferMins = 15 }: Props) {
  const [grid, setGrid] = useState<Map<string, SlotType>>(new Map())
  const isDragging = useRef(false)
  const paintType = useRef<SlotType | null>(null)
  const saveTimersRef = useRef<Record<'rules' | 'buffer', ReturnType<typeof setTimeout> | null>>({ rules: null, buffer: null })

  const [rules, setRules] = useState(initialRules)
  const [bufferMins, setBufferMins] = useState(initialBufferMins)
  const [studentAvailability, setStudentAvailability] = useState('')

  const bookedSet = useMemo(() => buildBookedSet(students), [students])
  const bookedSlots = useMemo(() => students.flatMap(s => s.classSchedule), [students])

  useEffect(() => {
    const stop = () => { isDragging.current = false }
    window.addEventListener('mouseup', stop)
    const timers = saveTimersRef.current
    return () => {
      window.removeEventListener('mouseup', stop)
      if (timers.rules) clearTimeout(timers.rules)
      if (timers.buffer) clearTimeout(timers.buffer)
    }
  }, [])

  const rulesMutation = useMutation({
    mutationFn: async (rulesValue: string) => {
      const res = await fetch('/api/timetable/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decamelizeKeys({ rules: rulesValue })),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new HttpError(data.error ?? 'Save failed', res.status, parseRetryAfterMs(res))
    },
    onSettled: () => {
      if (saveTimersRef.current.rules) clearTimeout(saveTimersRef.current.rules)
      saveTimersRef.current.rules = setTimeout(() => rulesMutation.reset(), 2500)
    },
  })

  const bufferMutation = useMutation({
    mutationFn: async (bufferValue: number) => {
      const res = await fetch('/api/timetable/buffer-mins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decamelizeKeys({ bufferMins: bufferValue })),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new HttpError(data.error ?? 'Save failed', res.status, parseRetryAfterMs(res))
    },
    onSettled: () => {
      if (saveTimersRef.current.buffer) clearTimeout(saveTimersRef.current.buffer)
      saveTimersRef.current.buffer = setTimeout(() => bufferMutation.reset(), 2500)
    },
  })

  const generateSlotsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/timetable/generate-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decamelizeKeys({ rules, studentAvailability, bookedSlots, bufferMins })),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new HttpError(data.error ?? 'Generation failed', res.status, parseRetryAfterMs(res))
      return data.slots as { day: string; time: string; state: string }[]
    },
    onSuccess: (slots) => {
      const newGrid = new Map<string, SlotType>()
      for (const slot of slots) {
        if (slot.state === 'preferred') newGrid.set(cellKey(slot.day, slot.time), 'preferred')
        else if (slot.state === 'normal') newGrid.set(cellKey(slot.day, slot.time), 'normal')
      }
      setGrid(newGrid)
    },
  })

  function saveStatusOf(mutation: { isSuccess: boolean; isError: boolean }): SaveStatus {
    if (mutation.isSuccess) return 'saved'
    if (mutation.isError) return 'error'
    return 'idle'
  }

  function errorMessageOf(error: unknown): string {
    return error instanceof HttpError ? error.message : 'Network error'
  }

  function applyPaint(day: WeekDay, ts: string, paint: SlotType | null) {
    setGrid(prev => {
      const m = new Map(prev)
      if (paint === null) m.delete(cellKey(day, ts))
      else m.set(cellKey(day, ts), paint)
      return m
    })
  }

  function handleMouseDown(e: React.MouseEvent, day: WeekDay, ts: string) {
    if (bookedSet.has(cellKey(day, ts))) return
    e.preventDefault()
    const paint = cycleType(grid.get(cellKey(day, ts)))
    paintType.current = paint
    isDragging.current = true
    applyPaint(day, ts, paint)
  }

  function handleMouseEnter(day: WeekDay, ts: string) {
    if (!isDragging.current || bookedSet.has(cellKey(day, ts))) return
    applyPaint(day, ts, paintType.current)
  }

  return (
    <Tabs defaultValue="schedule">
      <TabsList className="w-full">
        <TabsTrigger value="schedule" className="flex-1">Weekly Schedule</TabsTrigger>
        <TabsTrigger value="availability" className="flex-1">Slot Availability</TabsTrigger>
      </TabsList>

      <TabsContent value="schedule" className="pt-4">
        <div className="border rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-500">Current student class times</p>
            <button
              onClick={() => drawSchedule(students)}
              className="shrink-0 px-4 py-1.5 text-sm bg-navy text-white rounded-md hover:bg-navy/90 transition-colors"
            >
              Download Schedule
            </button>
          </div>
          <WeeklyScheduleView students={students} />
        </div>
      </TabsContent>

      <TabsContent value="availability" className="pt-4" keepMounted>
        <div className="border rounded-lg p-6 space-y-4">
          <p className="text-sm text-slate-500">Generate available slots with AI, then download for sharing</p>

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
                  onClick={() => rulesMutation.mutate(rules)}
                  disabled={rulesMutation.isPending}
                  className="px-3 py-1.5 text-xs bg-navy/8 hover:bg-navy/15 text-navy rounded-md transition-colors disabled:opacity-50"
                >
                  {saveLabel(rulesMutation.isPending, saveStatusOf(rulesMutation), 'Save Rules')}
                </button>
                {rulesMutation.isError && (
                  <span className="text-xs text-red-500">{errorMessageOf(rulesMutation.error)}</span>
                )}
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
                    onClick={() => bufferMutation.mutate(bufferMins)}
                    disabled={bufferMutation.isPending}
                    className="px-3 py-1.5 text-xs bg-navy/8 hover:bg-navy/15 text-navy rounded-md transition-colors disabled:opacity-50"
                  >
                    {saveLabel(bufferMutation.isPending, saveStatusOf(bufferMutation), 'Save')}
                  </button>
                  {bufferMutation.isError && (
                    <span className="text-xs text-red-500">{errorMessageOf(bufferMutation.error)}</span>
                  )}
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
          {generateSlotsMutation.isError && (
            <p className="text-xs text-red-500">{errorMessageOf(generateSlotsMutation.error)}</p>
          )}
          <button
            onClick={() => generateSlotsMutation.mutate()}
            disabled={generateSlotsMutation.isPending || !rules.trim()}
            className="px-4 py-2 text-sm bg-navy text-white rounded-md hover:bg-navy/90 transition-colors disabled:opacity-50"
          >
            {generateSlotsMutation.isPending ? 'Generating…' : 'Generate Slots'}
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
                    const cellState: CellKey = bookedSet.has(cellKey(day, ts)) ? 'booked' : (grid.get(cellKey(day, ts)) ?? 'empty')
                    return (
                      <div
                        key={`${day}-${ts}`}
                        onMouseDown={e => handleMouseDown(e, day, ts)}
                        onMouseEnter={() => handleMouseEnter(day, ts)}
                        className={`h-5 rounded-sm transition-colors ${CELL_CLASSES[cellState]}`}
                      />
                    )
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400">Click or drag to cycle: unavailable → preferred → normal → unavailable</p>
        </div>
      </TabsContent>
    </Tabs>
  )
}
