import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { FormalMethodEditor } from '@/components/knowbots/formal-method-editor'
import { formalDraftSchema } from '@/contracts/formal-methods'
import { workdraftSchema } from '@/contracts/workdraft'
import { formalValidation, freezeFormalMethod } from '@/lib/knowbots/formal-methods'
import messages from '@/messages/zh-CN.json'
import fixture from '../fixtures/author-method.json'
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
