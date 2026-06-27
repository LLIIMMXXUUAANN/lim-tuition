import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { WeekDay } from "@/lib/types"

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

export function camelizeKeys<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(camelizeKeys) as unknown as T
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as object).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        camelizeKeys(v),
      ])
    ) as T
  }
  return obj
}

export function decamelizeKeys<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(decamelizeKeys) as unknown as T
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as object).map(([k, v]) => [
        k.replace(/([A-Z])/g, (_, c: string) => `_${c.toLowerCase()}`),
        decamelizeKeys(v),
      ])
    ) as T
  }
  return obj
}
