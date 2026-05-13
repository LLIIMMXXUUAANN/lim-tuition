// src/lib/timetable-slots.ts
import { timeToMins, TIME_SLOTS, DAYS } from '@/lib/utils'
import { getGeminiModel, GenerateSlotsResponseSchema } from '@/lib/gemini'

export interface BookedSlot { day: string; start: string; end: string }
export type SlotState = 'preferred' | 'normal' | 'unavailable'
export interface ClassifiedSlot { day: string; time: string; state: SlotState }

export function computeBufferSlots(bookedSlots: BookedSlot[], bufferMins: number): Set<string> {
  const blocked = new Set<string>()
  for (const slot of bookedSlots) {
    const classStart = timeToMins(slot.start)
    const classEnd = timeToMins(slot.end)
    for (const ts of TIME_SLOTS) {
      const slotStart = timeToMins(ts)
      const slotEnd = slotStart + 30
      const gapBefore = classStart - slotEnd
      const gapAfter = slotStart - classEnd
      if ((gapBefore >= 0 && gapBefore < bufferMins) || (gapAfter >= 0 && gapAfter < bufferMins)) {
        blocked.add(`${slot.day}|${ts}`)
      }
    }
  }
  return blocked
}

export function buildBookedCellSet(bookedSlots: BookedSlot[]): Set<string> {
  return new Set(
    bookedSlots.flatMap(slot =>
      TIME_SLOTS.filter(ts => {
        const slotStart = timeToMins(ts)
        const slotEnd = slotStart + 30
        return slotStart < timeToMins(slot.end) && slotEnd > timeToMins(slot.start)
      }).map(ts => `${slot.day}|${ts}`)
    )
  )
}

export function buildSlotPrompt(
  rules: string,
  studentAvailability: string,
  bookedSlots: BookedSlot[],
  bufferSlots: Set<string>,
  bookedCellSet: Set<string>,
): string {
  const bookedLines = bookedSlots.length
    ? bookedSlots.map(s => `  ${s.day} ${s.start}–${s.end}`).join('\n')
    : '  (none)'

  const classifiableSlots = DAYS.flatMap(day =>
    TIME_SLOTS
      .filter(ts => !bookedCellSet.has(`${day}|${ts}`) && !bufferSlots.has(`${day}|${ts}`))
      .map(ts => `${day} ${ts}`)
  ).join(', ')

  return `You are a scheduling assistant for a private tutor. Classify every listed slot as "preferred", "normal", or "unavailable".

TUTOR'S SCHEDULING RULES:
${rules}

STUDENT'S AVAILABILITY:
${studentAvailability}

CURRENTLY BOOKED SLOTS (already taken — do not include in response):
${bookedLines}

SLOTS TO CLASSIFY (return exactly these, no others — buffer zones are already excluded):
${classifiableSlots}

INSTRUCTIONS:
- Classify every slot in the list above as "preferred", "normal", or "unavailable".
- "preferred" — tutor prefers this day AND the student EXPLICITLY mentioned they are available at that time
- "normal" — tutor day is normal (Wed/Sat/Sun), OR student did not mention this time, OR no student availability was provided
- "unavailable" — blocked by tutor rules (restricted hours, day limits) OR student EXPLICITLY said they cannot attend
- Time-range boundaries are EXCLUSIVE at the end: "08:00 to 10:00 unavailable" blocks the 08:00, 08:30, 09:00, and 09:30 slots but NOT 10:00 — the 10:00 slot starts after the block ends and is fully available. Never apply any extra margin around unavailability boundaries.

CRITICAL — how to interpret student availability:
- Student availability describes only times they CAN attend. They do NOT list times they cannot.
- Example: "free Thursday 12pm–6pm" confirms Thu 12:00–18:00 as available. Thu before 12pm or after 6pm is UNCLEAR, not unavailable → mark normal (subject to tutor blocked times).
- Never infer unavailability from silence. Only mark "unavailable" if tutor rules block it.`
}

export async function runSlotGeneration(
  rules: string,
  studentAvailability: string,
  bookedSlots: BookedSlot[],
  bufferMins: number,
): Promise<ClassifiedSlot[]> {
  const bufferSlots = computeBufferSlots(bookedSlots, bufferMins)
  const bookedCellSet = buildBookedCellSet(bookedSlots)
  const prompt = buildSlotPrompt(
    rules,
    studentAvailability || 'No student availability provided — classify slots based on tutor rules only.',
    bookedSlots,
    bufferSlots,
    bookedCellSet,
  )

  const model = getGeminiModel()
  const result = await model.generateContent(prompt)
  const raw = JSON.parse(result.response.text())
  const parsed = GenerateSlotsResponseSchema.parse(raw)

  return parsed.slots.map(s =>
    bufferSlots.has(`${s.day}|${s.time}`) ? { ...s, state: 'unavailable' as const } : s
  )
}
