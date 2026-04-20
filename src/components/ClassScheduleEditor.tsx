'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ClassSlot, WeekDay } from '@/lib/types'

const DAYS: WeekDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface Props {
  value: ClassSlot[]
  onChange: (slots: ClassSlot[]) => void
}

export default function ClassScheduleEditor({ value, onChange }: Props) {
  function addSlot() {
    onChange([...value, { day: 'Monday', start: '14:00', end: '16:00' }])
  }

  function removeSlot(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function updateSlot(index: number, field: keyof ClassSlot, newValue: WeekDay | string) {
    onChange(value.map((slot, i) => i === index ? { ...slot, [field]: newValue } : slot))
  }

  return (
    <div className="space-y-2">
      {value.map((slot, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap">
          <Select value={slot.day} onValueChange={(v) => updateSlot(i, 'day', v as WeekDay)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="time"
            value={slot.start}
            onChange={(e) => updateSlot(i, 'start', e.target.value)}
            className="w-32"
          />
          <span className="text-slate-400 text-sm">to</span>
          <Input
            type="time"
            value={slot.end}
            onChange={(e) => updateSlot(i, 'end', e.target.value)}
            className="w-32"
          />

          <button
            type="button"
            onClick={() => removeSlot(i)}
            className="text-slate-400 hover:text-red-500 text-lg leading-none px-1"
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addSlot}>
        + Add class
      </Button>
    </div>
  )
}
