import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { AIMessage, SystemMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLLM = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = any

export type SubagentStateType = typeof MessagesAnnotation.State
export type SubagentUpdateType = Partial<SubagentStateType>

export type SubagentPostHook = (
  state: SubagentStateType,
  config?: LangGraphRunnableConfig,
) => Promise<SubagentUpdateType> | SubagentUpdateType

export interface BuildSubagentParams {
  name: string
  description?: string
  llm: AnyLLM
  tools: AnyTool[]
  prompt?: string
  postToolHook?: SubagentPostHook
}

export function buildSubagent({ name, description, llm, tools, prompt, postToolHook }: BuildSubagentParams): AnyAgent {
  const model = (llm as AnyLLM).bindTools(tools)

  async function agentNode(state: SubagentStateType, config?: LangGraphRunnableConfig) {
    const messages = prompt
      ? [new SystemMessage(prompt), ...state.messages]
      : state.messages
    const response = await model.invoke(messages, config)
    return { messages: [response] }
  }

  function shouldContinue(state: SubagentStateType) {
    const last = state.messages.at(-1)
    if (AIMessage.isInstance(last) && last.tool_calls?.length) return 'tools'
    return END
  }

  const toolNode = new ToolNode(tools)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder: any = new StateGraph(MessagesAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, ['tools', END])

  if (postToolHook) {
    builder = builder
      .addNode('post_hook', postToolHook)
      .addEdge('tools', 'post_hook')
      .addEdge('post_hook', 'agent')
  } else {
    builder = builder.addEdge('tools', 'agent')
  }

  return builder.compile({ name, description })
}
