import { GoogleGenAI, Type } from '@google/genai'
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

const GEMINI_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    slots: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          day: { type: Type.STRING },
          time: { type: Type.STRING },
          state: { type: Type.STRING, enum: ['preferred', 'normal', 'unavailable'] },
        },
        required: ['day', 'time', 'state'],
      },
    },
  },
  required: ['slots'],
}

export async function runGeminiSlotGeneration(prompt: string): Promise<GenerateSlotsResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    },
  })
  const raw = JSON.parse(result.text ?? '')
  return GenerateSlotsResponseSchema.parse(raw)
}
