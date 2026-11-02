import { z } from 'zod'

// A choice on an idea is a shortlist. Input bindings belong to the workdraft.
export const methodChoiceSchema = z.object({
  method_id: z.string().uuid(),
  version: z.number().int().min(1).max(999999),
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
})
export type MethodChoice = z.infer<typeof methodChoiceSchema>
