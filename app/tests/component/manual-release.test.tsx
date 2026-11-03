import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { ManualReleaseRequest } from '@/components/knowbots/manual-release'
import { DeliveryPanel } from '@/components/knowbots/delivery-panel'
import { fetchManualReleases, requestManualRelease } from '@/lib/knowbots/manual-release'
import { submitDelivery } from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'
import {
  CSRF,
  DRAFT,
  TEST,
  EXPERT,
  detail,
  draft,
  expert,
  testRecord,
  renderWith,
} from './knowbot-fixtures'
vi.mock('@/lib/knowbots/manual-release', () => ({
  fetchManualReleases: vi.fn(),
  requestManualRelease: vi.fn(),
}))
vi.mock('@/lib/knowbots/client', () => ({
  submitDelivery: vi.fn(),
  declineExpert: vi.fn(),
  withdrawDelivery: vi.fn(),
}))
const t = messages.knowbots.manualRelease
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchManualReleases).mockResolvedValue([])
})
it('binds author consent and offline evidence to the exact revision without starting a test', async () => {
  const life = detail({
    experts: [],
    drafts: [
      draft({ revision: 1 }),
      draft({ draft_id: EXPERT, revision: 2, manifest_sha256: 'a'.repeat(64) }),
    ],
    tests: [testRecord({ draft_id: DRAFT, status: 'passed' })],
  })
  renderWith(<ManualReleaseRequest life={life} csrfToken={CSRF} />)
  fireEvent.click(screen.getByText(t.title))
  await screen.findByRole('button', { name: t.submit })
  for (const key of ['reason', 'change_summary', 'verification', 'limitations'] as const)
    fireEvent.change(screen.getByLabelText(t[key]), { target: { value: 'offline evidence' } })
  expect(screen.getByRole('button', { name: t.submit })).toBeDisabled()
  fireEvent.click(screen.getByLabelText(t.consent))
  fireEvent.click(screen.getByRole('button', { name: t.submit }))
  await waitFor(() =>
    expect(requestManualRelease).toHaveBeenCalledWith(
      EXPERT,
      expect.objectContaining({
        baseline_test_id: TEST,
        manifest_sha256: 'a'.repeat(64),
        authorize_reviewer: true,
        acknowledge_unretested: true,
      }),
      CSRF,
    ),
  )
})
it('public delivery of an approved exception displays no paid rerun budget', async () => {
  renderWith(
    <DeliveryPanel
      csrfToken={CSRF}
      expert={expert({
        stage: 'awaiting_user',
        test_id: null,
        test_number: null,
        test_mode: null,
        manual_release: { release_id: EXPERT, manifest_sha256: 'a'.repeat(64), retested: false },
      })}
    />,
  )
  expect(screen.getByText(t.notice)).toBeVisible()
  fireEvent.click(screen.getByRole('radio', { name: /公开/ }))
  expect(screen.queryByText(messages.knowbots.delivery.rerunBudget)).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText(messages.knowbots.delivery.authorize))
  fireEvent.click(screen.getByRole('button', { name: messages.knowbots.delivery.submit }))
  await waitFor(() =>
    expect(submitDelivery).toHaveBeenCalledWith(EXPERT, { listing: 'public' }, CSRF),
  )
})
