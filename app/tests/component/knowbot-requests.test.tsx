import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IdeasView } from '@/components/knowbots/ideas-view'
import messages from '@/messages/zh-CN.json'
import { RequestForm } from '@/components/knowbots/request-form'
import { ApiClientError } from '@/lib/common/api-client'
import {
  amendRequest,
  answerMyQuestion,
  fetchMyQuestions,
  fetchMyRequests,
  fetchRequestDetail,
  fetchRuntimes,
  submitRequest,
} from '@/lib/knowbots/client'

import {
  CSRF,
  DRAFT,
  DRAFT2,
  REQUEST,
  detail,
  draft,
  mine,
  question,
  renderWith,
  request,
} from './knowbot-fixtures'

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))

vi.mock('@/lib/knowbots/client', () => ({
  acceptConsent: vi.fn(),
  amendRequest: vi.fn(),
  answerMyQuestion: vi.fn(),
  fetchMyQuestions: vi.fn(),
  fetchMyRequests: vi.fn(),
  fetchRequestDetail: vi.fn(),
  fetchRuntimes: vi.fn(),
  submitRequest: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => ({
  ...(await import('./knowbot-fixtures')).linkMock(),
  useRouter: () => router,
}))

const OTHER = '9b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'

beforeEach(() => {
  for (const fn of [
    amendRequest,
    answerMyQuestion,
    fetchMyQuestions,
    fetchMyRequests,
    fetchRequestDetail,
    fetchRuntimes,
    submitRequest,
  ])
    vi.mocked(fn).mockReset()
  vi.mocked(fetchMyQuestions).mockResolvedValue([])
  vi.mocked(fetchRequestDetail).mockResolvedValue(detail())
  router.push.mockReset()
})

describe('创意', () => {
  it('lists my ideas with one user-facing status each and opens the newest', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(
      mine(
        request({
          drafts: [
            draft({ status: 'failed' }),
            draft({ draft_id: DRAFT2, revision: 2, status: 'delivered', knowbot_id: 'kb-1' }),
          ],
        }),
        request({
          request_id: OTHER,
          title: '估值',
          created_at: '2026-10-17T10:00:00Z',
          drafts: [],
        }),
      ),
    )
    renderWith(<IdeasView csrfToken={CSRF} />)
    const list = await screen.findByRole('complementary', { name: '我的创意' })
    const rows = within(list).getAllByRole('button')
    expect(rows[0]).toHaveTextContent('财务分析与预测')
    expect(rows[0]).toHaveTextContent('已出专家')
    expect(rows[1]).toHaveTextContent('估值')
    expect(rows[1]).toHaveTextContent('已提交，等我们孵化')
    // 详情：它的分身，新的在前，点了去分身页那一个
    const avatars = screen.getByRole('region', { name: '它的分身' })
    const links = within(avatars).getAllByRole('link')
    expect(links[0]).toHaveTextContent('分身 1.2')
    expect(links[0]).toHaveAttribute('href', `/avatars?draft=${DRAFT2}`)
    expect(links[1]).toHaveTextContent('分身 1.1')
    expect(within(avatars).getByText('没通过')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '提交一个创意' })).toHaveAttribute('href', '/ideas/new')
    // 右边：我的方法、我的用例（白话，不放原样 JSON）
    expect(await screen.findByRole('tab', { name: '我的方法' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /我的用例/ }))
    expect(screen.getByText('你的第 1 条用例')).toBeInTheDocument()
    expect(screen.getByText('茅台近三年营收？')).toBeInTheDocument()
    expect(screen.getByText('约等于')).toBeInTheDocument()
  })

  it('opens the idea named in the address and shows its questions to answer in place', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(
      mine(
        request({ drafts: [draft({ status: 'testing' })] }),
        request({ request_id: OTHER, title: '估值', created_at: '2026-10-19T10:00:00Z' }),
      ),
    )
    vi.mocked(fetchMyQuestions).mockResolvedValue([question()])
    vi.mocked(answerMyQuestion).mockResolvedValue(undefined)
    renderWith(<IdeasView csrfToken={CSRF} picked={REQUEST} />)
    const main = await screen.findByRole('region', { name: '财务分析与预测' })
    expect(within(main).getAllByText('等你回答').length).toBeGreaterThan(0)
    expect(within(main).getByText('毛利率按哪个口径？')).toBeInTheDocument()
    expect(within(main).getByText('分身 1.1 · 你的第 1 条用例')).toBeInTheDocument()
    fireEvent.click(within(main).getByRole('button', { name: '营业收入减营业成本' }))
    await waitFor(() =>
      expect(answerMyQuestion).toHaveBeenCalledWith(
        question().question_id,
        { option_id: 'gross' },
        CSRF,
      ),
    )
  })

  it('an idea under the old notice asks for consent before outputs are shown (SDD 0037)', async () => {
    const { acceptConsent } = await import('@/lib/knowbots/client')
    vi.mocked(acceptConsent).mockReset().mockResolvedValue(undefined)
    vi.mocked(fetchMyRequests).mockResolvedValue(
      mine(request({ consent_version: 1, consent_current: 2 })),
    )
    renderWith(<IdeasView csrfToken={CSRF} picked={REQUEST} />)
    expect(await screen.findByText(messages.knowbots.consent.needed)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: messages.knowbots.consent.accept }))
    await waitFor(() => expect(acceptConsent).toHaveBeenCalledWith(REQUEST, CSRF))
  })

  it('an idea under the current notice shows no consent line', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(
      mine(request({ consent_version: 2, consent_current: 2 })),
    )
    renderWith(<IdeasView csrfToken={CSRF} picked={REQUEST} />)
    expect(await screen.findByRole('heading', { level: 2 })).toBeInTheDocument()
    expect(screen.queryByText(messages.knowbots.consent.needed)).toBeNull()
  })

  it('shows empty and failed states', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValueOnce(mine())
    const { unmount } = renderWith(<IdeasView csrfToken={CSRF} />)
    expect(await screen.findByText('你还没有提交过创意。')).toBeInTheDocument()
    unmount()
    vi.mocked(fetchMyRequests).mockRejectedValueOnce(new Error('down'))
    renderWith(<IdeasView csrfToken={CSRF} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('读取失败')
  })
})

describe('补充方法', () => {
  const AMENDED = '3b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'

  it('shows what I wrote with its status', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(
      mine(
        request({
          amendments: [
            {
              amendment_id: AMENDED,
              text: '第 6 步改成对照管理层讨论',
              created_at: '2026-10-19T00:00:00Z',
              status: 'used',
              used_in_revision: 3,
              declined_reason: null,
              declined_at: null,
            },
            {
              amendment_id: DRAFT,
              text: '给出买入建议',
              created_at: '2026-10-19T00:00:00Z',
              status: 'declined',
              used_in_revision: null,
              declined_reason: '平台不给买卖建议',
              declined_at: '2026-10-19T01:00:00Z',
            },
            {
              amendment_id: DRAFT2,
              text: '第 7 步多一种假设',
              created_at: '2026-10-19T02:00:00Z',
              status: 'open',
              used_in_revision: null,
              declined_reason: null,
              declined_at: null,
            },
          ],
        }),
      ),
    )
    renderWith(<IdeasView csrfToken={CSRF} />)
    const section = await screen.findByRole('region', { name: '补充方法' })
    expect(within(section).getByText('第 6 步改成对照管理层讨论')).toBeInTheDocument()
    expect(within(section).getByText('已用进第 3 个分身')).toBeInTheDocument()
    expect(within(section).getByText('没照做：平台不给买卖建议')).toBeInTheDocument()
    expect(within(section).getByText('待处理')).toBeInTheDocument()
  })

  it('writes an amendment with the session token and reloads the list', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(mine(request()))
    vi.mocked(amendRequest).mockResolvedValue(AMENDED)
    renderWith(<IdeasView csrfToken={CSRF} />)
    fireEvent.click(await screen.findByRole('button', { name: '写一条补充' }))
    expect(screen.getByText(/我们照着孵化下一个分身/)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: '提交补充' })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('补充的内容'), {
      target: { value: '  第 6 步改成对照管理层讨论  ' },
    })
    fireEvent.click(submit)
    await waitFor(() =>
      expect(amendRequest).toHaveBeenCalledWith(REQUEST, '第 6 步改成对照管理层讨论', CSRF),
    )
    await waitFor(() => expect(fetchMyRequests).toHaveBeenCalledTimes(2))
    expect(screen.queryByLabelText('补充的内容')).toBeNull()
  })

  it('keeps the text and says so when submitting fails', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(mine(request()))
    vi.mocked(amendRequest).mockRejectedValue(new Error('down'))
    renderWith(<IdeasView csrfToken={CSRF} />)
    fireEvent.click(await screen.findByRole('button', { name: '写一条补充' }))
    fireEvent.change(screen.getByLabelText('补充的内容'), { target: { value: '改第 6 步' } })
    fireEvent.click(screen.getByRole('button', { name: '提交补充' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('没有提交成功')
    expect(screen.getByLabelText('补充的内容')).toHaveValue('改第 6 步')
  })
})

describe('提交一个创意', () => {
  function fill() {
    fireEvent.change(screen.getByLabelText('名字'), { target: { value: '财务分析' } })
    for (const label of [
      '它解决什么问题？',
      '它不解决什么？',
      '输入是什么？',
      '分几步做，每一步按什么规则判断？',
      '输出长什么样？',
      '怎样算做对了？',
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: `答：${label}` } })
    }
    fireEvent.change(screen.getByLabelText('用例 1：问它什么'), {
      target: { value: '分析 2025 年报' },
    })
  }

  it('needs consent, then submits the method, cases and runtime and goes back to ideas', async () => {
    vi.mocked(fetchRuntimes).mockResolvedValue(['knowbench'])
    vi.mocked(submitRequest).mockResolvedValue(REQUEST)
    renderWith(<RequestForm csrfToken={CSRF} />)
    await waitFor(() => expect(screen.getByLabelText('在哪里运行')).toHaveValue('knowbench'))
    fill()
    fireEvent.click(screen.getByText('加一条期望'))
    fireEvent.change(screen.getByLabelText('交回物'), { target: { value: 'summary' } })
    fireEvent.change(screen.getByLabelText('其中哪一项'), { target: { value: 'gross_margin' } })
    fireEvent.change(screen.getByLabelText('怎么比'), { target: { value: 'approx' } })
    fireEvent.change(screen.getByLabelText('应当是'), { target: { value: '0.52' } })
    fireEvent.change(screen.getByLabelText('允许误差（如 0.01 即 1%）'), {
      target: { value: '0.01' },
    })
    const submit = screen.getByRole('button', { name: '提交' })
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/我同意/))
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/ideas'))
    const [body, token] = vi.mocked(submitRequest).mock.calls[0]
    expect(token).toBe(CSRF)
    expect(body.runtime).toBe('knowbench')
    expect(body.consent_test_data).toBe(true)
    expect(body.idea).toMatchObject({ kind: 'six_questions' })
    expect(body.cases).toEqual([
      {
        case_id: 'c1',
        input: { question: '分析 2025 年报' },
        expectations: [
          {
            artifact: 'summary',
            path: 'gross_margin',
            kind: 'approx',
            value: 0.52,
            tolerance: 0.01,
          },
        ],
      },
    ])
  })

  it('sends a skill instead of the six answers when chosen', async () => {
    vi.mocked(fetchRuntimes).mockResolvedValue(['knowbench'])
    vi.mocked(submitRequest).mockResolvedValue(REQUEST)
    renderWith(<RequestForm csrfToken={CSRF} />)
    await waitFor(() => expect(screen.getByLabelText('在哪里运行')).toHaveValue('knowbench'))
    fireEvent.change(screen.getByLabelText('名字'), { target: { value: '财务分析' } })
    fireEvent.click(screen.getByLabelText('粘贴一份 skill'))
    expect(screen.queryByLabelText('它解决什么问题？')).toBeNull()
    fireEvent.change(screen.getByLabelText('skill 原文'), { target: { value: '# 我的方法' } })
    fireEvent.change(screen.getByLabelText('用例 1：问它什么'), { target: { value: '问' } })
    fireEvent.click(screen.getByLabelText(/我同意/))
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await waitFor(() => expect(submitRequest).toHaveBeenCalled())
    expect(vi.mocked(submitRequest).mock.calls[0][0].idea).toEqual({
      kind: 'skill',
      skill: '# 我的方法',
    })
  })

  it('explains a rejected submission without leaving the page', async () => {
    vi.mocked(fetchRuntimes).mockResolvedValue(['knowbench'])
    vi.mocked(submitRequest).mockRejectedValue(
      new ApiClientError(422, {
        code: 'validation_error',
        message_key: 'x',
        retryable: false,
        correlation_id: 'c',
      }),
    )
    renderWith(<RequestForm csrfToken={CSRF} />)
    await waitFor(() => expect(screen.getByLabelText('在哪里运行')).toHaveValue('knowbench'))
    fill()
    fireEvent.click(screen.getByLabelText(/我同意/))
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('没通过检查')
    expect(router.push).not.toHaveBeenCalled()
  })
})
