import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AvatarsView } from '@/components/knowbots/avatars-view'
import type { CaseResult, KnowbotDraft } from '@/contracts/knowbots'
import {
  answerMyQuestion,
  fetchDraftDetail,
  fetchMyQuestions,
  fetchMyRequests,
  fetchOutputs,
  fetchRequestDetail,
} from '@/lib/knowbots/client'

import {
  CSRF,
  DRAFT,
  DRAFT2,
  REQUEST,
  detail,
  draft,
  draftDetail,
  mine,
  outputs,
  question,
  renderWith,
  request,
} from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({
  answerMyQuestion: vi.fn(),
  fetchDraftDetail: vi.fn(),
  fetchMyQuestions: vi.fn(),
  fetchMyRequests: vi.fn(),
  fetchOutputs: vi.fn(),
  fetchRequestDetail: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const failedCase: CaseResult = {
  case_id: 'c1',
  status: 'failed',
  steps: [
    { step_id: 'scope', accepted: true, failed_checks: [] },
    {
      step_id: 'official',
      accepted: false,
      failed_checks: ['cite_required'],
      details: ['判支持的结论没引年报原文'],
    },
  ],
  expectations: [true, false],
  note: 'runner: check cite_required failed',
}

const errorCase: CaseResult = {
  case_id: 'c2',
  status: 'error',
  steps: [],
  expectations: [],
  note: 'rendezvous timeout after 30s (agent offline)',
}

function tested(overrides: Partial<KnowbotDraft> = {}): KnowbotDraft {
  return draft({
    status: 'failed',
    report: {
      status: 'failed',
      cases: [failedCase, errorCase],
      cost: { spent: '3.20', currency: 'CNY' },
      finished_at: '2026-10-19T08:00:00Z',
    },
    ...overrides,
  })
}

function renderPage(picked?: string) {
  return renderWith(<AvatarsView csrfToken={CSRF} picked={picked} />)
}

beforeEach(() => {
  for (const fn of [
    answerMyQuestion,
    fetchDraftDetail,
    fetchMyQuestions,
    fetchMyRequests,
    fetchOutputs,
    fetchRequestDetail,
  ])
    vi.mocked(fn).mockReset()
  vi.mocked(fetchMyQuestions).mockResolvedValue([])
  vi.mocked(fetchRequestDetail).mockResolvedValue(detail())
  vi.mocked(fetchDraftDetail).mockResolvedValue(draftDetail())
  vi.mocked(fetchOutputs).mockResolvedValue(outputs())
})

describe('分身', () => {
  it('lists avatars as 分身 N.M · idea title with the user status', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(
      mine(
        request({
          drafts: [
            tested(),
            draft({ draft_id: DRAFT2, revision: 2, status: 'testing', report: null }),
          ],
        }),
      ),
    )
    renderPage()
    const box = await screen.findByRole('button', { name: '分身' })
    expect(box).toHaveTextContent('分身 1.2 · 财务分析与预测')
    expect(screen.queryByRole('complementary', { name: '分身' })).toBeNull()
    fireEvent.click(box)
    const groups = within(screen.getByRole('listbox', { name: '分身' })).getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      '在做',
      '旧的分身（已有更新的）',
    ])
    expect(within(groups[0]).getByRole('option')).toHaveTextContent('分身 1.2 · 财务分析与预测')
    expect(within(groups[0]).getByRole('option')).toHaveTextContent('测试中')
    expect(within(groups[1]).getByRole('option')).toHaveTextContent('分身 1.1 · 财务分析与预测')
    expect(within(groups[1]).getByRole('option')).toHaveTextContent('没通过')
    fireEvent.keyDown(screen.getByRole('searchbox', { name: '搜名字' }), { key: 'Escape' })
    // 测试中只给一句，不给管理端那样的细进度
    expect(screen.getByText('测试在跑，跑完这里出结果。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '看它的创意' })).toHaveAttribute(
      'href',
      `/ideas?request=${REQUEST}`,
    )
  })

  it('shows each case: my question, plain result, the write-up first, steps folded', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(mine(request({ drafts: [tested()] })))
    renderPage(DRAFT)
    const block = await screen.findByRole('article', { name: '你的第 1 条用例' })
    expect(await within(block).findByText('你问的：茅台近三年营收？')).toBeInTheDocument()
    expect(block).toHaveTextContent('没通过 · 期望对上了 1/2 条')
    // 没过的那步：第几步、叫什么、白话原因；不显示验收规则的内部名字
    expect(await within(block).findByText('第 2 步 · 对照官方披露 没过')).toBeInTheDocument()
    expect(within(block).getByText('判支持的结论没引年报原文')).toBeInTheDocument()
    expect(block).not.toHaveTextContent('cite_required')
    // 成稿按 Markdown 排版：标题与表格
    expect(
      await within(block).findByRole('heading', { level: 1, name: '回答' }),
    ).toBeInTheDocument()
    const table = within(block).getByRole('table')
    expect(within(table).getByText('1688')).toBeInTheDocument()
    // 每一步的结果默认折叠；打开后有交回物与最后一次交回的原文
    const steps = within(block).getByText('每一步的结果').closest('details') as HTMLDetailsElement
    expect(steps.open).toBe(false)
    fireEvent.click(within(block).getByText('每一步的结果'))
    expect(steps.open).toBe(true)
    expect(within(steps).getByText(/第 1 步 · 定范围/)).toBeInTheDocument()
    expect(within(steps).getByText(/"company": "贵州茅台"/)).toBeInTheDocument()
    expect(within(steps).getByText('✗ 有结论判了支持却没引原文')).toBeInTheDocument()
    expect(within(steps).getByText('最后一次交回的原文')).toBeInTheDocument()
    expect(within(steps).getByText('没走到')).toBeInTheDocument()
  })

  it('does not blame the user for a platform error', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(mine(request({ drafts: [tested()] })))
    renderPage(DRAFT)
    const block = await screen.findByRole('article', { name: '你的第 2 条用例' })
    expect(
      within(block).getByText('这次是平台出了错，不是你方法的问题，我们会重测'),
    ).toBeInTheDocument()
    expect(block).not.toHaveTextContent('rendezvous')
    expect(within(block).queryByText('成稿')).toBeNull()
  })

  it('says where my words were used in the side panel', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(mine(request({ drafts: [tested()] })))
    renderPage(DRAFT)
    const tab = await screen.findByRole('tab', { name: /我的话用在了哪/ })
    fireEvent.click(tab)
    expect(screen.getByText('毛利率按营业收入减营业成本算')).toBeInTheDocument()
    expect(screen.getByText('出自你写的：第 4 问：毛利率口径')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '我的方法' }))
    expect(screen.getByText('# 我的方法')).toBeInTheDocument()
  })

  it('asks my questions for this avatar in place', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(
      mine(request({ drafts: [draft({ status: 'testing' })] })),
    )
    vi.mocked(fetchMyQuestions).mockResolvedValue([question()])
    vi.mocked(answerMyQuestion).mockResolvedValue(undefined)
    renderPage()
    expect(await screen.findByText('测试停在要你决定的地方，答完接着跑。')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('写下你的回答'), { target: { value: '按我的口径' } })
    fireEvent.click(screen.getByRole('button', { name: '回答' }))
    await waitFor(() =>
      expect(answerMyQuestion).toHaveBeenCalledWith(
        question().question_id,
        { text: '按我的口径' },
        CSRF,
      ),
    )
  })

  it('says when there is no avatar yet', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(mine(request()))
    renderPage()
    expect(await screen.findByText(/还没有分身/)).toBeInTheDocument()
  })
})
