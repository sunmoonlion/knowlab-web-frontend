import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MethodDirectory } from '@/components/knowbots/method-directory'
import { MethodStudioEditor, MethodStudioHome } from '@/components/knowbots/method-studio'
import * as formalApi from '@/lib/knowbots/formal-methods'
import * as draftApi from '@/lib/knowbots/method-drafts'
import zh from '@/messages/zh-CN.json'
import { CSRF, REQUEST, renderWith, router } from './knowbot-fixtures'

vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

afterEach(() => vi.restoreAllMocks())

describe('Method Studio & Author Method Directory', () => {
  it('creates an S1–S4 engineering draft and renders live Two-View + C-L1 confirmation in editor', async () => {
    const sampleDetail: draftApi.MethodDraftDetail = {
      method_id: REQUEST,
      request_id: null,
      workdraft_id: REQUEST,
      revision: 1,
      draft_contract: {
        archetype_id: 'S1',
        method_kind: 'expert',
        title: '三表勾稽专家',
        purpose: '核对资产负债表与现金流量表勾稽关系',
        applies_when: ['提供标准三表'],
        excludes: ['不做买卖建议'],
        expected_deliverables: [
          {
            promise_id: 'reconciliation_report',
            summary: '输出勾稽核验回执',
            expected_domain_id: 'audit.check_receipt',
            expected_schema: { type: 'object' },
            delivery_mode: 'always',
          },
        ],
        validation_rules: [
          {
            promise_id: 'reconciliation_report',
            outputs: ['reconciliation_report'],
            check: '勾稽差额在允许容差内',
            evidence: '运行回执',
            on_failure: 'fail',
            v0_checks: [{ kind: 'numeric_identity', target_output: 'reconciliation_report' }],
          },
        ],
      },
      projection: {
        public_inputs: [
          {
            name: 'statement_rows',
            description: '报表行',
            required: true,
            domain_id: 'fin.statement.row',
            schema_type: 'object',
          },
        ],
        what_to_return: [
          {
            name: 'reconciliation_report',
            description: '输出勾稽核验回执',
            required: true,
            domain_id: 'audit.check_receipt',
            schema_type: 'object',
          },
        ],
        missing_promise_sources: [],
        unconfirmed_paths: ['capability.purpose'],
        ready_to_freeze: false,
      },
      public_contract: null,
      definition_digest: null,
      source: null,
      allowed_callers: ['host'],
      feedback: [], provenance_verified: true,
      provenance_issues: [],
    }

    const pushSpy = vi.spyOn(router, 'push')
    vi.spyOn(draftApi, 'listMethodDrafts').mockResolvedValue([])
    const createSpy = vi.spyOn(draftApi, 'createMethodDraft').mockResolvedValue(sampleDetail)

    const home = renderWith(<MethodStudioHome csrfToken={CSRF} />)
    fireEvent.click(screen.getByRole('button', { name: /S3 · 隔离盲审/ }))
    fireEvent.change(screen.getByLabelText(zh.studio.methodTitle), {
      target: { value: '三表勾稽专家' },
    })
    fireEvent.click(screen.getByRole('button', { name: zh.studio.createAction }))
    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          archetype: 'S3',
          method_kind: 'expert',
          title: '三表勾稽专家',
        }),
        CSRF,
      ),
    )
    expect(pushSpy).toHaveBeenCalledWith(`/studio/${REQUEST}`)
    home.unmount()

    vi.spyOn(draftApi, 'fetchSlotVocabulary').mockResolvedValue({
      vocab_version: '1',
      domains: [
        { domain_id: 'audit.check_receipt', label: '核验回执' },
        { domain_id: 'fin.statement.row', label: '财务报表行' },
      ],
      presets: ['structured_record'],
      archetypes: ['S1', 'S2', 'S3', 'S4'],
    })
    vi.spyOn(draftApi, 'fetchMethodDraft').mockResolvedValue(sampleDetail)
    const patchSpy = vi.spyOn(draftApi, 'patchMethodDraft').mockResolvedValue({
      ...sampleDetail,
      revision: 2,
      projection: { ...sampleDetail.projection, unconfirmed_paths: [], ready_to_freeze: true },
    })

    renderWith(<MethodStudioEditor methodId={REQUEST} csrfToken={CSRF} />)
    expect(await screen.findByText(/statement_rows\(财务报表行\)/)).toBeVisible()
    expect(screen.getByText(/reconciliation_report\(核验回执\)/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: zh.studio.confirmAllProvenance }))
    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith(
        REQUEST,
        expect.objectContaining({
          revision: 1,
          confirm_paths: ['capability.purpose'],
        }),
        CSRF,
      ),
    )
  })

  it('opens the wire-format projection and sends the exact graph and pending confirmations', async () => {
    const out = {
      slot: {
        description: '首步回执',
        required: true,
        schema: { type: 'object' },
        meaning: { domain_id: 'core.check.receipt' },
      },
      always_present: true,
    }
    const raw = {
      method_id: REQUEST,
      workdraft_id: REQUEST,
      request_id: null,
      revision: 2,
      draft_contract: {
        method_kind: 'expert',
        title: '核对',
        purpose: '核对两项结果',
        applies_when: ['资料齐全'],
        unconfirmed_paths: ['element:procedure'],
        procedure: { kind: 'orchestration', steps: [], exports: {} },
        expected_deliverables: [],
        validation_rules: [],
      },
      projection: {
        public_inputs: {},
        what_to_return: { receipt: out },
        missing_promise_sources: ['summary'],
        ready_to_freeze: false,
      },
      definition_digest: null,
      formal_method: null,
      public_contract: null,
      provenance_verified: false,
    }
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).endsWith('/slot-vocabulary'))
        return Response.json({ vocab_version: '1', domains: [], presets: [], archetypes: ['S1'] })
      if (String(url).endsWith('/method-drafts/' + REQUEST))
        return Response.json({ ...raw, revision: options?.method === 'PATCH' ? 3 : 2 })
      return Response.json({ items: [] })
    })
    renderWith(<MethodStudioEditor methodId={REQUEST} csrfToken={CSRF} />)
    expect(await screen.findByText(/receipt\(core.check.receipt\)/)).toBeVisible()
    expect(screen.getByText(/缺少交付来源的承诺.*summary/)).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: '2. ' + zh.studio.steps.procedure }))
    const field = screen.getByLabelText(zh.studio.graphJson)
    fireEvent.change(field, { target: { value: '{invalid' } })
    fireEvent.click(screen.getByRole('button', { name: zh.studio.saveProcedure }))
    expect(screen.getByText(zh.studio.graphInvalid)).toBeVisible()
    expect(fetcher.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')).toHaveLength(0)
    const slot = { ...out.slot, on_missing: 'fail' }
    const step = (id: string, output: string) => ({
      id,
      inputs: {},
      outputs: { [output]: slot },
      depends_on: [],
      always_required: true,
      candidates: [{ method_id: REQUEST, version: 1, digest: 'sha256:' + 'b'.repeat(64) }],
      select_when: '核验',
      required_when: '始终',
      on_failure: 'fail',
    })
    const graph = {
      kind: 'orchestration',
      instructions: '独立执行并返回两份结果',
      max_depth: 2,
      max_steps: 2,
      max_expansions: 3,
      max_replans: 0,
      steps: [step('first', 'receipt'), step('independent', 'summary')],
      exports: {
        receipt: { step: 'first', output: 'receipt', always_present: true },
        summary: { step: 'independent', output: 'summary', always_present: true },
      },
    }
    fireEvent.change(field, { target: { value: JSON.stringify(graph) } })
    fireEvent.click(screen.getByRole('button', { name: zh.studio.saveProcedure }))
    await waitFor(() =>
      expect(fetcher.mock.calls.filter(([, opts]) => opts?.method === 'PATCH')).toHaveLength(1),
    )
    const [, opts] = fetcher.mock.calls.find(([, opts]) => opts?.method === 'PATCH')!
    expect(JSON.parse(String(opts?.body))).toMatchObject({
      revision: 2,
      confirm_paths: ['element:procedure'],
      elements: { procedure: graph },
    })
  })

  it('registers a script source inline from KnowLab /methods without round-tripping to KnowBench', async () => {
    vi.spyOn(formalApi, 'listFormalMethods').mockResolvedValue([])
    vi.spyOn(formalApi, 'formalSources').mockResolvedValue([])
    const registerSpy = vi.spyOn(formalApi, 'registerDirectorySource').mockResolvedValue({
      source_id: REQUEST,
      version: 1,
      kind: 'script',
      name: 'reconcile.py',
      digest: 'sha256:' + 'a'.repeat(64),
    })

    renderWith(<MethodDirectory csrfToken={CSRF} />)
    fireEvent.click(screen.getByRole('button', { name: zh.methodDirectory.sources }))
    fireEvent.click(
      await screen.findByRole('button', { name: zh.methodDirectory.registerSourceInline }),
    )
    fireEvent.change(screen.getByLabelText(zh.methodDirectory.sourceName), {
      target: { value: 'reconcile.py' },
    })
    fireEvent.change(screen.getByLabelText(zh.methodDirectory.sourceContent), {
      target: { value: 'print("ok")' },
    })
    fireEvent.click(screen.getByRole('button', { name: zh.methodDirectory.saveSource }))
    await waitFor(() =>
      expect(registerSpy).toHaveBeenCalledWith(
        expect.any(String),
        1,
        { kind: 'script', name: 'reconcile.py', content: 'print("ok")' },
        CSRF,
      ),
    )
  })
})
