'use client'

import type { z } from 'zod'

import {
  amendedSchema,
  answeredSchema,
  draftDetailSchema,
  myDataSchema,
  myKnowbotsSchema,
  myQuestionsSchema,
  myRequestsSchema,
  outputsSchema,
  requestDetailSchema,
  runtimesSchema,
  submittedSchema,
  uploadedSchema,
  type Dataset,
  type DraftDetail,
  type Knowbot,
  type KnowbotRequestIn,
  type MyData,
  type MyQuestion,
  type MyRequests,
  type Outputs,
  type RequestDetail,
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

const enc = encodeURIComponent

// 我的一个创意：方法原文与用例（SDD 0037）；不是自己的回 404
export async function fetchRequestDetail(requestId: string): Promise<RequestDetail> {
  return parse(
    requestDetailSchema,
    await requestJson(`/api/web/v1/knowbot-requests/${enc(requestId)}`),
  )
}

// 我的一个分身：状态、测试结果、规则出处
export async function fetchDraftDetail(draftId: string): Promise<DraftDetail> {
  return parse(draftDetailSchema, await requestJson(`/api/web/v1/knowbot-drafts/${enc(draftId)}`))
}

// 这个分身最近一次测试每条用例的成稿与各步交回物
export async function fetchOutputs(draftId: string): Promise<Outputs> {
  return parse(
    outputsSchema,
    await requestJson(`/api/web/v1/knowbot-drafts/${enc(draftId)}/outputs`),
  )
}

// 做出来的专家（交付了的各版）
export async function fetchMyKnowbots(): Promise<Knowbot[]> {
  return parse(myKnowbotsSchema, await requestJson('/api/web/v1/knowbots')).knowbots
}

// 给自己的创意写一条补充方法（SDD 0035）：写下后不能改，要撤回就再写一条
export async function amendRequest(
  requestId: string,
  text: string,
  csrfToken: string,
): Promise<string> {
  const answer = await requestJson(
    `/api/web/v1/knowbot-requests/${encodeURIComponent(requestId)}/amendments`,
    { method: 'POST', csrfToken, body: { text } },
  )
  return parse(amendedSchema, answer).amendment_id
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

const QUESTIONS = '/api/web/v1/knowbot-questions'

export async function fetchMyQuestions(): Promise<MyQuestion[]> {
  return parse(myQuestionsSchema, await requestJson(QUESTIONS)).questions
}

export async function answerMyQuestion(
  questionId: string,
  answer: { option_id?: string; text?: string },
  csrfToken: string,
): Promise<void> {
  parse(
    answeredSchema,
    await requestJson(`${QUESTIONS}/${encodeURIComponent(questionId)}/answer`, {
      method: 'POST',
      csrfToken,
      body: answer,
    }),
  )
}
