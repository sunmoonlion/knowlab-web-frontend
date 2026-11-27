import { z } from 'zod'
import { formalMethodRefSchema } from './formal-methods'

export const methodTemplateSchema = z.object({
  template: z.literal('checked_delivery/v1'),
  goal: z.string().min(1).regex(/\S/).max(2000),
  deliverable: z.string().min(1).regex(/\S/).max(2000),
  check: z.string().min(1).regex(/\S/).max(2000),
  evidence: z.string().min(1).regex(/\S/).max(2000),
})
export type MethodTemplate = z.infer<typeof methodTemplateSchema>

// ---------- AI 孵化的一轮（专家孵化方案第八、九节） ----------
// 状态照契约 knowbot-incubation/v1 的结果状态
export const ROUND_STATUSES = [
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'over_budget',
  'cancelled',
] as const
export const ACTIVE_ROUNDS: readonly string[] = ['queued', 'running', 'waiting']
export const DECISION_STATES = ['pending', 'accepted', 'accepted_edited', 'rejected'] as const

const sourceRowSchema = z.object({
  path: z.string(),
  kind: z.enum(['idea', 'answer', 'proposal']),
  quote: z.string().optional(),
  ref: z.string().optional(),
})
// 一条建议：改哪一格、怎么改、理由；出处（引到的那几行）核得上没有；我怎么处理的
export const suggestionSchema = z.object({
  id: z.string(),
  path: z.string(),
  op: z.enum(['set', 'add', 'remove', 'move']),
  value: z.unknown().optional(),
  reason: z.string(),
  sources: z.array(sourceRowSchema),
  // operator：平台人员的提议（不是 AI 的），作者接受了才算（专家孵化方案第十二节）
  kinds: z.array(z.enum(['idea', 'answer', 'proposal', 'operator'])),
  verified: z.boolean(),
  problems: z.array(z.object({ path: z.string(), problem: z.string() })),
  state: z.enum(DECISION_STATES),
})
// 一个缺口：问题、提议、选项；进了审核栏的那一条答了没有
export const gapSchema = z.object({
  gap_id: z.string(),
  question: z.string(),
  proposal: z.string().nullable(),
  options: z.array(z.string()),
  question_id: z.string().uuid().nullable(),
  answered: z.boolean(),
  answer: z.record(z.string(), z.unknown()).nullable(),
})
export const authorSelectionSchema = z.object({
  tree: z
    .object({
      nodes: z.array(
        z.object({
          id: z.string(),
          parent: z.string().nullable(),
          goal: z.string(),
          reason: z.string(),
          status: z.enum(['pending', 'hit', 'split', 'gap', 'clarify']),
          operator: z
            .enum(['leaf', 'sequence', 'parallel_join', 'branch', 'bounded_loop'])
            .nullable(),
        }),
      ),
    })
    .nullish(),
  status: z.enum(['ready', 'clarify', 'gap']),
  reason: z.string(),
  routing_required: z.boolean(),
  steps: z.array(
    z.object({
      id: z.string(),
      task: z.string(),
      method: z.string(),
      inputs: z.record(
        z.string(),
        z
          .object({
            source: z.string(),
            name: z.string().optional(),
            step: z.string().optional(),
            output: z.string().optional(),
          })
          .loose(),
      ),
      route_input: z.string().nullish(),
      cases: z.record(z.string(), z.string()).default({}),
      deliver_as: z.record(z.string(), z.string()).optional(),
      reviews: z.array(z.string()).default([]),
    }),
  ),
  object_batch: z.object({ max_objects: z.number(), on_missing: z.string() }).nullish(),
})

export const roundSchema = z.object({
  selection_issue: z.string().nullish(),
  selection_round: z.boolean().optional(),
  workdraft_revision: z.number().optional(),
  catalog_partial: z.boolean().optional(),
  selection: authorSelectionSchema.nullish(),
  routing_alternatives: z.array(z.string()).optional(),
  method_purposes: z.record(z.string(), z.string()).optional(),
  method_pins: z.record(z.string(), formalMethodRefSchema).optional(),
  method_titles: z.record(z.string(), z.string()).optional(),
  incubation_id: z.string().uuid(),
  round: z.number().int().min(1),
  action: z.enum(['draft', 'revise']),
  instruction: z.string().nullable(),
  step_id: z.string().nullable(),
  status: z.enum(ROUND_STATUSES),
  budget_limit: z.string(),
  spent: z.string().nullable(),
  currency: z.string(),
  waiting_for: z.string().nullable(),
  error: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  // 只有取一轮时才带
  suggestions: z.array(suggestionSchema).optional(),
  gaps: z.array(gapSchema).optional(),
})
export const roundsSchema = z.object({
  contract_version: z.literal(1),
  incubations: z.array(roundSchema),
})
export const oneRoundSchema = z.object({
  contract_version: z.literal(1),
  incubation: roundSchema,
})
export type Round = z.infer<typeof roundSchema>
export type RoundStart = {
  selection_revision?: number
  node_edit?: {
    node: string
    mode: 'revise' | 'split' | 'method'
    method?: z.infer<typeof formalMethodRefSchema>
  }
  action: 'draft' | 'revise'
  instruction?: string
  step_id?: string
  budget_limit: string
  environment_id?: string
  workspace_root?: string
  // 带上最近一次测试的报告让 AI 改（只有「让 AI 改…」，专家孵化方案第 8.4 节）
  with_test?: boolean
}
