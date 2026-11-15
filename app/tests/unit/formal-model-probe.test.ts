import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  formalExecutionCaseSchema,
  formalExecutionCommandSchema,
  formalExecutionResultSchema,
  formalExecutionSpecSchema,
  formalFrozenSuiteSchema,
  suiteCoversCallers,
} from '@/contracts/formal-method-execution'
import {
  formalDraftSchema,
  formalReceiptSchema,
  receiptCoversCallers,
} from '@/contracts/formal-methods'
import vectors from '@/contracts/formal-method-provider/samples.json'
import lock from '@/contracts/formal-method-provider/lock.json'

// Cross-service request/registration vectors exercise only their web-consumed
// draft, suite, receipt and caller qualification projection, not a web API route.
function accepts(schema: string, value: unknown): boolean {
  if (schema === 'execution-command') return formalExecutionCommandSchema.safeParse(value).success
  if (schema === 'execution-result') return formalExecutionResultSchema.safeParse(value).success
  if (schema === 'suite') return formalFrozenSuiteSchema.safeParse(value).success
  const record = value as Record<string, unknown>
  const draft = formalDraftSchema.safeParse(record.draft)
  if (!draft.success) return false
  if (schema === 'registration-request') {
    const receipt = formalReceiptSchema.safeParse(record.validation)
    return receipt.success && receiptCoversCallers(receipt.data, draft.data.allowed_callers)
  }
  if (schema === 'execution-request') {
    const execution = record.execution as Record<string, unknown>
    const suite = formalFrozenSuiteSchema.safeParse(execution.suite)
    if (!suite.success) return false
    const input = {
      suite_id: suite.data.suite_id,
      version: suite.data.version,
      cases: suite.data.cases,
    }
    return (
      formalExecutionSpecSchema.safeParse({ ...execution, suite: input }).success &&
      suiteCoversCallers(input, draft.data.allowed_callers)
    )
  }
  throw new Error(`Unmapped provider schema: ${schema}`)
}
const sample = (name: string) =>
  structuredClone(vectors.samples.find((v) => v.name === name)!.value) as Record<string, unknown>
const modelCommand = () => formalExecutionCommandSchema.parse(sample('model-command'))

describe('provider model probe vectors and web qualification', () => {
  it.each(vectors.samples)('$name ($schema)', ({ schema, value, valid }) => {
    expect(accepts(schema, value)).toBe(valid)
  })
  it('locks every generated provider schema and vector file', () => {
    for (const [name, digest] of Object.entries(lock.files_sha256)) {
      const bytes = readFileSync(resolve('contracts/formal-method-provider', name))
      expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(digest)
    }
  })
  it('preserves omitted legacy host caller and model fields', () => {
    const value = formalExecutionCommandSchema.parse(sample('host-command'))
    expect(value.execution.model_probe).toBeUndefined()
    expect(value.execution.suite.cases[0].caller).toBeUndefined()
    expect(value.execution.suite.cases[0].input.model_prompt).toBeUndefined()
  })
  it.each(['', '   ', 'x'.repeat(4001)])('rejects invalid model prompts', (prompt) => {
    const c = modelCommand().execution.suite.cases[0]
    expect(
      formalExecutionCaseSchema.safeParse({ ...c, input: { ...c.input, model_prompt: prompt } })
        .success,
    ).toBe(false)
  })
  it('does not allow host prompts, host probe limits, model negative shortcuts or forged evidence', () => {
    const command = modelCommand()
    const c = command.execution.suite.cases[0]
    expect(formalExecutionCaseSchema.safeParse({ ...c, caller: 'host' }).success).toBe(false)
    expect(
      formalExecutionSpecSchema.safeParse({
        ...command.execution,
        suite: {
          ...command.execution.suite,
          cases: [{ ...c, caller: 'host', input: { values: {} } }],
        },
      }).success,
    ).toBe(false)
    expect(
      formalExecutionCaseSchema.safeParse({
        ...c,
        expected: { outcome: 'rejected', rejection_code: 'authorization_denied', assertions: [] },
      }).success,
    ).toBe(false)
    expect(
      formalExecutionCaseSchema.safeParse({
        ...c,
        expected: { outcome: 'rejected', rejection_code: 'approval_denied', assertions: [] },
      }).success,
    ).toBe(true)
    expect(formalExecutionCommandSchema.safeParse({ ...command, passed: true }).success).toBe(false)
    expect(
      formalExecutionSpecSchema.safeParse({
        ...command.execution,
        model_probe: { max_turns: 2, max_method_calls: 1 },
      }).success,
    ).toBe(false)
    expect(
      formalExecutionSpecSchema.safeParse({
        ...command.execution,
        model_probe: { max_turns: 1, max_method_calls: 2 },
      }).success,
    ).toBe(false)
  })
  it('requires exact caller coverage and independent positive cases', () => {
    const suite = modelCommand().execution.suite
    expect(suiteCoversCallers(suite, ['model'])).toBe(true)
    expect(suiteCoversCallers(suite, ['host'])).toBe(false)
    expect(suiteCoversCallers(suite, ['host', 'model'])).toBe(false)
    const negative = {
      ...suite,
      cases: suite.cases.map((c) => ({
        ...c,
        expected: {
          outcome: 'rejected' as const,
          rejection_code: 'approval_denied' as const,
          assertions: [],
        },
      })),
    }
    expect(suiteCoversCallers(negative, ['model'])).toBe(false)
  })
  it('requires real references and rejects changed caller receipts', () => {
    const result = formalExecutionResultSchema.parse(sample('model-passed-result'))
    for (const missing of ['task_id', 'attempt_id', 'call_id', 'model_trace'] as const) {
      expect(
        formalExecutionResultSchema.safeParse({
          ...result,
          cases: [{ ...result.cases[0], [missing]: null }],
        }).success,
      ).toBe(false)
    }
    expect(
      formalExecutionResultSchema.safeParse({
        ...result,
        cases: [{ ...result.cases[0], caller: 'host' }],
      }).success,
    ).toBe(false)
    const receipt = result.admission.receipt!
    expect(
      formalReceiptSchema.safeParse({
        ...receipt,
        execution: { ...receipt.execution, validated_callers: ['model', 'model'] },
      }).success,
    ).toBe(false)
    expect(receiptCoversCallers(receipt, ['host', 'model'])).toBe(false)
  })
})
