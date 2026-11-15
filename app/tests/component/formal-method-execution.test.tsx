import { fireEvent, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FormalMethodExecution } from '@/components/knowbots/formal-method-execution'
import { formalDraftSchema } from '@/contracts/formal-methods'
import {
  formalExecutionResultSchema,
  formalSuiteInputSchema,
} from '@/contracts/formal-method-execution'
import { decideFormalExecution, getFormalExecution } from '@/lib/knowbots/formal-method-execution'
import messages from '@/messages/zh-CN.json'
import { CSRF, REQUEST, renderWith } from './knowbot-fixtures'
const METHOD = '70d89579-f919-4c13-9ba2-78f091ed639f'
const RUN = '9659855c-1bfc-4934-a571-839bacf7e202'
const ENV = '81d89579-f919-4c13-9ba2-78f091ed639f'
const CALL = '82d89579-f919-4c13-9ba2-78f091ed639f'
const DIGEST = 'sha256:' + 'a'.repeat(64)
const t = messages.formalExecution
const command = { request_id: REQUEST, revision: 2, run_id: RUN }
const source = {
  asset_id: ENV,
  asset_revision: 1,
  kind: 'mcp',
  source: 'fixture.mcp',
  version: '1',
  digest: DIGEST,
  entry: 'check',
  license_basis: 'pending',
}
const draft = formalDraftSchema.parse({
  source,
  allowed_callers: ['host'],
  definition: {
    contract: 'knowlab/formal-method/v1',
    capability_declaration: {
      title: 'Check',
      purpose: 'Check a value',
      applies_when: ['value available'],
      excludes: [],
      promises: { result: 'Return checked value' },
    },
    access_requirements: [],
    procedure: {
      kind: 'direct',
      implementation: {
        kind: 'mcp',
        source: source.source,
        version: '1',
        digest: DIGEST,
        entry: 'check',
        requirement_ids: [],
      },
      inputs: {},
      outputs: {
        ok: {
          description: 'Checked',
          schema: { type: 'boolean' },
          required: true,
          meaning: {},
          on_missing: 'fail',
        },
      },
      instructions: 'Check',
      stop_conditions: ['invalid input'],
      max_model_turns: 0,
    },
    how_to_validate: [
      {
        promise_id: 'result',
        outputs: ['ok'],
        check: 'Equals true',
        evidence: 'Output',
        on_failure: 'fail',
      },
    ],
    what_requires_approval: [],
  },
})
const suite = {
  suite_id: ENV,
  version: 1,
  cases: [
    {
      case_id: 'case_1',
      input: { values: { message: 'input only' } },
      repetitions: 1,
      minimum_passes: 1,
      expected: {
        outcome: 'succeeded',
        rejection_code: null,
        assertions: [{ kind: 'equals', pointer: '/ok', value: true }],
      },
    },
  ],
}
const pending = () => ({
  contract: 'knowlab/formal-method-execution/v1',
  run_id: RUN,
  request_id: REQUEST,
  method_id: METHOD,
  request_digest: DIGEST,
  suite: { suite_id: ENV, version: 1, digest: DIGEST },
  status: 'waiting',
  admission: {
    contract: 'knowlab/formal-method-validation/v1',
    run_id: RUN,
    status: 'pending',
    receipt: null,
    missing_checks: ['outcome'],
    details: [],
  },
  cases: [
    {
      case_id: 'case_1',
      repetition: 1,
      status: 'waiting',
      outcome: 'pending',
      rejection_code: null,
      task_id: null,
      attempt_id: null,
      call_id: CALL,
      assertions: [],
      detail: 'Awaiting approval',
    },
  ],
  spent: '0',
  currency: 'CNY',
  actions: [
    {
      call_id: CALL,
      case_id: 'case_1',
      repetition: 1,
      interaction_id: ENV,
      token: 'exact-token',
      subject_digest: 'exact-subject',
      expires_at: '2099-01-01T00:00:00Z',
      title: 'Approve fixture check',
      question: 'Allow this exact input?',
      subject: { tool: 'check', arguments: { message: 'input only' } },
    },
  ],
})
const fetcher = vi.fn()
let value = pending()
let posts: { url: string; body: Record<string, unknown> }[]
beforeEach(() => {
  value = pending()
  posts = []
  fetcher.mockReset()
  vi.stubGlobal('fetch', fetcher)
  fetcher.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/computers'))
      return Response.json({
        computers: [
          { environment_id: ENV, name: 'Local test computer', online: true, roots: ['/safe'] },
        ],
        last: null,
        model_key: false,
      })
    if (url.includes('/formal-test-suites/')) return Response.json({ ...suite, digest: DIGEST })
    if (init.method === 'POST') {
      const body = JSON.parse(String(init.body))
      posts.push({ url, body })
      if (url.endsWith('/executions')) {
        value.run_id = body.run_id
        value.admission.run_id = body.run_id
        value.suite.suite_id = body.execution.suite.suite_id
      }
      if (url.endsWith('/cancel')) {
        value.status = 'cancelled'
        value.actions = []
      }
    }
    return Response.json(value)
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
function page(resume = false) {
  const onRun = vi.fn(),
    onResult = vi.fn(),
    onActiveChange = vi.fn()
  renderWith(
    <FormalMethodExecution
      methodId={METHOD}
      requestId={REQUEST}
      revision={2}
      draft={draft}
      disabled={false}
      csrfToken={CSRF}
      resume={resume ? command : null}
      onRun={onRun}
      onResult={onResult}
      onActiveChange={onActiveChange}
    />,
  )
  return { onRun, onResult, onActiveChange }
}
async function fill() {
  await screen.findByText('Local test computer')
  fireEvent.change(screen.getByLabelText(t.values), {
    target: { value: '{"message":"input only"}' },
  })
  fireEvent.change(screen.getByLabelText(t.assertions, { exact: false }), {
    target: { value: '[{"kind":"equals","pointer":"/ok","value":true}]' },
  })
  fireEvent.change(screen.getByLabelText(t.computer), { target: { value: ENV } })
  fireEvent.change(screen.getByLabelText(t.workspace), { target: { value: '/safe' } })
}
it('starts a real suite without a model key and keeps assertions separate from tool input', async () => {
  const callbacks = page()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: t.start }))
  await screen.findByText('Approve fixture check')
  expect(posts).toHaveLength(1)
  const body = posts[0].body as {
    execution: { suite: typeof suite & { digest?: string }; runner: unknown }
    run_id: string
  }
  expect(body.execution.suite.digest).toBeUndefined()
  expect(body.execution.suite.cases[0].input).toEqual({ values: { message: 'input only' } })
  expect(body.execution.suite.cases[0].expected.assertions).toEqual(
    suite.cases[0].expected.assertions,
  )
  expect(body.execution.runner).toEqual({
    kind: 'user',
    environment_id: ENV,
    workspace_root: '/safe',
  })
  expect(callbacks.onRun).toHaveBeenCalledWith({
    request_id: REQUEST,
    revision: 2,
    run_id: body.run_id,
  })
  expect(screen.queryByRole('button', { name: t.start })).not.toBeInTheDocument()
  expect(callbacks.onActiveChange).toHaveBeenLastCalledWith(true)
})
it('restores with GET only, answers the exact approval and cancels through the run identity', async () => {
  page(true)
  await screen.findByText('Approve fixture check')
  expect(posts).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: t.accept }))
  await waitFor(() => expect(posts).toHaveLength(1))
  expect(posts[0].body).toEqual({
    request_id: REQUEST,
    case_id: 'case_1',
    repetition: 1,
    token: 'exact-token',
    subject_digest: 'exact-subject',
    decision: 'accept',
  })
  expect(posts[0].url).toContain(`/executions/${RUN}/actions/${CALL}`)
  await waitFor(() => expect(screen.getByRole('button', { name: t.cancel })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: t.cancel }))
  await waitFor(() => expect(posts).toHaveLength(2))
  expect(posts[1].body).toEqual({ request_id: REQUEST })
  await screen.findByRole('button', { name: t.nextVersion })
})
it('does not submit malformed assertions or negative-only suites', async () => {
  page()
  await fill()
  fireEvent.change(screen.getByLabelText(t.assertions, { exact: false }), {
    target: { value: '[]' },
  })
  fireEvent.click(screen.getByRole('button', { name: t.start }))
  await screen.findByText(t.invalid)
  expect(posts).toHaveLength(0)
  expect(
    formalSuiteInputSchema.safeParse({
      ...suite,
      cases: [
        {
          ...suite.cases[0],
          expected: { outcome: 'rejected', rejection_code: 'input_invalid', assertions: [] },
        },
      ],
    }).success,
  ).toBe(false)
})
it('rejects foreign run snapshots and stale or invented approval tokens before posting', async () => {
  value.run_id = ENV
  await expect(getFormalExecution(METHOD, command)).rejects.toThrow()
  const result = formalExecutionResultSchema.parse(pending())
  await expect(
    decideFormalExecution(
      METHOD,
      command,
      { ...result.actions[0], token: 'invented' },
      'accept',
      CSRF,
      result,
    ),
  ).rejects.toThrow()
  const expired = {
    ...result,
    actions: [{ ...result.actions[0], expires_at: '2020-01-01T00:00:00Z' }],
  }
  await expect(
    decideFormalExecution(METHOD, command, expired.actions[0], 'accept', CSRF, expired),
  ).rejects.toThrow()
  expect(posts).toHaveLength(0)
})
it('keeps unknown outcomes distinct and rejects a claimed pass without complete evidence', () => {
  expect(
    formalExecutionResultSchema.parse({
      ...pending(),
      cases: [{ ...pending().cases[0], outcome: 'unknown' }],
    }).cases[0].outcome,
  ).toBe('unknown')
  expect(formalExecutionResultSchema.safeParse({ ...pending(), status: 'passed' }).success).toBe(
    false,
  )
})

it('retries a failed start with the identical frozen submission and never automatically posts again', async () => {
  const fallback = fetcher.getMockImplementation()!
  const attempts: string[] = []
  fetcher.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/executions') && init.method === 'POST') {
      attempts.push(String(init.body))
      if (attempts.length === 1) throw new TypeError('connection lost')
    }
    if (url.includes('/executions/') && !init.method) throw new TypeError('connection lost')
    return fallback(url, init)
  })
  page()
  await fill()
  fireEvent.click(screen.getByRole('button', { name: t.start }))
  const retry = await screen.findByRole('button', { name: t.retry })
  expect(attempts).toHaveLength(1)
  fireEvent.click(retry)
  await screen.findByText('Approve fixture check')
  expect(attempts).toHaveLength(2)
  expect(attempts[1]).toBe(attempts[0])
})
it('loads the frozen inputs and assertions before editing the next suite version', async () => {
  value.status = 'cancelled'
  value.actions = []
  page(true)
  fireEvent.click(await screen.findByRole('button', { name: t.nextVersion }))
  await screen.findByText('测试集版本 2')
  expect(screen.getByLabelText(t.values)).toHaveValue(
    JSON.stringify(suite.cases[0].input.values, null, 2),
  )
  expect(screen.getByLabelText(t.assertions, { exact: false })).toHaveValue(
    JSON.stringify(suite.cases[0].expected.assertions, null, 2),
  )
  expect(posts).toHaveLength(0)
})
