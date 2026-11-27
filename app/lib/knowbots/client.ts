'use client'

import { z } from 'zod'

import {
  computersSchema,
  expertMovedSchema,
  expertsSchema,
  librarySchema,
  type Computers,
  type ExpertItem,
  type ExpertStage,
  type Material,
} from '@/contracts/knowbots'

import { oneRoundSchema, roundsSchema, type Round, type RoundStart } from '@/contracts/workdraft'

import { requestJson } from '@/lib/common/api-client'

export class KnowbotContractError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('knowbot_contract_invalid')
    this.name = 'KnowbotContractError'
    if (options?.cause !== undefined) this.cause = options.cause
  }
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new KnowbotContractError({ cause: parsed.error })
  return parsed.data
}

const BASE = '/api/web/v1'

const enc = encodeURIComponent

export async function fetchExperts(): Promise<ExpertItem[]> {
  return parse(expertsSchema, await requestJson(`${BASE}/method-directory/listed-experts`)).items
}

export async function fetchLibrary(): Promise<Material[]> {
  return parse(librarySchema, await requestJson(`${BASE}/knowbot-library`)).materials
}

export async function stopExpert(
  expertId: string,
  reason: string,
  csrfToken: string,
): Promise<ExpertStage> {
  const answer = await requestJson(`${BASE}/knowbot-experts/${enc(expertId)}/stop`, {
    method: 'POST',
    csrfToken,
    body: { reason },
  })
  return parse(expertMovedSchema, answer).stage
}

const workdraftOf = (requestId: string) => `${BASE}/knowbot-requests/${enc(requestId)}/workdraft`

const roundsOf = (requestId: string) => `${workdraftOf(requestId)}/incubations`

export async function fetchRoundComputers(requestId: string): Promise<Computers> {
  return parse(computersSchema, await requestJson(`${workdraftOf(requestId)}/computers`))
}

export async function fetchRounds(requestId: string): Promise<Round[]> {
  return parse(roundsSchema, await requestJson(roundsOf(requestId))).incubations
}

export async function startRound(
  requestId: string,
  body: RoundStart,
  csrfToken: string,
): Promise<Round> {
  return parse(
    oneRoundSchema,
    await requestJson(roundsOf(requestId), { method: 'POST', csrfToken, body }),
  ).incubation
}

export async function fetchRound(requestId: string, roundId: string): Promise<Round> {
  return parse(oneRoundSchema, await requestJson(`${roundsOf(requestId)}/${enc(roundId)}`))
    .incubation
}

export async function refreshRound(
  requestId: string,
  roundId: string,
  csrfToken: string,
): Promise<Round> {
  return parse(
    oneRoundSchema,
    await requestJson(`${roundsOf(requestId)}/${enc(roundId)}/refresh`, {
      method: 'POST',
      csrfToken,
    }),
  ).incubation
}

export async function cancelRound(
  requestId: string,
  roundId: string,
  csrfToken: string,
): Promise<Round> {
  return parse(
    oneRoundSchema,
    await requestJson(`${roundsOf(requestId)}/${enc(roundId)}/cancel`, {
      method: 'POST',
      csrfToken,
    }),
  ).incubation
}

export async function confirmSelection(
  requestId: string,
  roundId: string,
  body: {
    revision: number
    method_id: string
    confirmed: true
    confirm_brief: boolean
    cases: Record<string, string[]>
    template: import('@/contracts/workdraft').MethodTemplate
    step_text: Record<string, string>
  },
  csrfToken: string,
) {
  return parse(
    z.object({ revision: z.number().int().nonnegative() }),
    await requestJson(`${roundsOf(requestId)}/${enc(roundId)}/confirm-selection`, {
      method: 'POST',
      csrfToken,
      body,
    }),
  )
}
