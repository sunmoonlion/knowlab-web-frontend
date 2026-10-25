import { z } from 'zod'

// 创意、准专家、测试、专家的约定（后端 app/interfaces/endpoints/knowbot_routes.py 与
// knowbot_views.py，SDD 0037）。代码里仍叫 request（创意的名称）、draft（准专家）。用户只看到
// 自己的：创意各版本与受理结果、准专家（规则与出自哪句话）、测试结果、交回了的专家；没有清单
// 原文、规则名、run、谁做的。回包里多出来的字段不算错（账 144），少了、类型不对才算。

const RUNTIME = /^[a-z][a-z0-9-]{0,31}$/
const CASE_ID = /^[A-Za-z0-9._-]{1,64}$/
const when = z.string().nullable()

export const TEST_STATUSES = [
  'queued',
  'running',
  'waiting',
  'passed',
  'failed',
  'platform_error',
] as const
export const EXPERT_STAGES = [
  'to_return',
  'awaiting_user',
  'declined',
  'to_review',
  'rejected',
  'to_deliver',
  'listed',
  'stopped',
] as const

const sixAnswersSchema = z.object({
  solves: z.string(),
  not_solves: z.string(),
  inputs: z.string(),
  steps: z.string(),
  outputs: z.string(),
  correctness: z.string(),
})

export const ideaSchema = z.union([
  z.object({ kind: z.literal('six_questions'), answers: sixAnswersSchema }),
  z.object({ kind: z.literal('skill'), skill: z.string() }),
])

const acceptanceSchema = z.object({
  accepted: z.boolean(),
  reason: z.string().nullable(),
  decided_at: when,
  trial: z.boolean(),
})

const versionSchema = z.object({
  version: z.number().int().min(1),
  idea: ideaSchema,
  cases: z.array(z.record(z.string(), z.unknown())),
  consent_version: z.number().int().min(1),
  created_at: when,
  acceptance: acceptanceSchema.nullable(),
})

const draftSchema = z.object({
  draft_id: z.string().uuid(),
  label: z.string(),
  version: z.string(),
  revision: z.number().int().min(1),
  request_version: z.number().int().min(1),
  status: z.enum(['pending_test', 'testing', 'passed', 'failed']),
  name: z.string().nullable(),
  created_at: when,
  user_review: z
    .object({
      state: z.enum(['pending', 'ok', 'not_ok']),
      note: z.string().nullable().optional(),
      requested_at: when,
      answered_at: when.optional(),
    })
    .nullable(),
  // 我的话用在了哪：每条规则出自我写的哪句话
  rule_sources: z.array(z.object({ rule: z.string(), ref: z.string() })),
})

export const caseStatusSchema = z.enum(['passed', 'failed', 'needs_human', 'error'])

const caseResultSchema = z.object({
  case_id: z.string().regex(CASE_ID),
  status: caseStatusSchema,
  steps: z
    .array(
      z.object({
        step_id: z.string().min(1).max(128),
        accepted: z.boolean(),
        failed_checks: z.array(z.string()).max(64),
        // 没过的为什么没过，一条一句（审读第 3 条）；之前的报告没有
        details: z.array(z.string().max(200)).max(64).optional(),
      }),
    )
    .max(200),
  expectations: z.array(z.boolean()).max(64),
  note: z.string().max(1000).nullable(),
})

const reportSchema = z.object({
  status: z.string().min(1).max(32),
  cases: z.array(caseResultSchema).max(50),
  cost: z.object({ spent: z.string().max(32), currency: z.literal('CNY') }).nullable(),
  finished_at: when,
})

const testSchema = z.object({
  test_id: z.string().uuid(),
  number: z.number().int().min(1),
  draft_id: z.string().uuid(),
  label: z.string().nullable(),
  status: z.enum(TEST_STATUSES),
  started_at: when,
  finished_at: when,
  report: reportSchema.nullable(),
  backfilled: z.boolean(),
})

const expertSchema = z.object({
  expert_id: z.string().uuid(),
  version: z.number().int().min(1),
  name: z.string().nullable(),
  stage: z.enum(EXPERT_STAGES),
  draft_id: z.string().uuid(),
  label: z.string().nullable(),
  test_id: z.string().uuid().nullable(),
  test_number: z.number().int().nullable(),
  created_at: when,
  returned_at: when,
  user_accepted: z.boolean().nullable(),
  user_decided_at: when,
  review_approved: z.boolean().nullable(),
  review_listing: z.enum(['self', 'public']).nullable(),
  review_reason: z.string().nullable(),
  reviewed_at: when,
  listed_at: when,
  knowbot_id: z.string().nullable(),
  listing_status: z.string().nullable(),
  stopped_at: when,
  stop_reason: z.string().nullable(),
  // 试行期上架：两道门之前交付
  trial: z.boolean(),
})

const summarySchema = z.object({
  version: z.number().int().min(1),
  acceptance: z.enum(['accepted', 'rejected']).nullable(),
  draft: z.string().nullable(),
  test: z.object({ number: z.number().int(), status: z.enum(TEST_STATUSES) }).nullable(),
  expert: z.object({ version: z.number().int(), stage: z.enum(EXPERT_STAGES) }).nullable(),
})

const lifeFields = {
  request_id: z.string().uuid(),
  title: z.string().min(1).max(80),
  runtime: z.string().regex(RUNTIME),
  created_at: when,
  latest_version: z.number().int().min(1),
  summary: summarySchema,
  // 同意的是第几版测试数据说明、现行是第几版（SDD 0037）
  consent_version: z.number().int().min(1),
  consent_current: z.number().int().min(1),
}

// 补充方法（SDD 0035，已取消）：我以前写的，只看
const amendmentSchema = z.object({
  amendment_id: z.string().uuid(),
  text: z.string(),
  created_at: when,
  status: z.enum(['open', 'used', 'declined']),
  used_in_revision: z.number().int().min(1).nullable(),
  declined_reason: z.string().nullable(),
  declined_at: when,
})

// 详情页的记录：哪个过程、输入、输出、何时（各过程带的项不同）
const eventSchema = z.object({ at: z.string(), kind: z.string() }).catchall(z.unknown())

export const detailSchema = z.object({
  contract_version: z.literal(1),
  ...lifeFields,
  versions: z.array(versionSchema),
  drafts: z.array(draftSchema),
  tests: z.array(testSchema),
  experts: z.array(expertSchema),
  timeline: z.array(eventSchema),
  amendments: z.array(amendmentSchema),
})

export const countsSchema = z.object({
  contract_version: z.literal(1),
  inbox: z.number().int().min(0),
  experts_new: z.number().int().min(0),
})

const applicationSchema = z.object({
  ...lifeFields,
  category: z.enum(['working', 'has_expert', 'rejected']),
})

export const applicationsSchema = z.object({
  contract_version: z.literal(1),
  items: z.array(applicationSchema),
})

// 测试中转给我回答的问题（投资判断只能我自己答，C-L1）
const questionSchema = z.object({
  question_id: z.string().uuid(),
  kind: z.enum(['question', 'ask_before']),
  text: z.string().min(1).max(4000),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
  allow_free_text: z.boolean(),
  case_id: z.string(),
  step_id: z.string().nullable(),
  asked_at: z.string(),
  title: z.string(),
  request_id: z.string().uuid(),
  label: z.string(),
  // 是哪位准专家的（SDD 0037）
  draft_id: z.string().uuid(),
})

const brief = { request_id: z.string().uuid(), title: z.string().min(1).max(80) }
const inboxBase = { ...brief, state: z.enum(['todo', 'done']) }

// 审核栏（我的待办箱）：转给我的问题、请我审核的准专家、交回等我定的专家
const inboxItemSchema = z.discriminatedUnion('type', [
  z.object({ ...questionSchema.shape, ...inboxBase, type: z.literal('question') }),
  z.object({ ...draftSchema.shape, ...inboxBase, type: z.literal('draft') }),
  z.object({ ...expertSchema.shape, ...inboxBase, type: z.literal('expert') }),
])

const answeredSchema = z.object({
  question_id: z.string().uuid(),
  kind: z.enum(['tool_approval', 'question', 'ask_before']),
  case_id: z.string(),
  key: z.string().nullable(),
  text: z.string(),
  answer: z.record(z.string(), z.string()).nullable(),
  answered_by: z.enum(['operator', 'user']).nullable(),
  answered_at: when,
  draft_id: z.string().uuid(),
})

export const inboxSchema = z.object({
  contract_version: z.literal(1),
  items: z.array(inboxItemSchema),
  answered: z.array(answeredSchema),
})

const expertItemSchema = z.object({
  ...brief,
  category: z.enum(['new', 'accepted', 'usable', 'stopped', 'not_listed']),
  ...expertSchema.shape,
})

export const expertsSchema = z.object({
  contract_version: z.literal(1),
  items: z.array(expertItemSchema),
})

export const questionsSchema = z.object({
  contract_version: z.literal(1),
  questions: z.array(questionSchema),
})

export const sentSchema = z.object({
  contract_version: z.literal(1),
  question_id: z.string().uuid(),
  sent: z.boolean(),
})

export const submittedSchema = z.object({
  contract_version: z.literal(1),
  request_id: z.string().uuid(),
  version: z.number().int().min(1),
})

export const reviewedSchema = z.object({
  contract_version: z.literal(1),
  draft_id: z.string().uuid(),
  status: z.string(),
})

export const expertMovedSchema = z.object({
  contract_version: z.literal(1),
  expert_id: z.string().uuid(),
  stage: z.enum(EXPERT_STAGES),
})

// 一条用例的产出：成稿与各步交回物（SDD 0037，契约 test-run-case-outputs，运行方给；与管理端同形）
const outputCheckSchema = z.object({
  label: z.string().max(200),
  passed: z.boolean().nullable().optional(),
  message: z.string().max(1000).optional(),
})

export const OUTCOMES = [
  'accepted',
  'rejected',
  'failed',
  'over_budget',
  'cancelled',
  'running',
  'not_reached',
] as const

const stepOutputSchema = z.object({
  step_id: z.string().min(1).max(128),
  title: z.string().max(200).optional(),
  outcome: z.enum(OUTCOMES),
  artifact: z.unknown().optional(),
  artifact_omitted_bytes: z.number().int().min(0).nullable().optional(),
  returned_raw: z.string().nullable().optional(),
  checks: z.array(outputCheckSchema).max(64).optional(),
})

const caseOutputsSchema = z.object({
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
    .nullable()
    .optional(),
  deliverable_note: z.string().max(500).nullable().optional(),
  steps: z.array(stepOutputSchema).max(200).optional(),
  error: z.string().max(500).nullable().optional(),
})

export const outputsSchema = z.object({
  contract_version: z.literal(1),
  test_id: z.string().uuid(),
  // 这个创意是在旧说明下同意的：产出不取不显示（审读 10-19）
  consent_needed: z.boolean(),
  cases: z.array(
    z.object({
      case_id: z.string().regex(CASE_ID),
      fetched_at: when,
      note: z.string().nullable(),
      outputs: caseOutputsSchema.nullable(),
    }),
  ),
})

export const runtimesSchema = z.object({
  contract_version: z.literal(1),
  runtimes: z.array(z.string().regex(RUNTIME)),
})

const datasetSchema = z.object({
  dataset_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  version: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  created_at: when,
  no_resale: z.boolean().optional(),
})

export const myDataSchema = z.object({
  contract_version: z.literal(1),
  datasets: z.array(datasetSchema),
  used_bytes: z.number().int().min(0),
  quota_bytes: z.number().int().min(1),
  max_file_bytes: z.number().int().min(1),
})

export const uploadedSchema = z.object({ contract_version: z.literal(1), dataset: datasetSchema })

// 提交、修改的形状与后端 KnowbotRequestIn、RevisionIn 一致；后端会再核一遍
export type ExpectationIn = {
  artifact: string
  path: string
  kind: 'equals' | 'approx' | 'contains'
  value: string | number
  tolerance?: number
}
export type CaseIn = {
  case_id: string
  input: { question: string; answers?: Record<string, string> }
  expectations: ExpectationIn[]
}
export type SixAnswers = {
  solves: string
  not_solves: string
  inputs: string
  steps: string
  outputs: string
  correctness: string
}
export type IdeaIn =
  | { kind: 'six_questions'; answers: SixAnswers }
  | { kind: 'skill'; skill: string }
export type RevisionIn = { idea: IdeaIn; cases: CaseIn[]; consent_test_data: true }
export type KnowbotRequestIn = RevisionIn & { title: string; runtime: string }

export type Idea = z.infer<typeof ideaSchema>
export type Version = z.infer<typeof versionSchema>
export type Draft = z.infer<typeof draftSchema>
export type Test = z.infer<typeof testSchema>
export type TestStatus = (typeof TEST_STATUSES)[number]
export type Expert = z.infer<typeof expertSchema>
export type ExpertStage = (typeof EXPERT_STAGES)[number]
export type Summary = z.infer<typeof summarySchema>
export type Detail = z.infer<typeof detailSchema>
export type Counts = Omit<z.infer<typeof countsSchema>, 'contract_version'>
export type Application = z.infer<typeof applicationSchema>
export type InboxItem = z.infer<typeof inboxItemSchema>
export type Inbox = z.infer<typeof inboxSchema>
export type ExpertItem = z.infer<typeof expertItemSchema>
export type MyQuestion = z.infer<typeof questionSchema>
export type Answered = z.infer<typeof answeredSchema>
export type CaseResult = z.infer<typeof caseResultSchema>
export type Amendment = z.infer<typeof amendmentSchema>
export type Event = z.infer<typeof eventSchema>
export type Outputs = z.infer<typeof outputsSchema>
export type CaseOutputs = z.infer<typeof caseOutputsSchema>
export type StepOutput = z.infer<typeof stepOutputSchema>
export type Dataset = z.infer<typeof datasetSchema>
export type MyData = z.infer<typeof myDataSchema>
