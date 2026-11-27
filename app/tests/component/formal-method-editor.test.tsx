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

it('withdraws the saved method and collaboration together at the displayed revision', async () => {
  vi.stubGlobal('confirm', vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true))
  show()
  const button = await screen.findByRole('button', { name: labels.withdrawDraft })
  fireEvent.click(button)
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/cells'))).toHaveLength(0)
  fireEvent.click(button)
  expect(await screen.findByText(labels.withdrawn)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: labels.withdrawDraft })).not.toBeInTheDocument()
  const calls = fetcher.mock.calls.filter(([url]) => url.endsWith('/cells'))
  expect(calls).toHaveLength(1)
  expect(JSON.parse(calls[0][1].body as string)).toEqual({
    revision: initial.revision,
    cells: [
      { path: 'formal_method', value: null },
      { path: 'collaboration', value: null },
    ],
  })
})

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
    current = { ...initial, revision: 1, body: { ...initial.body, formal_method: null } }
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

it('opens the five-element studio when an old bookmark has no stored draft', async () => {
  current = { ...initial, revision: 0, body: { ...initial.body, formal_method: null } }
  show()
  expect(await screen.findByRole('button', { name: messages.studio.createAction })).toBeVisible()
  expect(screen.queryByLabelText(labels.import)).toBeNull()
})
