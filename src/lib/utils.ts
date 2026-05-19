import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { WeekDay, ClassSlot } from "@/lib/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(time: string): string {
  if (!time || !time.includes(':')) return time ?? ''
  const [hourStr, minute] = time.split(':')
  const hour = parseInt(hourStr, 10)
  if (isNaN(hour)) return time
  const period = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${minute} ${period}`
}

export const DAYS: WeekDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const TIME_SLOTS: string[] = []
for (let h = 8; h < 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}

export function timeToMins(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
}

export const MONTH_NAMES: string[] = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

export function formatFee(fee: number): string {
  const rounded = Math.round(fee * 100) / 100
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2)
}

export function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

export function oxfordList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export function groupSlotsByDay(schedule: ClassSlot[]): Map<string, ClassSlot[]> {
  const map = new Map<string, ClassSlot[]>()
  for (const slot of schedule) {
    const existing = map.get(slot.day)
    if (existing) existing.push(slot)
    else map.set(slot.day, [slot])
  }
  return map
}

export function getMYTDateString(): string {
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
}

export function getWeekdayDates(year: number, month: number, weekday: string): number[] {
  const dayIndex = DAY_INDEX[weekday]
  if (dayIndex === undefined) return []
  const dates: number[] = []
  const d = new Date(year, month - 1, 1)
  while (d.getDay() !== dayIndex) d.setDate(d.getDate() + 1)
  while (d.getMonth() === month - 1) {
    dates.push(d.getDate())
    d.setDate(d.getDate() + 7)
  }
  return dates
}
