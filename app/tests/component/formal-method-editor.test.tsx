import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { FormalMethodEditor } from '@/components/knowbots/formal-method-editor'
import { formalDraftSchema } from '@/contracts/formal-methods'
import { workdraftSchema } from '@/contracts/workdraft'
import { replaceP1Tool } from '@/lib/knowbots/formal-orchestration'
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
const functionSource = {
  ...source,
  asset_id: null,
  asset_revision: null,
  kind: 'service_function',
  source: 'knowbase',
  entry: 'query_facts',
  license_basis: 'synthetic-reviewed-source',
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
    if (url.endsWith('/formal-method-sources')) return respond({ items: [source, functionSource] })
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

it.each([source, functionSource])(
  'pins the selected $kind source in the saved workdraft',
  async (selected) => {
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
      name: selected.source + ' · ' + selected.version + ' · ' + selected.entry,
    })
    expect(screen.getByRole('button', { name: labels.save })).toBeDisabled()
    fireEvent.change(picker, { target: { value: option.value } })
    fireEvent.click(screen.getByRole('button', { name: labels.save }))
    await screen.findByText(labels.saved)
    const writes = fetcher.mock.calls.filter(([, options]) => options.method !== 'GET')
    expect(writes).toHaveLength(1)
    expect(writes[0][0]).toMatch(/\/workdraft\/cells$/)
    expect(JSON.parse(writes[0][1].body).cells[0].value.source).toEqual(selected)
  },
)

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

it.each(['service_function', 'registered_script'] as const)(
  'requires trial evidence before freezing %s',
  async (kind) => {
    const binding =
      kind === 'service_function'
        ? functionSource
        : {
            ...functionSource,
            kind,
            source: METHOD,
            entry: 'reconcile.py',
          }
    current.body.formal_method = formalDraftSchema.parse({ ...draft, source: binding })
    const fallback = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, options) =>
      url.includes('/validations') ? respond(passed) : fallback(url, options),
    )
    show()
    fireEvent.click(await screen.findByRole('button', { name: labels.refresh }))
    await screen.findByText(labels.status.passed)
    expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeDisabled()
  },
)

it('freezes only after fetching a matching trusted receipt and never posts receipt claims', async () => {
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) =>
    url.includes('/validations') ? respond(passed) : fallback(url, options),
  )
  show()
  fireEvent.click(await screen.findByRole('button', { name: labels.refresh }))
  expect(await screen.findByText(labels.status.passed)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: labels.confirmFreeze }))
  await screen.findByText('第 1 版已冻结。')
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
    await screen.findByText('第 1 版已冻结。')
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

it('shows exact graph connections and keeps a graph without execution evidence private', async () => {
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
  expect(screen.getByText(labels.orchestrationPublication)).toBeInTheDocument()
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

it('offers public freeze for an expert with business coverage and trial evidence', async () => {
  current.body.formal_method = orchestrationDraft(draft)
  const execution = {
    contract: 'knowlab/formal-method-execution/v1',
    request_digest: fingerprint,
    suite_id: RUN,
    suite_version: 1,
    suite_digest: fingerprint,
    evidence_digest: fingerprint,
  }
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) =>
    url.includes('/validations')
      ? respond({ ...passed, receipt: { ...receipt, source_digest: null, execution } })
      : fallback(url, options),
  )
  show()
  fireEvent.click(await screen.findByRole('button', { name: labels.refresh }))
  await waitFor(() => expect(screen.getByRole('option', { name: labels.public })).toBeEnabled())
  fireEvent.change(screen.getByLabelText(labels.visibility), { target: { value: 'public' } })
  expect(screen.getByRole('button', { name: labels.confirmFreeze })).toBeEnabled()
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
  expect(screen.getByLabelText(labels.bindFrom)).toHaveValue('literal')
  expect(screen.getByLabelText(labels.fixedText)).toHaveValue('fixed input')
  fireEvent.change(select, { target: { value: 'second.message' } })
  expect(
    Array.from((screen.getByLabelText(labels.bindFrom) as HTMLSelectElement).options).map(
      (o) => o.value,
    ),
  ).toEqual(['', 'caller', 'literal', 'first.summary'])
  expect(screen.getByRole('button', { name: labels.save })).toBeDisabled()
  expect(current.body.formal_method?.definition.procedure).toEqual(graph)
})

it.each([
  ['integer', '0', 0],
  ['boolean', 'false', false],
  ['string', '', ''],
  [['null', 'number'], 'null', null],
  ['array', '[false,0,""]', [false, 0, '']],
  ['number', '12.5', 12.5],
  ['object', '{"quarter":0}', { quarter: 0 }],
])('round-trips a fixed %j input through author save and reopen', async (type, text, expected) => {
  const original = orchestrationDraft(draft)
  const graph = original.definition.procedure
  if (graph.kind !== 'orchestration') throw new Error('Expected graph')
  graph.steps[0].inputs.message.slot.schema = { type }
  current = { ...initial, body: { ...initial.body, formal_method: original } }
  const view = show()
  const selectInput = async () =>
    fireEvent.change(await screen.findByLabelText(labels.targetInput), {
      target: { value: 'first.message' },
    })
  await selectInput()
  fireEvent.change(screen.getByLabelText(labels.bindFrom), { target: { value: 'literal' } })
  const field = screen.getByLabelText(type === 'string' ? labels.fixedText : labels.fixedJson)
  fireEvent.change(field, { target: { value: text } })
  expect(screen.getByRole('button', { name: labels.save })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: labels.adoptBinding }))
  fireEvent.click(screen.getByRole('button', { name: labels.save }))
  await screen.findByText(labels.saved)
  const saved = structuredClone(graph)
  saved.steps[0].inputs.message.binding = { source: 'literal', value: expected }
  expect(current.body.formal_method?.definition.procedure).toEqual(saved)
  view.unmount()
  show()
  await selectInput()
  expect(screen.getByLabelText(labels.bindFrom)).toHaveValue('literal')
  expect(
    screen.getByLabelText(type === 'string' ? labels.fixedText : labels.fixedJson),
  ).toHaveValue(text)
  expect(screen.getByRole('button', { name: labels.adoptBinding })).toBeDisabled()
})

it('keeps malformed, wrongly typed and out-of-range fixed values out of the draft', async () => {
  const original = orchestrationDraft(draft)
  const graph = original.definition.procedure
  if (graph.kind !== 'orchestration') throw new Error('Expected graph')
  graph.steps[0].inputs.message.slot.schema = { type: 'integer' }
  current = { ...initial, body: { ...initial.body, formal_method: original } }
  show()
  fireEvent.change(await screen.findByLabelText(labels.targetInput), {
    target: { value: 'first.message' },
  })
  fireEvent.change(screen.getByLabelText(labels.bindFrom), { target: { value: 'literal' } })
  for (const raw of [
    '',
    '{',
    'false',
    '"1"',
    '0.5',
    '1e400',
    '9007199254740993',
    '1e-400',
    '0.99999999999999999999',
  ]) {
    fireEvent.change(screen.getByLabelText(labels.fixedJson), { target: { value: raw } })
    expect(screen.getByRole('alert')).toHaveTextContent(labels.invalidFixedValue)
    expect(screen.getByRole('button', { name: labels.adoptBinding })).toBeDisabled()
    expect(screen.getByRole('button', { name: labels.save })).toBeDisabled()
  }
  expect(current.body.formal_method?.definition.procedure).toEqual(graph)
})

it('rejects an oversized or deeply nested fixed JSON input before adopting it', async () => {
  const original = orchestrationDraft(draft)
  const graph = original.definition.procedure
  if (graph.kind !== 'orchestration') throw new Error('Expected graph')
  graph.steps[0].inputs.message.slot.schema = { type: 'array' }
  current = { ...initial, body: { ...initial.body, formal_method: original } }
  show()
  fireEvent.change(await screen.findByLabelText(labels.targetInput), {
    target: { value: 'first.message' },
  })
  fireEvent.change(screen.getByLabelText(labels.bindFrom), { target: { value: 'literal' } })
  for (const raw of [
    '['.repeat(40) + ']'.repeat(40),
    JSON.stringify(['数'.repeat(22000)]),
    '[0.9999999999999999999]',
  ]) {
    fireEvent.change(screen.getByLabelText(labels.fixedJson), { target: { value: raw } })
    expect(screen.getByRole('button', { name: labels.adoptBinding })).toBeDisabled()
  }
  fireEvent.change(screen.getByLabelText(labels.fixedJson), {
    target: { value: '["1e400", 1.20e1]' },
  })
  expect(screen.getByRole('button', { name: labels.adoptBinding })).toBeEnabled()
})

it('submits the exact viewed version for self use only on explicit author action', async () => {
  const fallback = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) => {
    if (url.includes('/validations')) return respond(passed)
    if (url.endsWith('/self-listing'))
      return respond({
        listing_id: METHOD,
        reference: { method_id: METHOD, version: 1, digest: fingerprint },
        scope: 'self',
        status: 'listed',
      })
    return fallback(url, options)
  })
  show()
  fireEvent.click(await screen.findByRole('button', { name: labels.refresh }))
  await screen.findByText(labels.status.passed)
  fireEvent.click(screen.getByRole('button', { name: labels.confirmFreeze }))
  const submit = await screen.findByRole('button', { name: labels.selfListingSubmit })
  expect(fetcher.mock.calls.some(([u]) => u.endsWith('/self-listing'))).toBe(false)
  fireEvent.click(submit)
  await screen.findByText(labels.selfListingStatus.listed)
  const [url, options] = fetcher.mock.calls.find(([u]) => u.endsWith('/self-listing'))!
  expect(url).toBe(`/api/web/v1/method-units/${METHOD}/formal-versions/1/self-listing`)
  expect(JSON.parse(options.body)).toEqual({ digest: fingerprint })
  expect(options.headers['X-CSRF-Token']).toBe(CSRF)
})

it('adopts a licensed market version from its public interface', async () => {
  openToolCatalog()
  const fallback = fetcher.getMockImplementation()!
  const ref = { method_id: childId, version: 2, digest: fingerprint }
  const { procedure, ...contract } = draft.definition
  if (procedure.kind !== 'direct') throw new Error('expected tool')
  let chosen: string | null = null
  fetcher.mockImplementation((url, options) => {
    if (url.endsWith('/installation')) {
      expect(options.method).toBe('PUT')
      expect(options.headers['X-CSRF-Token']).toBe(CSRF)
      expect(JSON.parse(options.body)).toEqual({
        digest: fingerprint,
        asset_id: METHOD,
        revision: 1,
      })
      chosen = METHOD
      return respond({ reference: ref, asset_id: METHOD, revision: 1 })
    }
    if (url.includes('/incubation-tools')) {
      const item = {
        reference: ref,
        title: '市场核对',
        scope: 'acquired',
        selected: chosen,
        installations: [
          { asset_id: METHOD, revision: 1, name: '账户甲', account: null },
          { asset_id: childId, revision: 2, name: '账户乙', account: null },
        ],
      }
      return respond({
        items: [
          url.includes('/versions/')
            ? {
                ...item,
                interface: { ...contract, inputs: procedure.inputs, outputs: procedure.outputs },
              }
            : item,
        ],
        next: null,
      })
    }
    return fallback(url, options)
  })
  fireEvent.change(await screen.findByLabelText(labels.toolDirectory), {
    target: { value: 'shared' },
  })
  const option = await screen.findByRole<HTMLOptionElement>('option', { name: '市场核对 · v2' })
  fireEvent.change(screen.getByLabelText(labels.registeredTool), {
    target: { value: option.value },
  })
  const adopt = () => screen.getByRole('button', { name: labels.useToolAsStep })
  const accounts = await screen.findByLabelText(labels.executionInstallation)
  expect(adopt()).toBeDisabled()
  fireEvent.change(accounts, { target: { value: METHOD } })
  await waitFor(() => expect(adopt()).toBeEnabled())
  fireEvent.click(adopt())
  await waitFor(() => expect(screen.getByRole('button', { name: labels.save })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: labels.save }))
  await screen.findByText(labels.saved)
  expect(formalDraftSchema.parse(current.body.formal_method).definition.procedure).toMatchObject({
    steps: [{ candidates: [ref] }],
  })
})

it('saves an adopted tool slot with the selected schema and meaning', async () => {
  show()
  const name = await screen.findByLabelText(labels.slotId)
  fireEvent.change(name, { target: { value: 'receiptCount' } })
  fireEvent.change(screen.getByLabelText(labels.slotDescription), {
    target: { value: '已核对回执数' },
  })
  fireEvent.change(screen.getByLabelText(labels.slotPreset), { target: { value: 'integer' } })
  const adopt = screen.getByRole('button', { name: labels.adoptSlot })
  fireEvent.change(screen.getByLabelText(labels.slotMeaning), { target: { value: '{' } })
  expect(adopt).toBeDisabled()
  fireEvent.change(screen.getByLabelText(labels.slotMeaning), {
    target: { value: '{"unit":"receipts"}' },
  })
  fireEvent.click(adopt)
  fireEvent.click(screen.getByRole('button', { name: labels.save }))
  await screen.findByText(labels.saved)
  const saved = current.body.formal_method?.definition.procedure
  if (saved?.kind !== 'direct') throw Error('Expected direct tool')
  expect(saved.inputs.receiptCount).toMatchObject({
    schema: { type: 'integer' },
    meaning: { unit: 'receipts' },
  })
})

it('continues an empty shared page and switches from a revoked candidate before adopting a P1 bridge', async () => {
  const authored = orchestrationDraft(draft)
  const graph = authored.definition.procedure
  if (graph.kind !== 'orchestration') throw Error('expected graph')
  graph.steps = graph.steps.slice(0, 1)
  graph.exports.summary.step = graph.steps[0].id
  current = { ...initial, body: { ...initial.body, formal_method: authored } }
  const fallback = fetcher.getMockImplementation()!
  const reference = { method_id: childId, version: 2, digest: fingerprint }
  let grantActive = true
  const pendingCheck = Promise.withResolvers<void>()
  let delayCheck = false
  const revoked = { ...reference, method_id: RUN }
  const { procedure, ...contract } = draft.definition
  if (procedure.kind !== 'direct') throw Error('expected tool')
  fetcher.mockImplementation(async (url, options) => {
    if (url.endsWith('/matching-outputs')) {
      const body = JSON.parse(options.body)
      expect(body.slot.schema).toEqual({ type: 'string' })
      expect(body.directory).toBe('shared')
      return body.after === null
        ? respond({ items: [], next: RUN })
        : respond({
            items: [
              { reference: revoked, title: '已撤权', output: 'summary' },
              { reference, title: '可引用', output: 'summary' },
            ],
            next: null,
          })
    }
    if (url.includes('/incubation-tools/') && url.includes('/versions/')) {
      if (delayCheck) await pendingCheck.promise
      if (url.includes(revoked.method_id) && !grantActive) return respond({ items: [], next: null })
      return respond({
        items: [
          {
            reference: url.includes(revoked.method_id) ? revoked : reference,
            scope: 'platform',
            title: '可引用',
            interface: { ...contract, inputs: procedure.inputs, outputs: procedure.outputs },
            installations: [{ asset_id: childId, revision: 1, name: '测试安装', account: null }],
            selected: childId,
          },
        ],
        next: null,
      })
    }
    return fallback(url, options)
  })
  show()
  fireEvent.change(await screen.findByLabelText(labels.purpose), {
    target: { value: '补查后复核' },
  })
  fireEvent.change(await screen.findByLabelText(labels.toolDirectory), {
    target: { value: 'shared' },
  })
  fireEvent.change(screen.getByLabelText(labels.p1Input), { target: { value: 'message' } })
  await screen.findByText(labels.noToolsOnPage)
  fireEvent.click(
    within(screen.getByRole('group', { name: labels.p1Find })).getByRole('button', {
      name: labels.next,
    }),
  )
  const blocked = await screen.findByRole<HTMLOptionElement>('option', { name: /已撤权/ })
  const select = screen.getByLabelText(labels.p1Provider)
  fireEvent.change(select, { target: { value: blocked.value } })
  const firstPreview = await screen.findByRole('button', { name: labels.p1Adopt })
  grantActive = false
  fireEvent.click(firstPreview)
  await screen.findByText(labels.versionUnavailable)
  expect(screen.queryByRole('button', { name: labels.p1Adopt })).toBeNull()
  const usable = screen.getByRole<HTMLOptionElement>('option', { name: /可引用 · v2/ })
  fireEvent.change(select, { target: { value: usable.value } })
  const adopt = await screen.findByRole('button', { name: labels.p1Adopt })
  const save = screen.getByRole('button', { name: labels.save })
  expect(save).toBeEnabled()
  delayCheck = true
  fireEvent.click(adopt)
  await waitFor(() => expect(save).toBeDisabled())
  expect(screen.getByLabelText(labels.purpose)).toBeDisabled()
  fireEvent.click(save)
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('/cells'))).toBe(false)
  pendingCheck.resolve()
  await waitFor(() => expect(screen.getByRole('button', { name: labels.save })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: labels.save }))
  await screen.findByText(labels.saved)
  expect(current.body.formal_method?.definition.procedure).toMatchObject({
    steps: [
      { id: 'prepare', candidates: [reference] },
      {
        inputs: { message: { binding: { source: 'step', step: 'prepare', output: 'summary' } } },
      },
    ],
  })
})

it.each([false, true])(
  'saves and reopens review requirements, staged comparison %s',
  async (strict) => {
    const graph = orchestrationDraft(draft)
    const stage = messages.formalExecution
    if (strict && graph.definition.procedure.kind === 'orchestration') {
      const [first, second] = graph.definition.procedure.steps
      first.outputs.notes = first.outputs.summary
      second.inputs.notes = {
        slot: first.outputs.notes,
        binding: { source: 'step', step: 'first', output: 'notes' },
      }
    }
    current = {
      ...initial,
      body: {
        ...initial.body,
        formal_method: graph,
        collaboration: {
          second: { isolation_group: 'review', handoff_from: ['first'] },
        },
      },
    }
    const fallback = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, options) => {
      if (!url.endsWith('/cells')) return fallback(url, options)
      const body = JSON.parse(options.body)
      expect(body.cells.map((c: { path: string }) => c.path)).toEqual(['collaboration'])
      current = {
        ...current,
        revision: current.revision + 1,
        body: { ...current.body, collaboration: body.cells[0].value },
        runtime_gaps: [
          { step: 'second', primitive: 'isolated_reviewer' },
          { step: 'second', primitive: 'different_model_family' },
        ],
      }
      return respond(current)
    })
    const label = 'second 复核 first 的产物'
    const view = show()
    fireEvent.change(await screen.findByLabelText(label), {
      target: { value: 'different_model_family' },
    })
    if (strict) {
      fireEvent.change(screen.getByLabelText(stage.reviewStage), { target: { value: 'strict' } })
      fireEvent.change(screen.getByLabelText(stage.reviewAssessment), {
        target: { value: 'notes' },
      })
      fireEvent.change(screen.getByLabelText(stage.reviewReworks), { target: { value: '1' } })
      expect(screen.getByText(stage.reviewFirst.replace('{outputs}', 'summary'))).toBeVisible()
    } else expect(screen.getByRole('option', { name: stage.reviewStrict })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: labels.save }))
    await screen.findByText(labels.saved)
    expect(current.body.collaboration?.second).toEqual({
      isolation_group: 'review',
      handoff_from: ['first'],
      ...(strict && { comparison: { assessment_output: 'notes', max_reworks: 1 } }),
      review_requirements: { first: 'different_model_family' },
    })
    expect(current.body.formal_method).toEqual(graph)
    view.unmount()
    show()
    expect(await screen.findByLabelText(label)).toHaveValue('different_model_family')
    if (strict) {
      expect(screen.getByLabelText(stage.reviewAssessment)).toHaveValue('notes')
      expect(screen.getByLabelText(stage.reviewReworks)).toHaveValue('1')
    }
    expect(screen.getByText(/当前运行器尚未支持核验/)).toBeInTheDocument()
  },
)

it('imports the review requirement from a portable formal graph and rejects unrecognized restrictions', async () => {
  const graph = orchestrationDraft(draft)
  const role = { review_requirements: { first: 'different_model_family' } }
  const file = (collaboration: object) => ({
    size: 100,
    text: async () =>
      JSON.stringify({
        ...graph.definition,
        procedure: { ...graph.definition.procedure, collaboration },
      }),
  })
  show()
  const input = await screen.findByLabelText(labels.import)
  fireEvent.change(input, { target: { files: [file({ second: role })] } })
  expect(await screen.findByLabelText('second 复核 first 的产物')).toHaveValue(
    'different_model_family',
  )
  fireEvent.change(input, { target: { files: [file({ second: { ...role, future_rule: true } })] } })
  await screen.findByText(labels.errors.definition_invalid)
  expect(screen.getByLabelText('second 复核 first 的产物')).toHaveValue('different_model_family')
})

it.each(['direct', 'plain graph', 'review graph'])(
  'replaces saved collaboration when importing a %s and preserves it after reopening',
  async (kind) => {
    const graph = orchestrationDraft(draft)
    current.body.formal_method = graph
    current.body.collaboration = {
      first: { isolation_group: 'author', handoff_from: [] },
      second: {
        isolation_group: 'review',
        handoff_from: ['first'],
        review_requirements: { first: 'different_model_family' },
      },
    }
    const expected =
      kind === 'review graph'
        ? {
            second: {
              isolation_group: null,
              handoff_from: [],
              review_requirements: { first: 'isolated_reviewer' as const },
            },
          }
        : null
    const definition = structuredClone(kind === 'direct' ? draft.definition : graph.definition)
    definition.capability_declaration.title = '导入的替代方法'
    if (definition.procedure.kind === 'orchestration' && expected)
      definition.procedure.collaboration = expected
    const fallback = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, options) => {
      if (!url.endsWith('/cells')) return fallback(url, options)
      const body = JSON.parse(options.body)
      const edits = Object.fromEntries(
        body.cells.map((c: { path: string; value: unknown }) => [c.path, c.value]),
      )
      current = { ...current, revision: current.revision + 1, body: { ...current.body, ...edits } }
      return respond(current)
    })
    const view = show()
    fireEvent.change(await screen.findByLabelText(labels.import), {
      target: { files: [{ size: 100, text: async () => JSON.stringify(definition) }] },
    })
    await screen.findByDisplayValue('导入的替代方法')
    if (kind === 'direct') {
      const option = await screen.findByRole<HTMLOptionElement>('option', {
        name: 'synthetic.check · 1 · check',
      })
      fireEvent.change(screen.getByLabelText(labels.source), { target: { value: option.value } })
    }
    fireEvent.click(screen.getByRole('button', { name: labels.save }))
    await screen.findByText(labels.saved)
    expect(current.body.collaboration).toEqual(expected)
    expect(current.body.formal_method?.definition.procedure).not.toHaveProperty('collaboration')
    view.unmount()
    show()
    await screen.findByDisplayValue('导入的替代方法')
    expect(screen.queryByText(labels.p3Group.replace('{group}', 'author'))).toBeNull()
    if (kind === 'review graph')
      expect(screen.getByLabelText('second 复核 first 的产物')).toHaveValue('isolated_reviewer')
  },
)

it('keeps every promised output and fixed input when the author replaces a downstream tool', () => {
  const original = orchestrationDraft(draft).definition
  const graph = original.procedure
  if (graph.kind !== 'orchestration') throw Error('expected graph')
  graph.steps = graph.steps.slice(0, 1)
  const first = graph.steps[0]
  graph.exports.summary.step = first.id
  first.outputs.audit = { ...first.outputs.summary, meaning: { kind: 'audit' } }
  graph.exports.audit = { step: first.id, output: 'audit', always_present: true }
  const candidate = structuredClone(original)
  const other = candidate.procedure
  if (other.kind !== 'orchestration') throw Error('expected graph')
  const tool = other.steps[0]
  tool.candidates[0].method_id = RUN
  tool.outputs.alternative = tool.outputs.summary
  delete tool.outputs.summary
  const replace = () => replaceP1Tool(original, 'message', 'summary', candidate, 'alternative')
  expect(replace()).toMatchObject({ issue: 'p1BindingGap', slot: 'message' })
  delete tool.inputs.message
  tool.outputs.audit = { ...first.outputs.audit, required: false }
  expect(replace()).toMatchObject({ issue: 'p1OutputGap', slot: 'audit' })
  tool.outputs.audit = { ...first.outputs.audit, meaning: { kind: 'different' } }
  expect(replace()).toMatchObject({ issue: 'p1OutputGap', slot: 'audit' })
  tool.outputs.audit = first.outputs.audit
  const applied = replace()
  expect(applied).toMatchObject({
    plan: {
      capability_declaration: original.capability_declaration,
      how_to_validate: original.how_to_validate,
      procedure: {
        exports: { summary: { output: 'alternative' }, audit: graph.exports.audit },
        steps: [{ inputs: { fixed: first.inputs.fixed } }],
      },
    },
  })
  delete tool.inputs.fixed
  expect(replace()).toMatchObject({ issue: 'p1BindingGap', slot: 'fixed' })
})

it('stops on a repeated catalog page and lets the author keep the original plan', async () => {
  const authored = orchestrationDraft(draft)
  const graph = authored.definition.procedure
  if (graph.kind !== 'orchestration') throw Error('expected graph')
  graph.steps = graph.steps.slice(0, 1)
  graph.exports.summary.step = graph.steps[0].id
  current = { ...initial, body: { ...initial.body, formal_method: authored } }
  const fallback = fetcher.getMockImplementation()!
  let searches = 0
  fetcher.mockImplementation((url, options) => {
    if (!url.endsWith('/matching-outputs')) return fallback(url, options)
    searches++
    return respond({ items: [], next: 0 })
  })
  show()
  fireEvent.change(await screen.findByLabelText(labels.p1Input), { target: { value: 'message' } })
  await screen.findByText(labels.p1CursorStopped)
  const panel = within(screen.getByRole('group', { name: labels.p1Find }))
  expect(panel.queryByRole('button', { name: labels.next })).toBeNull()
  fireEvent.click(panel.getByRole('button', { name: labels.p1Stop }))
  expect(screen.getByLabelText(labels.p1Input)).toHaveValue('')
  expect(searches).toBe(1)
  expect(screen.getByRole('button', { name: labels.save })).toBeDisabled()
  expect(current.body.formal_method).toEqual(authored)
})

it('stops automatic lookup at the author limit and stops paging after cancellation', async () => {
  const authored = orchestrationDraft(draft)
  const graph = authored.definition.procedure
  if (graph.kind !== 'orchestration') throw Error('expected graph')
  graph.steps = graph.steps.slice(0, 1)
  graph.exports.summary.step = graph.steps[0].id
  current = { ...initial, body: { ...initial.body, formal_method: authored } }
  const fallback = fetcher.getMockImplementation()!
  const pending = Promise.withResolvers<Response>()
  const actions: string[] = []
  let lastSignal: AbortSignal | undefined
  fetcher.mockImplementation((url, options) => {
    if (!url.endsWith('/scan-outputs')) return fallback(url, options)
    const command = JSON.parse(options.body)
    actions.push(command.action_id)
    lastSignal = options.signal
    if (command.page_limit === 3) return pending.promise
    return respond({
      items: [],
      limit: 2,
      used: actions.length,
      pages_read: actions.length,
      has_more: true,
      reason: actions.length === 1 ? 'continue' : 'budget',
    })
  })
  show()
  fireEvent.click(await screen.findByLabelText(labels.p1Automatic))
  fireEvent.change(screen.getByLabelText(labels.p1Input), { target: { value: 'message' } })
  fireEvent.change(screen.getByLabelText(labels.p1PageBudget), { target: { value: '2' } })
  const start = screen.getByRole('button', { name: labels.p1Scan })
  expect(actions).toHaveLength(0)
  fireEvent.click(start)
  await screen.findByText(labels.p1ScanStatus.budget, { exact: false })
  expect(new Set(actions).size).toBe(2)
  expect(start).toBeDisabled()
  fireEvent.change(screen.getByLabelText(labels.p1PageBudget), { target: { value: '3' } })
  fireEvent.click(start)
  await waitFor(() => expect(actions).toHaveLength(3))
  fireEvent.click(screen.getByRole('button', { name: labels.p1Stop }))
  await waitFor(() => expect(lastSignal?.aborted).toBe(true))
  pending.resolve(
    respond({ items: [], limit: 3, used: 2, pages_read: 2, has_more: true, reason: 'continue' }),
  )
  await pending.promise
  expect(actions).toHaveLength(3)
  expect(current.body.formal_method).toEqual(authored)
})

it('offers an existing transitive output before searching and preserves other dependencies', async () => {
  const authored = orchestrationDraft(draft)
  const graph = authored.definition.procedure
  if (graph.kind !== 'orchestration') throw Error('expected graph')
  const [first, second] = graph.steps
  const target = structuredClone(second)
  target.id = 'last'
  target.depends_on = ['second']
  target.inputs.message.binding = { source: 'caller', name: 'missing' }
  const sibling = { ...first, id: 'independent' }
  graph.steps = [target, second, sibling, first]
  current = { ...initial, body: { ...initial.body, formal_method: authored } }
  show()
  fireEvent.change(await screen.findByLabelText(labels.p1Target), { target: { value: 'last' } })
  fireEvent.change(screen.getByLabelText(labels.p1Input), { target: { value: 'message' } })
  const reachable = screen.getByLabelText<HTMLSelectElement>(labels.p1Available)
  expect([...reachable.options].map((o) => o.value).sort()).toEqual([
    '',
    'first.summary',
    'second.summary',
  ])
  fireEvent.change(reachable, { target: { value: 'first.summary' } })
  fireEvent.click(
    within(screen.getByRole('group', { name: labels.p1Find })).getByRole('button', {
      name: labels.adoptBinding,
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: labels.save }))
  await screen.findByText(labels.saved)
  expect(
    fetcher.mock.calls.some(
      ([url]) => url.endsWith('/matching-outputs') || url.endsWith('/scan-outputs'),
    ),
  ).toBe(false)
  const saved = current.body.formal_method?.definition.procedure
  if (saved?.kind !== 'orchestration') throw Error('expected saved graph')
  expect(saved.steps).toEqual([
    {
      ...target,
      depends_on: ['second', 'first'],
      inputs: {
        message: {
          ...target.inputs.message,
          binding: { source: 'step', step: 'first', output: 'summary' },
        },
      },
    },
    second,
    sibling,
    first,
  ])
})

it('replaces an internal producer while preserving the fixed input, downstream consumers and exports', () => {
  const plan = orchestrationDraft(draft).definition
  const graph = plan.procedure
  if (graph.kind !== 'orchestration') throw Error('expected graph')
  const [first, second] = graph.steps
  const candidate = structuredClone(plan)
  if (candidate.procedure.kind !== 'orchestration') throw Error('expected candidate')
  const next = candidate.procedure.steps[0]
  next.candidates[0].method_id = RUN
  next.outputs = { newPort: next.outputs.summary }
  delete next.inputs.message
  candidate.procedure.steps = [next]
  const result = replaceP1Tool(plan, 'message', '@summary', candidate, 'newPort', {}, first.id)
  if (!('plan' in result) || result.plan.procedure.kind !== 'orchestration')
    throw Error('expected replacement')
  const resultGraph = result.plan.procedure
  expect(resultGraph.steps[0].inputs.fixed).toEqual(first.inputs.fixed)
  expect(resultGraph.steps[1]).toEqual({
    ...second,
    inputs: {
      message: {
        ...second.inputs.message,
        binding: { source: 'step', step: first.id, output: 'newPort' },
      },
    },
  })
  expect(resultGraph.exports).toEqual(graph.exports)
  expect(graph.steps[1].inputs.message.binding).toMatchObject({ output: 'summary' })
})

it('persists application boundaries and a conditional promise across reopening', async () => {
  const editor = show()
  fireEvent.change(await screen.findByLabelText(labels.applicableLines), {
    target: { value: '已有报告\n已有会议纪要' },
  })
  fireEvent.change(screen.getByLabelText(labels.excludedLines), { target: { value: '实时预测' } })
  fireEvent.change(screen.getByLabelText(labels.promiseWhen), {
    target: { value: '有可核验的文字' },
  })
  fireEvent.click(screen.getByRole('button', { name: labels.save }))
  await screen.findByText(labels.saved)
  editor.unmount()
  show()
  expect(await screen.findByLabelText(labels.promiseWhen)).toHaveValue('有可核验的文字')
  expect(screen.getByLabelText(labels.applicableLines)).toHaveValue('已有报告\n已有会议纪要')
  expect(current.body.formal_method?.definition.capability_declaration.conditions).toEqual({
    summary: { when: '有可核验的文字', input_slots: [] },
  })
})

it.each(['join', 'review'])(
  'keeps the %s preview separate when a shared branch installation changes before adoption',
  async (mode) => {
    const review = mode === 'review'
    const apply = review ? labels.p3Adopt : labels.p2Adopt
    const authored = orchestrationDraft(draft)
    const graph = authored.definition.procedure
    if (graph.kind !== 'orchestration' || draft.definition.procedure.kind !== 'direct')
      throw Error('fixture')
    const join = graph.steps[0]
    join.inputs.fixed = { ...join.inputs.message, binding: { source: 'caller', name: 'fixed' } }
    graph.steps = [join]
    graph.exports.summary.step = join.id
    current = { ...initial, body: { ...initial.body, formal_method: authored } }
    const fallback = fetcher.getMockImplementation()!
    const ref = { method_id: childId, version: 2, digest: fingerprint }
    const { procedure, ...contract } = draft.definition
    if (procedure.kind !== 'direct') throw Error('fixture')
    let installationRevision = 1
    fetcher.mockImplementation(async (url, options) => {
      if (url.endsWith('/matching-outputs'))
        return respond({
          items: [{ reference: ref, title: 'prepared result', output: 'summary' }],
          next: null,
        })
      if (url.includes('/incubation-tools/') && url.includes('/versions/'))
        return respond({
          items: [
            {
              reference: ref,
              scope: 'platform',
              title: 'prepared result',
              interface: { ...contract, inputs: procedure.inputs, outputs: procedure.outputs },
              installations: [
                {
                  asset_id: childId,
                  revision: installationRevision,
                  name: 'reader',
                  account: null,
                },
              ],
              selected: childId,
            },
          ],
          next: null,
        })
      return fallback(url, options)
    })
    show()
    const panel = within(
      await screen.findByRole('group', { name: review ? labels.p3Review : labels.p2Join }),
    )
    if (!review)
      fireEvent.change(panel.getByLabelText(labels.p2Target), { target: { value: join.id } })
    for (const input of ['message', 'fixed']) {
      fireEvent.change(panel.getByLabelText(labels.p2Input), { target: { value: input } })
      fireEvent.change(panel.getByLabelText(labels.toolDirectory), { target: { value: 'shared' } })
      const choice = await panel.findByRole<HTMLOptionElement>('option', {
        name: /prepared result/,
      })
      fireEvent.change(panel.getByLabelText(labels.p1Provider), { target: { value: choice.value } })
      const add = panel.getByRole('button', { name: labels.p2Add })
      await waitFor(() => expect(add).toBeEnabled())
      fireEvent.click(add)
    }
    installationRevision++
    fireEvent.click(panel.getByRole('button', { name: apply }))
    await panel.findByText(labels.p2Stale)
    expect(screen.getByRole('button', { name: labels.save })).toBeDisabled()
    expect(fetcher.mock.calls.some(([url]) => url.endsWith('/cells'))).toBe(false)
    fireEvent.click(panel.getByRole('button', { name: labels.p2Undo }))
    expect(panel.getByRole('button', { name: apply })).toBeDisabled()
  },
)
