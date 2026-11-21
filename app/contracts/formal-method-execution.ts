import { z } from 'zod'
import { formalValidationSchema, receiptCoversCallers, type FormalDraft } from './formal-methods'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const caseId = z.string().regex(/^[A-Za-z0-9_-]{1,48}$/)
const pointer = z
  .string()
  .max(512)
  .regex(/^(?:\/(?:[^~/]|~[01])*)*$/)
const rejection = z.enum(['authorization_denied', 'approval_denied', 'input_invalid'])
const state = z.enum(['pending', 'running', 'waiting', 'passed', 'failed', 'cancelled'])

export function boundedExecutionJson(value: unknown): boolean {
  try {
    const visit = (item: unknown, depth: number): boolean =>
      depth <= 32 &&
      (item === null ||
        typeof item !== 'object' ||
        Object.values(item).every((v) => visit(v, depth + 1)))
    return visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= 64000
  } catch {
    return false
  }
}

export const formalAssertionSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('equals'), pointer, value: z.json().refine(boundedExecutionJson) })
    .strict(),
  z
    .object({
      kind: z.literal('approx'),
      pointer,
      value: z.number(),
      absolute_tolerance: z.number().min(0),
    })
    .strict(),
  z.object({ kind: z.literal('contains'), pointer, value: z.string().min(1).max(20000) }).strict(),
])
export const formalExecutionCaseSchema = z
  .object({
    case_id: caseId,
    covers_promises: z
      .array(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/))
      .max(30)
      .optional(),
    caller: z.enum(['host', 'model']).optional(),
    input: z
      .object({
        values: z
          .record(z.string(), z.json())
          .refine((v) => Object.keys(v).length <= 100 && boundedExecutionJson(v)),
        model_prompt: z.string().min(1).max(4000).nullable().optional(),
      })
      .strict(),
    repetitions: z.number().int().min(1).max(10),
    minimum_passes: z.number().int().min(1).max(10),
    expected: z
      .object({
        outcome: z.enum(['succeeded', 'rejected']),
        rejection_code: rejection.nullable().default(null),
        assertions: z.array(formalAssertionSchema).max(64),
      })
      .strict()
      .refine((v) =>
        v.outcome === 'succeeded'
          ? v.rejection_code === null && v.assertions.length > 0
          : v.rejection_code !== null && v.assertions.length === 0,
      ),
  })
  .strict()
  .refine((v) => v.minimum_passes <= v.repetitions)
  .refine((v) => (v.caller === 'model') === (v.input.model_prompt != null))
  .refine((v) => v.input.model_prompt == null || /\S/.test(v.input.model_prompt))
  .refine(
    (v) =>
      v.caller !== 'model' ||
      v.expected.outcome !== 'rejected' ||
      v.expected.rejection_code === 'approval_denied',
  )
export const formalSuiteInputSchema = z
  .object({
    suite_id: z.uuid(),
    version: z.number().int().min(1),
    cases: z.array(formalExecutionCaseSchema).min(1).max(50),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.cases.map((c) => c.case_id)).size === v.cases.length &&
      v.cases.reduce((n, c) => n + c.repetitions, 0) <= 50 &&
      v.cases.some((c) => c.expected.outcome === 'succeeded') &&
      new TextEncoder().encode(JSON.stringify(v)).length <= 1000000,
  )
export const formalExecutionSpecSchema = z
  .object({
    suite: formalSuiteInputSchema,
    runner: z
      .object({
        kind: z.literal('user'),
        environment_id: z.uuid(),
        workspace_root: z.string().min(1).max(1024),
      })
      .strict(),
    budget: z
      .object({
        limit: z.string().regex(/^[0-9]{1,6}(\.[0-9]{1,2})?$/),
        currency: z.literal('CNY'),
      })
      .strict(),
    timeout_seconds: z.number().int().min(60).max(86400),
    max_wait_seconds: z.number().int().min(60).max(604800),
    model_probe: z
      .object({ max_turns: z.literal(1), max_method_calls: z.literal(1) })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()
  .refine((v) => v.suite.cases.some((c) => c.caller === 'model') === (v.model_probe != null))
export const formalExecutionCommandSchema = z
  .object({
    request_id: z.uuid(),
    revision: z.number().int().min(1),
    run_id: z.uuid(),
    execution: formalExecutionSpecSchema,
  })
  .strict()
export const formalFrozenSuiteSchema = formalSuiteInputSchema.safeExtend({ digest })
const suiteRef = z.object({ suite_id: z.uuid(), version: z.number().int().min(1), digest }).strict()
export const formalExecutionActionSchema = z
  .object({
    call_id: z.uuid(),
    case_id: caseId,
    repetition: z.number().int().min(1).max(10),
    interaction_id: z.uuid(),
    token: z.string().min(1).max(256),
    subject_digest: z.string().min(1).max(128),
    expires_at: z.iso.datetime({ offset: true }),
    title: z.string().max(200),
    question: z.string().max(2000),
    subject: z.record(z.string(), z.json()),
  })
  .strict()
const slotName = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
const branchArtifact = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    content_digest: digest,
    output_names: z.array(slotName).max(100),
  })
  .strict()
const partialReport = z
  .object({
    scope_digest: digest,
    received: z.array(slotName),
    steps: z
      .array(
        z
          .object({
            step: slotName,
            depends_on: z.array(slotName),
            detail: z.string().max(2000),
            state: z.enum(['accepted', 'failed', 'cancelled', 'unknown', 'not_run', 'unverified']),
            artifact: branchArtifact.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    missing_promises: z.record(
      slotName,
      z.object({ description: z.string(), missing_outputs: z.array(slotName) }).strict(),
    ),
  })
  .strict()
export const reviewCriteriaSchema = z
  .object({
    outputs: z.array(slotName).min(1).max(100),
    assertions: z.array(formalAssertionSchema).min(1).max(64),
    reviewer: z.enum(['isolated_reviewer', 'different_model_family']),
  })
  .strict()
const branchReviewSchema = z
  .object({
    criteria: reviewCriteriaSchema,
    checks: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            passed: z.boolean(),
            detail: z.string(),
          })
          .strict(),
      )
      .min(1)
      .max(64),
    status: z.enum(['v0_failed', 'awaiting_isolation']),
    handoff: z.record(slotName, digest),
    digest,
  })
  .strict()
  .refine(
    (r) =>
      r.checks.length === r.criteria.assertions.length &&
      r.checks.every((c, i) => c.index === i) &&
      (r.status === 'awaiting_isolation'
        ? r.checks.every((c) => c.passed) &&
          Object.keys(r.handoff).length === r.criteria.outputs.length &&
          r.criteria.outputs.every((k) => Object.hasOwn(r.handoff, k))
        : r.checks.some((c) => !c.passed) && !Object.keys(r.handoff).length),
  )
export type ReviewCriteria = z.infer<typeof reviewCriteriaSchema>
export const branchDeliverySchema = z
  .object({
    method_id: z.uuid(),
    request_id: z.uuid(),
    run_id: z.uuid(),
    case_id: caseId,
    repetition: z.number().int().min(1).max(10),
    step: slotName,
    scope_digest: digest,
    review: branchReviewSchema.optional(),
    received_at: z.iso.datetime({ offset: true }),
    artifact: branchArtifact,
    outputs: z.record(slotName, z.json()).refine(boundedExecutionJson),
  })
  .strict()

export const formalExecutionResultSchema = z
  .object({
    contract: z.literal('knowlab/formal-method-execution/v1'),
    run_id: z.uuid(),
    request_id: z.uuid(),
    method_id: z.uuid(),
    request_digest: digest,
    suite: suiteRef,
    status: state,
    admission: formalValidationSchema,
    cases: z
      .array(
        z
          .object({
            partial: partialReport.optional(),
            verified_steps: partialReport.optional(),
            case_id: caseId,
            caller: z.enum(['host', 'model']).optional(),
            model_trace: z
              .object({
                thread_id: z.string().min(1).max(200),
                turn_id: z.string().min(1).max(200),
                tool_call_id: z.string().min(1).max(200),
                method_call_id: z.uuid(),
              })
              .strict()
              .nullable()
              .optional(),
            repetition: z.number().int().min(1).max(10),
            status: state,
            outcome: z.enum(['pending', 'succeeded', 'rejected', 'failed', 'unknown', 'cancelled']),
            rejection_code: rejection.nullable(),
            task_id: z.uuid().nullable(),
            attempt_id: z.uuid().nullable(),
            call_id: z.uuid().nullable(),
            assertions: z
              .array(
                z
                  .object({
                    index: z.number().int().min(0).max(63),
                    passed: z.boolean(),
                    detail: z.string().max(2000),
                  })
                  .strict(),
              )
              .max(64),
            detail: z.string().max(2000),
          })
          .strict()
          .refine((v) => (v.caller ?? 'host') !== 'host' || v.model_trace == null)
          .refine(
            (v) =>
              v.caller !== 'model' ||
              v.status !== 'passed' ||
              !!(v.model_trace && v.task_id && v.attempt_id && v.call_id),
          ),
      )
      .max(50),
    spent: z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/),
    currency: z.literal('CNY'),
    actions: z.array(formalExecutionActionSchema).max(50),
  })
  .strict()
  .refine((v) => {
    if (
      v.admission.run_id !== v.run_id ||
      new Set(v.cases.map((c) => `${c.case_id}:${c.repetition}`)).size !== v.cases.length
    )
      return false
    if (
      v.actions.some(
        (a) =>
          !v.cases.some(
            (c) =>
              c.case_id === a.case_id && c.repetition === a.repetition && c.call_id === a.call_id,
          ),
      )
    )
      return false
    const r = v.admission.receipt,
      e = r?.execution
    if (
      r &&
      (v.status !== 'passed' ||
        r.run_id !== v.run_id ||
        !e ||
        e.request_digest !== v.request_digest ||
        e.suite_id !== v.suite.suite_id ||
        e.suite_version !== v.suite.version ||
        e.suite_digest !== v.suite.digest ||
        r.request_id !== v.request_id ||
        r.method_id !== v.method_id)
    )
      return false
    const callers = [...new Set(v.cases.map((c) => c.caller ?? 'host'))]
    const positive = new Set(
      v.cases
        .filter((c) => c.status === 'passed' && c.outcome === 'succeeded')
        .map((c) => c.caller ?? 'host'),
    )
    return (
      v.status !== 'passed' ||
      (!!r &&
        receiptCoversCallers(r, callers) &&
        callers.every((caller) => positive.has(caller)) &&
        v.cases.length > 0 &&
        v.cases.every(
          (c) =>
            !['pending', 'unknown', 'cancelled'].includes(c.outcome) &&
            !['pending', 'running', 'waiting', 'cancelled'].includes(c.status),
        ))
    )
  })
export type FormalExecutionSpec = z.infer<typeof formalExecutionSpecSchema>
export type FormalExecutionResult = z.infer<typeof formalExecutionResultSchema>
export type FormalExecutionAction = z.infer<typeof formalExecutionActionSchema>

export function suiteCoversCallers(
  suite: z.infer<typeof formalSuiteInputSchema>,
  callers: FormalDraft['allowed_callers'],
) {
  return (
    suite.cases.every((c) => callers.includes(c.caller ?? 'host')) &&
    callers.every((caller) =>
      suite.cases.some(
        (c) => (c.caller ?? 'host') === caller && c.expected.outcome === 'succeeded',
      ),
    )
  )
}

export type BranchDelivery = z.infer<typeof branchDeliverySchema>
