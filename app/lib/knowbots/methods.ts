import {
  bindingPreviewSchema,
  methodsSchema,
  methodVersionSchema,
  type BindMethodCommand,
  type FreezeMethodCommand,
} from '@/contracts/author-methods'
import { workdraftSchema } from '@/contracts/workdraft'
import { requestJson } from '@/lib/common/api-client'
import { KnowbotContractError, parse } from './client'
import { same } from './workdraft'

const methodPath = (id: string, version: number) =>
  `/api/web/v1/method-units/${encodeURIComponent(id)}/versions/${version}`

export async function listMethods(offset = 0, limit = 30) {
  return parse(
    methodsSchema,
    await requestJson(`/api/web/v1/method-units?limit=${limit}&offset=${offset}`),
  ).items
}

export async function getMethodVersion(id: string, version: number) {
  const got = parse(methodVersionSchema, await requestJson(methodPath(id, version)))
  if (got.method_id !== id || got.version !== version) throw new KnowbotContractError()
  return got
}

export async function freezeMethod(
  id: string,
  version: number,
  command: FreezeMethodCommand,
  csrfToken: string,
) {
  const got = parse(
    methodVersionSchema,
    await requestJson(methodPath(id, version), { method: 'PUT', body: command, csrfToken }),
  )
  if (got.method_id !== id || got.version !== version) throw new KnowbotContractError()
  return got
}

export async function previewMethodBinding(
  id: string,
  version: number,
  command: BindMethodCommand,
  csrfToken: string,
) {
  const got = parse(
    bindingPreviewSchema,
    await requestJson(`${methodPath(id, version)}/preview-binding`, {
      method: 'POST',
      body: command,
      csrfToken,
    }),
  )
  if (
    got.method_id !== id ||
    got.version !== version ||
    got.digest !== command.digest ||
    got.workdraft_revision !== command.revision ||
    got.step.id !== command.alias ||
    !same(got.inputs, command.inputs) ||
    got.step.selection?.required !== command.required ||
    got.step.selection?.max_calls !== command.max_calls
  )
    throw new KnowbotContractError()
  return got
}

export async function bindMethod(
  id: string,
  version: number,
  command: BindMethodCommand,
  csrfToken: string,
) {
  const got = parse(
    workdraftSchema,
    await requestJson(`${methodPath(id, version)}/bind`, {
      method: 'POST',
      body: command,
      csrfToken,
    }),
  )
  const ref = got.body.method_refs?.[command.alias]
  const step = got.body.steps.find((s) => s.id === command.alias)
  if (
    got.request_id !== command.request_id ||
    !ref ||
    ref.method_id !== id ||
    ref.version !== version ||
    ref.digest !== command.digest ||
    !same(ref.inputs, command.inputs) ||
    step?.selection?.required !== command.required ||
    step?.selection?.max_calls !== command.max_calls
  )
    throw new KnowbotContractError()
  return got
}
