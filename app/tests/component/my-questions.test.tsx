import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MyQuestions } from '@/components/knowbots/my-questions'
import { answerMyQuestion, fetchMyQuestions } from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

vi.mock('@/lib/knowbots/client', () => ({ fetchMyQuestions: vi.fn(), answerMyQuestion: vi.fn() }))

const CSRF = 'csrf-token-value-that-is-long-enough-1234'
const Q = {
  question_id: '6b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
  kind: 'question' as const,
  text: '毛利率按哪个口径？',
  options: [{ id: 'gross', label: '营业收入减营业成本' }],
  allow_free_text: true,
  case_id: 'c1',
  step_id: null,
  asked_at: '2026-10-17T00:00:00Z',
  title: '财务分析与预测',
  version: '1',
  revision: 1,
}

function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh-CN" messages={messages}>
        <MyQuestions csrfToken={CSRF} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(fetchMyQuestions).mockReset()
  vi.mocked(answerMyQuestion).mockReset().mockResolvedValue(undefined)
})

describe('需要你回答的问题', () => {
  it('shows nothing when there is nothing to answer', async () => {
    vi.mocked(fetchMyQuestions).mockResolvedValue([])
    const { container } = page()
    await waitFor(() => expect(fetchMyQuestions).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('answers with an option or in my own words', async () => {
    vi.mocked(fetchMyQuestions).mockResolvedValue([Q])
    page()
    expect(await screen.findByText('毛利率按哪个口径？')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '营业收入减营业成本' }))
    await waitFor(() =>
      expect(answerMyQuestion).toHaveBeenCalledWith(Q.question_id, { option_id: 'gross' }, CSRF),
    )
    fireEvent.change(screen.getByLabelText('写下你的回答'), { target: { value: '按我说的口径' } })
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    await waitFor(() =>
      expect(answerMyQuestion).toHaveBeenLastCalledWith(
        Q.question_id,
        { text: '按我说的口径' },
        CSRF,
      ),
    )
  })
})
