import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/lib/supabase/server'
import { getGeminiModel, GenerateSlotsResponseSchema } from '@/lib/gemini'
import { TIME_SLOTS, DAYS, timeToMins } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface BookedSlot { day: string; start: string; end: string }

// Deterministic buffer calculation — keeps LLM out of time arithmetic entirely.
function computeBufferSlots(bookedSlots: BookedSlot[], bufferMins: number): Set<string> {
  const blocked = new Set<string>()
  for (const slot of bookedSlots) {
    const classStart = timeToMins(slot.start)
    const classEnd = timeToMins(slot.end)
    for (const ts of TIME_SLOTS) {
      const slotStart = timeToMins(ts)
      const slotEnd = slotStart + 30
      const gapBefore = classStart - slotEnd
      const gapAfter  = slotStart - classEnd
      if ((gapBefore >= 0 && gapBefore < bufferMins) || (gapAfter >= 0 && gapAfter < bufferMins)) {
        blocked.add(`${slot.day}|${ts}`)
      }
    }
  }
  return blocked
}

function buildBookedCellSet(bookedSlots: BookedSlot[]): Set<string> {
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

function buildPrompt(
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

CRITICAL — how to interpret student availability:
- Student availability describes only times they CAN attend. They do NOT list times they cannot.
- Example: "free Thursday 12pm–6pm" confirms Thu 12:00–18:00 as available. Thu before 12pm or after 6pm is UNCLEAR, not unavailable → mark normal (subject to tutor blocked times).
- Never infer unavailability from silence. Only mark "unavailable" if tutor rules block it.`
}

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as {
    rules?: string
    studentAvailability?: string
    bookedSlots?: BookedSlot[]
    bufferMins?: number
  }

  if (!body.rules?.trim()) {
    return NextResponse.json({ error: 'rules is required' }, { status: 400 })
  }

  const bookedSlots = body.bookedSlots ?? []
  const bufferMins = typeof body.bufferMins === 'number' ? body.bufferMins : 15
  const bufferSlots = computeBufferSlots(bookedSlots, bufferMins)
  const bookedCellSet = buildBookedCellSet(bookedSlots)

  const prompt = buildPrompt(
    body.rules.trim(),
    body.studentAvailability?.trim() || 'No student availability provided — classify slots based on tutor rules only.',
    bookedSlots,
    bufferSlots,
    bookedCellSet,
  )

  try {
    const model = getGeminiModel()
    const result = await model.generateContent(prompt)
    const raw = JSON.parse(result.response.text())
    const parsed = GenerateSlotsResponseSchema.safeParse(raw)
    if (!parsed.success) {
      console.error('[generate-slots] Zod validation failed:', parsed.error.message)
      return NextResponse.json({ error: 'AI returned unexpected format. Please try again.' }, { status: 500 })
    }

    // Safety net: force any buffer slot the AI somehow returned to unavailable
    const slots = parsed.data.slots.map(s =>
      bufferSlots.has(`${s.day}|${s.time}`) ? { ...s, state: 'unavailable' as const } : s
    )

    return NextResponse.json({ slots })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gemini API error'
    console.error('[generate-slots]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
