import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MyQuestions } from '@/components/knowbots/my-questions'
import { answerMyQuestion, fetchMyQuestions, fetchMyRequests } from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

vi.mock('@/lib/knowbots/client', () => ({
  fetchMyQuestions: vi.fn(),
  fetchMyRequests: vi.fn(),
  answerMyQuestion: vi.fn(),
}))

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
  vi.mocked(fetchMyRequests).mockReset().mockResolvedValue({ contract_version: 1, requests: [] })
  vi.mocked(fetchMyQuestions).mockReset()
  vi.mocked(answerMyQuestion).mockReset().mockResolvedValue(undefined)
})

describe('待我回答', () => {
  it('says so when there is nothing to answer', async () => {
    vi.mocked(fetchMyQuestions).mockResolvedValue([])
    page()
    expect(await screen.findByText('现在没有要你回答的问题。')).toBeInTheDocument()
  })

  it('groups the questions by idea and says which avatar and case asked', async () => {
    vi.mocked(fetchMyQuestions).mockResolvedValue([
      Q,
      {
        ...Q,
        question_id: '7b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        title: '估值',
        text: '用哪个折现率？',
        case_id: 'c2',
        revision: 3,
      },
    ])
    page()
    const first = await screen.findByRole('region', { name: '财务分析与预测' })
    expect(within(first).getByText('毛利率按哪个口径？')).toBeInTheDocument()
    expect(within(first).getByText('分身 1.1 · 你的第 1 条用例')).toBeInTheDocument()
    const second = screen.getByRole('region', { name: '估值' })
    expect(within(second).getByText('用哪个折现率？')).toBeInTheDocument()
    expect(within(second).getByText('分身 1.3 · 你的第 2 条用例')).toBeInTheDocument()
  })

  it('keeps two ideas with the same title apart by which avatar asked', async () => {
    const A = '1b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
    const B = '2b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
    const draftOf = (draft_id: string) => ({
      draft_id,
      revision: 1,
      version: '1',
      status: 'testing' as const,
      name: null,
      report: null,
      knowbot_id: null,
    })
    vi.mocked(fetchMyRequests).mockResolvedValue({
      contract_version: 1,
      requests: [
        {
          request_id: '3b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
          title: '财务分析与预测',
          runtime: 'knowbench',
          created_at: null,
          drafts: [draftOf(A)],
        },
        {
          request_id: '4b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
          title: '财务分析与预测',
          runtime: 'knowbench',
          created_at: null,
          drafts: [draftOf(B)],
        },
      ],
    })
    vi.mocked(fetchMyQuestions).mockResolvedValue([
      { ...Q, draft_id: A },
      { ...Q, question_id: '7b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10', text: '取几年？', draft_id: B },
    ])
    page()
    await waitFor(() =>
      expect(screen.getAllByRole('region', { name: '财务分析与预测' })).toHaveLength(2),
    )
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
