'use client'

import type { z } from 'zod'

import {
  applicationsSchema,
  computersSchema,
  countsSchema,
  detailSchema,
  expertMovedSchema,
  expertsSchema,
  inboxSchema,
  outputsSchema,
  questionsSchema,
  reviewedSchema,
  runtimesSchema,
  selfTestSchema,
  sentSchema,
  submittedSchema,
  testDataAnsweredSchema,
  testDataSchema,
  type Application,
  type Computers,
  type Counts,
  type Detail,
  type ExpertItem,
  type ExpertStage,
  type Inbox,
  type KnowbotRequestIn,
  type MyQuestion,
  type Outputs,
  type RevisionIn,
  type TestDataRequest,
} from '@/contracts/knowbots'
import {
  decidedSchema,
  oneRoundSchema,
  previewSchema,
  publishedSchema,
  roundsSchema,
  seededSchema,
  workdraftSchema,
  type CellEdit,
  type Decision,
  type Preview,
  type Published,
  type Round,
  type RoundStart,
  type Workdraft,
} from '@/contracts/workdraft'
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

// ---------- 测试中转给我的问题 ----------
const QUESTIONS = `${BASE}/knowbot-questions`

export async function fetchMyQuestions(): Promise<MyQuestion[]> {
  return parse(questionsSchema, await requestJson(QUESTIONS)).questions
}

export async function answerMyQuestion(
  questionId: string,
  answer: { option_id?: string; text?: string; decision?: 'approve' | 'deny' },
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

// ---------- 自助测试与测试里的数据（SDD 0046 第三节，decisions ⑭） ----------
export async function fetchComputers(draftId: string): Promise<Computers> {
  return parse(
    computersSchema,
    await requestJson(`${BASE}/knowbot-drafts/${enc(draftId)}/computers`),
  )
}

export async function startSelfTest(
  draftId: string,
  body: { environment_id: string; workspace_root: string; budget_limit: string },
  csrfToken: string,
): Promise<string> {
  return parse(
    selfTestSchema,
    await requestJson(`${BASE}/knowbot-drafts/${enc(draftId)}/self-tests`, {
      method: 'POST',
      csrfToken,
      body,
    }),
  ).test_id
}

export async function refreshMyTest(testId: string, csrfToken: string): Promise<void> {
  await requestJson(`${BASE}/knowbot-tests/${enc(testId)}/refresh`, { method: 'POST', csrfToken })
}

export async function fetchTestData(testId: string): Promise<TestDataRequest[]> {
  return parse(testDataSchema, await requestJson(`${BASE}/knowbot-tests/${enc(testId)}/data`))
    .requests
}

export type TestDataChoice = {
  picks?: Record<string, { material_id: string; version_no: number }>
  dropped?: string[]
  needs?: Record<string, unknown>[]
}

export async function confirmTestData(
  questionId: string,
  body: TestDataChoice,
  csrfToken: string,
): Promise<string> {
  return parse(
    testDataAnsweredSchema,
    await requestJson(`${BASE}/knowbot-test-data/${enc(questionId)}/confirm`, {
      method: 'POST',
      csrfToken,
      body,
    }),
  ).status
}

export async function declineTestData(questionId: string, csrfToken: string): Promise<string> {
  return parse(
    testDataAnsweredSchema,
    await requestJson(`${BASE}/knowbot-test-data/${enc(questionId)}/decline`, {
      method: 'POST',
      csrfToken,
    }),
  ).status
}

// ---------- 工作稿（专家孵化方案第五至十一节） ----------
const workdraftOf = (requestId: string) => `${BASE}/knowbot-requests/${enc(requestId)}/workdraft`

// 这个名称的工作稿；还没存过的是空的一份（revision 0）
export async function fetchWorkdraft(requestId: string): Promise<Workdraft> {
  return parse(workdraftSchema, await requestJson(workdraftOf(requestId)))
}

// 存几格（自动保存）：带读到的 revision，对不上回 409 workdraft_revision
export async function saveWorkdraftCells(
  requestId: string,
  body: { revision: number; cells: CellEdit[] },
  csrfToken: string,
): Promise<Workdraft> {
  return parse(
    workdraftSchema,
    await requestJson(`${workdraftOf(requestId)}/cells`, { method: 'POST', csrfToken, body }),
  )
}

// 导入专家包（清单 v2）：整份换掉，导入的内容算我的原话
export async function importWorkdraft(
  requestId: string,
  body: { revision: number; manifest: Record<string, unknown> },
  csrfToken: string,
): Promise<Workdraft> {
  return parse(
    workdraftSchema,
    await requestJson(`${workdraftOf(requestId)}/import`, { method: 'POST', csrfToken, body }),
  )
}

// 拿我自己的一位准专家作起点：整份换掉
export async function copyWorkdraft(
  requestId: string,
  body: { revision: number; draft_id: string },
  csrfToken: string,
): Promise<Workdraft> {
  return parse(
    workdraftSchema,
    await requestJson(`${workdraftOf(requestId)}/copy`, { method: 'POST', csrfToken, body }),
  )
}

// 编出的清单与出不了版本的地方（按格子路径），不出版本
export async function previewWorkdraft(requestId: string): Promise<Preview> {
  return parse(previewSchema, await requestJson(`${workdraftOf(requestId)}/preview`))
}

// 出一版：把关都过了就出准专家第 n 版（自助）
export async function publishWorkdraft(requestId: string, csrfToken: string): Promise<Published> {
  return parse(
    publishedSchema,
    await requestJson(`${workdraftOf(requestId)}/publish`, { method: 'POST', csrfToken }),
  )
}

// 导入 skill 当种子：存成创意的新一版（种类 skill），回版本号
export async function seedSkill(
  requestId: string,
  skill: string,
  csrfToken: string,
): Promise<number> {
  return parse(
    seededSchema,
    await requestJson(`${workdraftOf(requestId)}/seed-skill`, {
      method: 'POST',
      csrfToken,
      body: { skill },
    }),
  ).version
}

// ---------- AI 孵化的一轮（专家孵化方案第八、九节） ----------
const roundsOf = (requestId: string) => `${workdraftOf(requestId)}/incubations`

// 选电脑：我接入过的电脑与上次用的那台与目录
export async function fetchRoundComputers(requestId: string): Promise<Computers> {
  return parse(computersSchema, await requestJson(`${workdraftOf(requestId)}/computers`))
}

// 这个名称的各轮（第几轮、状态、花费），第一轮在前
export async function fetchRounds(requestId: string): Promise<Round[]> {
  return parse(roundsSchema, await requestJson(roundsOf(requestId))).incubations
}

// 发起一轮：已有一轮在跑回 409 incubation_running，没有电脑回 409 author_has_no_computer
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

// 刷新一次（轮询）：没结束的问一次运行方
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

// 接受、改了再接受、不要一条建议：回改过的工作稿与这一轮
export async function decideSuggestion(
  requestId: string,
  roundId: string,
  suggestionId: string,
  body: Decision,
  csrfToken: string,
): Promise<{ workdraft: Workdraft; round: Round }> {
  const got = parse(
    decidedSchema,
    await requestJson(`${roundsOf(requestId)}/${enc(roundId)}/suggestions/${enc(suggestionId)}`, {
      method: 'POST',
      csrfToken,
      body,
    }),
  )
  return { workdraft: { ...got.workdraft, contract_version: 1 }, round: got.incubation }
}
