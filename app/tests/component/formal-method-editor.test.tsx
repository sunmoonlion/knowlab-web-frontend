import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { FormalMethodEditor } from '@/components/knowbots/formal-method-editor'
import { formalDraftSchema } from '@/contracts/formal-methods'
import { workdraftSchema } from '@/contracts/workdraft'
import { formalValidation, freezeFormalMethod } from '@/lib/knowbots/formal-methods'
import messages from '@/messages/zh-CN.json'
import fixture from '../fixtures/author-method.json'
import { orchestrationDraft } from '../fixtures/formal-orchestration'
import { CSRF, REQUEST, renderWith } from './knowbot-fixtures'

vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const METHOD = '70d89579-f919-4c13-9ba2-78f091ed639f'
const RUN = '9659855c-1bfc-4934-a571-839bacf7e202'
const labels = messages.formalMethod
const fingerprint = 'sha256:' + 'a'.repeat(64)
const source = {
  asset_id: null,
  asset_revision: null,
  kind: 'platform',
  source: 'synthetic.check',
  version: '1',
  digest: fingerprint,
  entry: 'check',
  license_basis: 'Synthetic test source',
}
const slot = {
  description: 'Summary',
  schema: { type: 'string' },
  required: true,
  meaning: {},
  on_missing: 'fail',
}
const draft = formalDraftSchema.parse({
  source,
  allowed_callers: ['host'],
  definition: {
    contract: 'knowlab/formal-method/v1',
    capability_declaration: {
      title: '文档核对',
      purpose: '核对提供的文字',
      applies_when: ['已有文档'],
      excludes: [],
      promises: { summary: '返回核对说明' },
    },
    access_requirements: [],
    procedure: {
      kind: 'direct',
      implementation: {
        kind: source.kind,
        source: source.source,
        version: source.version,
        digest: fingerprint,
        entry: source.entry,
        requirement_ids: [],
      },
      inputs: {},
      outputs: { summary: slot },
      instructions: '按输入生成核对说明',
      stop_conditions: ['输入无效'],
      max_model_turns: 0,
    },
    how_to_validate: [
      {
        promise_id: 'summary',
        outputs: ['summary'],
        check: '结果非空',
        evidence: '运行产物',
        on_failure: 'fail',
      },
    ],
    what_requires_approval: [],
  },
})
const initial = workdraftSchema.parse({
  ...fixture.workdraft,
  body: {
    ...fixture.workdraft.body,
    steps: [],
    planning: null,
    method_refs: null,
    formal_method: draft,
  },
})
const command = { request_id: REQUEST, revision: initial.revision, run_id: RUN }
const checks = [
  'definition',
  'source',
  'dependencies',
  'authorization',
  'approval',
  'isolation',
  'outcome',
  'business',
]
const receipt = {
  contract: 'knowlab/formal-method-validation/v1',
  run_id: RUN,
  owner_subject: 'author',
  request_id: REQUEST,
  workdraft_id: 'ebae570d-8104-47c4-b729-97f7ebba125c',
  revision: initial.revision,
  method_id: METHOD,
  definition_digest: fingerprint,
  source_digest: fingerprint,
  dependencies: [],
  checks,
  uncovered: [],
  completed_at: '2026-11-14T12:00:00Z',
}
const passed = {
  contract: receipt.contract,
  run_id: RUN,
  status: 'passed',
  receipt,
  missing_checks: [],
  details: [],
}
const pending = {
  ...passed,
  status: 'pending',
  receipt: null,
  missing_checks: ['outcome'],
  details: ['尚缺实际运行产物'],
}
const frozen = {
  method_id: METHOD,
  version: 1,
  digest: fingerprint,
  definition: draft.definition,
  provenance: { method_kind: 'tool', dispatch: 'direct', interfaces: { inputs: {}, outputs: {} } },
  created_at: receipt.completed_at,
}
const fetcher = vi.fn()
const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
let current = initial
beforeEach(() => {
  current = structuredClone(initial)
  fetcher.mockReset()
  vi.stubGlobal('fetch', fetcher)
  fetcher.mockImplementation(async (url: string, options: RequestInit) => {
    if (url.endsWith('/workdraft')) return respond(current)
    if (url.startsWith('/api/web/v1/method-units?formal=true')) return respond({ items: [] })
    if (url.endsWith('/formal-method-sources')) return respond({ items: [source] })
    if (url.includes('/validations')) return respond(pending)
    if (url.endsWith('/formal-versions/1')) return respond(frozen)
    if (url.endsWith('/cells')) {
      const body = JSON.parse(options.body as string)
      current = {
        ...current,
        revision: current.revision + 1,
        body: { ...current.body, formal_method: body.cells[0].value },
      }
      return respond(current)
    }
    throw new Error('Unexpected route: ' + url)
  })
})
afterEach(() => vi.unstubAllGlobals())

const show = () =>
  renderWith(
    <FormalMethodEditor
      requestId={REQUEST}
      csrfToken={CSRF}
      resume={{ method: METHOD, run: RUN, revision: String(initial.revision) }}
    />,
  )

it('preserves a legacy draft and never opens its technical binding or source picker', async () => {
  current = workdraftSchema.parse(fixture.workdraft)
  show()
  expect(await screen.findByText(labels.existingDraft)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: labels.save })).not.toBeInTheDocument()
  expect(fetcher.mock.calls.some(([url]) => url.includes('formal-method-sources'))).toBe(false)
  expect(fetcher.mock.calls.some(([, options]) => options.method !== 'GET')).toBe(false)
})

it('imports into an empty draft and pins an existing source without reinstalling it', async () => {
  current = { ...initial, revision: 0, body: { ...initial.body, formal_method: null } }
  show()
  const upload = await screen.findByLabelText(labels.import)
  const file = new File([JSON.stringify(draft.definition)], 'method.json', {
    type: 'application/json',
  })
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify(draft.definition) })
  fireEvent.change(upload, { target: { files: [file] } })
  const picker = await screen.findByLabelText(labels.source)
  const option = await screen.findByRole<HTMLOptionElement>('option', {
    name: 'synthetic.check · 1 · check',
  })
  expect(screen.getByRole('button', { name: labels.save })).toBeDisabled()
  fireEvent.change(picker, { target: { value: option.value } })
  fireEvent.click(screen.getByRole('button', { name: labels.save }))
  await screen.findByText(labels.saved)
  const writes = fetcher.mock.calls.filter(([, options]) => options.method !== 'GET')
  expect(writes).toHaveLength(1)
  expect(writes[0][0]).toMatch(/\/workdraft\/cells$/)
  expect(JSON.parse(writes[0][1].body).cells[0].value.source).toEqual(source)
})

it('leaves an incomplete validation unfrozen and only sends the saved revision and run identity', async () => {
  show()
  fireEvent.click(await screen.findByRole('button', { name: labels.validate }))
  expect(await screen.findByText(labels.status.pending)).toBeInTheDocument()
  expect(screen.getByText(/尚缺实际运行产物/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeDisabled()
  const [, options] = fetcher.mock.calls.find(([, options]) => options.method === 'POST')!
  expect(JSON.parse(options.body)).toEqual(command)
  expect(options.headers['X-CSRF-Token']).toBe(CSRF)
})

it('freezes only after fetching a matching trusted receipt and never posts receipt claims', async () => {
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) =>
    url.includes('/validations') ? respond(passed) : fallback(url, options),
  )
  show()
  fireEvent.click(await screen.findByRole('button', { name: labels.refresh }))
  expect(await screen.findByText(labels.status.passed)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: labels.confirmFreeze }))
  await screen.findByText('第 1 版已冻结。是否可调用以登记结果为准。')
  const [url, options] = fetcher.mock.calls.find(([, options]) => options.method === 'PUT')!
  expect(url).toBe(`/api/web/v1/method-units/${METHOD}/formal-versions/1`)
  expect(JSON.parse(options.body)).toEqual({ ...command, visibility: 'private' })
  expect(fetcher.mock.calls.some(([url]) => url.includes('/publish'))).toBe(false)
})

it('invalidates the displayed validation when the definition changes and saves only the formal cell', async () => {
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) =>
    url.includes('/validations') ? respond(passed) : fallback(url, options),
  )
  show()
  fireEvent.click(await screen.findByRole('button', { name: labels.refresh }))
  await screen.findByText(labels.status.passed)
  fireEvent.change(screen.getByLabelText(labels.methodTitle), {
    target: { value: '修订后的文档核对' },
  })
  expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeDisabled()
  expect(screen.getByRole('button', { name: labels.validate })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: labels.save }))
  await screen.findByText(labels.saved)
  const [, options] = fetcher.mock.calls.find(([url]) => url.endsWith('/cells'))!
  const sent = JSON.parse(options.body)
  expect(sent.revision).toBe(initial.revision)
  expect(sent.cells).toHaveLength(1)
  expect(sent.cells[0].path).toBe('formal_method')
  expect(sent.cells[0].value.source).toEqual(source)
  expect(sent.cells[0].value.definition.capability_declaration.title).toBe('修订后的文档核对')
  expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeDisabled()
})

it('keeps the same validation identity when a response is lost and retries', async () => {
  const fallback = fetcher.getMockImplementation()!
  let lost = true
  fetcher.mockImplementation((url, options) => {
    if (url.endsWith('/validations') && lost) {
      lost = false
      throw new TypeError('lost')
    }
    return fallback(url, options)
  })
  show()
  fireEvent.click(await screen.findByRole('button', { name: labels.validate }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: labels.validate }))
  await screen.findByText(labels.status.pending)
  const writes = fetcher.mock.calls.filter(([, options]) => options.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(writes[0][1].body).toBe(writes[1][1].body)
})

it('rejects a receipt for another method, run, request or revision', async () => {
  for (const mismatch of [
    { method_id: RUN },
    { run_id: METHOD },
    { request_id: RUN },
    { revision: 999 },
  ]) {
    fetcher.mockResolvedValue(respond({ ...passed, receipt: { ...receipt, ...mismatch } }))
    await expect(formalValidation(METHOD, command)).rejects.toThrow('knowbot_contract_invalid')
  }
})

it('rejects an incomplete receipt even when a response claims validation passed', async () => {
  fetcher.mockResolvedValue(respond({ ...passed, receipt: { ...receipt, checks: ['definition'] } }))
  await expect(formalValidation(METHOD, command)).rejects.toThrow('knowbot_contract_invalid')
})

it('rejects a freeze response for another method identity', async () => {
  fetcher.mockResolvedValue(respond({ ...frozen, method_id: RUN }))
  await expect(
    freezeFormalMethod(METHOD, 1, { ...command, visibility: 'private' }, CSRF),
  ).rejects.toThrow('knowbot_contract_invalid')
})

it('retains explicit self-use limitations and disables public publication', async () => {
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) =>
    url.includes('/validations')
      ? respond({
          ...passed,
          receipt: {
            ...receipt,
            checks: checks.filter((check) => check !== 'business'),
            uncovered: [{ scenario: '长文档', reason: '尚未业务复测', scope: '只用于短文档自测' }],
          },
        })
      : fallback(url, options),
  )
  show()
  fireEvent.click(await screen.findByRole('button', { name: labels.refresh }))
  await screen.findByText(/只用于短文档自测/)
  expect(screen.getByRole('option', { name: labels.public })).toBeDisabled()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeEnabled(),
  )
})

it('browses a formal version without adopting it or allowing an unvalidated new version', async () => {
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) =>
    url.startsWith('/api/web/v1/method-units?formal=true')
      ? respond({
          items: [
            {
              method_id: METHOD,
              latest_version: 1,
              digest: fingerprint,
              method_kind: 'tool',
              title: '已冻结核对方法',
              summary: '核对文字',
              created_at: receipt.completed_at,
            },
          ],
        })
      : fallback(url, options),
  )
  show()
  fireEvent.click(await screen.findByRole('button', { name: labels.viewFrozen }))
  await screen.findByText('已冻结的第 1 版')
  expect(screen.getByText(labels.generatedInterfaces)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeDisabled()
  expect(fetcher.mock.calls.some(([, options]) => options.method !== 'GET')).toBe(false)
})

it.each([false, true])(
  'restores execution admission without reusing it after a failed new validation (%s)',
  async (failNextValidation) => {
    const fallback = fetcher.getMockImplementation()!
    const suiteId = '42d89579-f919-4c13-9ba2-78f091ed639f'
    const execution = {
      contract: 'knowlab/formal-method-execution/v1',
      request_digest: fingerprint,
      suite_id: suiteId,
      suite_version: 1,
      suite_digest: fingerprint,
      evidence_digest: fingerprint,
    }
    const result = {
      contract: execution.contract,
      run_id: RUN,
      request_id: REQUEST,
      method_id: METHOD,
      request_digest: fingerprint,
      suite: { suite_id: suiteId, version: 1, digest: fingerprint },
      status: 'passed',
      admission: { ...passed, receipt: { ...receipt, execution } },
      cases: [
        {
          case_id: 'check',
          repetition: 1,
          status: 'passed',
          outcome: 'succeeded',
          rejection_code: null,
          task_id: null,
          attempt_id: null,
          call_id: null,
          assertions: [{ index: 0, passed: true, detail: 'matched' }],
          detail: 'Checked',
        },
      ],
      spent: '0',
      currency: 'CNY',
      actions: [],
    }
    fetcher.mockImplementation((url, options) =>
      url.includes('/executions/') ? respond(result) : fallback(url, options),
    )
    renderWith(
      <FormalMethodEditor
        requestId={REQUEST}
        csrfToken={CSRF}
        resume={{ method: METHOD, run: RUN, revision: String(initial.revision), execution: '1' }}
      />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: labels.confirmFreeze })).not.toBeDisabled(),
    )
    expect(fetcher.mock.calls.some(([, options]) => options.method !== 'GET')).toBe(false)
    if (failNextValidation) {
      const prior = fetcher.getMockImplementation()!
      fetcher.mockImplementation((url, options) =>
        url.includes('/validations')
          ? Promise.reject(new TypeError('connection lost'))
          : prior(url, options),
      )
      fireEvent.click(screen.getByRole('button', { name: labels.validate }))
      await screen.findByRole('alert')
      expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeDisabled()
      const write = fetcher.mock.calls.find(([, options]) => options.method === 'POST')!
      expect(JSON.parse(write[1].body).run_id).not.toBe(RUN)
      expect(fetcher.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(false)
      return
    }
    fireEvent.click(screen.getByRole('button', { name: labels.confirmFreeze }))
    await screen.findByText('第 1 版已冻结。是否可调用以登记结果为准。')
    const writes = fetcher.mock.calls.filter(([, options]) => options.method !== 'GET')
    expect(writes).toHaveLength(1)
    expect(JSON.parse(writes[0][1].body)).toEqual({ ...command, visibility: 'private' })
    expect(window.location.search).toContain('run=' + RUN)
  },
)

it.each([undefined, ['host'], ['host', 'model']])(
  'does not expand a model-only declaration from incompatible receipt callers %j',
  async (verified) => {
    current = {
      ...initial,
      body: { ...initial.body, formal_method: { ...draft, allowed_callers: ['model'] } },
    }
    const validation = {
      ...passed,
      receipt: {
        ...receipt,
        execution: verified
          ? {
              contract: 'knowlab/formal-method-execution/v1',
              request_digest: fingerprint,
              suite_id: RUN,
              suite_version: 1,
              suite_digest: fingerprint,
              evidence_digest: fingerprint,
              validated_callers: verified,
            }
          : undefined,
      },
    }
    const fallback = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, options) =>
      url.includes('/validations') ? respond(validation) : fallback(url, options),
    )
    show()
    fireEvent.click(await screen.findByRole('button', { name: labels.refresh }))
    await screen.findByText(labels.status.passed)
    expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeDisabled()
    expect(fetcher.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(false)
  },
)
it('shows the validated caller from the frozen server receipt', async () => {
  current = {
    ...initial,
    body: { ...initial.body, formal_method: { ...draft, allowed_callers: ['model'] } },
  }
  const verified = {
    ...receipt,
    execution: {
      contract: 'knowlab/formal-method-execution/v1',
      request_digest: fingerprint,
      suite_id: RUN,
      suite_version: 1,
      suite_digest: fingerprint,
      evidence_digest: fingerprint,
      validated_callers: ['model'],
    },
  }
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) =>
    url.includes('/validations')
      ? respond({ ...passed, receipt: verified })
      : url.includes('/formal-versions/')
        ? respond({
            ...frozen,
            provenance: { ...frozen.provenance, allowed_callers: ['model'], validation: verified },
          })
        : fallback(url, options),
  )
  show()
  fireEvent.click(await screen.findByRole('button', { name: labels.refresh }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: labels.confirmFreeze })).not.toBeDisabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: labels.confirmFreeze }))
  await screen.findByText(`${labels.verifiedCallers}: ${labels.model}`)
})

it('shows exact graph connections and keeps a fully validated graph private', async () => {
  current.body.formal_method = orchestrationDraft(draft)
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) =>
    url.includes('/validations') ? respond(passed) : fallback(url, options),
  )
  show()
  await screen.findByText(labels.orchestrationScope)
  expect(
    screen.getByText(/f45d7d69-1d43-4f13-9207-81de485e18e1.*3.*sha256:bbbbbbbb/),
  ).toBeInTheDocument()
  expect(
    screen.getByText(/a45d7d69-1d43-4f13-9207-81de485e18e1.*4.*sha256:cccccccc/),
  ).toBeInTheDocument()
  expect(screen.getByText(/前置步骤: first/)).toBeInTheDocument()
  expect(screen.getByText(/message ← 调用输入: message/)).toBeInTheDocument()
  expect(screen.getByText(/fixed ← 固定值: "fixed input"/)).toBeInTheDocument()
  expect(screen.getByText(/message ← 前置步骤输出: first.summary/)).toBeInTheDocument()
  expect(screen.getByText(/summary ← second.summary/)).toBeInTheDocument()
  expect(screen.getByText(labels.orchestrationPrivate)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: labels.refresh }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeEnabled(),
  )
  expect(screen.getByRole('option', { name: labels.public })).toBeDisabled()
  // Even an invalid client-side change must not send a public freeze request.
  fireEvent.change(screen.getByLabelText(labels.visibility), { target: { value: 'public' } })
  expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeDisabled()
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0)
})

const childId = 'a45d7d69-1d43-4f13-9207-81de485e18e1'
const optionalSlot = { ...slot, required: false, on_missing: 'omit', meaning: { unit: 'text' } }
function openToolCatalog(detail: { digest?: string; callers?: string[] } = {}) {
  current = { ...initial, revision: 0, body: { ...initial.body, formal_method: null } }
  const child = {
    ...frozen,
    method_id: childId,
    version: 3,
    digest: detail.digest ?? fingerprint,
    provenance: { ...frozen.provenance, allowed_callers: detail.callers ?? ['host'] },
    definition: {
      ...draft.definition,
      procedure: {
        ...draft.definition.procedure,
        inputs: { text: slot, hint: optionalSlot },
        outputs: { summary: slot, notes: optionalSlot },
      },
    },
  }
  const listing = {
    method_id: childId,
    latest_version: 3,
    digest: fingerprint,
    method_kind: 'tool',
    title: '已登记核对工具',
    summary: '核对文字',
    created_at: child.created_at,
  }
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) => {
    if (url.startsWith('/api/web/v1/method-units?formal=true'))
      return respond({ items: [listing, { ...listing, method_id: METHOD, title: '当前目标' }] })
    if (url.endsWith(childId + '/formal-versions/3')) return respond(child)
    return fallback(url, options)
  })
  return show()
}

async function chooseTool() {
  const option = await screen.findByRole<HTMLOptionElement>('option', {
    name: '已登记核对工具 · v3',
  })
  fireEvent.change(screen.getByLabelText(labels.registeredTool), {
    target: { value: option.value },
  })
  return screen.getByRole('button', { name: labels.useToolAsStep })
}

it('saves and reopens an independently authored expert with exact dependency, bindings and exports', async () => {
  const view = openToolCatalog()
  const adopt = await chooseTool()
  expect(screen.queryByRole('option', { name: '当前目标 · v3' })).not.toBeInTheDocument()
  await waitFor(() => expect(adopt).toBeEnabled())
  expect(fetcher.mock.calls.filter(([, options]) => options.method !== 'GET')).toHaveLength(0)
  fireEvent.click(adopt)
  fireEvent.change(screen.getByLabelText(labels.methodTitle), { target: { value: '我的核对专家' } })
  fireEvent.click(screen.getByRole('button', { name: labels.save }))
  await screen.findByText(labels.saved)
  const saved = formalDraftSchema.parse(current.body.formal_method)
  expect(saved.source).toBeNull()
  expect(saved.allowed_callers).toEqual(['host'])
  expect(saved.definition.capability_declaration.title).toBe('我的核对专家')
  expect(saved.definition.how_to_validate).toEqual(draft.definition.how_to_validate)
  expect(saved.definition.procedure).toMatchObject({
    kind: 'orchestration',
    max_depth: 2,
    max_expansions: 2,
    max_steps: 1,
    max_replans: 0,
    steps: [
      {
        id: 'step_1',
        always_required: true,
        on_failure: 'fail',
        candidates: [{ method_id: childId, version: 3, digest: fingerprint }],
        inputs: {
          text: { slot, binding: { source: 'caller', name: 'text' } },
          hint: { slot: optionalSlot, binding: { source: 'caller', name: 'hint' } },
        },
        outputs: { summary: slot, notes: optionalSlot },
      },
    ],
    exports: {
      summary: { step: 'step_1', output: 'summary', always_present: true },
      notes: { step: 'step_1', output: 'notes', always_present: false },
    },
  })
  expect(fetcher.mock.calls.filter(([, options]) => options.method !== 'GET')).toHaveLength(1)
  view.unmount()
  show()
  expect(await screen.findByDisplayValue('我的核对专家')).toBeInTheDocument()
  expect(screen.getByText(new RegExp(childId))).toHaveTextContent(fingerprint)
  expect(screen.queryByLabelText(labels.registeredTool)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeDisabled()
})

it.each([
  [{ digest: 'sha256:' + 'b'.repeat(64) }, labels.versionUnavailable],
  [{ callers: ['model'] }, labels.hostToolRequired],
])('keeps an unavailable or ineligible dependency out of the draft (%j)', async (detail, error) => {
  openToolCatalog(detail)
  const adopt = await chooseTool()
  expect(await screen.findByText(error)).toBeInTheDocument()
  expect(adopt).toBeDisabled()
  expect(current.body.formal_method).toBeNull()
  expect(fetcher.mock.calls.filter(([, options]) => options.method !== 'GET')).toHaveLength(0)
})

it('adopts each binding explicitly and preserves pinned versions, other slots, order and exports', async () => {
  const original = orchestrationDraft(draft)
  const graph = original.definition.procedure
  if (graph.kind !== 'orchestration') throw new Error('Expected graph')
  current = { ...initial, body: { ...initial.body, formal_method: original } }
  show()
  const target = await screen.findByLabelText(labels.targetInput)
  fireEvent.change(target, { target: { value: 'second.message' } })
  const apply = () => screen.getByRole('button', { name: labels.adoptBinding })
  expect(apply()).toBeDisabled()
  fireEvent.change(screen.getByLabelText(labels.bindFrom), { target: { value: 'caller' } })
  expect(await screen.findByText(labels.aliasConflict)).toBeInTheDocument()
  expect(apply()).toBeDisabled()
  const alias = screen.getByLabelText(labels.callerName)
  fireEvent.change(alias, { target: { value: '2bad' } })
  expect(screen.getByText(labels.invalidAlias)).toBeInTheDocument()
  expect(apply()).toBeDisabled()
  fireEvent.change(alias, { target: { value: 'reviewText' } })
  expect(apply()).toBeEnabled()
  expect(screen.getByRole('button', { name: labels.save })).toBeDisabled()
  fireEvent.click(apply())
  fireEvent.click(screen.getByRole('button', { name: labels.save }))
  await screen.findByText(labels.saved)
  const changedGraph = structuredClone(graph)
  changedGraph.steps[1].inputs.message.binding = { source: 'caller', name: 'reviewText' }
  expect(current.body.formal_method?.definition.procedure).toEqual(changedGraph)
  fireEvent.change(screen.getByLabelText(labels.bindFrom), { target: { value: 'first.summary' } })
  fireEvent.click(apply())
  fireEvent.click(screen.getByRole('button', { name: labels.save }))
  await waitFor(() => expect(current.body.formal_method?.definition.procedure).toEqual(graph))
})

it('offers only declared compatible predecessor outputs and leaves imported literals untouched', async () => {
  const original = orchestrationDraft(draft)
  const graph = original.definition.procedure
  if (graph.kind !== 'orchestration') throw new Error('Expected graph')
  const outputs = graph.steps[0].outputs
  outputs.conditional = { ...outputs.summary, required: false }
  outputs.otherMeaning = { ...outputs.summary, meaning: { currency: 'USD' } }
  outputs.otherType = { ...outputs.summary, schema: { type: 'number' } }
  current = { ...initial, body: { ...initial.body, formal_method: original } }
  show()
  const select = await screen.findByLabelText(labels.targetInput)
  fireEvent.change(select, { target: { value: 'first.fixed' } })
  expect((screen.getByLabelText(labels.bindFrom) as HTMLSelectElement).options).toHaveLength(2)
  fireEvent.change(select, { target: { value: 'second.message' } })
  expect(
    Array.from((screen.getByLabelText(labels.bindFrom) as HTMLSelectElement).options).map(
      (o) => o.value,
    ),
  ).toEqual(['', 'caller', 'first.summary'])
  expect(screen.getByRole('button', { name: labels.save })).toBeDisabled()
  expect(current.body.formal_method?.definition.procedure).toEqual(graph)
})
