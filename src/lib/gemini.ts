import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'

export const SlotSchema = z.object({
  day: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  state: z.enum(['preferred', 'normal', 'unavailable']),
})

export const GenerateSlotsResponseSchema = z.object({
  slots: z.array(SlotSchema),
})

export type GenerateSlotsResponse = z.infer<typeof GenerateSlotsResponseSchema>

export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    slots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'string' },
          time: { type: 'string' },
          state: { type: 'string', enum: ['preferred', 'normal', 'unavailable'] },
        },
        required: ['day', 'time', 'state'],
      },
    },
  },
  required: ['slots'],
} as const

export function getGeminiModel() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  return genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA as never,
    },
  })
}
