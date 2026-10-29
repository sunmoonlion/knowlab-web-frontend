import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IncubationMode } from '@/components/knowbots/incubation-mode'
import type { Grant } from '@/contracts/knowbots'
import { askPlatform, renewPlatform, takeBack } from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

import { CSRF, REQUEST, detail, renderWith } from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({
  askPlatform: vi.fn(),
  renewPlatform: vi.fn(),
  takeBack: vi.fn(),
}))

const m = messages.knowbots.mode

function grant(over: Partial<Grant> = {}): Grant {
  return {
    grant_id: '22222222-2222-4222-8222-222222222222',
    kind: 'incubate',
    draft_id: null,
    state: 'active',
    budget_limit: '20.00',
    granted_at: '2026-10-29T08:00:00Z',
    expires_at: '2026-11-28T08:00:00Z',
    decided_at: '2026-10-29T09:00:00Z',
    reason: null,
    ended_at: null,
    basis: 'platform:knowlab:incubate:22222222-2222-4222-8222-222222222222',
    ...over,
  }
}

beforeEach(() => vi.resetAllMocks())

describe('孵化方式（SDD 0046 第四节）', () => {
  it('自己来的名称：请平台孵化先看确认框，写明看到什么、用谁的 key、谁出钱，同意才授权', async () => {
    vi.mocked(askPlatform).mockResolvedValue(grant({ state: 'pending' }))
    renderWith(
      <IncubationMode life={detail({ incubation_mode: 'self', grants: [] })} csrfToken={CSRF} />,
    )
    expect(screen.getByTestId('incubation-mode')).toHaveTextContent(m.self)
    fireEvent.click(screen.getByRole('button', { name: m.ask }))
    expect(screen.getByText(m.askLines.who)).toBeInTheDocument()
    expect(screen.getByText(m.askLines.key)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(m.budget), { target: { value: '35' } })
    fireEvent.click(screen.getByRole('button', { name: m.agree }))
    await waitFor(() => expect(askPlatform).toHaveBeenCalledWith(REQUEST, '35', CSRF))
  })

  it('平台孵化中：我自己来要再确认一次，撤了顶上说一声', async () => {
    vi.mocked(takeBack).mockResolvedValue(undefined)
    renderWith(
      <IncubationMode
        life={detail({ incubation_mode: 'platform', grants: [grant()] })}
        csrfToken={CSRF}
      />,
    )
    expect(screen.getByTestId('incubation-mode')).toHaveTextContent(m.platform)
    fireEvent.click(screen.getByRole('button', { name: m.takeBack }))
    expect(screen.getByText(m.backConfirm)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: m.backYes }))
    await waitFor(() => expect(takeBack).toHaveBeenCalledWith(REQUEST, CSRF))
    expect(await screen.findByText(m.revoked)).toBeInTheDocument()
  })

  it('授权到期了：一键续', async () => {
    vi.mocked(renewPlatform).mockResolvedValue(grant())
    renderWith(
      <IncubationMode
        life={detail({ incubation_mode: 'platform', grants: [grant({ state: 'expired' })] })}
        csrfToken={CSRF}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: m.renew }))
    await waitFor(() => expect(renewPlatform).toHaveBeenCalledWith(REQUEST, CSRF))
  })
})
