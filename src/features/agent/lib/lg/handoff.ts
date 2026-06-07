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
    // supervisorNode intercepts the dispatch tool call directly — this function never runs.
    // Only the schema below is used (for binding to the supervisor LLM so it knows the tool).
    async ({ handoffs }) => `Dispatching ${handoffs.length} task(s)`,
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
