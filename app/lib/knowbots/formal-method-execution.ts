import {
  formalExecutionResultSchema,
  formalExecutionCommandSchema,
  formalFrozenSuiteSchema,
  type FormalExecutionSpec,
  type FormalExecutionResult,
  type FormalExecutionAction,
} from '@/contracts/formal-method-execution'
import { requestJson } from '@/lib/common/api-client'
import { KnowbotContractError } from './client'
import { parseFormalReply, type ValidationCommand } from './formal-methods'

const path = (method: string) => `/api/web/v1/method-units/${encodeURIComponent(method)}/executions`
const runPath = (method: string, run: string) => `${path(method)}/${encodeURIComponent(run)}`
export type FormalExecutionCommand = ValidationCommand & { execution: FormalExecutionSpec }

export async function getFormalSuite(request: string, reference: FormalExecutionResult['suite']) {
  const suite = parseFormalReply(
    formalFrozenSuiteSchema,
    await requestJson(
      `/api/web/v1/knowbot-requests/${encodeURIComponent(request)}/formal-test-suites/${encodeURIComponent(reference.suite_id)}/versions/${reference.version}`,
    ),
  )
  if (
    suite.suite_id !== reference.suite_id ||
    suite.version !== reference.version ||
    suite.digest !== reference.digest
  )
    throw new KnowbotContractError()
  return suite
}

function checked(
  value: unknown,
  method: string,
  command: ValidationCommand,
  prior?: FormalExecutionResult,
) {
  const r = parseFormalReply(formalExecutionResultSchema, value)
  if (
    r.method_id !== method ||
    r.run_id !== command.run_id ||
    r.request_id !== command.request_id ||
    (r.admission.receipt && r.admission.receipt.revision !== command.revision) ||
    (prior &&
      (r.request_digest !== prior.request_digest ||
        JSON.stringify(r.suite) !== JSON.stringify(prior.suite) ||
        r.cases.some((c) =>
          prior.cases.some(
            (p) =>
              p.case_id === c.case_id &&
              p.repetition === c.repetition &&
              (p.caller ?? 'host') !== (c.caller ?? 'host'),
          ),
        )))
  )
    throw new KnowbotContractError()
  return r
}

export async function startFormalExecution(
  method: string,
  command: FormalExecutionCommand,
  csrfToken: string,
) {
  const payload = formalExecutionCommandSchema.parse(command)
  const execution = payload.execution
  const r = checked(
    await requestJson(path(method), { method: 'POST', csrfToken, body: payload }),
    method,
    command,
  )
  if (
    r.suite.suite_id !== execution.suite.suite_id ||
    r.suite.version !== execution.suite.version ||
    r.cases.some(
      (c) =>
        !execution.suite.cases.some(
          (expected) =>
            expected.case_id === c.case_id &&
            c.repetition <= expected.repetitions &&
            (expected.caller ?? 'host') === (c.caller ?? 'host'),
        ),
    )
  )
    throw new KnowbotContractError()
  return r
}
export async function getFormalExecution(
  method: string,
  command: ValidationCommand,
  prior?: FormalExecutionResult,
) {
  return checked(
    await requestJson(
      `${runPath(method, command.run_id)}?request_id=${encodeURIComponent(command.request_id)}`,
    ),
    method,
    command,
    prior,
  )
}
export async function cancelFormalExecution(
  method: string,
  command: ValidationCommand,
  csrfToken: string,
  prior?: FormalExecutionResult,
) {
  return checked(
    await requestJson(`${runPath(method, command.run_id)}/cancel`, {
      method: 'POST',
      csrfToken,
      body: { request_id: command.request_id },
    }),
    method,
    command,
    prior,
  )
}
export async function decideFormalExecution(
  method: string,
  command: ValidationCommand,
  action: FormalExecutionAction,
  decision: 'accept' | 'decline',
  csrfToken: string,
  prior: FormalExecutionResult,
) {
  if (
    !prior.actions.some((a) => JSON.stringify(a) === JSON.stringify(action)) ||
    Date.parse(action.expires_at) <= Date.now()
  )
    throw new KnowbotContractError()
  return checked(
    await requestJson(
      `${runPath(method, command.run_id)}/actions/${encodeURIComponent(action.call_id)}`,
      {
        method: 'POST',
        csrfToken,
        body: {
          request_id: command.request_id,
          case_id: action.case_id,
          repetition: action.repetition,
          token: action.token,
          subject_digest: action.subject_digest,
          decision,
        },
      },
    ),
    method,
    command,
    prior,
  )
}
