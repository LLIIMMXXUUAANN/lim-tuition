import { START, StateGraph } from '@langchain/langgraph'
import { createReactAgent, createReactAgentAnnotation, withAgentName } from '@langchain/langgraph/prebuilt'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { createTaskHandoffTool, normalizeAgentName } from './handoff'
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
      // Content is the subagent's reply so the supervisor LLM outputs it verbatim
      // even if it simply echoes the last tool result.
      content: replyText || `Subagent ${agentName} completed its task.`,
      name: toolName,
      tool_call_id: toolCallId,
    }),
  ]
}

function isChatModelWithBindTools(llm: AnyLLM): boolean {
  return typeof llm?.bindTools === 'function'
}

const makeCallAgent = (
  agent: AnyAgent,
  outputMode: 'last_message' | 'full_history',
  supervisorName: string,
) => {
  return async (state: AnyAgent, config: AnyAgent) => {
    const output = await agent.invoke(state, config)
    let { messages } = output
    if (outputMode === 'last_message') messages = messages.slice(-1)
    const lastMsg = messages[messages.length - 1]
    const replyText = typeof lastMsg?.content === 'string' ? lastMsg.content : ''
    messages = [...messages, ...createHandoffBackMessages(agent.name, supervisorName, replyText)]
    return { ...output, messages }
  }
}

export interface BuildCustomSupervisorParams {
  agents: AnyAgent[]
  llm: ChatGoogle
  tools?: AnyAgent[]
  prompt?: string
  supervisorName?: string
  includeAgentName?: 'inline' | boolean
  outputMode?: 'last_message' | 'full_history'
}

export function buildCustomSupervisor({
  agents,
  llm,
  tools,
  prompt,
  supervisorName = 'supervisor',
  includeAgentName,
  outputMode = 'last_message',
}: BuildCustomSupervisorParams) {
  const agentNames = new Set<string>()
  for (const agent of agents) {
    if (!agent.name || agent.name === 'LangGraph')
      throw new Error('Each agent must have a name set via compile({ name }) or createReactAgent({ name }).')
    if (agentNames.has(agent.name))
      throw new Error(`Duplicate agent name: '${agent.name}'.`)
    agentNames.add(agent.name)
  }

  const handoffTools = agents.map(agent =>
    createTaskHandoffTool({
      agentName: agent.name,
      agentDescription: typeof agent.description === 'string' ? agent.description : undefined,
    })
  )

  const allTools = [...(tools ?? []), ...handoffTools]

  let supervisorLLM: AnyLLM = llm
  if (isChatModelWithBindTools(llm)) {
    supervisorLLM = (llm as AnyLLM).bindTools(allTools)
    supervisorLLM.kwargs ??= {}
    if (!('tools' in supervisorLLM.kwargs)) {
      if ('config' in supervisorLLM && typeof supervisorLLM.config === 'object' &&
          supervisorLLM.config != null && 'tools' in supervisorLLM.config) {
        supervisorLLM.kwargs.tools = supervisorLLM.config.tools
      }
    }
  }
  if (includeAgentName) supervisorLLM = withAgentName(supervisorLLM, includeAgentName as 'inline')

  const schema = createReactAgentAnnotation()
  const supervisorAgent = createReactAgent({
    name: supervisorName,
    llm: supervisorLLM,
    tools: allTools,
    prompt,
    stateSchema: schema,
  })

  const svName = supervisorAgent.name ?? supervisorName
  let builder = new StateGraph(schema)
    .addNode(svName, supervisorAgent, { ends: [...agentNames] })
    .addEdge(START, svName)

  for (const agent of agents) {
    builder = builder
      .addNode(agent.name!, makeCallAgent(agent, outputMode, supervisorName), { subgraphs: [agent] })
      .addEdge(agent.name!, svName) as typeof builder
  }

  return builder
}
