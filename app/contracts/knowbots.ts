import { z } from 'zod'

import { methodChoiceSchema, type MethodChoice } from './method-choice'

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

// 创意的种类：六问、一份 skill、一句话问题（专家孵化方案第四节：方法由 AI 按问题起草）
export const ideaSchema = z.union([
  z.object({
    kind: z.literal('six_questions'),
    answers: sixAnswersSchema,
    method_choices: z.array(methodChoiceSchema).max(30).optional(),
  }),
  z.object({
    kind: z.literal('skill'),
    skill: z.string(),
    method_choices: z.array(methodChoiceSchema).max(30).optional(),
  }),
  z.object({
    kind: z.literal('question'),
    question: z.string(),
    method_choices: z.array(methodChoiceSchema).max(30).optional(),
  }),
])

const acceptanceSchema = z.object({
  accepted: z.boolean(),
  reason: z.string().nullable(),
  decided_at: when,
  trial: z.boolean(),
  // formal：平台正式受理；self：选了自己来，不过平台（SDD 0046 第二节）
  kind: z.enum(['formal', 'self']).default('formal'),
})

// 我给平台的一张授权（SDD 0046 第四节）：孵化（请平台孵化）或测试（交平台测这一次）
export const GRANT_STATES = [
  'pending',
  'active',
  'declined',
  'revoked',
  'ended',
  'expired',
] as const
export const grantSchema = z.object({
  grant_id: z.string().uuid(),
  kind: z.enum(['incubate', 'test']),
  draft_id: z.string().uuid().nullable(),
  state: z.enum(GRANT_STATES),
  budget_limit: z.string(),
  granted_at: when,
  expires_at: when,
  decided_at: when,
  reason: z.string().nullable(),
  ended_at: when,
  basis: z.string(),
})
export type Grant = z.infer<typeof grantSchema>
export const grantResultSchema = z.object({ contract_version: z.literal(1), grant: grantSchema })
export const defaultsSchema = z.object({
  contract_version: z.literal(1),
  mode: z.enum(['self', 'platform']).nullable(),
})

const versionSchema = z.object({
  version: z.number().int().min(1),
  idea: ideaSchema,
  cases: z.array(z.record(z.string(), z.unknown())),
  consent_version: z.number().int().min(0),
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
  // 自己出的一版（self）还是平台出的（platform）
  mode: z.enum(['self', 'platform']).default('platform'),
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
  manifest_sha256: z.string().optional(),
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
  // 自助（自己的电脑）、平台，或公开交付时平台发起的重跑；带的测试集第几版（SDD 0046 第三、五节）
  mode: z.enum(['platform', 'self', 'rerun']).default('platform'),
  test_set_version: z.number().int().nullable().default(null),
  // 测试证据进了 knowbase 产出区的那一份（0043 第 4.2 节）
  evidence: z
    .object({ material_id: z.string(), version_no: z.number().int() })
    .nullable()
    .optional(),
})

// 交付（SDD 0046 第五节）：一次「提交交付」的进度
export const DELIVERY_STATUSES = ['reviewing', 'approved', 'rejected', 'withdrawn'] as const
export const BINDING_PROBLEMS = [
  'binding_gone',
  'binding_disabled',
  'binding_deleted',
  'binding_frozen_self_only',
  'binding_not_shareable',
] as const
const findingSchema = z.object({
  kind: z.enum([
    'manual_unretested',
    'test_not_passed',
    'not_accepted',
    'cases_mismatch',
    'outputs_missing',
    'flagged_word',
  ]),
  case_id: z.string().optional(),
  rule: z.string().optional(),
  word: z.string().optional(),
})
export const deliverySchema = z.object({
  delivery_id: z.string().uuid(),
  listing: z.enum(['self', 'public']),
  conversion: z.boolean(),
  test_mode: z.enum(['self', 'platform', 'unrun']),
  needs_rerun: z.boolean(),
  budget_limit: z.string().nullable(),
  status: z.enum(DELIVERY_STATUSES),
  submitted_at: when,
  auto_check: z
    .object({ passed: z.boolean(), findings: z.array(findingSchema), checked_at: z.string() })
    .nullable(),
  binding_problem: z.enum(BINDING_PROBLEMS).nullable(),
  bindings: z.array(
    z.object({
      material_id: z.string(),
      version_no: z.number().int(),
      license: z.string().nullable().optional(),
    }),
  ),
  rerun: z
    .object({
      test_id: z.string().uuid(),
      number: z.number().int(),
      status: z.enum(TEST_STATUSES),
      report: reportSchema.nullable(),
    })
    .nullable(),
  decided_at: when,
  reason: z.string().nullable(),
  category: z.string().nullable(),
  delivered_at: when,
  listing_status: z.string().nullable(),
  withdrawn_at: when.optional(),
  withdraw_reason: z.string().nullable().optional(),
  basis: z.string(),
  consent_ended_at: when,
})

const expertSchema = z.object({
  expert_id: z.string().uuid(),
  manual_release: z
    .object({
      release_id: z.string().uuid(),
      retested: z.literal(false),
      manifest_sha256: z.string(),
    })
    .nullable()
    .optional(),
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
  // 平台孵化、平台测的要平台先交回；测试通过的那一次是自助还是平台测的（SDD 0046 第五节）
  needs_return: z.boolean().default(false),
  test_mode: z.enum(['platform', 'self', 'rerun']).nullable().default(null),
  deliveries: z.array(deliverySchema).default([]),
  // knowmart 那头这一版现在怎样：待处理（所绑数据失效，别人请不了）与原因（0043 第 4.3 节）
  market_status: z.string().nullable().optional(),
  held_reason: z.string().nullable().optional(),
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
  consent_version: z.number().int().min(0),
  consent_current: z.number().int().min(1),
  // 现在的孵化是自己来还是平台（孵化栏按它分，SDD 0046 第六节）
  incubation_mode: z.enum(['self', 'platform']).default('self'),
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

// 平台在问我什么（SDD 0046 第四节「平台视图」）：平台人员请我审核的准专家、交回等我定的专家、
// 对工作稿的提议、平台那一轮的缺口、平台测试里转给我的问题；还在等我（open）或处理过了（done）
export const PLATFORM_ASK_KINDS = ['review', 'expert', 'proposal', 'gap', 'question'] as const
export const platformAskSchema = z.object({
  kind: z.enum(PLATFORM_ASK_KINDS),
  state: z.enum(['open', 'done']),
  at: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  answer: z.string().nullable().optional(),
  question_id: z.string().optional(),
  draft_id: z.string().optional(),
  expert_id: z.string().optional(),
  path: z.string().optional(),
})
export type PlatformAsk = z.infer<typeof platformAskSchema>

export const detailSchema = z.object({
  contract_version: z.literal(1),
  ...lifeFields,
  // 现在的孵化是自己来还是平台；我给平台的授权
  incubation_mode: z.enum(['self', 'platform']),
  // 从 knowbench 找专家没找到时建的：哪个应用、哪个项目、哪一轮找专家（专家孵化方案第十三节）
  origin: z
    .object({
      app: z.string(),
      project_id: z.string().nullable().optional(),
      task_id: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  grants: z.array(grantSchema),
  versions: z.array(versionSchema),
  drafts: z.array(draftSchema),
  tests: z.array(testSchema),
  experts: z.array(expertSchema),
  timeline: z.array(eventSchema),
  amendments: z.array(amendmentSchema),
  platform_asks: z.array(platformAskSchema).default([]),
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

// 测试中转给我回答的问题（投资判断只能我自己答，C-L1）；我自助测试里的工具审批（批准 / 拒绝）；
// 专家要的数据（在名称页的测试卡片里确认，SDD 0046 第三节）；AI 孵化列的缺口（gap，可以答
// 「按提议」，专家孵化方案第 8.4 节）
export const QUESTION_KINDS = ['tool_approval', 'question', 'ask_before', 'data', 'gap'] as const
const questionSchema = z.object({
  question_id: z.string().uuid(),
  kind: z.enum(QUESTION_KINDS),
  text: z.string().min(1).max(4000),
  options: z.array(z.object({ id: z.string(), label: z.string() })),
  allow_free_text: z.boolean(),
  case_id: z.string(),
  step_id: z.string().nullable(),
  asked_at: z.string(),
  title: z.string(),
  request_id: z.string().uuid(),
  // 是哪位准专家的（SDD 0037）；孵化的缺口不挂准专家，是空的
  label: z.string().nullable(),
  draft_id: z.string().uuid().nullable(),
  // 从哪来：测试中的，还是孵化的缺口；缺口带 AI 附的提议与是哪一轮
  source: z.enum(['test', 'incubation']).optional(),
  proposal: z.string().nullable().optional(),
  incubation_id: z.string().uuid().nullable().optional(),
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
  kind: z.enum(QUESTION_KINDS),
  case_id: z.string(),
  key: z.string().nullable(),
  text: z.string(),
  // 审批是 decision，判断是 option_id / text，数据是 data（确认的那几样）
  answer: z.record(z.string(), z.unknown()).nullable(),
  answered_by: z.enum(['operator', 'user']).nullable(),
  answered_at: when,
  draft_id: z.string().uuid().nullable(),
  source: z.enum(['test', 'incubation']).optional(),
  proposal: z.string().nullable().optional(),
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
  incubation_mode: z.enum(['self', 'platform']).optional(),
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

export const deliverySubmittedSchema = z.object({
  contract_version: z.literal(1),
  delivery_id: z.string().uuid(),
  status: z.enum(DELIVERY_STATUSES),
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
  current: z.boolean().nullable().optional(),
})

const deliverableSchema = z.object({
  path: z.string().max(1024),
  text: z.string(),
  truncated: z.boolean().optional(),
  step_id: z.string().max(128).nullable().optional(),
})
const finalOutputSchema = z.object({
  method_id: z.string().min(1).max(48),
  instance_id: z.string().min(1).max(48),
  result: z
    .object({
      id: z.string().uuid(),
      version: z.number().int().min(1),
      digest: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .nullable(),
  artifact: z.unknown().optional(),
  artifact_omitted_bytes: z.number().int().min(0).nullable().optional(),
  deliverable: deliverableSchema.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
})
export const caseOutputsSchema = z.object({
  contract: z.literal('knowbot-test-run/v1'),
  run_id: z.string(),
  case_id: z.string().regex(CASE_ID),
  deliverable: deliverableSchema.nullable().optional(),
  deliverable_note: z.string().max(500).nullable().optional(),
  steps: z.array(stepOutputSchema).max(200).optional(),
  error: z.string().max(500).nullable().optional(),
  plan_version: z.number().int().min(1).nullable().optional(),
  final_outputs: z.array(finalOutputSchema).max(30).optional(),
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

// 提交、修改的形状与后端 KnowbotRequestIn、RevisionIn 一致；后端会再核一遍
export const rowSelectionSchema = z
  .object({
    where: z
      .record(
        z
          .string()
          .min(1)
          .max(128)
          .refine((s) => s.trim().length > 0),
        z.union([z.string(), z.number().finite(), z.boolean()]),
      )
      .refine((v) => Object.keys(v).length >= 1 && Object.keys(v).length <= 8),
    field: z
      .string()
      .min(1)
      .max(256)
      .refine((s) => s.trim().length > 0),
  })
  .strict()

export type ExpectationIn = {
  artifact: string
  path: string
  kind: 'equals' | 'approx' | 'contains'
  value: string | number
  tolerance?: number
  row?: z.infer<typeof rowSelectionSchema>
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
export type IdeaIn = (
  | { kind: 'six_questions'; answers: SixAnswers }
  | { kind: 'skill'; skill: string }
  | { kind: 'question'; question: string }
) & { method_choices?: MethodChoice[] }
export type RevisionIn = { idea: IdeaIn; cases: CaseIn[]; consent_test_data: true }
// mode：孵化自己来还是请平台（SDD 0046 第四节）；请平台的同时设平台发起 AI 一轮的费用上限
export type KnowbotRequestIn = RevisionIn & {
  title: string
  runtime: string
  mode: 'self' | 'platform'
  budget_limit?: string
}

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
export type Delivery = z.infer<typeof deliverySchema>
export type MyQuestion = z.infer<typeof questionSchema>
export type Answered = z.infer<typeof answeredSchema>
export type CaseResult = z.infer<typeof caseResultSchema>
export type Amendment = z.infer<typeof amendmentSchema>
export type Event = z.infer<typeof eventSchema>
export type Outputs = z.infer<typeof outputsSchema>
export type CaseOutputs = z.infer<typeof caseOutputsSchema>
export type StepOutput = z.infer<typeof stepOutputSchema>

// ---------- 自助测试与测试里的数据（SDD 0046 第三节，decisions ⑭） ----------
export const computerSchema = z.object({
  environment_id: z.string().uuid(),
  name: z.string(),
  os: z.string().nullable().optional(),
  online: z.boolean(),
  roots: z.array(z.string()),
})
export type Computer = z.infer<typeof computerSchema>
export const computersSchema = z.object({
  computers: z.array(computerSchema),
  last: z.object({ environment_id: z.string(), workspace_root: z.string().nullable() }).nullable(),
  // 我在 knowbench 填了模型 key 没有：false 时发起前就拦（SDD 0046 第三节）；null 是说不准
  model_key: z.boolean().nullable().default(null),
})
export type Computers = z.infer<typeof computersSchema>
export const selfTestSchema = z.object({ test_id: z.string().uuid(), status: z.string() })

const candidateSchema = z.object({
  material_id: z.string(),
  version_no: z.number().int(),
  name: z.string().default(''),
})
export const testDataItemSchema = z.object({
  ref: z.string(),
  need_key: z.string(),
  key: z.object({
    subject: z.string().nullable().optional(),
    period_start: z.string().nullable().optional(),
    period_end: z.string().nullable().optional(),
  }),
  status: z.string(),
  chosen: z.array(candidateSchema),
  candidates: z.array(candidateSchema),
})
export type TestDataItem = z.infer<typeof testDataItemSchema>
export const testDataNeedSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    subject: z.string().nullable().optional(),
    doc_type: z.string(),
    period: z
      .object({
        kind: z.string(),
        start: z.string().nullable().optional(),
        end: z.string().nullable().optional(),
      })
      .loose(),
    required: z.boolean().default(false),
  })
  .loose()
export type TestDataNeed = z.infer<typeof testDataNeedSchema>
export const testDataRequestSchema = z.object({
  question_id: z.string().uuid(),
  case_id: z.string(),
  status: z.enum(['proposed', 'supplying', 'missing', 'answered']).nullable(),
  needs: z.array(testDataNeedSchema),
  items: z.array(testDataItemSchema),
  missing: z.array(z.string()),
  incomplete: z.array(z.string()),
})
export type TestDataRequest = z.infer<typeof testDataRequestSchema>
export const testDataSchema = z.object({ requests: z.array(testDataRequestSchema) })
export const testDataAnsweredSchema = z.object({ status: z.string() }).loose()

// ---------- 知识库栏（SDD 0046 第六节）：knowbase 里我展示给 knowlab 的资料，在 knowbase 管 ----------
export const materialSchema = z.object({
  material_id: z.string(),
  name: z.string(),
  mine: z.boolean(),
  category: z.string().nullable().optional(),
  content_origin: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  description: z
    .object({
      subject: z.string().nullable().optional(),
      doc_type: z.string().nullable().optional(),
      period_start: z.string().nullable().optional(),
      period_end: z.string().nullable().optional(),
      data_format: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
    })
    .loose(),
  version_no: z.number().int().nullable().optional(),
  media_type: z.string().nullable().optional(),
  size_bytes: z.number().int().nullable().optional(),
  created_at: z.string().nullable().optional(),
})
export type Material = z.infer<typeof materialSchema>
export const librarySchema = z.object({
  contract_version: z.literal(1),
  materials: z.array(materialSchema),
})
