'use client'

import type { z } from 'zod'

import {
  applicationsSchema,
  countsSchema,
  detailSchema,
  expertMovedSchema,
  expertsSchema,
  inboxSchema,
  myDataSchema,
  outputsSchema,
  questionsSchema,
  reviewedSchema,
  runtimesSchema,
  sentSchema,
  submittedSchema,
  uploadedSchema,
  type Application,
  type Counts,
  type Dataset,
  type Detail,
  type ExpertItem,
  type ExpertStage,
  type Inbox,
  type KnowbotRequestIn,
  type MyData,
  type MyQuestion,
  type Outputs,
  type RevisionIn,
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

const BASE = '/api/web/v1'
const enc = encodeURIComponent

// ---------- 三栏与详情页（SDD 0037 第八、第九节） ----------
export async function fetchCounts(): Promise<Counts> {
  const { inbox, experts_new } = parse(countsSchema, await requestJson(`${BASE}/knowbot-counts`))
  return { inbox, experts_new }
}

export async function fetchApplications(): Promise<Application[]> {
  return parse(applicationsSchema, await requestJson(`${BASE}/knowbot-board/applications`)).items
}

export async function fetchInbox(): Promise<Inbox> {
  return parse(inboxSchema, await requestJson(`${BASE}/knowbot-board/inbox`))
}

export async function fetchExperts(): Promise<ExpertItem[]> {
  return parse(expertsSchema, await requestJson(`${BASE}/knowbot-board/experts`)).items
}

// 我的一个名称的详情页；不是自己的回 404
export async function fetchDetail(requestId: string): Promise<Detail> {
  return parse(detailSchema, await requestJson(`${BASE}/knowbot-requests/${enc(requestId)}`))
}

// ---------- 申请与修改 ----------
export async function fetchRuntimes(): Promise<string[]> {
  return parse(runtimesSchema, await requestJson(`${BASE}/knowbot-runtimes`)).runtimes
}

export async function submitRequest(body: KnowbotRequestIn, csrfToken: string): Promise<string> {
  const answer = await requestJson(`${BASE}/knowbot-requests`, {
    method: 'POST',
    csrfToken,
    body,
  })
  return parse(submittedSchema, answer).request_id
}

// 改创意：出一个新版本（名称不变，旧版本不变）
export async function reviseRequest(
  requestId: string,
  body: RevisionIn,
  csrfToken: string,
): Promise<number> {
  const answer = await requestJson(`${BASE}/knowbot-requests/${enc(requestId)}/versions`, {
    method: 'POST',
    csrfToken,
    body,
  })
  return parse(submittedSchema, answer).version
}

// 同意新一版测试数据说明（SDD 0037）：之后测试的成稿与各步结果才取、才显示
export async function acceptConsent(requestId: string, csrfToken: string): Promise<void> {
  await requestJson(`${BASE}/knowbot-requests/${enc(requestId)}/consent`, {
    method: 'POST',
    csrfToken,
  })
}

// ---------- 审核：准专家、专家 ----------
export async function reviewDraft(
  draftId: string,
  body: { ok: boolean; note: string },
  csrfToken: string,
): Promise<void> {
  parse(
    reviewedSchema,
    await requestJson(`${BASE}/knowbot-drafts/${enc(draftId)}/review`, {
      method: 'POST',
      csrfToken,
      body,
    }),
  )
}

// 用户同意门：要这一版 / 不要
export async function decideExpert(
  expertId: string,
  accept: boolean,
  csrfToken: string,
): Promise<ExpertStage> {
  const answer = await requestJson(`${BASE}/knowbot-experts/${enc(expertId)}/decision`, {
    method: 'POST',
    csrfToken,
    body: { accept },
  })
  return parse(expertMovedSchema, answer).stage
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

// 一次测试每条用例的成稿与各步交回物（验收依据，C-L3）
export async function fetchOutputs(testId: string): Promise<Outputs> {
  return parse(outputsSchema, await requestJson(`${BASE}/knowbot-tests/${enc(testId)}/outputs`))
}

// ---------- 知识库 ----------
const DATASETS = `${BASE}/knowbot-datasets`

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
  await requestJson(`${DATASETS}/${enc(datasetId)}`, { method: 'DELETE', csrfToken })
}

// ---------- 测试中转给我的问题 ----------
const QUESTIONS = `${BASE}/knowbot-questions`

export async function fetchMyQuestions(): Promise<MyQuestion[]> {
  return parse(questionsSchema, await requestJson(QUESTIONS)).questions
}

export async function answerMyQuestion(
  questionId: string,
  answer: { option_id?: string; text?: string },
  csrfToken: string,
): Promise<void> {
  parse(
    sentSchema,
    await requestJson(`${QUESTIONS}/${enc(questionId)}/answer`, {
      method: 'POST',
      csrfToken,
      body: answer,
    }),
  )
}
