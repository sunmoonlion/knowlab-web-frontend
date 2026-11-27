import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExpertsView } from '@/components/knowbots/experts-view'
import { fetchExperts, stopExpert } from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'
import { CSRF, EXPERT, expertItem, renderWith } from './knowbot-fixtures'
vi.mock('@/lib/knowbots/client', () => ({ fetchExperts: vi.fn(), stopExpert: vi.fn() }))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())
const k = messages.knowbots

describe('专家', () => {
  it('能用的可以停用，要写原因', async () => {
    vi.mocked(fetchExperts).mockResolvedValue([expertItem({ knowbot_id: 'kb-1' })])
    vi.mocked(stopExpert).mockResolvedValue('stopped')
    renderWith(<ExpertsView csrfToken={CSRF} />)
    expect(await screen.findByText(/去 knowbench 工作台请它/)).toBeInTheDocument()
    const stop = screen.getByRole('button', { name: k.experts.stop })
    expect(stop).toBeDisabled()
    fireEvent.change(screen.getByLabelText(k.experts.stopReason), { target: { value: '不用了' } })
    fireEvent.click(stop)
    await waitFor(() => expect(stopExpert).toHaveBeenCalledWith(EXPERT, '不用了', CSRF))
  })
})
