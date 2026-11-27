import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MethodStudioEditor, MethodStudioHome } from '@/components/knowbots/method-studio'
import zh from '@/messages/zh-CN.json'
import { CSRF, REQUEST, renderWith, router } from './knowbot-fixtures'

vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

afterEach(() => vi.restoreAllMocks())

it('opens a newly saved expert and reopens its mapped return and unconfirmed fields', async () => {
  const detail = {
    contract_version: 1,
    method_id: REQUEST,
    workdraft_id: REQUEST,
    request_id: null,
    revision: 1,
    draft_contract: {
      archetype_id: 'S1',
      method_kind: 'expert',
      title: '三表核验',
      purpose: '核对',
      unconfirmed_paths: ['capability.applies_when/0'],
    },
    projection: {
      public_inputs: {},
      what_to_return: {
        primary_receipt: {
          slot: {
            description: '核验回执',
            required: true,
            schema: { type: 'object' },
            meaning: { domain_id: 'core.check.receipt', vocab_version: '1' },
          },
        },
      },
      missing_promise_sources: ['primary_receipt'],
      ready_to_freeze: false,
    },
    definition_digest: null,
    public_contract: null,
    provenance_verified: false,
  }
  const createBodies: unknown[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = String(input)
    if (path === '/api/web/v1/method-drafts') {
      if (init?.method === 'POST') {
        createBodies.push(JSON.parse(String(init.body)))
        return Response.json(detail, { status: 201 })
      }
      return Response.json({ contract_version: 1, items: [] })
    }
    if (path === '/api/web/v1/method-drafts/' + REQUEST) return Response.json(detail)
    if (path === '/api/web/v1/slot-vocabulary')
      return Response.json({
        vocab_version: '1',
        domains: [{ domain_id: 'core.check.receipt', label: { label: '核验回执' } }],
        archetypes: ['S1', 'S2', 'S3', 'S4'],
        presets: [],
      })
    throw Error('Unexpected path ' + path)
  })
  const navigate = vi.spyOn(router, 'push')
  const home = renderWith(<MethodStudioHome csrfToken={CSRF} />)
  fireEvent.change(screen.getByLabelText(zh.studio.methodTitle), { target: { value: '三表核验' } })
  fireEvent.change(screen.getByLabelText(zh.studio.purposeOptional), { target: { value: '核对' } })
  fireEvent.click(screen.getByRole('button', { name: zh.studio.createAction }))
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/studio/' + REQUEST))
  expect(createBodies).toEqual([
    { archetype: 'S1', method_kind: 'expert', title: '三表核验', purpose: '核对' },
  ])
  home.unmount()
  renderWith(<MethodStudioEditor methodId={REQUEST} csrfToken={CSRF} />)
  expect(await screen.findByDisplayValue('三表核验')).toBeVisible()
  expect(await screen.findByText(/primary_receipt\(核验回执\)/)).toBeVisible()
  expect(screen.getByText('capability.applies_when/0')).toBeVisible()
})
