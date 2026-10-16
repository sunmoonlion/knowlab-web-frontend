'use client'

import type { z } from 'zod'

import {
  myDataSchema,
  myRequestsSchema,
  runtimesSchema,
  submittedSchema,
  uploadedSchema,
  type Dataset,
  type KnowbotRequestIn,
  type MyData,
  type MyRequests,
} from '@/contracts/knowbots'
import { ApiClientError, requestJson } from '@/lib/common/api-client'

export class KnowbotContractError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('knowbot_contract_invalid')
    this.name = 'KnowbotContractError'
    if (options?.cause !== undefined) this.cause = options.cause
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new KnowbotContractError({ cause: parsed.error })
  return parsed.data
}

export async function fetchMyRequests(): Promise<MyRequests> {
  return parse(myRequestsSchema, await requestJson('/api/web/v1/knowbot-requests'))
}

export async function fetchRuntimes(): Promise<string[]> {
  return parse(runtimesSchema, await requestJson('/api/web/v1/knowbot-runtimes')).runtimes
}

export async function submitRequest(body: KnowbotRequestIn, csrfToken: string): Promise<string> {
  const answer = await requestJson('/api/web/v1/knowbot-requests', {
    method: 'POST',
    csrfToken,
    body,
  })
  return parse(submittedSchema, answer).request_id
}

const DATASETS = '/api/web/v1/knowbot-datasets'

export async function fetchMyData(): Promise<MyData> {
  return parse(myDataSchema, await requestJson(DATASETS))
}

// 上传是表单数据，不走 JSON 封装；同源、带 CSRF，错误照样给出后端的 code
export async function uploadDataset(file: File, csrfToken: string): Promise<Dataset> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(DATASETS, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'manual',
    body: form,
    headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken },
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { code?: unknown }).code === 'string'
        ? (payload as { code: string }).code
        : 'request_failed'
    throw new ApiClientError(response.status, {
      code,
      message_key: 'errors.requestFailed',
      retryable: false,
      correlation_id: '',
    })
  }
  return parse(uploadedSchema, payload).dataset
}

export async function deleteDataset(datasetId: string, csrfToken: string): Promise<void> {
  await requestJson(`${DATASETS}/${encodeURIComponent(datasetId)}`, {
    method: 'DELETE',
    csrfToken,
  })
}
