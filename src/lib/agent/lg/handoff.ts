import { Command, getCurrentTaskInput } from '@langchain/langgraph'
import { ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export function normalizeAgentName(name: string): string {
  return name.trim().replace(/\s+/g, '_').toLowerCase()
}

export function createTaskHandoffTool({ agentName, agentDescription }: {
  agentName: string
  agentDescription?: string
}) {
  const toolName = `transfer_to_${normalizeAgentName(agentName)}`
  return tool(
    async ({ task }, config) => {
      const toolMessage = new ToolMessage({
        content: task,
        name: toolName,
        tool_call_id: (config as { toolCall?: { id?: string } }).toolCall?.id ?? '',
      })
      const state = getCurrentTaskInput() as { messages: unknown[] }
      return new Command({
        goto: agentName,
        graph: Command.PARENT,
        update: { messages: state.messages.concat(toolMessage) },
      })
    },
    {
      name: toolName,
      schema: z.object({
        task: z.string().describe(
          'Clear, self-contained task for the subagent. Resolve all ambiguities: ' +
          '"today" → actual date, "this month" → month/year. ' +
          'Example: "Get the class schedule for Tuesday 2026-05-19."'
        ),
      }),
      description: agentDescription ?? 'Handoff to specialist agent.',
    }
  )
}
