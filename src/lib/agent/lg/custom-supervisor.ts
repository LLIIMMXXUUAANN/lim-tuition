import { Annotation, Command, END, Send, START, StateGraph } from '@langchain/langgraph'
import { createReactAgent, createReactAgentAnnotation, withAgentName } from '@langchain/langgraph/prebuilt'
import { AIMessage, AIMessageChunk, HumanMessage, ToolMessage } from '@langchain/core/messages'
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
      if ((m instanceof AIMessage || m instanceof AIMessageChunk) && !m.tool_calls?.length) {
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

  const baseSchema = createReactAgentAnnotation()
  const outerSchema = Annotation.Root({
    ...baseSchema.spec,
    pendingHandoffs: Annotation<HandoffTask[]>({
      reducer: (prev, next) => {
        if (next === undefined) return prev ?? []
        if (!next.length) return []
        return [...(prev ?? []), ...next]
      },
      default: () => [],
    }),
  })

  const supervisorAgent = createReactAgent({
    name: supervisorName,
    llm: supervisorLLM,
    tools: allTools,
    prompt,
    stateSchema: outerSchema,
  })

  async function dispatchNode(state: typeof outerSchema.State) {
    const handoffs = state.pendingHandoffs ?? []
    if (!handoffs.length) throw new Error('dispatchNode called with empty pendingHandoffs — routing bug')
    return new Command({
      update: { pendingHandoffs: [] },
      goto: handoffs.map(h => new Send(h.agentName, { messages: [new HumanMessage(h.task)] })),
    })
  }

  // dispatch tool ends the supervisor's react loop via goto:END (not Command.PARENT) so the
  // supervisor's AIMessage propagates to outer state; this edge then routes to dispatch_node.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeAfterSupervisor = (state: typeof outerSchema.State): any =>
    (state.pendingHandoffs?.length ?? 0) > 0 ? 'dispatch_node' : END

  let builder = new StateGraph(outerSchema)
    .addNode(supervisorName, supervisorAgent)
    .addNode('dispatch_node', dispatchNode, { ends: [...agentNames] })
    .addEdge(START, supervisorName)
    .addConditionalEdges(supervisorName, routeAfterSupervisor)

  for (const agent of agents) {
    builder = builder
      .addNode(agent.name!, makeCallAgent(agent, supervisorName), { subgraphs: [agent] })
      .addEdge(agent.name!, supervisorName) as typeof builder
  }

  return builder
}
