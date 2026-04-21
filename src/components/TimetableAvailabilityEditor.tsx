'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AvailabilitySlot, SlotType, WeekDay } from '@/lib/types'

const DAYS: WeekDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TIME_SLOTS: string[] = []
for (let h = 8; h < 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

function buildKey(day: WeekDay, timeSlot: string) {
  return `${day}|${timeSlot}`
}

function cycleType(current: SlotType | undefined): SlotType | null {
  if (!current) return 'preferred'
  if (current === 'preferred') return 'normal'
  return null
}

const CELL_COLORS: Record<string, string> = {
  preferred: 'bg-green-300 hover:bg-green-400',
  normal:    'bg-yellow-200 hover:bg-yellow-300',
  empty:     'bg-slate-100 hover:bg-slate-200',
}

interface Props {
  initialSlots: AvailabilitySlot[]
  onSaved: (slots: AvailabilitySlot[]) => void
}

export default function TimetableAvailabilityEditor({ initialSlots, onSaved }: Props) {
  const [grid, setGrid] = useState<Map<string, SlotType>>(() => {
    const m = new Map<string, SlotType>()
    for (const s of initialSlots) m.set(buildKey(s.day, s.time_slot), s.slot_type)
    return m
  })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function toggle(day: WeekDay, timeSlot: string) {
    const key = buildKey(day, timeSlot)
    const next = cycleType(grid.get(key))
    setGrid(prev => {
      const m = new Map(prev)
      if (next === null) m.delete(key)
      else m.set(key, next)
      return m
    })
    setSaveState('idle')
  }

  async function handleSave() {
    setSaveState('saving')
    const supabase = createClient()

    const newSlots = Array.from(grid.entries()).map(([key, slot_type]) => {
      const [day, time_slot] = key.split('|')
      return { day, time_slot, slot_type }
    })

    const { error: delErr } = await supabase
      .from('tutor_availability')
      .delete()
      .not('id', 'is', null)

    if (delErr) { setSaveState('error'); return }

    if (newSlots.length > 0) {
      const { error: insErr } = await supabase.from('tutor_availability').insert(newSlots)
      if (insErr) { setSaveState('error'); return }
    }

    const { data, error: fetchErr } = await supabase
      .from('tutor_availability')
      .select('id, day, time_slot, slot_type')
    if (fetchErr) { setSaveState('error'); return }

    setSaveState('saved')
    onSaved((data ?? []) as AvailabilitySlot[])
    setTimeout(() => setSaveState('idle'), 2000)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-medium text-sm">Edit Availability</h3>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-green-300 rounded-sm" /> Preferred</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-yellow-200 rounded-sm" /> Normal</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-slate-100 border border-slate-200 rounded-sm" /> Unavailable</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 70px)', gap: 1 }}>
          <div />
          {DAY_SHORT.map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-600 pb-1">{d}</div>
          ))}
          {TIME_SLOTS.map(ts => (
            <>
              <div key={`label-${ts}`} className="text-right pr-2 text-xs text-slate-400 leading-5">
                {ts.endsWith(':00') ? ts : ''}
              </div>
              {DAYS.map(day => {
                const slotType = grid.get(buildKey(day, ts))
                return (
                  <div
                    key={`${day}-${ts}`}
                    onClick={() => toggle(day, ts)}
                    className={`h-5 cursor-pointer rounded-sm transition-colors ${CELL_COLORS[slotType ?? 'empty']}`}
                  />
                )
              })}
            </>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className="px-4 py-1.5 text-sm bg-navy text-white rounded-md hover:bg-navy/90 disabled:opacity-50 transition-colors"
        >
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : saveState === 'error' ? 'Error — retry' : 'Save availability'}
        </button>
        <p className="text-xs text-slate-400">Click to toggle: unavailable → preferred → normal → unavailable</p>
      </div>
    </div>
  )
}
