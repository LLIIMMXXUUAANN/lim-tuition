import { Annotation, END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { tool } from '@langchain/core/tools'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { ChatGoogle } from '@langchain/google'
import type { DynamicStructuredTool, DynamicTool, StructuredToolInterface } from '@langchain/core/tools'
import type { RunnableToolLike } from '@langchain/core/runnables'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'

export type AgentTool = StructuredToolInterface | DynamicStructuredTool | DynamicTool | RunnableToolLike

const SubagentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  pendingTool: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
})

export type SubagentStateType = typeof SubagentState.State
export type SubagentUpdateType = typeof SubagentState.Update

export type SubagentPostHook = (
  state: SubagentStateType,
  config?: LangGraphRunnableConfig,
) => Promise<SubagentUpdateType> | SubagentUpdateType

export interface BuildProgressiveSubagentParams {
  name: string
  description: string
  prompt: string
  tools: AgentTool[]
  model: ChatGoogle
  postModelHook?: SubagentPostHook
}

// Subagents must not see supervisor routing messages (transfer_to_X calls, handoff acks) —
// they confuse the subagent's reasoning. The task injected via the handoff ToolMessage content
// is recast as a HumanMessage so the subagent treats it as a fresh user request.
function extractSubagentMessages(messages: BaseMessage[]): BaseMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m instanceof ToolMessage && typeof m.name === 'string' && m.name.startsWith('transfer_to_')) {
      const task = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      return [new HumanMessage(task), ...messages.slice(i + 1)]
    }
  }
  return messages
}

export function buildProgressiveSubagent(params: BuildProgressiveSubagentParams) {
  const { name, description, prompt, tools, model, postModelHook } = params
  const toolByName = new Map(tools.map(t => [t.name, t] as const))
  const toolNames = tools.map(t => t.name) as [string, ...string[]]

  const selectTool = tool(
    async ({ tool_name }) => `Now invoke ${tool_name} with its full schema.`,
    {
      name: 'select_tool',
      description:
        'Pick which tool you want to use next. After calling this, the next round will expose only that tool with its full input schema, and you must invoke it. Call select_tool only when you actually need a tool; otherwise reply directly.',
      schema: z.object({
        tool_name: z.enum(toolNames).describe('The exact name of the tool you want to use'),
      }),
    },
  )

  const catalogText = tools
    .map(t => `- **${t.name}**: ${t.description ?? ''}`)
    .join('\n')

  const slimPrompt =
    `${prompt}\n\n` +
    `## Available tools (call select_tool to use one)\n${catalogText}\n\n` +
    `When you need a tool, call select_tool with its name. On the next turn you will see ONLY that tool's full input schema and must invoke it. If no tool is needed, reply directly.`

  const fullPromptBase = `${prompt}\n\nThe user asked you to use a specific tool. Invoke it now with appropriate arguments based on the conversation context.`

  const slimModel = model.bindTools([selectTool], { tool_choice: 'auto' })
  const fullModelByTool = new Map(
    tools.map(t => [t.name, model.bindTools([t], { tool_choice: 'any' })] as const)
  )

  function withSystem(systemContent: string, messages: BaseMessage[]): BaseMessage[] {
    return [new SystemMessage(systemContent), ...messages]
  }

  async function slimSelector(state: SubagentStateType): Promise<SubagentUpdateType> {
    const ai = await slimModel.invoke(withSystem(slimPrompt, extractSubagentMessages(state.messages))) as AIMessage
    const selectCall = ai.tool_calls?.find(tc => tc.name === 'select_tool')
    if (!selectCall) {
      return { messages: [ai] }
    }
    const chosenName = (selectCall.args as { tool_name?: string }).tool_name
    if (!chosenName || !toolByName.has(chosenName)) {
      const ack = new ToolMessage({
        content: `Unknown tool "${chosenName}". Please pick a tool from the catalog or reply directly.`,
        tool_call_id: selectCall.id ?? '',
        name: 'select_tool',
      })
      return { messages: [ai, ack], pendingTool: null }
    }
    const ack = new ToolMessage({
      content: `OK, now invoke ${chosenName}.`,
      tool_call_id: selectCall.id ?? '',
      name: 'select_tool',
    })
    return { messages: [ai, ack], pendingTool: chosenName }
  }

  async function fullInvoker(state: SubagentStateType): Promise<SubagentUpdateType> {
    const fullModel = fullModelByTool.get(state.pendingTool!)
    if (!fullModel) {
      return { messages: [new AIMessage('I lost track of which tool to invoke; please try again.')], pendingTool: null }
    }
    const ai = await fullModel.invoke(withSystem(fullPromptBase, extractSubagentMessages(state.messages))) as AIMessage
    return { messages: [ai], pendingTool: null }
  }

  const toolNode = new ToolNode(tools)

  function routeFromSlim(state: SubagentStateType): 'full_invoker' | typeof END {
    return state.pendingTool ? 'full_invoker' : END
  }

  const builder = new StateGraph(SubagentState)
    .addNode('slim_selector', slimSelector)
    .addNode('full_invoker', fullInvoker)
    .addNode('tools', toolNode)
    .addEdge(START, 'slim_selector')
    .addConditionalEdges('slim_selector', routeFromSlim, ['full_invoker', END])
    .addEdge('full_invoker', 'tools')

  if (postModelHook) {
    builder
      .addNode('post_hook', postModelHook)
      .addEdge('tools', 'post_hook')
      .addEdge('post_hook', 'slim_selector')
  } else {
    builder.addEdge('tools', 'slim_selector')
  }

  return builder.compile({ name, description })
}
