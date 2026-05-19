import { ChatGoogle } from '@langchain/google'

let cached: ChatGoogle | null = null

export function getGeminiChatModel(): ChatGoogle {
  if (cached) return cached
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required')
  cached = new ChatGoogle({
    model: 'gemini-2.5-flash',
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0,
  })
  return cached
}
