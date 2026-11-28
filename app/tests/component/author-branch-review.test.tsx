import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { SelectionPanel } from '@/components/knowbots/selection-panel'
import { roundSchema } from '@/contracts/workdraft'
import * as api from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'
import { CSRF, REQUEST, renderWith } from './knowbot-fixtures'

vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

it('preserves comma and newline characters in a confirmed branch value', async () => {
  const labels = ['上海，浦东', 'a,b\nc']
  const round = roundSchema.parse({
    incubation_id: REQUEST,
    round: 1,
    action: 'draft',
    instruction: null,
    step_id: null,
    status: 'succeeded',
    budget_limit: '2',
    spent: '0',
    currency: 'CNY',
    waiting_for: null,
    error: null,
    started_at: null,
    finished_at: null,
    selection_round: true,
    workdraft_revision: 1,
    selection: {
      status: 'ready',
      reason: '按地点分派',
      routing_required: true,
      steps: [
        {
          id: 'route',
          method: 'm',
          task: '分类',
          inputs: {},
          route_input: '地点',
          cases: { [labels[0]]: 'm', [labels[1]]: 'n' },
        },
      ],
    },
  })
  vi.spyOn(api, 'fetchRounds').mockResolvedValue([round])
  vi.spyOn(api, 'fetchRound').mockResolvedValue(round)
  const confirmed = vi.spyOn(api, 'confirmSelection').mockResolvedValue({ revision: 2 })
  renderWith(
    <SelectionPanel
      requestId={REQUEST}
      methodId={REQUEST}
      revision={1}
      csrfToken={CSRF}
      binding={{
        template: 'checked_delivery/v1',
        goal: '分类',
        deliverable: '回执',
        check: '逐项',
        evidence: '原文',
      }}
      onConfirmed={async () => {}}
    />,
  )
  fireEvent.change(await screen.findByLabelText(messages.selection.routing), {
    target: { value: 'yes' },
  })
  for (const [index, value] of labels.entries()) {
    fireEvent.change(screen.getByLabelText('分支值 ' + (index + 1)), { target: { value } })
  }
  fireEvent.click(screen.getByLabelText(messages.selection.checked))
  fireEvent.click(screen.getByRole('button', { name: messages.selection.confirm }))
  await waitFor(() =>
    expect(confirmed).toHaveBeenCalledWith(
      REQUEST,
      REQUEST,
      expect.objectContaining({
        cases: { route: [...labels].sort() },
      }),
      CSRF,
    ),
  )
})
