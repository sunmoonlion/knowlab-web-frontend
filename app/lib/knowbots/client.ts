'use client'

import type { z } from 'zod'

import {
  myRequestsSchema,
  runtimesSchema,
  submittedSchema,
  type KnowbotRequestIn,
  type MyRequests,
} from '@/contracts/knowbots'
import { requestJson } from '@/lib/common/api-client'

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
