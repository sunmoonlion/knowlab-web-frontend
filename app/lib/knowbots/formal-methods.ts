import { z } from 'zod'
import { directoryBrowseSchema, type Facet } from '@/lib/directory-facets'
import {
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
      `/api/web/v1/method-units?limit=30&offset=${offset}${requestId ? '&request_id=' + encodeURIComponent(requestId) : ''}`,
    ),
  ).items
}

export async function browseIncubationDirectory(
  scene: 'owned' | 'shared',
  facet: Facet,
  offset: number,
  requestId?: string,
) {
  const params = new URLSearchParams({ kind: facet.kind, offset: String(offset) })
  if (facet.group) params.set('category', facet.category || facet.group)
  if (requestId) params.set('request_id', requestId)
  return parseFormalReply(
    directoryBrowseSchema,
    await requestJson(`/api/web/v1/method-directory/browse/${scene}?${params}`),
  )
}

const sharedToolsPage = z.object({
  items: z.array(
    z.object({
      reference: formalMethodRefSchema,
      title: z.string(),
      scope: z.enum(['acquired', 'platform']),
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
export async function sharedIncubationTools(requestId: string | undefined, after: string | null) {
  const base = requestId
    ? `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/incubation-tools`
    : '/api/web/v1/method-directory/shared-tools'
  const suffix = after ? `?after=${encodeURIComponent(after)}` : ''
  return parseFormalReply(sharedToolsPage, await requestJson(base + suffix))
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

export async function planningCapabilities(requestId: string) {
  return parseFormalReply(
    z.object({ digest: z.string(), patterns: z.record(z.string(), z.boolean()) }),
    await requestJson(
      `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/planning-capabilities`,
    ),
  )
}

export async function formalSources(requestId?: string) {
  return parseFormalReply(
    formalSourcesSchema,
    await requestJson(
      requestId
        ? `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/formal-method-sources`
        : '/api/web/v1/method-directory/sources',
    ),
  ).items
}

const registeredSourceReceiptSchema = z.object({
  source: z
    .object({
      source_id: z.uuid(),
      version: z.number().int().positive(),
      kind: z.enum(['script', 'instruction']),
      name: z.string(),
      digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .loose(),
})

export async function registerDirectorySource(
  sourceId: string,
  version: number,
  body: {
    kind: 'script' | 'instruction'
    name: string
    content: string
    request_id?: string
  },
  csrfToken: string,
) {
  return parseFormalReply(
    registeredSourceReceiptSchema,
    await requestJson(
      `/api/web/v1/method-directory/sources/${encodeURIComponent(sourceId)}/versions/${version}`,
      {
        method: 'PUT',
        csrfToken,
        body,
      },
    ),
  ).source
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
  if (!Number.isInteger(version) || version < 1 || version > 999999)
    throw new KnowbotContractError()
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
