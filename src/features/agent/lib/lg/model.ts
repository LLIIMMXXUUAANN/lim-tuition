import { ChatGoogle } from '@langchain/google'

// Fresh instance per call: parallel subagents (student_agent + template_agent via Send)
// must not share a model instance — shared internal state causes non-deterministic failures.
// thinkingBudget: 0 — Gemini 2.5 Flash's thinking pass exhausts its token budget on large
// tool schemas (11 tools) and returns "No message content"; disabling it fixes this.
export function getGeminiChatModel(): ChatGoogle {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required')
  return new ChatGoogle({
    model: 'gemini-2.5-flash',
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
    thinkingBudget: 0,
  })
}
