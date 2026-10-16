import { z } from 'zod'

// 分身创建的约定（后端 app/interfaces/endpoints/knowbot_routes.py，SDD 0027）。
// 用户只看到自己的提交、各版草稿的状态与运行正确性报告；没有清单原文，也没有分析内容。

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

const draftSchema = z
  .object({
    draft_id: z.string().uuid(),
    revision: z.number().int().min(1),
    version: z.string().regex(/^[1-9][0-9]{0,5}$/),
    status: draftStatusSchema,
    name: z.string().max(80).nullable(),
    report: reportSchema.nullable(),
    knowbot_id: z.string().nullable(),
  })
  .strict()

const requestSchema = z
  .object({
    request_id: z.string().uuid(),
    title: z.string().min(1).max(80),
    runtime: z.string().regex(RUNTIME),
    created_at: z.string().nullable(),
    drafts: z.array(draftSchema),
  })
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
