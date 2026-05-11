import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import type { Content } from '@google/genai'
import { requireTutor } from '@/lib/supabase/server'
import {
  errMsg,
  searchStudents, getStudent, listStudents,
  createStudent, updateStudent, deleteStudent,
  setupStudentGoogle, runSyncAll, managePortalAccess,
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
      return listStudents(supabase, args as { status?: string; day?: string })
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
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const MUTATION_TOOLS = new Set(['update_student', 'delete_student', 'setup_student_google'])

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as {
    messages?: { role: 'user' | 'model'; content: string }[]
  }

  if (!body.messages?.length) {
    return NextResponse.json({ error: 'messages is required' }, { status: 400 })
  }

  const contents: Content[] = body.messages.map(m => ({
    role: m.role,
    parts: [{ text: m.content }],
  }))

  const steps: string[] = []
  let reply = ''
  let lastMutationTool: { name: string; args: Record<string, unknown>; createdId?: string } | null = null

  try {
    for (let round = 0; round < 10; round++) {
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

      const modelContent = response.candidates?.[0]?.content
      if (modelContent) contents.push(modelContent)

      const namedCalls = fnCalls.filter(fc => fc.name)
      for (const fc of namedCalls) steps.push(`🔧 ${fc.name}(${JSON.stringify(fc.args)})`)

      const toolResults = await Promise.all(
        namedCalls.map(fc => executeTool(fc.name!, fc.args as Record<string, unknown>, supabase))
      )

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
      }

      contents.push({ role: 'user', parts: fnResponseParts })
    }
  } catch (err) {
    return NextResponse.json({ error: errMsg(err, 'Gemini API error') }, { status: 500 })
  }

  if (!reply) {
    reply = "I wasn't able to complete that in the allowed steps — please try a simpler request."
  }

  if (lastMutationTool) {
    const verification = await selfEval(lastMutationTool.name, lastMutationTool.args, supabase, lastMutationTool.createdId)
    if (verification) steps.push(verification)
  }

  return NextResponse.json({ reply, steps })
}
