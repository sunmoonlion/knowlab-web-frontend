import {
  formalSourcesSchema,
  formalMethodsSchema,
  formalValidationSchema,
  formalVersionSchema,
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

export async function getFormalVersion(id: string, version: number) {
  const result = parse(
    formalVersionSchema,
    await requestJson(`${methodPath(id)}/formal-versions/${version}`),
  )
  if (result.method_id !== id || result.version !== version) throw new KnowbotContractError()
  return result
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
