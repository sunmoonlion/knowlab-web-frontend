import type { FormalDefinition } from '@/contracts/formal-methods'
import { z } from 'zod'
import {
  sharedToolInterfaceSchema,
  formalSourcesSchema,
  formalMethodsSchema,
  formalValidationSchema,
  formalVersionSchema,
  formalMethodRefSchema,
} from '@/contracts/formal-methods'
import { requestJson } from '@/lib/common/api-client'
import { KnowbotContractError, parse } from './client'

export function parseFormalReply<T>(schema: z.ZodType<T>, value: unknown): T {
  if (value && typeof value === 'object' && 'contract_version' in value) {
    const { contract_version, ...body } = value
    if (contract_version !== 1) throw new KnowbotContractError()
    return parse(schema, body)
  }
  return parse(schema, value)
}

const methodPath = (id: string) => `/api/web/v1/method-units/${encodeURIComponent(id)}`
export async function listFormalMethods(offset = 0, requestId?: string) {
  return parseFormalReply(
    formalMethodsSchema,
    await requestJson(
      `/api/web/v1/method-units?formal=true&limit=30&offset=${offset}${requestId ? '&request_id=' + encodeURIComponent(requestId) : ''}`,
    ),
  ).items
}

const sharedToolsPage = z.object({
  items: z.array(
    z.object({
      reference: formalMethodRefSchema,
      title: z.string(),
      scope: z.enum(['acquired', 'platform']),
      interface: sharedToolInterfaceSchema.optional(),
      installations: z
        .array(
          z.object({
            asset_id: z.uuid(),
            revision: z.number().int().positive(),
            name: z.string(),
            account: z.string().nullable(),
          }),
        )
        .default([]),
      selected: z.uuid().nullable().optional(),
    }),
  ),
  next: z.uuid().nullable(),
})
export async function sharedIncubationTools(
  requestId: string,
  after: string | null,
  ref?: z.infer<typeof formalMethodRefSchema>,
) {
  const base = `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/incubation-tools`
  const suffix = ref
    ? `/${encodeURIComponent(ref.method_id)}/versions/${ref.version}?digest=${encodeURIComponent(ref.digest)}`
    : after
      ? `?after=${encodeURIComponent(after)}`
      : ''
  const page = parseFormalReply(sharedToolsPage, await requestJson(base + suffix))
  if (
    ref &&
    page.items.some(
      (item) =>
        item.reference.method_id !== ref.method_id ||
        item.reference.version !== ref.version ||
        item.reference.digest !== ref.digest,
    )
  )
    throw new KnowbotContractError()
  return page
}

export async function chooseToolInstallation(
  requestId: string,
  reference: z.infer<typeof formalMethodRefSchema>,
  installation: { asset_id: string; revision: number },
  csrfToken: string,
) {
  const receipt = parseFormalReply(
    z.object({ reference: formalMethodRefSchema, asset_id: z.uuid(), revision: z.number().int() }),
    await requestJson(
      `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/incubation-tools/${reference.method_id}/versions/${reference.version}/installation`,
      {
        method: 'PUT',
        csrfToken,
        body: {
          digest: reference.digest,
          asset_id: installation.asset_id,
          revision: installation.revision,
        },
      },
    ),
  )
  if (
    receipt.asset_id !== installation.asset_id ||
    receipt.revision !== installation.revision ||
    receipt.reference.method_id !== reference.method_id ||
    receipt.reference.version !== reference.version ||
    receipt.reference.digest !== reference.digest
  )
    throw new KnowbotContractError()
}

export async function getFormalVersion(id: string, version: number) {
  const result = parseFormalReply(
    formalVersionSchema,
    await requestJson(`${methodPath(id)}/formal-versions/${version}`),
  )
  if (result.method_id !== id || result.version !== version) throw new KnowbotContractError()
  return result
}
export async function submitSelfListing(
  reference: z.infer<typeof formalMethodRefSchema>,
  csrfToken: string,
) {
  const receipt = parseFormalReply(
    z.object({
      listing_id: z.uuid(),
      reference: formalMethodRefSchema,
      scope: z.literal('self'),
      status: z.enum(['pending', 'listed', 'withdrawn', 'rejected']),
    }),
    await requestJson(
      `${methodPath(reference.method_id)}/formal-versions/${reference.version}/self-listing`,
      {
        method: 'PUT',
        body: { digest: reference.digest },
        csrfToken,
      },
    ),
  )
  if (
    receipt.reference.method_id !== reference.method_id ||
    receipt.reference.version !== reference.version ||
    receipt.reference.digest !== reference.digest
  )
    throw new KnowbotContractError()
  return receipt.status
}

export type ValidationCommand = { request_id: string; revision: number; run_id: string }

export async function formalSources(requestId: string) {
  return parseFormalReply(
    formalSourcesSchema,
    await requestJson(
      `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/formal-method-sources`,
    ),
  ).items
}

function checkedValidation(value: unknown, methodId: string, command: ValidationCommand) {
  const result = parseFormalReply(formalValidationSchema, value)
  const receipt = result.receipt
  if (
    result.run_id !== command.run_id ||
    (receipt &&
      (receipt.run_id !== command.run_id ||
        receipt.method_id !== methodId ||
        receipt.request_id !== command.request_id ||
        receipt.revision !== command.revision))
  )
    throw new KnowbotContractError()
  return result
}

export async function validateFormalMethod(
  id: string,
  command: ValidationCommand,
  csrfToken: string,
) {
  return checkedValidation(
    await requestJson(`${methodPath(id)}/validations`, {
      method: 'POST',
      body: command,
      csrfToken,
    }),
    id,
    command,
  )
}

export async function formalValidation(id: string, command: ValidationCommand) {
  return checkedValidation(
    await requestJson(
      `${methodPath(id)}/validations/${encodeURIComponent(command.run_id)}?request_id=${encodeURIComponent(command.request_id)}`,
    ),
    id,
    command,
  )
}

export async function freezeFormalMethod(
  id: string,
  version: number,
  command: ValidationCommand & { visibility: 'private' | 'public' },
  csrfToken: string,
) {
  const result = parseFormalReply(
    formalVersionSchema,
    await requestJson(`${methodPath(id)}/formal-versions/${version}`, {
      method: 'PUT',
      body: command,
      csrfToken,
    }),
  )
  if (result.method_id !== id || result.version !== version) throw new KnowbotContractError()
  return result
}

const outputMatch = z.object({
  reference: formalMethodRefSchema,
  output: z.string(),
  title: z.string(),
})
export async function matchingToolOutputs(
  requestId: string,
  target: string,
  slot: unknown,
  page: number | string | null,
  csrfToken: string,
) {
  return parseFormalReply(
    z.object({
      items: z.array(outputMatch),
      next: (typeof page === 'number' ? z.number().int().nonnegative() : z.uuid()).nullable(),
    }),
    await requestJson(
      `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/incubation-tools/matching-outputs`,
      {
        method: 'POST',
        csrfToken,
        body: {
          slot,
          exclude_method_id: target,
          ...(typeof page === 'number' ? { offset: page } : { directory: 'shared', after: page }),
        },
      },
    ),
  )
}

const scanReply = z.object({
  reason: z.enum(['matches', 'continue', 'no_progress', 'budget', 'busy', 'already_read']),
  has_more: z.boolean(),
  pages_read: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(100),
  items: z.array(outputMatch),
})

export async function scanToolOutputs(
  requestId: string,
  target: string,
  slot: unknown,
  shared: boolean,
  limit: number,
  excluded: z.infer<typeof formalMethodRefSchema>[],
  csrfToken: string,
  signal: AbortSignal,
) {
  for (let count = 0; count < limit; count++) {
    signal.throwIfAborted()
    const page = parseFormalReply(
      scanReply,
      await requestJson(
        `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/incubation-tools/scan-outputs`,
        {
          method: 'POST',
          csrfToken,
          signal,
          body: {
            slot,
            exclude_method_id: target,
            directory: shared ? 'shared' : 'owned',
            page_limit: limit,
            action_id: crypto.randomUUID(),
          },
        },
      ),
    )
    const items = page.items.filter(
      ({ reference }) =>
        !excluded.some(
          (ref) =>
            ref.method_id === reference.method_id &&
            ref.version === reference.version &&
            ref.digest === reference.digest,
        ),
    )
    if (page.limit !== limit) throw new KnowbotContractError()
    if (items.length || (page.reason !== 'matches' && page.reason !== 'continue'))
      return { ...page, items, next: null }
    if (page.reason === 'matches' && !page.has_more)
      return { ...page, items, reason: 'no_progress' as const, next: null }
    if (page.used >= limit) return { ...page, items, reason: 'budget' as const, next: null }
  }
  throw new KnowbotContractError()
}

const sampleColumn = z.object({
  material_id: z.string(),
  version_no: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  sheet: z.string().max(255),
  column: z.string().min(1).max(200),
})
export async function checkSampleColumn(
  requestId: string,
  pin: z.infer<typeof sampleColumn>,
  csrfToken: string,
  signal: AbortSignal,
) {
  const result = parseFormalReply(
    sampleColumn.extend({ status: z.enum(['present', 'missing', 'unknown']) }),
    await requestJson(
      `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/workdraft/column-check`,
      {
        method: 'POST',
        csrfToken,
        body: pin,
        signal,
      },
    ),
  )
  if (
    result.material_id !== pin.material_id ||
    result.version_no !== pin.version_no ||
    result.sha256 !== pin.sha256 ||
    result.sheet !== pin.sheet ||
    result.column !== pin.column
  )
    throw new KnowbotContractError()
  return result
}

export async function previewCandidateChoice(
  requestId: string,
  methodId: string,
  revision: number,
  definition: FormalDefinition,
  csrfToken: string,
) {
  const result = parseFormalReply(
    z
      .object({
        fits: z.boolean(),
        depth: z.number().int().positive(),
        steps: z.number().int().positive(),
        expansions: z.number().int().positive(),
        revision: z.number().int().nonnegative(),
      })
      .strict(),
    await requestJson(
      `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/workdraft/candidate-preview`,
      { method: 'POST', csrfToken, body: { method_id: methodId, revision, definition } },
    ),
  )
  if (result.revision !== revision) throw new KnowbotContractError()
  return result
}
