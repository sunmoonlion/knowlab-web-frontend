'use client'

import type { z } from 'zod'

import {
  applicationsSchema,
  computersSchema,
  countsSchema,
  defaultsSchema,
  detailSchema,
  deliverySubmittedSchema,
  expertMovedSchema,
  expertsSchema,
  grantResultSchema,
  inboxSchema,
  librarySchema,
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
  type Grant,
  type Inbox,
  type KnowbotRequestIn,
  type Material,
  type MyQuestion,
  type Outputs,
  type RevisionIn,
  type TestDataRequest,
} from '@/contracts/knowbots'
import {
  acceptedStepSchema,
  decidedProposalSchema,
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
  type Proposal,
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

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
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

// ---------- 知识库栏（SDD 0046 第六节） ----------
// 我在 knowbase 展示给 knowlab 的资料（后端凭我本人的令牌现取）
export async function fetchLibrary(): Promise<Material[]> {
  return parse(librarySchema, await requestJson(`${BASE}/knowbot-library`)).materials
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

// 提交交付（SDD 0046 第五节）：定自用或公开、授权审核员看这次交付；这一下就是用户同意门。
// 上架了的自用版本再提交一次公开，就是自用转公开（重查许可）
export async function submitDelivery(
  expertId: string,
  body: { listing: 'self' | 'public'; budget_limit?: string; raise_frozen?: boolean },
  csrfToken: string,
): Promise<{ delivery_id: string; status: string }> {
  const answer = await requestJson(`${BASE}/knowbot-experts/${enc(expertId)}/deliveries`, {
    method: 'POST',
    csrfToken,
    body: { ...body, authorize_reviewer: true },
  })
  return parse(deliverySubmittedSchema, answer)
}

// 撤回没走完的交付（在审的，或审过还没交成的）：停平台重跑、撤给审核员的授权
export async function withdrawDelivery(
  expertId: string,
  csrfToken: string,
): Promise<{ delivery_id: string; status: string }> {
  const answer = await requestJson(`${BASE}/knowbot-experts/${enc(expertId)}/deliveries/withdraw`, {
    method: 'POST',
    csrfToken,
  })
  return parse(deliverySubmittedSchema, answer)
}

// 不要这一版：不上架
export async function declineExpert(expertId: string, csrfToken: string): Promise<ExpertStage> {
  const answer = await requestJson(`${BASE}/knowbot-experts/${enc(expertId)}/decline`, {
    method: 'POST',
    csrfToken,
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

// 挑数据：整份换成这几份（只能是知识库栏里的），挑的时候后端记下格式
export async function pickData(
  requestId: string,
  body: { revision: number; picks: string[] },
  csrfToken: string,
): Promise<Workdraft> {
  return parse(
    workdraftSchema,
    await requestJson(`${workdraftOf(requestId)}/data-picks`, { method: 'PUT', csrfToken, body }),
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

// 一键接受一步的全部建议：出处核不上的、放不上去的跳过
export async function acceptStep(
  requestId: string,
  roundId: string,
  stepId: string,
  revision: number,
  csrfToken: string,
): Promise<{ workdraft: Workdraft; round: Round; accepted: string[]; skipped: string[] }> {
  const got = parse(
    acceptedStepSchema,
    await requestJson(`${roundsOf(requestId)}/${enc(roundId)}/steps/${enc(stepId)}/accept-all`, {
      method: 'POST',
      csrfToken,
      body: { revision },
    }),
  )
  return {
    workdraft: { ...got.workdraft, contract_version: 1 },
    round: got.incubation,
    accepted: got.accepted,
    skipped: got.skipped.map((s) => s.id),
  }
}

// ---------- 自己来还是请平台（SDD 0046 第四节） ----------
// 新申请默认的模式：上次选的；第一次是 null，让我自己选
export async function fetchRequestDefaults(): Promise<'self' | 'platform' | null> {
  return parse(defaultsSchema, await requestJson(`${BASE}/knowbot-requests/defaults`)).mode
}

// 「请平台孵化」：确认框上同意就是本人授权；带平台发起 AI 一轮的费用上限
export async function askPlatform(
  requestId: string,
  budgetLimit: string,
  csrfToken: string,
): Promise<Grant> {
  const got = await requestJson(`${BASE}/knowbot-requests/${enc(requestId)}/platform`, {
    method: 'POST',
    csrfToken,
    body: { agree: true, budget_limit: budgetLimit },
  })
  return parse(grantResultSchema, got).grant
}

// 「我自己来」：平台的授权立即撤销
export async function takeBack(requestId: string, csrfToken: string): Promise<void> {
  await requestJson(`${BASE}/knowbot-requests/${enc(requestId)}/take-back`, {
    method: 'POST',
    csrfToken,
  })
}

// 续期：孵化授权续到 30 天后
export async function renewPlatform(requestId: string, csrfToken: string): Promise<Grant> {
  const got = await requestJson(`${BASE}/knowbot-requests/${enc(requestId)}/platform/renew`, {
    method: 'POST',
    csrfToken,
  })
  return parse(grantResultSchema, got).grant
}

// 「交平台测」：自己孵化的准专家交平台测这一次（轻受理），上限我设
export async function askPlatformTest(
  draftId: string,
  budgetLimit: string,
  csrfToken: string,
): Promise<Grant> {
  const got = await requestJson(`${BASE}/knowbot-drafts/${enc(draftId)}/platform-test`, {
    method: 'POST',
    csrfToken,
    body: { agree: true, budget_limit: budgetLimit },
  })
  return parse(grantResultSchema, got).grant
}

// 还没开测的平台测试，我收回
export async function withdrawPlatformTest(grantId: string, csrfToken: string): Promise<void> {
  await requestJson(`${BASE}/knowbot-grants/${enc(grantId)}/withdraw`, {
    method: 'POST',
    csrfToken,
  })
}

// 平台人员的一条提议：接受、改了再接受、不要（专家孵化方案第十二节）
export async function decideProposal(
  requestId: string,
  proposalId: string,
  body: Decision,
  csrfToken: string,
): Promise<{ workdraft: Workdraft; proposal: Proposal }> {
  const got = parse(
    decidedProposalSchema,
    await requestJson(
      `${BASE}/knowbot-requests/${enc(requestId)}/workdraft/proposals/${enc(proposalId)}`,
      { method: 'POST', csrfToken, body },
    ),
  )
  return { workdraft: { ...got.workdraft, contract_version: 1 }, proposal: got.proposal }
}
