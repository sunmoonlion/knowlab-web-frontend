import { fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RoundPanel } from '@/components/knowbots/workdraft-ai'
import * as api from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'
import { renderWith, REQUEST } from '@/tests/component/knowbot-fixtures'

vi.mock('@/i18n/navigation', async () =>
  (await import('@/tests/component/knowbot-fixtures')).linkMock(),
)
const t = messages.workdraft.ai
afterEach(() => vi.restoreAllMocks())
function display() {
  const start = vi.fn()
  renderWith(
    <RoundPanel
      action="draft"
      requestId={REQUEST}
      busy={false}
      error={null}
      onStart={start}
      onClose={vi.fn()}
    />,
  )
  return start
}

it('compares the visible folder with the authoring request after a directory rename', async () => {
  vi.spyOn(api, 'fetchRoundComputers').mockResolvedValue({
    computers: [
      { environment_id: REQUEST, name: '开发机', online: true, roots: ['/workspace/new'] },
    ],
    last: { environment_id: REQUEST, workspace_root: '/workspace/old' },
    model_key: true,
  })
  const start = display()
  expect(await screen.findByLabelText(t.folder)).toHaveValue('/workspace/new')
  fireEvent.click(screen.getByRole('button', { name: t.start }))
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ workspace_root: '/workspace/new' }))
})

it('compares a computer list read failure with the empty inventory message', async () => {
  vi.spyOn(api, 'fetchRoundComputers').mockRejectedValue(
    new Error('inventory temporarily unavailable'),
  )
  display()
  expect(await screen.findByRole('alert')).toHaveTextContent(t.computersFailed)
  expect(screen.queryByText(t.noComputer)).toBeNull()
  expect(screen.getByRole('button', { name: t.retryComputers })).toBeEnabled()
})
