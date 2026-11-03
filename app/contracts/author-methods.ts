import { z } from 'zod'

import {
  selectionSchema,
  stepSchema,
  methodExecutionSchema,
  ruleSchema,
  outputSchema,
  checkSchema,
} from './workdraft'

// Provider: knowlab methods.py and the existing web method-units routes.
export const methodsSchema = z.object({
  items: z.array(
    z.object({
      method_id: z.string().uuid(),
      latest_version: z.number().int().min(1).max(999999),
      created_at: z.string(),
      title: z.string().default(''),
      summary: z.string().default(''),
    }),
  ),
})

const definitionFields = {
  step: stepSchema.extend({ selection: selectionSchema }),
  input_schemas: z.record(z.string(), z.record(z.string(), z.unknown())),
}
export const methodDefinitionSchema = z.discriminatedUnion('schema', [
  z.object({ schema: z.literal('knowlab/method-definition/v1'), ...definitionFields }),
  z.object({
    schema: z.literal('knowlab/method-definition/v2'),
    ...definitionFields,
    input_required: z.record(z.string(), z.boolean()),
  }),
  z.object({
    schema: z.literal('knowlab/method-definition/v3'),
    title: z.string(),
    purpose: z.string(),
    procedure: z.string(),
    applies_when: z.string(),
    inputs: z.record(
      z.string(),
      z.object({
        schema: z.record(z.string(), z.unknown()),
        required: z.boolean(),
        description: z.string(),
      }),
    ),
    rules: z.array(ruleSchema),
    outputs: z.array(outputSchema),
    checks: z.array(checkSchema),
    output_schema: z.record(z.string(), z.unknown()),
  }),
])
export const methodVersionSchema = z.object({
  method_id: z.string().uuid(),
  version: z.number().int().min(1).max(999999),
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  definition: methodDefinitionSchema,
  provenance: z.record(z.string(), z.unknown()),
  created_at: z.string(),
})

export const bindingPreviewSchema = z.object({
  method_id: z.string().uuid(),
  version: z.number().int().min(1),
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  workdraft_revision: z.number().int().min(1),
  inputs: z.record(z.string(), z.string()),
  step: stepSchema,
  preview_only: z.literal(true),
})

export type MethodVersion = z.infer<typeof methodVersionSchema>
export type BindingPreview = z.infer<typeof bindingPreviewSchema>
export type BindMethodCommand = {
  request_id: string
  revision: number
  alias: string
  digest: string
  inputs: Record<string, string>
  required: boolean
  max_calls: number
  execution?: z.infer<typeof methodExecutionSchema>
}

export type FreezeMethodCommand = {
  request_id: string
  revision: number
  step_id: string
  input_slots: Record<string, string>
  definition_contract?: 'knowlab/method-definition/v3'
  input_fields?: Record<string, string[]>
  input_descriptions?: Record<string, string>
  applies_when?: string
}

/** Read-only presentation adapter. Never serialize this as a method definition. */
export function methodView(definition: MethodVersion['definition']) {
  if (definition.schema !== 'knowlab/method-definition/v3') return definition
  return {
    input_schemas: Object.fromEntries(
      Object.entries(definition.inputs).map(([k, v]) => [k, v.schema]),
    ),
    input_required: Object.fromEntries(
      Object.entries(definition.inputs).map(([k, v]) => [k, v.required]),
    ),
    step: {
      title: definition.title,
      does: definition.procedure,
      why: definition.purpose,
      uses: Object.keys(definition.inputs).sort(),
      rules: definition.rules,
      outputs: definition.outputs,
      checks: definition.checks,
      selection: { applies_when: definition.applies_when },
      ask_before: undefined,
      on_fail: undefined,
      advanced: { output_schema: definition.output_schema },
    },
  }
}
