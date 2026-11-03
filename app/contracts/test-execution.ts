import { z } from 'zod'
import { caseOutputsSchema } from './knowbots'

export const testExecutionSchema = z.object({
  contract: z.literal('knowbot-test-execution/v1'),
  run_id: z.string(),
  status: z.string(),
  cases: z.array(
    z.object({
      case_id: z.string(),
      state: z.string(),
      waiting_reason: z.string().nullable().optional(),
      title: z.string().default(''),
      activity: z.string().default(''),
      since: z.string().nullable().optional(),
      last_event_at: z.string().nullable().optional(),
      spent: z.string(),
      plan: z
        .object({
          version: z.number().nullable(),
          planning: z.boolean(),
          reason: z.string().nullable(),
        })
        .nullable()
        .optional(),
      steps: z.array(
        z.object({
          step_id: z.string(),
          index: z.number(),
          title: z.string(),
          status: z.string(),
          selection_reason: z.string().nullable().optional(),
          attempts: z.number(),
          spent: z.string(),
          tools: z.record(z.string(), z.number()),
          latest_activity: z.array(
            z.object({ at: z.string().nullable(), name: z.string(), ok: z.boolean() }),
          ),
        }),
      ),
      outputs: caseOutputsSchema.nullable().optional(),
    }),
  ),
})
