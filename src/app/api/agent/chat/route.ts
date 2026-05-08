import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'
import type { Tool, Content } from '@google/genai'
import { requireTutor, createClient } from '@/lib/supabase/server'
import type { StudentMode, PaymentMethod, StudentStatus, ClassSlot } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

type Supabase = Awaited<ReturnType<typeof createClient>>

// ─── Tool implementations ─────────────────────────────────────────────────────

async function searchStudents(supabase: Supabase, query: string) {
  const { data, error } = await supabase
    .from('students')
    .select('id, name, status, fee_per_hour, class_schedule')
    .ilike('name', `%${query}%`)
    .order('name')
  if (error) return { error: error.message }
  return { students: data ?? [] }
}

async function createStudent(
  supabase: Supabase,
  params: {
    name: string
    mode: StudentMode
    fee_per_hour: number
    payment_method?: PaymentMethod
    status?: StudentStatus
    class_schedule?: ClassSlot[]
    contact_person?: string
    contact_phone?: string
  }
) {
  const { data, error } = await supabase
    .from('students')
    .insert({
      name: params.name,
      mode: params.mode,
      fee_per_hour: params.fee_per_hour,
      payment_method: params.payment_method ?? 'Monthly',
      status: params.status ?? 'Active',
      class_schedule: params.class_schedule ?? [],
      contact_person: params.contact_person ?? null,
      contact_phone: params.contact_phone ?? null,
      access_emails: [],
    })
    .select('id, name')
    .single()
  if (error) return { error: error.message }
  return { student: data }
}

const ALLOWED_UPDATE_KEYS = new Set([
  'name', 'mode', 'fee_per_hour', 'payment_method', 'status',
  'class_schedule', 'contact_person', 'contact_phone', 'student_phone',
  'today_homework', 'notes', 'latest_payment',
])

async function updateStudent(
  supabase: Supabase,
  id: string,
  fields: Record<string, unknown>
) {
  const permitted = Object.fromEntries(
    Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_KEYS.has(k))
  )
  if (Object.keys(permitted).length === 0) return { error: 'No valid fields to update' }
  const { error } = await supabase.from('students').update(permitted).eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

async function deleteStudent(supabase: Supabase, id: string) {
  const { error } = await supabase.from('students').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ─── Gemini tool declarations ─────────────────────────────────────────────────

const TOOL_DECLARATIONS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'search_students',
        description:
          'Search for students by name (partial match). Use before update/delete to get the student ID. Use after mutations to verify the change.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: 'Partial or full student name' },
          },
          required: ['query'],
        },
      },
      {
        name: 'create_student',
        description: 'Create a new student record in the database.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            mode: {
              type: Type.STRING,
              enum: ['University', 'IGCSE', 'My Python Syllabus'],
            },
            fee_per_hour: { type: Type.NUMBER, description: 'Hourly fee in RM' },
            payment_method: { type: Type.STRING, enum: ['Monthly', 'Weekly'] },
            status: {
              type: Type.STRING,
              enum: ['Active', 'On Hold', 'Completed'],
            },
            class_schedule: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: {
                    type: Type.STRING,
                    enum: [
                      'Monday', 'Tuesday', 'Wednesday', 'Thursday',
                      'Friday', 'Saturday', 'Sunday',
                    ],
                  },
                  start: {
                    type: Type.STRING,
                    description: '24-hour HH:MM format, e.g. "15:00"',
                  },
                  end: {
                    type: Type.STRING,
                    description: '24-hour HH:MM format, e.g. "17:00"',
                  },
                },
                required: ['day', 'start', 'end'],
              },
            },
            contact_person: { type: Type.STRING },
            contact_phone: { type: Type.STRING },
          },
          required: ['name', 'mode', 'fee_per_hour'],
        },
      },
      {
        name: 'update_student',
        description:
          'Update one or more fields on an existing student. You MUST call search_students first to obtain the student UUID.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: {
              type: Type.STRING,
              description: 'Student UUID obtained from search_students',
            },
            fields: {
              type: Type.OBJECT,
              description:
                'Object of fields to update. Allowed keys: name, mode, fee_per_hour, payment_method, status, class_schedule, contact_person, contact_phone, today_homework, notes',
            },
          },
          required: ['id', 'fields'],
        },
      },
      {
        name: 'delete_student',
        description:
          'Permanently delete a student record. Only call this AFTER the user has typed "yes" to confirm deletion in this conversation.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: {
              type: Type.STRING,
              description: 'Student UUID obtained from search_students',
            },
          },
          required: ['id'],
        },
      },
    ],
  },
]

const SYSTEM_INSTRUCTION = `You are a helpful assistant for a private tuition admin system. You help the tutor manage student records using the provided tools.

RULES — follow these exactly:
1. Before calling update_student or delete_student, always call search_students first to obtain the student's UUID.
2. Never call delete_student without first asking: "Are you sure you want to permanently delete [name]? Type yes to confirm." You must see "yes" in the conversation before proceeding.
3. If a create_student command is missing required fields (mode, fee_per_hour), ask for them before calling the tool.
4. If search_students returns multiple matches, list them and ask which student the user means.
5. If search_students returns no results when the user wanted to update/delete, say so and offer to create instead.
6. After successfully creating or updating a student, include their UUID at the end of your reply in this exact format: [student_id:UUID] — this lets the UI render a link to their profile.
7. Keep replies concise and friendly.`

// ─── Tool dispatcher ──────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  supabase: Supabase
): Promise<unknown> {
  switch (name) {
    case 'search_students':
      return searchStudents(supabase, args.query as string)
    case 'create_student':
      return createStudent(supabase, args as Parameters<typeof createStudent>[1])
    case 'update_student':
      return updateStudent(supabase, args.id as string, args.fields as Record<string, unknown>)
    case 'delete_student':
      return deleteStudent(supabase, args.id as string)
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ─── Self-evaluation ──────────────────────────────────────────────────────────

async function selfEval(
  toolName: string,
  args: Record<string, unknown>,
  supabase: Supabase,
  createdId?: string
): Promise<string> {
  try {
    if (toolName === 'create_student') {
      if (!createdId) return '⚠ could not verify'
      const { data } = await supabase
        .from('students')
        .select('id')
        .eq('id', createdId)
        .maybeSingle()
      return data ? '✓ verified in DB' : '⚠ could not verify'
    }
    if (toolName === 'update_student') {
      const { data } = await supabase
        .from('students')
        .select('id')
        .eq('id', args.id as string)
        .maybeSingle()
      return data ? '✓ verified in DB' : '⚠ could not verify'
    }
    if (toolName === 'delete_student') {
      const { data } = await supabase
        .from('students')
        .select('id')
        .eq('id', args.id as string)
        .maybeSingle()
      return !data ? '✓ verified deleted' : '⚠ student still exists in DB'
    }
  } catch {
    return '⚠ could not verify'
  }
  return ''
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as {
    messages?: { role: 'user' | 'model'; content: string }[]
  }

  if (!body.messages?.length) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

  // Convert simple chat messages → Gemini Content format
  const contents: Content[] = body.messages.map(m => ({
    role: m.role,
    parts: [{ text: m.content }],
  }))

  const steps: string[] = []
  let reply = ''
  let lastMutationTool: { name: string; args: Record<string, unknown>; createdId?: string } | null = null

  try { for (let round = 0; round < 5; round++) {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        tools: TOOL_DECLARATIONS,
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    })

    const fnCalls = response.functionCalls ?? []

    if (fnCalls.length === 0) {
      reply = response.text ?? ''
      break
    }

    // Append model's turn (with function calls) to history
    const modelContent = response.candidates?.[0]?.content
    if (modelContent) {
      contents.push(modelContent)
    }

    // Execute each tool call sequentially
    const fnResponseParts: Array<{
      functionResponse: { name: string; id?: string; response: Record<string, unknown> }
    }> = []

    for (const fc of fnCalls) {
      if (!fc.name) continue
      steps.push(`🔧 ${fc.name}(${JSON.stringify(fc.args)})`)
      const result = await executeTool(fc.name, fc.args as Record<string, unknown>, supabase)
      fnResponseParts.push({
        functionResponse: {
          name: fc.name,
          ...(fc.id ? { id: fc.id } : {}),
          response: { result },
        },
      })
      if (fc.name === 'create_student' && typeof result === 'object' && result !== null && 'student' in result) {
        const created = (result as { student: { id: string } }).student
        lastMutationTool = { name: fc.name, args: fc.args as Record<string, unknown>, createdId: created.id }
      } else if (['update_student', 'delete_student'].includes(fc.name)) {
        lastMutationTool = { name: fc.name, args: fc.args as Record<string, unknown> }
      }
    }

    contents.push({ role: 'user', parts: fnResponseParts })
  } } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini API error'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  if (!reply) {
    reply = "I wasn't able to complete that in the allowed steps — please try a simpler request."
  }

  // Self-evaluation after any mutating operation
  if (lastMutationTool) {
    const verification = await selfEval(lastMutationTool.name, lastMutationTool.args, supabase, lastMutationTool.createdId)
    if (verification) reply = `${reply}\n\n${verification}`
  }

  return NextResponse.json({ reply, steps })
}
