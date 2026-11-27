import { z } from 'zod'
import {
  formalDraftSchema,
  formalMethodRefSchema,
  formalSourceSchema,
} from '@/contracts/formal-methods'
import { requestJson } from '@/lib/common/api-client'
import { parseFormalReply } from './formal-methods'

export const archetypeIdSchema = z.enum(['S1', 'S2', 'S3', 'S4'])
export type ArchetypeId = z.infer<typeof archetypeIdSchema>

const slotVocabularySchema = z
  .object({
    vocab_version: z.string(),
    domains: z.array(z.object({ domain_id: z.string(), label: z.string() })),
    presets: z.array(z.string()),
    archetypes: z.array(archetypeIdSchema),
  })
  .loose()
export type SlotVocabulary = z.infer<typeof slotVocabularySchema>

const parentGapSchema = z
  .object({
    parent_method_id: z.string(),
    parent_revision: z.number().int().optional(),
    step_id: z.string(),
    node_id: z.string().nullable().optional(),
  })
  .loose()

const draftSummarySchema = z
  .object({
    method_id: z.uuid(),
    request_id: z.uuid().nullable(),
    revision: z.number().int().nonnegative(),
    archetype: archetypeIdSchema.nullable(),
    method_kind: z.enum(['tool', 'expert']),
    title: z.string(),
    purpose: z.string(),
    ready_to_freeze: z.boolean(),
    parent_gap: parentGapSchema.nullable().optional(),
    updated_at: z.string().nullable(),
  })
  .loose()
export type MethodDraftSummary = z.infer<typeof draftSummarySchema>

const projectedSlots = z
  .record(
    z.string(),
    z.object({
      slot: z.object({
        description: z.string(),
        required: z.boolean(),
        schema: z.record(z.string(), z.unknown()),
        meaning: z.record(z.string(), z.string()),
      }),
    }),
  )
  .transform((slots) =>
    Object.entries(slots).map(([name, { slot }]) => ({
      name,
      description: slot.description,
      required: slot.required,
      schema_type: typeof slot.schema.type === 'string' ? slot.schema.type : undefined,
      domain_id: slot.meaning.domain_id,
    })),
  )

const projectionSchema = z.object({
  public_inputs: projectedSlots,
  what_to_return: projectedSlots,
  missing_promise_sources: z.array(z.string()),
  ready_to_freeze: z.boolean(),
})

const methodDraftDetailSchema = z
  .object({
    method_id: z.uuid(),
    request_id: z.uuid().nullable(),
    workdraft_id: z.uuid(),
    revision: z.number().int().nonnegative(),
    draft_contract: z.record(z.string(), z.any()),
    projection: projectionSchema,
    formal_method: formalDraftSchema.nullable().optional(),
    public_contract: z.record(z.string(), z.any()).nullable(),
    definition_digest: z.string().nullable(),
    source: formalSourceSchema.nullable().optional(),
    allowed_callers: z.array(z.enum(['host', 'model'])).default(['host']),
    htn_state: z.record(z.string(), z.any()).nullable().optional(),
    parent_gap: parentGapSchema.nullable().optional(),
    provenance_verified: z.boolean(),
    provenance_issues: z.array(z.string()).default([]),
  })
  .loose()
  .transform((detail) => ({
    ...detail,
    projection: {
      ...detail.projection,
      unconfirmed_paths: z.array(z.string()).parse(detail.draft_contract.unconfirmed_paths ?? []),
    },
  }))
export type MethodDraftDetail = z.infer<typeof methodDraftDetailSchema>

export async function fetchSlotVocabulary() {
  return parseFormalReply(slotVocabularySchema, await requestJson('/api/web/v1/slot-vocabulary'))
}

export async function listMethodDrafts() {
  return parseFormalReply(
    z.object({ items: z.array(draftSummarySchema) }).loose(),
    await requestJson('/api/web/v1/method-drafts'),
  ).items
}

export async function createMethodDraft(
  body: {
    method_id?: string
    archetype: ArchetypeId
    method_kind: 'tool' | 'expert'
    title: string
    purpose?: string
    applies_when?: string[]
    excludes?: string[]
    source?: z.infer<typeof formalSourceSchema> | null
    allowed_callers?: ('host' | 'model')[]
  },
  csrfToken: string,
) {
  return parseFormalReply(
    methodDraftDetailSchema,
    await requestJson('/api/web/v1/method-drafts', {
      method: 'POST',
      csrfToken,
      body,
    }),
  )
}

export async function deleteMethodDraft(methodId: string, revision: number, csrfToken: string) {
  await requestJson<void>(`/api/web/v1/method-drafts/${encodeURIComponent(methodId)}?revision=${revision}`, {
    method: 'DELETE',
    csrfToken,
  })
}

export async function fetchMethodDraft(methodId: string) {
  return parseFormalReply(
    methodDraftDetailSchema,
    await requestJson(`/api/web/v1/method-drafts/${encodeURIComponent(methodId)}`),
  )
}

export async function patchMethodDraft(
  methodId: string,
  body: {
    revision: number
    elements?: Record<string, unknown>
    confirm_paths?: string[]
    source?: z.infer<typeof formalSourceSchema> | null
    allowed_callers?: ('host' | 'model')[]
    provenance_kind?: 'edit' | 'accept' | 'copy'
    suggestion_ref?: string | null
  },
  csrfToken: string,
) {
  return parseFormalReply(
    methodDraftDetailSchema,
    await requestJson(`/api/web/v1/method-drafts/${encodeURIComponent(methodId)}`, {
      method: 'PATCH',
      csrfToken,
      body,
    }),
  )
}

export async function ensureMethodDraftRuntimeAnchor(methodId: string, csrfToken: string) {
  return parseFormalReply(
    z.object({ request_id: z.uuid(), runtime: z.string() }).loose(),
    await requestJson(`/api/web/v1/method-drafts/${encodeURIComponent(methodId)}/runtime-anchor`, {
      method: 'POST',
      csrfToken,
      body: {},
    }),
  )
}

export async function spawnGapChild(
  parentMethodId: string,
  body: {
    revision: number
    step_id: string
    node_id?: string | null
    title: string
    purpose: string
    kind: 'tool' | 'expert'
    archetype?: ArchetypeId
  },
  csrfToken: string,
) {
  return parseFormalReply(
    methodDraftDetailSchema,
    await requestJson(
      `/api/web/v1/method-drafts/${encodeURIComponent(parentMethodId)}/gaps/spawn`,
      {
        method: 'POST',
        csrfToken,
        body,
      },
    ),
  )
}

export async function bindGapResolution(
  parentMethodId: string,
  body: {
    revision: number
    step_id: string
    child_reference: z.infer<typeof formalMethodRefSchema>
  },
  csrfToken: string,
) {
  return parseFormalReply(
    methodDraftDetailSchema,
    await requestJson(`/api/web/v1/method-drafts/${encodeURIComponent(parentMethodId)}/gaps/bind`, {
      method: 'POST',
      csrfToken,
      body,
    }),
  )
}
