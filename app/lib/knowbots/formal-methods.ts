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

const methodPath = (id: string) => `/api/web/v1/method-units/${encodeURIComponent(id)}`
export async function listFormalMethods(offset = 0) {
  return parse(
    formalMethodsSchema,
    await requestJson(`/api/web/v1/method-units?formal=true&limit=30&offset=${offset}`),
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
  const page = parse(sharedToolsPage, await requestJson(base + suffix))
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
  const receipt = parse(
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
  const result = parse(
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
  const receipt = parse(
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
  return parse(
    formalSourcesSchema,
    await requestJson(
      `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/formal-method-sources`,
    ),
  ).items
}

function checkedValidation(value: unknown, methodId: string, command: ValidationCommand) {
  const result = parse(formalValidationSchema, value)
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
  const result = parse(
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
