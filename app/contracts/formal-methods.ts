import { z } from 'zod'

// Provider: KnowLab formal_method.py / formal_method_admission.py.
// Runtime admission and semantic validation remain server responsibilities.
const text = z.string().min(1).max(20000).regex(/\S/)
const name = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const jsonObject = z.record(z.string(), z.unknown())
export const formalMethodRefSchema = z
  .object({
    method_id: z.uuid(),
    version: z.number().int().min(1),
    digest,
  })
  .strict()
const slot = z
  .object({
    description: text,
    schema: jsonObject,
    required: z.boolean(),
    meaning: z.record(name, text),
    on_missing: z.enum(['pause', 'fail', 'omit']),
  })
  .strict()
const implementation = z
  .object({
    kind: z.enum(['platform', 'mcp', 'skill_instruction', 'skill_script']),
    source: text,
    version: text,
    digest,
    entry: text,
    requirement_ids: z.array(name).max(30),
  })
  .strict()
const permission = z
  .object({
    requirement_id: text,
    capability_ref: text,
    version: text,
    operations: z.array(text).min(1).max(30),
    resources: z
      .array(
        z
          .object({
            resource_kind: z.literal('connector').default('connector'),
            resource_role: text,
            values: z.array(text).min(1).max(1000),
          })
          .strict(),
      )
      .max(30),
    data_transfer: z
      .object({
        destination: text,
        argument_fields: z.array(text).max(100),
        purpose: text,
      })
      .strict(),
    required_when: z.literal('always').default('always'),
    on_unavailable: z.literal('pause').default('pause'),
  })
  .strict()
const binding = z.discriminatedUnion('source', [
  z.object({ source: z.literal('caller'), name }).strict(),
  z.object({ source: z.literal('step'), step: name, output: name }).strict(),
  z.object({ source: z.literal('literal'), value: z.unknown() }).strict(),
  z.object({ source: z.literal('resource'), requirement_id: name, role: name }).strict(),
])
const step = z
  .object({
    id: name,
    candidates: z.array(formalMethodRefSchema).min(1).max(100),
    select_when: text,
    required_when: text,
    always_required: z.boolean(),
    depends_on: z.array(name).max(100),
    inputs: z.record(name, z.object({ slot, binding }).strict()),
    outputs: z.record(name, slot),
    on_failure: z.enum(['pause', 'fail']),
  })
  .strict()
export const formalDefinitionSchema = z
  .object({
    contract: z.literal('knowlab/formal-method/v1'),
    capability_declaration: z
      .object({
        title: text,
        purpose: text,
        applies_when: z.array(text).min(1).max(30),
        excludes: z.array(text).max(30),
        promises: z.record(name, text),
      })
      .strict(),
    access_requirements: z.array(permission).max(100),
    procedure: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('direct'),
          implementation,
          inputs: z.record(name, slot),
          outputs: z.record(name, slot),
          instructions: text,
          stop_conditions: z.array(text).min(1).max(30),
          max_model_turns: z.number().int().min(0).max(100),
        })
        .strict(),
      z
        .object({
          kind: z.literal('orchestration'),
          instructions: text,
          steps: z.array(step).min(1).max(100),
          exports: z.record(
            name,
            z
              .object({
                step: name,
                output: name,
                always_present: z.boolean(),
              })
              .strict(),
          ),
          max_depth: z.number().int().min(1).max(16),
          max_expansions: z.number().int().min(1).max(1000),
          max_steps: z.number().int().min(1).max(1000),
          max_replans: z.number().int().min(0).max(10),
        })
        .strict(),
    ]),
    how_to_validate: z
      .array(
        z
          .object({
            promise_id: name,
            outputs: z.array(name).min(1).max(100),
            check: text,
            evidence: text,
            on_failure: z.enum(['pause', 'fail']),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    what_requires_approval: z
      .array(
        z
          .object({
            requirement_id: name,
            operations: z.array(name).min(1).max(30),
            when: text,
            preview: z.array(name).min(1).max(100),
            on_denied: z.enum(['pause', 'fail']),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
export const formalSourceSchema = implementation
  .omit({ requirement_ids: true })
  .extend({
    asset_id: z.uuid().nullable(),
    asset_revision: z.number().int().min(1).nullable(),
    license_basis: text,
  })
  .strict()
export const formalDraftSchema = z
  .object({
    definition: formalDefinitionSchema,
    source: formalSourceSchema.nullable(),
    allowed_callers: z
      .array(z.enum(['host', 'model']))
      .min(1)
      .max(2),
  })
  .strict()
export type FormalDefinition = z.infer<typeof formalDefinitionSchema>
export type FormalSource = z.infer<typeof formalSourceSchema>
export type FormalDraft = z.infer<typeof formalDraftSchema>

const check = z.enum([
  'definition',
  'source',
  'dependencies',
  'authorization',
  'approval',
  'isolation',
  'outcome',
  'business',
])
export const formalReceiptSchema = z
  .object({
    contract: z.literal('knowlab/formal-method-validation/v1'),
    run_id: z.uuid(),
    owner_subject: text,
    request_id: z.uuid(),
    workdraft_id: z.uuid(),
    revision: z.number().int().min(1),
    method_id: z.uuid(),
    definition_digest: digest,
    source_digest: digest.nullable(),
    dependencies: z.array(formalMethodRefSchema),
    checks: z.array(check).min(1).max(8),
    uncovered: z.array(z.object({ scenario: text, reason: text, scope: text }).strict()),
    completed_at: z.string(),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.checks).size === value.checks.length &&
      [
        'definition',
        'source',
        'dependencies',
        'authorization',
        'approval',
        'isolation',
        'outcome',
      ].every((required) => (value.checks as string[]).includes(required)) &&
      (value.checks.includes('business') || value.uncovered.length > 0),
  )
export const formalValidationSchema = z
  .object({
    contract: z.literal('knowlab/formal-method-validation/v1'),
    run_id: z.uuid(),
    status: z.enum(['pending', 'passed', 'failed', 'cancelled']),
    receipt: formalReceiptSchema.nullable(),
    missing_checks: z.array(check),
    details: z.array(z.string()),
  })
  .strict()
  .refine((value) => (value.status === 'passed') === (value.receipt !== null))
export const formalVersionSchema = z.object({
  method_id: z.uuid(),
  version: z.number().int().min(1),
  digest,
  definition: formalDefinitionSchema,
  provenance: z
    .object({
      method_kind: z.enum(['tool', 'expert', 'expert_team']),
      dispatch: z.enum(['direct', 'orchestration']),
      interfaces: z
        .object({
          inputs: z.record(
            name,
            z
              .object({
                slot,
                required_by: z.array(z.string()),
                used_by: z.array(z.string()).optional(),
              })
              .strict(),
          ),
          outputs: z.record(name, z.object({ slot, always_present: z.boolean() }).strict()),
        })
        .strict(),
    })
    .loose(),
  created_at: z.string(),
})
export const formalSourcesSchema = z.object({ items: z.array(formalSourceSchema) }).strict()
export const formalMethodsSchema = z
  .object({
    items: z.array(
      z
        .object({
          method_id: z.uuid(),
          latest_version: z.number().int().min(1),
          digest,
          method_kind: z.enum(['tool', 'expert', 'expert_team']),
          title: z.string(),
          summary: z.string(),
          created_at: z.string(),
        })
        .strict(),
    ),
  })
  .strict()
export type FormalValidation = z.infer<typeof formalValidationSchema>
export type FormalVersion = z.infer<typeof formalVersionSchema>
