import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { KnowledgeView } from '@/components/knowbots/knowledge-view'
import { DeliveryColumn, IncubationColumn, TestsColumn } from '@/components/knowbots/lab-columns'
import { NameView } from '@/components/knowbots/name-view'
import {
  fetchApplications,
  fetchComputers,
  fetchDetail,
  fetchExperts,
  fetchLibrary,
  fetchOutputs,
  fetchRounds,
  withdrawDelivery,
} from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

import {
  CSRF,
  DRAFT,
  EXPERT,
  QUESTION,
  REQUEST,
  application,
  delivery,
  detail,
  expertItem,
  outputs,
  renderWith,
  testRecord,
} from './knowbot-fixtures'

// web端分栏（SDD 0046 第六节）：孵化按名称列、标模式，自助进工作稿、平台看平台视图；测试列用例、
// 测试集、历次测试；交付是列表与入口的骨架；知识库只列 knowbase 里展示给 knowlab 的、链去 knowbase 管。

vi.mock('@/lib/knowbots/client', () => ({
  fetchApplications: vi.fn(),
  fetchComputers: vi.fn(),
  fetchDetail: vi.fn(),
  fetchExperts: vi.fn(),
  fetchLibrary: vi.fn(),
  fetchOutputs: vi.fn(),
  fetchRounds: vi.fn(),
  refreshMyTest: vi.fn(),
  fetchTestData: vi.fn(),
  submitDelivery: vi.fn(),
  declineExpert: vi.fn(),
  withdrawDelivery: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const k = messages.knowbots
const OTHER = '9c8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchRounds).mockResolvedValue([])
  vi.mocked(fetchOutputs).mockResolvedValue(outputs())
})

describe('孵化栏', () => {
  it('按模式分；自己来的给工作稿入口，平台孵化的是平台视图', async () => {
    vi.mocked(fetchApplications).mockResolvedValue([
      application({ incubation_mode: 'self' }),
      application({ request_id: OTHER, title: '另一个', incubation_mode: 'platform' }),
    ])
    vi.mocked(fetchDetail).mockImplementation(async (id) =>
      id === REQUEST
        ? detail({ incubation_mode: 'self' })
        : detail({
            request_id: OTHER,
            title: '另一个',
            platform_asks: [
              {
                kind: 'gap',
                state: 'open',
                text: '看几年？',
                question_id: QUESTION,
                at: '2026-10-29T01:00:00Z',
              },
              {
                kind: 'review',
                state: 'done',
                label: '1.1',
                draft_id: DRAFT,
                answer: 'ok',
                at: '2026-10-28T01:00:00Z',
              },
            ],
          }),
    )
    renderWith(<IncubationColumn csrfToken={CSRF} />)
    const open = await screen.findByRole('link', { name: k.incubationColumn.open })
    expect(open).toHaveAttribute('href', `/names/${REQUEST}/workdraft`)
    fireEvent.click(screen.getByRole('button', { name: `${k.categories.platform} · 1` }))
    const view = within(await screen.findByRole('region', { name: k.platformView.title }))
    const waiting = within(view.getByRole('region', { name: k.platformView.waiting }))
    expect(waiting.getByRole('link', { name: '看几年？' })).toHaveAttribute(
      'href',
      `/review?item=${QUESTION}`,
    )
    expect(view.getByText('平台问过的（1）')).toBeInTheDocument()
    expect(view.getByText('你的处理：行')).toBeInTheDocument()
  })
})

describe('测试栏', () => {
  it('用例、测试集第几版、历次测试', async () => {
    vi.mocked(fetchApplications).mockResolvedValue([application()])
    vi.mocked(fetchDetail).mockResolvedValue(
      detail({ drafts: [], tests: [testRecord({ mode: 'self', test_set_version: 3 })] }),
    )
    renderWith(<TestsColumn csrfToken={CSRF} />)
    fireEvent.click(await screen.findByRole('button', { name: `${k.categories.tested} · 1` }))
    expect(await screen.findByTestId('test-set')).toHaveTextContent('测试集第 3 版')
    const history = within(screen.getByTestId('test-history'))
    expect(history.getByText('测试 5')).toBeInTheDocument()
    expect(history.getByText(/作者自测/)).toBeInTheDocument()
    expect(screen.getByText(k.testsColumn.nothingToTest)).toBeInTheDocument()
    expect(fetchComputers).not.toHaveBeenCalled()
  })
})

describe('交付栏', () => {
  it('列各版专家与交付到哪了：自动查没过交人看、授权与进小店', async () => {
    vi.mocked(fetchExperts).mockResolvedValue([
      expertItem({
        category: 'accepted',
        stage: 'to_review',
        review_listing: null,
        deliveries: [delivery()],
      }),
    ])
    renderWith(<DeliveryColumn csrfToken={CSRF} />)
    const rows = within(await screen.findByTestId('delivery-rows'))
    expect(rows.getByText(k.deliveryColumn.notListed)).toBeInTheDocument()
    const progress = within(screen.getByTestId('delivery-progress'))
    expect(progress.getByText(/用例 c1 的成稿里有「目标价」/)).toBeInTheDocument()
    expect(progress.getByText(k.delivery.consentLive)).toBeInTheDocument()
    // 在审的不能再提交；可以撤回（要再点一次确认）
    expect(screen.queryByRole('button', { name: k.delivery.submit })).toBeNull()
    vi.mocked(withdrawDelivery).mockResolvedValue({ delivery_id: EXPERT, status: 'withdrawn' })
    fireEvent.click(screen.getByRole('button', { name: k.delivery.withdraw }))
    expect(withdrawDelivery).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: k.delivery.withdrawSure }))
    await waitFor(() => expect(withdrawDelivery).toHaveBeenCalledWith(EXPERT, CSRF))
    expect(screen.getByRole('link', { name: k.toName })).toHaveAttribute(
      'href',
      `/names/${REQUEST}`,
    )
  })

  it('上架了的自用版本可以转公开', async () => {
    vi.mocked(fetchExperts).mockResolvedValue([
      expertItem({
        category: 'usable',
        stage: 'listed',
        review_listing: 'self',
        listed_at: '2026-10-24T12:00:00Z',
        market_status: 'held',
        held_reason: 'binding_deleted',
        deliveries: [delivery({ status: 'approved', delivered_at: '2026-10-24T12:00:00Z' })],
      }),
    ])
    renderWith(<DeliveryColumn csrfToken={CSRF} picked={EXPERT} />)
    expect(await screen.findByText(k.delivery.toPublicTitle)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('你绑给这位专家的数据有一份删了')
    expect(screen.getByLabelText(k.delivery.rerunBudget)).toBeInTheDocument()
    expect(screen.getByLabelText(k.delivery.raiseFrozen)).not.toBeChecked()
    expect(screen.getByText(k.delivery.status.approved)).toBeInTheDocument()
  })
})

describe('知识库栏', () => {
  it('只列展示给 knowlab 的资料；没有时说去 knowbase 打开', async () => {
    vi.mocked(fetchLibrary).mockResolvedValue([
      {
        material_id: 'm1',
        name: '2024 年报.pdf',
        mine: true,
        description: {
          subject: '600519.SH',
          doc_type: 'annual_report',
          period_start: '2024-01-01',
          period_end: '2024-12-31',
          status: 'unconfirmed',
        },
        version_no: 2,
        size_bytes: 2048,
      },
    ])
    const { unmount } = renderWith(<KnowledgeView />)
    const list = within(await screen.findByTestId('knowledge-list'))
    expect(list.getByText('2024 年报.pdf')).toBeInTheDocument()
    expect(list.getByText(k.knowledge.unconfirmed)).toBeInTheDocument()
    expect(
      list.getByText(/600519\.SH · annual_report · 2024-01-01 ~ 2024-12-31 · 第 2 版/),
    ).toBeInTheDocument()
    unmount()
    vi.mocked(fetchLibrary).mockResolvedValue([])
    renderWith(<KnowledgeView />)
    expect(await screen.findByText(k.knowledge.empty)).toBeInTheDocument()
  })
})

describe('名称页的平台视图', () => {
  it('平台孵化时写出平台在等你什么', async () => {
    vi.mocked(fetchDetail).mockResolvedValue(
      detail({
        platform_asks: [
          { kind: 'proposal', state: 'open', text: '范围写清楚', at: '2026-10-29T01:00:00Z' },
        ],
      }),
    )
    renderWith(<NameView requestId={REQUEST} />)
    await waitFor(() =>
      expect(screen.getByRole('link', { name: '范围写清楚' })).toHaveAttribute(
        'href',
        `/names/${REQUEST}/workdraft`,
      ),
    )
  })
})
