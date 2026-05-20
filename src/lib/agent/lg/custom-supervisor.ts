import { Command, END, Send, START, StateGraph } from '@langchain/langgraph'
import { createReactAgentAnnotation, withAgentName } from '@langchain/langgraph/prebuilt'
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { createDispatchTool, normalizeAgentName, type HandoffTask } from './handoff'
import { extractText } from './stream-adapter'
import type { ChatGoogle } from '@langchain/google'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLLM = any

function createHandoffBackMessages(agentName: string, supervisorName: string, replyText: string) {
  const toolCallId = crypto.randomUUID()
  const toolName = `transfer_back_to_${normalizeAgentName(supervisorName)}`
  return [
    new AIMessage({
      content: `Transferring back to ${supervisorName}`,
      tool_calls: [{ name: toolName, args: {}, id: toolCallId }],
      name: agentName,
    }),
    new ToolMessage({
      content: replyText || `Subagent ${agentName} completed its task.`,
      name: toolName,
      tool_call_id: toolCallId,
    }),
  ]
}

function isChatModelWithBindTools(llm: AnyLLM): boolean {
  return typeof llm?.bindTools === 'function'
}

const makeCallAgent = (agent: AnyAgent, supervisorName: string) => {
  return async (state: AnyAgent, config: AnyAgent) => {
    const output = await agent.invoke(state, config)
    const { messages } = output
    // Scan backward: post-hooks append a self_eval SystemMessage after mutations,
    // so messages.at(-1) may not be the subagent's text reply.
    let replyText = ''
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (AIMessage.isInstance(m) && !m.tool_calls?.length) {
        replyText = extractText(m)
        break
      }
    }
    return { messages: createHandoffBackMessages(agent.name, supervisorName, replyText) }
  }
}

export interface BuildCustomSupervisorParams {
  agents: AnyAgent[]
  llm: ChatGoogle
  tools?: AnyAgent[]
  prompt?: string
  supervisorName?: string
  includeAgentName?: 'inline' | boolean
}

export function buildCustomSupervisor({
  agents,
  llm,
  tools,
  prompt,
  supervisorName = 'supervisor',
  includeAgentName,
}: BuildCustomSupervisorParams) {
  const agentNames = new Set<string>()
  for (const agent of agents) {
    if (!agent.name || agent.name === 'LangGraph')
      throw new Error('Each agent must have a name set via compile({ name }) or createReactAgent({ name }).')
    if (agentNames.has(agent.name))
      throw new Error(`Duplicate agent name: '${agent.name}'.`)
    agentNames.add(agent.name)
  }

  const dispatchTool = createDispatchTool(
    agents.map(a => ({
      name: a.name as string,
      description: typeof a.description === 'string' ? a.description : undefined,
    }))
  )

  const allTools = [...(tools ?? []), dispatchTool]

  let supervisorLLM: AnyLLM = llm
  if (isChatModelWithBindTools(llm)) {
    supervisorLLM = (llm as AnyLLM).bindTools(allTools)
    // @langchain/google stores bound tools in .config.tools rather than .kwargs.tools;
    // copy them so the LangGraph message formatter can inspect bound tool schemas.
    supervisorLLM.kwargs ??= {}
    if (!('tools' in supervisorLLM.kwargs)) {
      if ('config' in supervisorLLM && typeof supervisorLLM.config === 'object' &&
          supervisorLLM.config != null && 'tools' in supervisorLLM.config) {
        supervisorLLM.kwargs.tools = supervisorLLM.config.tools
      }
    }
  }
  if (includeAgentName) supervisorLLM = withAgentName(supervisorLLM, includeAgentName as 'inline')

  const outerSchema = createReactAgentAnnotation()

  // Single-turn supervisor node: one LLM call per turn, no React loop.
  // Inspects the response directly and returns a Command for dispatch or a plain
  // state update for direct replies — eliminating the second "empty" LLM call that
  // createReactAgent always makes after a tool executes.
  async function supervisorNode(state: typeof outerSchema.State, config: AnyAgent) {
    const inputMessages = prompt
      ? [new SystemMessage(prompt), ...state.messages]
      : state.messages
    const response = await supervisorLLM.invoke(inputMessages, config)

    const dispatchCall = AIMessage.isInstance(response)
      ? response.tool_calls?.find((tc: { name: string }) => tc.name === 'dispatch')
      : undefined

    if (!dispatchCall) {
      return { messages: [response] }
    }

    const { handoffs } = dispatchCall.args as { handoffs: HandoffTask[] }
    const toolMessage = new ToolMessage({
      content: `Dispatching ${handoffs.length} task(s) to: ${handoffs.map((h: HandoffTask) => h.agentName).join(', ')}`,
      name: 'dispatch',
      tool_call_id: dispatchCall.id ?? '',
    })
    return new Command({
      update: { messages: [response, toolMessage] },
      goto: handoffs.map((h: HandoffTask) => new Send(h.agentName, { messages: [new HumanMessage(h.task)] })),
    })
  }

  const agentNamesList = [...agentNames]

  let builder = new StateGraph(outerSchema)
    .addNode(supervisorName, supervisorNode, { ends: agentNamesList })
    .addEdge(START, supervisorName)
    .addEdge(supervisorName, END)

  for (const agent of agents) {
    builder = builder
      .addNode(agent.name!, makeCallAgent(agent, supervisorName), { subgraphs: [agent] })
      .addEdge(agent.name!, supervisorName) as typeof builder
  }

  return builder
}
