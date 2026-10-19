import { z } from 'zod'

// 创意、分身、专家的约定（后端 app/interfaces/endpoints/knowbot_routes.py，SDD 0027、0037）。
// 代码里仍叫 request（创意）、draft（分身）、knowbot（专家）。用户只看到自己的：
// 方法原文、用例、各个分身的状态与测试结果、成稿与各步交回物、规则出处（规则与出自哪句话）；没有清单原文。

const RUNTIME = /^[a-z][a-z0-9-]{0,31}$/
const CASE_ID = /^[A-Za-z0-9._-]{1,64}$/

export const draftStatusSchema = z.enum([
  'pending_test',
  'testing',
  'passed',
  'failed',
  'delivered',
])
export const caseStatusSchema = z.enum(['passed', 'failed', 'needs_human', 'error'])

const stepSchema = z
  .object({
    step_id: z.string().min(1).max(128),
    accepted: z.boolean(),
    failed_checks: z.array(z.string()).max(64),
    // 没过的为什么没过，一条一句（审读第 3 条）；之前的报告没有
    details: z.array(z.string().max(200)).max(64).optional(),
  })
  .strict()

const caseResultSchema = z
  .object({
    case_id: z.string().regex(CASE_ID),
    status: caseStatusSchema,
    steps: z.array(stepSchema).max(200),
    expectations: z.array(z.boolean()).max(64),
    note: z.string().max(1000).nullable(),
  })
  .strict()

const reportSchema = z
  .object({
    status: z.string().min(1).max(32),
    cases: z.array(caseResultSchema).max(50),
    cost: z
      .object({ spent: z.string().max(32), currency: z.literal('CNY') })
      .strict()
      .nullable(),
    finished_at: z.string().nullable(),
  })
  .strict()

const draftFields = {
  draft_id: z.string().uuid(),
  revision: z.number().int().min(1),
  version: z.string().regex(/^[1-9][0-9]{0,5}$/),
  status: draftStatusSchema,
  name: z.string().max(80).nullable(),
  report: reportSchema.nullable(),
  knowbot_id: z.string().nullable(),
}

const draftSchema = z.object(draftFields).strict()

// 我给这个创意写的补充方法（SDD 0035）：原话写下后不能改；状态由各稿推出来
const amendmentSchema = z
  .object({
    amendment_id: z.string().uuid(),
    text: z.string().min(1).max(4000),
    created_at: z.string().nullable(),
    status: z.enum(['open', 'used', 'declined']),
    used_in_revision: z.number().int().min(1).nullable(),
    declined_reason: z.string().max(500).nullable(),
    declined_at: z.string().nullable(),
  })
  .strict()

const requestFields = {
  request_id: z.string().uuid(),
  title: z.string().min(1).max(80),
  runtime: z.string().regex(RUNTIME),
  created_at: z.string().nullable(),
  drafts: z.array(draftSchema),
  // 后端先发、网页后发都要能读：旧后端没有这一项
  amendments: z.array(amendmentSchema).max(200).optional(),
  // 同意的是第几版测试数据说明、现行是第几版（SDD 0037）；旧后端没有
  consent_version: z.number().int().min(1).optional(),
  consent_current: z.number().int().min(1).optional(),
}

const requestSchema = z.object(requestFields).strict()

const sixAnswersSchema = z
  .object({
    solves: z.string(),
    not_solves: z.string(),
    inputs: z.string(),
    steps: z.string(),
    outputs: z.string(),
    correctness: z.string(),
  })
  .strict()

// 我的一个创意（SDD 0037）：列表那一项加上方法原文与验收用例（用例是原样，前端按需取）
export const requestDetailSchema = z
  .object({
    contract_version: z.literal(1),
    ...requestFields,
    idea: z.union([
      z.object({ kind: z.literal('six_questions'), answers: sixAnswersSchema }).strict(),
      z.object({ kind: z.literal('skill'), skill: z.string() }).strict(),
    ]),
    cases: z.array(z.record(z.string(), z.unknown())),
  })
  .strict()

// 我的一个分身：状态、测试结果、规则出处（只给规则与出自我的哪句话）
export const draftDetailSchema = z
  .object({
    contract_version: z.literal(1),
    ...draftFields,
    request_id: z.string().uuid(),
    title: z.string().min(1).max(80),
    rule_sources: z.array(z.object({ rule: z.string(), ref: z.string() }).strict()),
  })
  .strict()

// 一条用例的产出：成稿与各步交回物（SDD 0037，契约 test-run-case-outputs，运行方给；与管理端同形）
const outputCheckSchema = z
  .object({
    label: z.string().max(200),
    passed: z.boolean().nullable().optional(),
    message: z.string().max(1000).optional(),
  })
  .strict()

export const OUTCOMES = [
  'accepted',
  'rejected',
  'failed',
  'over_budget',
  'cancelled',
  'running',
  'not_reached',
] as const

const stepOutputSchema = z
  .object({
    step_id: z.string().min(1).max(128),
    title: z.string().max(200).optional(),
    outcome: z.enum(OUTCOMES),
    artifact: z.unknown().optional(),
    artifact_omitted_bytes: z.number().int().min(0).nullable().optional(),
    returned_raw: z.string().nullable().optional(),
    checks: z.array(outputCheckSchema).max(64).optional(),
  })
  .strict()

const caseOutputsSchema = z
  .object({
    contract: z.literal('knowbot-test-run/v1'),
    run_id: z.string(),
    case_id: z.string().regex(CASE_ID),
    deliverable: z
      .object({
        path: z.string().max(1024),
        text: z.string(),
        truncated: z.boolean().optional(),
        step_id: z.string().max(128).nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    deliverable_note: z.string().max(500).nullable().optional(),
    steps: z.array(stepOutputSchema).max(200).optional(),
    error: z.string().max(500).nullable().optional(),
  })
  .strict()

export const outputsSchema = z
  .object({
    contract_version: z.literal(1),
    draft_id: z.string().uuid(),
    run_id: z.string().nullable(),
    // 这个创意是在旧说明下同意的：产出不取不显示（审读 10-19）
    consent_needed: z.boolean().optional(),
    cases: z.array(
      z
        .object({
          case_id: z.string().regex(CASE_ID),
          fetched_at: z.string().nullable(),
          note: z.string().nullable(),
          outputs: caseOutputsSchema.nullable(),
        })
        .strict(),
    ),
  })
  .strict()

// 做出来的专家：交付了的各版（列表直接写专家名，不叫「我的专家」）
const knowbotSchema = z
  .object({
    knowbot_id: z.string().nullable(),
    name: z.string().max(80).nullable(),
    version: z.string(),
    revision: z.number().int().min(1),
    draft_id: z.string().uuid(),
    request_id: z.string().uuid(),
    title: z.string().min(1).max(80),
    delivered_at: z.string().nullable(),
  })
  .strict()

export const myKnowbotsSchema = z
  .object({ contract_version: z.literal(1), knowbots: z.array(knowbotSchema) })
  .strict()

export const amendedSchema = z
  .object({ contract_version: z.literal(1), amendment_id: z.string().uuid() })
  .strict()

export const myRequestsSchema = z
  .object({ contract_version: z.literal(1), requests: z.array(requestSchema) })
  .strict()

export const runtimesSchema = z
  .object({ contract_version: z.literal(1), runtimes: z.array(z.string().regex(RUNTIME)) })
  .strict()

const datasetSchema = z
  .object({
    dataset_id: z.string().uuid(),
    name: z.string().min(1).max(200),
    version: z.string(),
    content_type: z.string(),
    size_bytes: z.number().int().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    created_at: z.string().nullable(),
  })
  .strict()

export const myDataSchema = z
  .object({
    contract_version: z.literal(1),
    datasets: z.array(datasetSchema),
    used_bytes: z.number().int().min(0),
    quota_bytes: z.number().int().min(1),
    max_file_bytes: z.number().int().min(1),
  })
  .strict()

export const uploadedSchema = z
  .object({ contract_version: z.literal(1), dataset: datasetSchema })
  .strict()

export type Dataset = z.infer<typeof datasetSchema>
export type MyData = z.infer<typeof myDataSchema>

// 测试中转给我回答的问题（投资判断只能我自己答，C-L1）
const myQuestionSchema = z
  .object({
    question_id: z.string().uuid(),
    kind: z.enum(['question', 'ask_before']),
    text: z.string().min(1).max(4000),
    options: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
    allow_free_text: z.boolean(),
    case_id: z.string(),
    step_id: z.string().nullable(),
    asked_at: z.string(),
    title: z.string(),
    version: z.string(),
    revision: z.number().int(),
    // 是哪个分身的（SDD 0037）；旧后端没有
    draft_id: z.string().uuid().optional(),
  })
  .strict()

export const myQuestionsSchema = z
  .object({ contract_version: z.literal(1), questions: z.array(myQuestionSchema) })
  .strict()

export const answeredSchema = z
  .object({ contract_version: z.literal(1), question_id: z.string().uuid(), sent: z.boolean() })
  .strict()

export type MyQuestion = z.infer<typeof myQuestionSchema>

export const submittedSchema = z
  .object({ contract_version: z.literal(1), request_id: z.string().uuid() })
  .strict()

// 提交的形状与后端 KnowbotRequestIn 一致；后端会再核一遍
export type ExpectationIn = {
  artifact: string
  path: string
  kind: 'equals' | 'approx' | 'contains'
  value: string | number
  tolerance?: number
}
export type CaseIn = { case_id: string; input: { question: string }; expectations: ExpectationIn[] }
export type SixAnswers = {
  solves: string
  not_solves: string
  inputs: string
  steps: string
  outputs: string
  correctness: string
}
export type KnowbotRequestIn = {
  title: string
  runtime: string
  idea: { kind: 'six_questions'; answers: SixAnswers } | { kind: 'skill'; skill: string }
  cases: CaseIn[]
  consent_test_data: true
}

export type MyRequests = z.infer<typeof myRequestsSchema>
export type KnowbotRequest = z.infer<typeof requestSchema>
export type KnowbotDraft = z.infer<typeof draftSchema>
export type CaseResult = z.infer<typeof caseResultSchema>
export type Amendment = z.infer<typeof amendmentSchema>
export type RequestDetail = z.infer<typeof requestDetailSchema>
export type DraftDetail = z.infer<typeof draftDetailSchema>
export type Outputs = z.infer<typeof outputsSchema>
export type CaseOutputs = z.infer<typeof caseOutputsSchema>
export type StepOutput = z.infer<typeof stepOutputSchema>
export type Knowbot = z.infer<typeof knowbotSchema>
