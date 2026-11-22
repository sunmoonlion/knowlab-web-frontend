import { fireEvent, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FormalMethodExecution } from '@/components/knowbots/formal-method-execution'
import {
  formalDraftSchema,
  type FormalDraft,
  type FormalDefinition,
} from '@/contracts/formal-methods'
import { supportsOrchestrationExecution } from '@/lib/knowbots/formal-orchestration'
import { orchestrationDraft } from '../fixtures/formal-orchestration'
import {
  formalExecutionResultSchema,
  formalSuiteInputSchema,
} from '@/contracts/formal-method-execution'
import {
  decideFormalExecution,
  getFormalExecution,
  startFormalExecution,
} from '@/lib/knowbots/formal-method-execution'
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
function page(
  resume = false,
  callers: ('host' | 'model')[] = ['host'],
  definition: FormalDraft = draft,
  restored = command,
) {
  const onRun = vi.fn(),
    onResult = vi.fn(),
    onActiveChange = vi.fn()
  renderWith(
    <FormalMethodExecution
      methodId={METHOD}
      requestId={REQUEST}
      revision={2}
      draft={{ ...definition, allowed_callers: callers }}
      disabled={false}
      csrfToken={CSRF}
      resume={resume ? restored : null}
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
it('requires a licensed instruction source before offering a billable trial', () => {
  const instruction = structuredClone(draft)
  if (instruction.definition.procedure.kind !== 'direct') throw new Error('expected tool')
  instruction.definition.procedure.implementation.kind = 'skill_instruction'
  instruction.definition.procedure.max_model_turns = 1
  page(false, ['host'], instruction)
  expect(screen.getByText(t.instructionValidation)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: t.start })).not.toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})

it.each(['skill_instruction', 'registered_instruction'] as const)(
  'submits a single-turn %s trial with separate assertions',
  async (kind) => {
    const instruction = structuredClone(draft)
    if (!instruction.source || instruction.definition.procedure.kind !== 'direct')
      throw new Error('expected tool')
    instruction.source.kind = kind
    instruction.source.license_basis = kind === 'registered_instruction' ? 'owner' : 'author_grant'
    instruction.definition.procedure.implementation.kind = kind
    instruction.definition.procedure.max_model_turns = 1
    page(false, ['host'], instruction)
    expect(screen.getByText(t.instructionTrial)).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: t.rejected })).not.toBeInTheDocument()
    await fill()
    fireEvent.click(screen.getByRole('button', { name: t.start }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].body).toMatchObject({ execution: { suite: { cases: suite.cases } } })
  },
)

it.each(['skill_script', 'registered_script', 'service_function'] as const)(
  'submits a zero-turn host %s from the author page',
  async (kind) => {
    const script = structuredClone(draft)
    if (script.definition.procedure.kind !== 'direct') throw new Error('expected tool')
    script.definition.procedure.implementation.kind = kind
    page(false, ['host'], script)
    await fill()
    fireEvent.click(screen.getByRole('button', { name: t.start }))
    await screen.findByText('Approve fixture check')
    expect(posts[0].url).toContain('/executions')
  },
)
it.each([
  ['knowbase', 'read_method_input', true],
  ['knowbase', 'read_input', false],
  ['other', 'read_method_input', false],
] as const)(
  'checks the exact registered function before enabling a model trial for %s/%s',
  (provider, entry, enabled) => {
    const candidate = structuredClone(draft)
    if (!candidate.source || candidate.definition.procedure.kind !== 'direct')
      throw new Error('expected tool')
    Object.assign(candidate.source, {
      kind: 'service_function',
      source: provider,
      entry,
      asset_id: null,
      asset_revision: null,
    })
    Object.assign(candidate.definition.procedure.implementation, {
      kind: 'service_function',
      source: provider,
      entry,
    })
    page(false, ['model'], candidate)
    expect(!!screen.queryByRole('button', { name: t.start })).toBe(enabled)
  },
)

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

it('submits model prompts and fixed probe limits separately from expectations', async () => {
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation(async (url, init) => {
    const response = await fallback(url, init)
    if (url.includes('/executions')) {
      const body = await response.json()
      body.cases[0].caller = 'model'
      return Response.json(body)
    }
    return response
  })
  page(false, ['model'])
  await fill()
  expect(screen.getByText(t.modelProbe)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText(t.modelPrompt, { exact: false }), {
    target: { value: 'Check the supplied message using this method.' },
  })
  fireEvent.click(screen.getByRole('button', { name: t.start }))
  await screen.findByText('Approve fixture check')
  const execution = posts[0].body.execution as {
    model_probe: unknown
    suite: { cases: { caller: string; input: unknown; expected: unknown }[] }
  }
  expect(execution.model_probe).toEqual({ max_turns: 1, max_method_calls: 1 })
  expect(execution.suite.cases[0].caller).toBe('model')
  expect(execution.suite.cases[0].input).toEqual({
    values: { message: 'input only' },
    model_prompt: 'Check the supplied message using this method.',
  })
  expect(execution.suite.cases[0].expected).toEqual(suite.cases[0].expected)
  expect(screen.getByText(t.tracePending)).toBeInTheDocument()
})
it('requires positive coverage of both declared callers before starting', async () => {
  page(false, ['host', 'model'])
  await screen.findByText('Local test computer')
  fireEvent.click(screen.getAllByRole('button', { name: t.remove })[1])
  await fill()
  fireEvent.click(screen.getByRole('button', { name: t.start }))
  await screen.findByRole('alert')
  expect(posts).toHaveLength(0)
  expect(screen.getByRole('alert')).toHaveTextContent(t.callerCoverage)
})
it('shows only real model runtime references and restores the model suite for the next version', async () => {
  const modelSuite = {
    ...suite,
    cases: [
      {
        ...suite.cases[0],
        caller: 'model',
        input: { ...suite.cases[0].input, model_prompt: 'Check this input' },
      },
    ],
  }
  value.status = 'cancelled'
  value.actions = []
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation(async (url, init) => {
    if (url.includes('/formal-test-suites/'))
      return Response.json({ ...modelSuite, digest: DIGEST })
    const response = await fallback(url, init)
    if (url.includes('/executions/')) {
      const body = await response.json()
      body.cases[0].caller = 'model'
      body.cases[0].model_trace = {
        thread_id: 'actual-thread',
        turn_id: 'actual-turn',
        tool_call_id: 'actual-tool',
        method_call_id: CALL,
      }
      return Response.json(body)
    }
    return response
  })
  page(true, ['model'])
  await screen.findByText('actual-thread')
  expect(screen.getByText('actual-turn')).toBeInTheDocument()
  expect(screen.getByText('actual-tool')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: t.nextVersion }))
  await screen.findByText('测试集版本 2')
  expect(screen.getByLabelText(t.modelPrompt, { exact: false })).toHaveValue('Check this input')
  expect(screen.getByLabelText(t.caller)).toHaveValue('model')
  expect(posts).toHaveLength(0)
})

it('rejects caller changes in refreshed results and a host response to a model submission', async () => {
  const prior = formalExecutionResultSchema.parse({
    ...pending(),
    cases: [{ ...pending().cases[0], caller: 'model' }],
  })
  await expect(getFormalExecution(METHOD, command, prior)).rejects.toThrow()
  await expect(
    startFormalExecution(
      METHOD,
      {
        ...command,
        execution: {
          suite: {
            suite_id: ENV,
            version: 1,
            cases: [
              {
                case_id: 'case_1',
                caller: 'model',
                input: { values: {}, model_prompt: 'Use the method' },
                repetitions: 1,
                minimum_passes: 1,
                expected: {
                  outcome: 'succeeded',
                  rejection_code: null,
                  assertions: [{ kind: 'equals', pointer: '/ok', value: true }],
                },
              },
            ],
          },
          runner: { kind: 'user', environment_id: ENV, workspace_root: '/safe' },
          budget: { limit: '1', currency: 'CNY' },
          timeout_seconds: 60,
          max_wait_seconds: 60,
          model_probe: { max_turns: 1, max_method_calls: 1 },
        },
      },
      CSRF,
    ),
  ).rejects.toThrow()
})

it('starts a fixed host graph and restores each successive approval without replaying a step', async () => {
  const graph = orchestrationDraft(draft)
  const nextCall = '92d89579-f919-4c13-9ba2-78f091ed639f'
  const firstAction = formalExecutionResultSchema.parse(value).actions[0]
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (init.method === 'POST' && url.endsWith(`/actions/${CALL}`)) {
      const response = await fallback(url, init)
      value.cases[0].call_id = nextCall
      value.actions = [
        {
          ...value.actions[0],
          call_id: nextCall,
          token: 'second-token',
          subject_digest: 'second-subject',
          title: 'Approve second step',
        },
      ]
      return response.ok ? Response.json(value) : response
    }
    return fallback(url, init)
  })
  page(false, ['host'], graph)
  await fill()
  fireEvent.click(screen.getByRole('button', { name: t.start }))
  await screen.findByText('Approve fixture check')
  expect(posts[0].body.execution).not.toHaveProperty('model_probe')
  fireEvent.click(screen.getByRole('button', { name: t.accept }))
  await screen.findByText('Approve second step')
  expect(screen.queryByText('Approve fixture check')).not.toBeInTheDocument()
  expect(posts[1].body).toMatchObject({ token: 'exact-token', decision: 'accept' })
  await expect(
    decideFormalExecution(
      METHOD,
      { ...command, run_id: value.run_id },
      firstAction,
      'accept',
      CSRF,
      formalExecutionResultSchema.parse(value),
    ),
  ).rejects.toThrow('knowbot_contract_invalid')
  cleanup()
  // A reload reconstructs only the saved run identity, not the submitted inputs.
  const restoredRun = value.run_id
  page(true, ['host'], graph, { ...command, run_id: restoredRun })
  await screen.findByText('Approve second step')
  expect(posts).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: t.decline }))
  await waitFor(() => expect(posts).toHaveLength(3))
  expect(posts[2].url).toContain(`/executions/${restoredRun}/actions/${nextCall}`)
  expect(posts[2].body).toMatchObject({
    token: 'second-token',
    subject_digest: 'second-subject',
    decision: 'decline',
  })
  expect(posts.filter((post) => post.url.endsWith('/executions'))).toHaveLength(1)
})

it('does not offer a model or resource-bound graph as an executable fixed host flow', async () => {
  page(false, ['host', 'model'], orchestrationDraft(draft))
  expect(screen.getByText(t.unsupported)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: t.start })).not.toBeInTheDocument()
  expect(fetcher).not.toHaveBeenCalled()
})

type Graph = Extract<FormalDefinition['procedure'], { kind: 'orchestration' }>
it.each<[string, (graph: Graph) => void]>([
  [
    'optional step',
    (g) => {
      g.steps[0].always_required = false
    },
  ],
  [
    'multiple candidates',
    (g) => {
      g.steps[0].candidates.push(g.steps[0].candidates[0])
    },
  ],
  [
    'pause failure',
    (g) => {
      g.steps[0].on_failure = 'pause'
    },
  ],
  [
    'replanning',
    (g) => {
      g.max_replans = 1
    },
  ],
  [
    'cycle',
    (g) => {
      g.steps[0].depends_on = ['second']
    },
  ],
  [
    'missing predecessor',
    (g) => {
      g.steps[1].depends_on = ['missing']
    },
  ],
  [
    'duplicate identity',
    (g) => {
      g.steps[1].id = 'first'
    },
  ],
  [
    'missing output',
    (g) => {
      g.steps[1].inputs.message.binding = { source: 'step', step: 'first', output: 'missing' }
    },
  ],
  [
    'undeclared connection',
    (g) => {
      g.steps[1].depends_on = []
    },
  ],
  [
    'resource binding',
    (g) => {
      g.steps[0].inputs.message.binding = {
        source: 'resource',
        requirement_id: 'account',
        role: 'input',
      }
    },
  ],
  [
    'missing export',
    (g) => {
      g.exports.ok.output = 'missing'
    },
  ],
  [
    'depth bound',
    (g) => {
      g.max_depth = 1
    },
  ],
  [
    'expansion bound',
    (g) => {
      g.max_expansions = 2
    },
  ],
  [
    'step bound',
    (g) => {
      g.max_steps = 1
    },
  ],
  [
    'inconsistent exact reference',
    (g) => {
      g.steps[1].candidates = [{ ...g.steps[0].candidates[0], digest: 'sha256:' + 'c'.repeat(64) }]
    },
  ],
])('blocks unsupported fixed-flow structure: %s', (_, mutate) => {
  const graph = orchestrationDraft(draft)
  expect(supportsOrchestrationExecution(graph)).toBe(true)
  mutate(graph.definition.procedure as Graph)
  expect(supportsOrchestrationExecution(graph)).toBe(false)
})

it('offers an author trial for a frozen candidate rule and a bounded object list', () => {
  const chosen = orchestrationDraft(draft)
  const graph = chosen.definition.procedure as Graph
  const first = graph.steps[0]
  const alternative = { ...first.candidates[0], version: 7 }
  first.candidates.push(alternative)
  first.candidate_choice = {
    input: 'message',
    cases: first.candidates.map((candidate, i) => ({ equals: String(i), candidate })),
  }
  expect(supportsOrchestrationExecution(chosen)).toBe(true)

  const listed = orchestrationDraft(draft)
  const batch = listed.definition.procedure as Graph
  batch.object_batch = { max_objects: 2, on_missing: 'stop' }
  batch.max_steps = 3
  batch.max_expansions = 4
  batch.steps[0].inputs.message.binding = { source: 'object_item', name: 'items' }
  const [output] = Object.keys(batch.steps[0].outputs)
  batch.steps[1].inputs.message.binding = { source: 'object_rows', step: 'first', output }
  expect(supportsOrchestrationExecution(listed)).toBe(true)
  batch.max_expansions = 3
  expect(supportsOrchestrationExecution(listed)).toBe(false)
})

it('requires an author-selected case for each conditional delivery and submits its promise ID', async () => {
  const conditional = structuredClone(draft)
  conditional.definition.capability_declaration.conditions = {
    result: { when: 'A checked value is requested', input_slots: [] },
  }
  page(false, ['host'], conditional)
  await fill()
  fireEvent.click(screen.getByRole('button', { name: t.start }))
  expect(await screen.findByText(t.missingPromiseCase)).toBeVisible()
  expect(posts).toHaveLength(0)
  fireEvent.click(screen.getByLabelText('Return checked value'))
  fireEvent.click(screen.getByRole('button', { name: t.start }))
  await waitFor(() => expect(posts).toHaveLength(1))
  expect(posts[0].body).toMatchObject({
    execution: {
      suite: {
        cases: [{ covers_promises: ['result'], input: { values: { message: 'input only' } } }],
      },
    },
  })
})

it('shows the missing promise, and releases only the branch receipt matching the selected scope', async () => {
  const artifact = {
    id: CALL,
    version: 1,
    digest: 'a'.repeat(64),
    content_digest: DIGEST,
    output_names: ['ok'],
  }
  const partial = {
    steps: [
      { step: 'left', depends_on: [], state: 'accepted', artifact, detail: '' },
      {
        step: 'right',
        depends_on: [],
        state: 'failed',
        artifact: null,
        detail: 'Approval expired',
      },
      {
        step: 'merge',
        depends_on: ['left', 'right'],
        state: 'not_run',
        artifact: null,
        detail: '',
      },
    ],
    missing_promises: {
      result: { description: 'Compare both sources', missing_outputs: ['report'] },
    },
    scope_digest: DIGEST,
    received: [] as string[],
  }
  const result = {
    ...pending(),
    status: 'failed',
    actions: [],
    admission: { ...value.admission, status: 'failed' },
    cases: [
      {
        ...value.cases[0],
        status: 'failed',
        outcome: 'rejected',
        detail: 'Trial stopped',
        partial,
      },
    ],
  }
  let mismatch = true
  let received = 0
  fetcher.mockImplementation(async (url: string, init: RequestInit = {}) => {
    if (!url.endsWith('/step-deliveries')) return Response.json(result)
    received++
    const body = JSON.parse(String(init.body))
    expect(body).toEqual({
      request_id: REQUEST,
      case_id: 'case_1',
      repetition: 1,
      step: 'left',
      scope_digest: DIGEST,
    })
    if (!mismatch) partial.received = ['left']
    return Response.json({
      ...body,
      method_id: METHOD,
      run_id: RUN,
      received_at: '2026-11-21T12:00:00Z',
      artifact: { ...artifact, id: mismatch ? ENV : CALL },
      outputs: { ok: 'verified-left' },
    })
  })
  page(true, ['host'], orchestrationDraft(draft))
  expect(await screen.findByText(/Compare both sources/)).toHaveTextContent('report')
  expect(screen.getByText(/Approval expired/)).toBeVisible()
  expect(received).toBe(0)
  expect(
    screen.queryByRole('button', { name: t.branchReceive.replace('{step}', 'right') }),
  ).toBeNull()
  const accept = await screen.findByRole('button', {
    name: t.branchReceive.replace('{step}', 'left'),
  })
  fireEvent.click(accept)
  await screen.findByText(t.branchUnavailable)
  expect(screen.queryByText(/verified-left/)).toBeNull()
  mismatch = false
  fireEvent.click(accept)
  expect(await screen.findByText(/verified-left/)).toBeVisible()
  cleanup()
  page(true, ['host'], orchestrationDraft(draft))
  expect(
    await screen.findByRole('button', { name: t.branchOpen.replace('{step}', 'left') }),
  ).toBeVisible()
  expect(received).toBe(2)
})

it.each([false, true])(
  'checks chosen outputs and reopens the saved review, two rounds %s',
  async (strict) => {
    const { BranchReviewForm } = await import('@/components/knowbots/branch-review-form')
    const artifact = {
      id: CALL,
      version: 2,
      digest: 'b'.repeat(64),
      content_digest: DIGEST,
      output_names: ['notes', 'result'],
    }
    const source = {
      request_id: REQUEST,
      method_id: METHOD,
      run_id: RUN,
      case_id: 'case_1',
      repetition: 1,
      step: 'left',
      scope_digest: DIGEST,
      artifact,
      received_at: '2026-11-21T12:00:00Z',
      outputs: { notes: 'excluded', result: 42 },
    }
    const criteria = {
      ...(strict && { comparison: { assessment_output: 'notes', max_reworks: 2 } }),
      outputs: ['result'],
      assertions: [{ kind: 'equals' as const, pointer: '/result', value: 42 }],
      reviewer: 'different_model_family' as const,
    }
    const review = {
      criteria,
      ...(strict && {
        deferred: {
          assessment_output: 'notes',
          assessment_digest: DIGEST,
          opens_after: 'independent_findings_sealed' as const,
          unresolved_to: 'task_owner' as const,
        },
      }),
      digest: DIGEST,
      status: 'awaiting_isolation' as const,
      checks: [{ index: 0, passed: true, detail: 'matched' }],
      handoff: { result: DIGEST },
    }
    fetcher.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === '/api/web/v1/cross-app/links') {
        return Response.json({
          app: 'knowlab',
          targets: { knowbench: { web_base_url: 'https://bench.example.test' } },
        })
      }
      expect(url).toMatch(/\/branch-review$/)
      expect(JSON.parse(String(init.body))).toEqual({
        request_id: REQUEST,
        case_id: 'case_1',
        repetition: 1,
        step: 'left',
        scope_digest: DIGEST,
        artifact,
        previous: null,
        criteria,
      })
      return Response.json({ ...source, review })
    })
    renderWith(<BranchReviewForm receipt={source} csrfToken={CSRF} />)
    fireEvent.change(screen.getByLabelText(t.reviewOutput), { target: { value: 'result' } })
    fireEvent.click(screen.getByRole('button', { name: t.reviewSave }))
    expect(await screen.findByRole('alert')).toHaveTextContent(t.reviewInvalid)
    expect(fetcher).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(t.reviewExpected), { target: { value: '42' } })
    if (strict) {
      fireEvent.change(screen.getByLabelText(t.reviewStage), { target: { value: 'strict' } })
      expect(screen.getByLabelText(t.reviewAssessment)).toHaveValue('notes')
      fireEvent.change(screen.getByLabelText(t.reviewReworks), { target: { value: '2' } })
    }
    fireEvent.click(screen.getByLabelText(t.reviewFamily))
    fireEvent.click(screen.getByRole('button', { name: t.reviewSave }))
    expect(await screen.findByText(t.reviewWaiting)).toBeVisible()
    const link = await screen.findByRole('link', { name: t.reviewChooseRoute })
    const href = new URL(link.getAttribute('href')!)
    expect(href.pathname).toMatch(/\/workbench\/review$/)
    expect(Object.fromEntries(href.searchParams)).toEqual({
      from: 'knowlab',
      run_id: RUN,
      request_id: REQUEST,
      case_id: 'case_1',
      repetition: '1',
      step: 'left',
      scope_digest: DIGEST,
      review_digest: DIGEST,
    })
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).endsWith('/branch-review')),
    ).toHaveLength(1)
    cleanup()
    renderWith(<BranchReviewForm receipt={{ ...source, review }} csrfToken={CSRF} />)
    expect(screen.getByLabelText(t.reviewOutput)).toHaveValue('result')
    expect(screen.getByLabelText(t.reviewFamily)).toBeChecked()
    if (strict) {
      expect(screen.getByLabelText(t.reviewAssessment)).toHaveValue('notes')
      expect(screen.getByText(t.reviewDisposition)).toBeVisible()
    }
    expect(screen.getByLabelText(t.reviewExpected)).toHaveValue('42')
    expect(screen.getByText(t.reviewWaiting)).toBeVisible()
  },
)
