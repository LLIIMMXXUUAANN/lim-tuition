import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import type { Content, FunctionCall, Part } from '@google/genai'
import { requireTutor } from '@/lib/supabase/server'
import {
  errMsg,
  searchStudents, getStudent, listStudents,
  createStudent, updateStudent, deleteStudent,
  setupStudentGoogle, runSyncAll, managePortalAccess,
  getSchedule, getFeeSummary,
  listTemplates, getTemplate, generatePaymentMessage,
  getTimetableSettings, updateTimetableRules, updateBufferMins,
  generateSlotAvailability, downloadTimetableImage,
  type Supabase,
} from '@/lib/agent/tools'
import { TOOL_DECLARATIONS, SYSTEM_INSTRUCTION } from '@/lib/agent/schema'
import { selfEval } from '@/lib/agent/eval'

export const dynamic = 'force-dynamic'

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  supabase: Supabase
): Promise<unknown> {
  switch (name) {
    case 'search_students':
      return searchStudents(supabase, args.query as string)
    case 'get_student':
      return getStudent(supabase, args.id as string)
    case 'list_students':
      return listStudents(supabase, args as { status?: string })
    case 'create_student':
      return createStudent(supabase, args as Parameters<typeof createStudent>[1])
    case 'update_student':
      return updateStudent(supabase, args.id as string, args.fields as Record<string, unknown>)
    case 'delete_student':
      return deleteStudent(supabase, args.id as string)
    case 'setup_student_google':
      return setupStudentGoogle(supabase, args.student_id as string)
    case 'sync_all_students':
      return runSyncAll(supabase)
    case 'manage_portal_access':
      return managePortalAccess(supabase, args.student_id as string, args.action as 'add' | 'remove', args.email as string)
    case 'get_schedule':
      return getSchedule(supabase, args.day as string)
    case 'get_fee_summary':
      return getFeeSummary(supabase, args.month as number | undefined, args.year as number | undefined)
    case 'list_templates':
      return listTemplates()
    case 'get_template':
      return getTemplate(supabase, args.id as string)
    case 'generate_payment_message':
      return generatePaymentMessage(supabase, args as Parameters<typeof generatePaymentMessage>[1])
    case 'get_timetable_settings':
      return getTimetableSettings(supabase)
    case 'update_timetable_rules':
      return updateTimetableRules(supabase, args.rules as string)
    case 'update_buffer_mins':
      return updateBufferMins(supabase, args.buffer_mins as number)
    case 'generate_slot_availability':
      return generateSlotAvailability(supabase, (args.student_availability as string | undefined) ?? '')
    case 'download_timetable_image':
      return downloadTimetableImage()
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const MUTATION_TOOLS = new Set(['update_student', 'delete_student', 'setup_student_google'])
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as {
    messages?: { role: 'user' | 'model'; content: string }[]
  }

  if (!body.messages?.length) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }

  const mytDate = new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
  const systemInstruction = `Today is ${mytDate} (Malaysia Time).\n\n${SYSTEM_INSTRUCTION}`

  const contents: Content[] = body.messages.map(m => ({
    role: m.role,
    parts: [{ text: m.content }],
  }))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      let gotReply = false
      let lastMutationTool: { name: string; args: Record<string, unknown>; createdId?: string } | null = null

      try {
        for (let round = 0; round < 10; round++) {
          const streamResult = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents,
            config: {
              tools: TOOL_DECLARATIONS,
              systemInstruction,
            },
          })

          let roundText = ''
          const roundFnCalls: FunctionCall[] = []

          for await (const chunk of streamResult) {
            const chunkFnCalls = chunk.functionCalls ?? []
            roundFnCalls.push(...chunkFnCalls)

            const chunkText = (chunk.candidates?.[0]?.content?.parts ?? [])
              .filter(p => p.text)
              .map(p => p.text)
              .join('')
            if (chunkText) {
              roundText += chunkText
              // Guard: Gemini doesn't mix text and fn-calls, but don't emit text once calls appear
              if (roundFnCalls.length === 0) {
                emit({ type: 'chunk', content: chunkText })
              }
            }
          }

          const modelParts: Part[] = []
          if (roundText) modelParts.push({ text: roundText })
          roundFnCalls.forEach(fc => modelParts.push({ functionCall: fc }))
          if (modelParts.length > 0) contents.push({ role: 'model', parts: modelParts })

          if (roundFnCalls.length === 0) {
            gotReply = true
            break
          }

          const namedCalls = roundFnCalls.filter(fc => fc.name)
          for (const fc of namedCalls) {
            emit({ type: 'step', content: `🔧 ${fc.name}(${JSON.stringify(fc.args)})` })
          }

          const timings: { name: string; ms: number }[] = new Array(namedCalls.length)
          const roundStart = Date.now()
          const toolResults = await Promise.all(
            namedCalls.map(async (fc, i) => {
              const t0 = Date.now()
              const result = await executeTool(fc.name!, fc.args as Record<string, unknown>, supabase)
              timings[i] = { name: fc.name!, ms: Date.now() - t0 }
              return result
            })
          )
          if (namedCalls.length > 1) {
            const roundMs = Date.now() - roundStart
            emit({ type: 'step', content: `⏱ parallel ×${namedCalls.length} — ${timings.map(t => `${t.name} ${t.ms}ms`).join(', ')} (total ${roundMs}ms)` })
          }

          const fnResponseParts: Array<{
            functionResponse: { name: string; id?: string; response: Record<string, unknown> }
          }> = []

          for (let i = 0; i < namedCalls.length; i++) {
            const fc = namedCalls[i]
            const result = toolResults[i]
            fnResponseParts.push({
              functionResponse: {
                name: fc.name!,
                ...(fc.id ? { id: fc.id } : {}),
                response: { result },
              },
            })
            if (fc.name === 'create_student' && typeof result === 'object' && result !== null && 'student' in result) {
              const created = (result as { student: { id: string } }).student
              lastMutationTool = { name: fc.name, args: fc.args as Record<string, unknown>, createdId: created.id }
            } else if (MUTATION_TOOLS.has(fc.name!)) {
              lastMutationTool = { name: fc.name!, args: fc.args as Record<string, unknown> }
            }
            if (fc.name === 'download_timetable_image') {
              emit({ type: 'download_schedule' })
            }
            if (fc.name === 'generate_slot_availability') {
              const r = result as { slots?: unknown[] } | { error?: string }
              if ('slots' in r && Array.isArray(r.slots)) {
                emit({ type: 'slots_ready', slots: r.slots })
              }
            }
          }

          contents.push({ role: 'user', parts: fnResponseParts })
        }
      } catch (err) {
        emit({ type: 'error', message: errMsg(err, 'Gemini API error') })
        controller.close()
        return
      }

      if (!gotReply) {
        emit({ type: 'chunk', content: "I wasn't able to complete that in the allowed steps — please try a simpler request." })
      }

      if (lastMutationTool) {
        const verification = await selfEval(
          lastMutationTool.name,
          lastMutationTool.args,
          supabase,
          lastMutationTool.createdId,
        )
        if (verification) emit({ type: 'step', content: verification })
      }

      emit({ type: 'done' })
      controller.close()
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
