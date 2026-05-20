import { Command, END } from '@langchain/langgraph'
import { ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export interface HandoffTask {
  agentName: string
  task: string
}

export function normalizeAgentName(name: string): string {
  return name.trim().replace(/\s+/g, '_').toLowerCase()
}

export function createDispatchTool(agents: { name: string; description?: string }[]) {
  const agentEnum = agents.map(a => a.name) as [string, ...string[]]
  const agentInfo = agents
    .map(a => `- **${a.name}**: ${a.description ?? 'Specialist agent'}`)
    .join('\n')

  return tool(
    async ({ handoffs }, config) => {
      const toolCallId = (config as { toolCall?: { id?: string } }).toolCall?.id ?? ''
      const toolMessage = new ToolMessage({
        content: `Dispatching ${handoffs.length} task(s) to: ${handoffs.map(h => h.agentName).join(', ')}`,
        name: 'dispatch',
        tool_call_id: toolCallId,
      })
      // goto:END (not Command.PARENT) lets the supervisor subgraph exit normally so its AIMessage propagates to outer state.
      return new Command({
        goto: END,
        update: {
          messages: [toolMessage],
          pendingHandoffs: handoffs as HandoffTask[],
        },
      })
    },
    {
      name: 'dispatch',
      description:
        `Route one or more tasks to specialist subagents in parallel. ` +
        `Call this ONCE with all tasks you want to run — they execute in parallel.\n\n` +
        `Available agents:\n${agentInfo}`,
      schema: z.object({
        handoffs: z
          .array(
            z.object({
              agentName: z.enum(agentEnum).describe('Which agent handles this task'),
              task: z.string().describe(
                'Clear, self-contained task for the subagent. Resolve all ambiguities: ' +
                '"today" → actual date, "this month" → month/year. ' +
                'Example: "Get the class schedule for Tuesday 2026-05-19."'
              ),
            })
          )
          .min(1)
          .describe('List of tasks to dispatch. Use multiple entries for parallel execution.'),
      }),
    }
  )
}
