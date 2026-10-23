import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExpertsView } from '@/components/knowbots/experts-view'
import { NameView } from '@/components/knowbots/name-view'
import { Overview } from '@/components/knowbots/overview'
import { ReviewView } from '@/components/knowbots/review-view'
import {
  answerMyQuestion,
  decideExpert,
  fetchApplications,
  fetchDetail,
  fetchExperts,
  fetchInbox,
  fetchOutputs,
  reviewDraft,
  stopExpert,
} from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

import {
  CSRF,
  DRAFT,
  EXPERT,
  QUESTION,
  REQUEST,
  TEST,
  detail,
  draft,
  expert,
  expertItem,
  outputs,
  question,
  renderWith,
} from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({
  answerMyQuestion: vi.fn(),
  decideExpert: vi.fn(),
  fetchApplications: vi.fn(),
  fetchDetail: vi.fn(),
  fetchExperts: vi.fn(),
  fetchInbox: vi.fn(),
  fetchOutputs: vi.fn(),
  reviewDraft: vi.fn(),
  stopExpert: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const k = messages.knowbots
const BRIEF = { request_id: REQUEST, title: '财务分析与预测' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchDetail).mockResolvedValue(detail())
  vi.mocked(fetchOutputs).mockResolvedValue(outputs())
})

describe('审核', () => {
  it('待办箱分三类：问题、准专家、专家；回答问题就地答', async () => {
    vi.mocked(fetchInbox).mockResolvedValue({
      contract_version: 1,
      items: [
        { ...question(), ...BRIEF, state: 'todo', type: 'question' },
        { ...draft(), ...BRIEF, state: 'todo', type: 'draft' },
        { ...expert(), ...BRIEF, state: 'todo', type: 'expert' },
      ],
      answered: [],
    })
    vi.mocked(answerMyQuestion).mockResolvedValue(undefined)
    renderWith(<ReviewView csrfToken={CSRF} />)
    expect(await screen.findByRole('button', { name: '等你回答 · 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '等你审核 · 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '等你决定要不要 · 1' })).toBeInTheDocument()
    expect(screen.getAllByText('毛利率按哪个口径？').length).toBeGreaterThan(0)
    expect(screen.getByText(/准专家 2.3 · 你的第 1 条用例/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '营业收入口径' }))
    await waitFor(() =>
      expect(answerMyQuestion).toHaveBeenCalledWith(QUESTION, { option_id: 'a' }, CSRF),
    )
  })

  it('审核准专家：看我的话用在了哪；不行要写意见', async () => {
    vi.mocked(fetchInbox).mockResolvedValue({
      contract_version: 1,
      items: [{ ...draft(), ...BRIEF, state: 'todo', type: 'draft' }],
      answered: [],
    })
    vi.mocked(reviewDraft).mockResolvedValue(undefined)
    renderWith(<ReviewView csrfToken={CSRF} picked={DRAFT} />)
    expect(await screen.findByText('毛利率按营业收入减营业成本')).toBeInTheDocument()
    expect(screen.getByText('出自你写的：创意 v2 第 4 问')).toBeInTheDocument()
    expect(await screen.findByText('# 第二版方法')).toBeInTheDocument() // 它照的是哪一版
    expect(screen.getByRole('button', { name: k.review.notOk })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(k.review.note), { target: { value: '口径不对' } })
    fireEvent.click(screen.getByRole('button', { name: k.review.notOk }))
    await waitFor(() =>
      expect(reviewDraft).toHaveBeenCalledWith(DRAFT, { ok: false, note: '口径不对' }, CSRF),
    )
  })

  it('用户同意门：看成稿与测试结果，要这一版', async () => {
    vi.mocked(fetchInbox).mockResolvedValue({
      contract_version: 1,
      items: [{ ...expert(), ...BRIEF, state: 'todo', type: 'expert' }],
      answered: [],
    })
    vi.mocked(decideExpert).mockResolvedValue('to_review')
    renderWith(<ReviewView csrfToken={CSRF} />)
    expect(await screen.findByText(/营业收入 2025 年下降/)).toBeInTheDocument()
    expect(fetchOutputs).toHaveBeenCalledWith(TEST)
    fireEvent.click(screen.getByRole('button', { name: k.review.accept }))
    await waitFor(() => expect(decideExpert).toHaveBeenCalledWith(EXPERT, true, CSRF))
  })

  it('答过、定过的在右边', async () => {
    vi.mocked(fetchInbox).mockResolvedValue({
      contract_version: 1,
      items: [
        {
          ...expert({
            stage: 'to_review',
            user_accepted: true,
            user_decided_at: '2026-10-24T11:00:00Z',
          }),
          ...BRIEF,
          state: 'done',
          type: 'expert',
        },
      ],
      answered: [
        {
          question_id: QUESTION,
          kind: 'question',
          case_id: 'c1',
          key: null,
          text: '毛利率按哪个口径？',
          answer: { text: '营业收入口径' },
          answered_by: 'user',
          answered_at: '2026-10-24T09:50:00Z',
          draft_id: DRAFT,
        },
      ],
    })
    renderWith(<ReviewView csrfToken={CSRF} />)
    expect(await screen.findByText(k.review.allDone)).toBeInTheDocument()
    expect(screen.getByText(/第 2 版：你要了/)).toBeInTheDocument()
    expect(screen.getByText(/你答：营业收入口径/)).toBeInTheDocument()
  })
})

describe('专家', () => {
  it('能用的可以停用，要写原因', async () => {
    vi.mocked(fetchExperts).mockResolvedValue([
      expertItem({ category: 'usable', stage: 'listed', knowbot_id: 'kb-1' }),
    ])
    vi.mocked(stopExpert).mockResolvedValue('stopped')
    renderWith(<ExpertsView csrfToken={CSRF} />)
    expect(await screen.findByText(/去 knowbench 工作台请它/)).toBeInTheDocument()
    const stop = screen.getByRole('button', { name: k.experts.stop })
    expect(stop).toBeDisabled()
    fireEvent.change(screen.getByLabelText(k.experts.stopReason), { target: { value: '不用了' } })
    fireEvent.click(stop)
    await waitFor(() => expect(stopExpert).toHaveBeenCalledWith(EXPERT, '不用了', CSRF))
  })

  it('新交回的指去审核；审核没通过的写理由', async () => {
    vi.mocked(fetchExperts).mockResolvedValue([
      expertItem(),
      expertItem({
        expert_id: '8b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        version: 3,
        category: 'not_listed',
        stage: 'rejected',
        review_reason: '成稿里有目标价',
      }),
    ])
    renderWith(<ExpertsView csrfToken={CSRF} />)
    expect(await screen.findByRole('link', { name: k.experts.toReview })).toHaveAttribute(
      'href',
      `/review?item=${EXPERT}`,
    )
    fireEvent.click(screen.getByRole('button', { name: '没上架 · 1' }))
    expect(
      await screen.findByText('我们审核没通过，这一版不上架：成稿里有目标价'),
    ).toBeInTheDocument()
  })
})

describe('首页与详情页', () => {
  it('首页顶上一条：测试通过了，去确认，直达审核里那一条', async () => {
    vi.mocked(fetchInbox).mockResolvedValue({
      contract_version: 1,
      items: [{ ...expert(), ...BRIEF, state: 'todo', type: 'expert' }],
      answered: [],
    })
    vi.mocked(fetchApplications).mockResolvedValue([])
    vi.mocked(fetchExperts).mockResolvedValue([])
    renderWith(<Overview />)
    expect(
      await screen.findByRole('link', { name: '你的创意「财务分析与预测」测试通过了，去确认' }),
    ).toHaveAttribute('href', `/review?item=${EXPERT}`)
  })

  it('详情页：摘要一行，记录用我的说法，没有谁做的', async () => {
    vi.mocked(fetchDetail).mockResolvedValue(
      detail({
        timeline: [
          { at: '2026-10-18T10:00:00Z', kind: 'version', version: 1 },
          {
            at: '2026-10-24T08:00:00Z',
            kind: 'acceptance',
            version: 2,
            accepted: true,
            trial: false,
          },
          { at: '2026-10-24T10:30:00Z', kind: 'returned', expert_id: EXPERT, version: 2 },
        ],
      }),
    )
    renderWith(<NameView requestId={REQUEST} />)
    expect(await screen.findByLabelText(k.name.summary)).toHaveTextContent(
      '创意 v2 · 受理了 · 准专家 2.3 · 测试 5 通过 · 专家第 2 版 · 等你决定',
    )
    expect(screen.getByRole('link', { name: '你申请：创意 v1' })).toHaveAttribute(
      'href',
      `/applications?item=${REQUEST}`,
    )
    expect(screen.getByRole('link', { name: '专家第 2 版交回你' })).toHaveAttribute(
      'href',
      `/experts?item=${EXPERT}`,
    )
    expect(screen.getByText('我们受理了创意 v2')).toBeInTheDocument()
  })
})
