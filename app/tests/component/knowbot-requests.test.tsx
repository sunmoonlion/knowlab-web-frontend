import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MyRequests } from '@/components/knowbots/my-requests'
import type { Amendment } from '@/contracts/knowbots'
import { RequestForm } from '@/components/knowbots/request-form'
import { ApiClientError } from '@/lib/common/api-client'
import { amendRequest, fetchMyRequests, fetchRuntimes, submitRequest } from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

const router = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('@/lib/knowbots/client', () => ({
  amendRequest: vi.fn(),
  fetchMyRequests: vi.fn(),
  fetchRuntimes: vi.fn(),
  submitRequest: vi.fn(),
}))
vi.mock('@/i18n/navigation', () => ({ useRouter: () => router }))

const CSRF = 'csrf-token-value-that-is-long-enough-1234'
const REQUEST = '0b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
const DRAFT1 = '1b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
const DRAFT2 = '2b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh-CN" messages={messages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(fetchMyRequests).mockReset()
  vi.mocked(amendRequest).mockReset()
  vi.mocked(fetchRuntimes).mockReset()
  vi.mocked(submitRequest).mockReset()
  router.push.mockReset()
})

describe('我在做的分身', () => {
  it('shows each draft with its status and the run-correctness report only', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue({
      contract_version: 1,
      requests: [
        {
          request_id: REQUEST,
          title: '财务分析与预测',
          runtime: 'knowbench',
          created_at: '2026-10-16T00:00:00Z',
          drafts: [
            {
              draft_id: DRAFT1,
              revision: 1,
              version: '1',
              status: 'failed',
              name: '财务分析与预测',
              knowbot_id: null,
              report: {
                status: 'failed',
                finished_at: null,
                cost: null,
                cases: [
                  {
                    case_id: 'c1',
                    status: 'failed',
                    steps: [
                      {
                        step_id: 's2',
                        accepted: false,
                        failed_checks: ['毛利率口径'],
                        details: ['毛利率口径: 用的是净利润'],
                      },
                    ],
                    expectations: [true, false],
                    note: null,
                  },
                ],
              },
            },
            {
              draft_id: DRAFT2,
              revision: 2,
              version: '1',
              status: 'delivered',
              name: '财务分析与预测',
              knowbot_id: 'kb-1',
              report: null,
            },
          ],
        },
      ],
    })
    wrap(<MyRequests csrfToken={CSRF} />)
    expect(await screen.findByText('财务分析与预测')).toBeInTheDocument()
    expect(screen.getByText(/已交付/)).toBeInTheDocument()
    expect(screen.getByText(/测试未通过/)).toBeInTheDocument()
    expect(screen.getByText(/期望满足 1\/2/)).toBeInTheDocument()
    expect(screen.getByText('毛利率口径: 用的是净利润')).toBeInTheDocument()
    expect(screen.getByText('第 s2 步没过：毛利率口径')).toBeInTheDocument()
    // 第 2 稿在前
    const drafts = screen.getAllByText(/第 1 版/)
    expect(drafts[0].textContent).toContain('第 2 稿')
  })

  it('shows empty and failed states', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValueOnce({ contract_version: 1, requests: [] })
    const { unmount } = wrap(<MyRequests csrfToken={CSRF} />)
    expect(await screen.findByText('你还没有提交过想法。')).toBeInTheDocument()
    unmount()
    vi.mocked(fetchMyRequests).mockRejectedValueOnce(new Error('down'))
    wrap(<MyRequests csrfToken={CSRF} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('读取失败')
  })
})

describe('补充方法', () => {
  const AMENDED = '3b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
  const request = (amendments?: Amendment[]) => ({
    contract_version: 1 as const,
    requests: [
      {
        request_id: REQUEST,
        title: '财务分析与预测',
        runtime: 'knowbench',
        created_at: '2026-10-16T00:00:00Z',
        drafts: [],
        ...(amendments ? { amendments } : {}),
      },
    ],
  })

  it('shows what I wrote with its status', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(
      request([
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
          amendment_id: DRAFT1,
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
      ]),
    )
    wrap(<MyRequests csrfToken={CSRF} />)
    expect(await screen.findByText('第 6 步改成对照管理层讨论')).toBeInTheDocument()
    expect(screen.getByText('已用进第 3 稿')).toBeInTheDocument()
    expect(screen.getByText('没照做：平台不给买卖建议')).toBeInTheDocument()
    expect(screen.getByText('待处理')).toBeInTheDocument()
  })

  it('writes an amendment with the session token and reloads the list', async () => {
    vi.mocked(fetchMyRequests).mockResolvedValue(request())
    vi.mocked(amendRequest).mockResolvedValue(AMENDED)
    wrap(<MyRequests csrfToken={CSRF} />)
    fireEvent.click(await screen.findByRole('button', { name: '写一条补充' }))
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
    vi.mocked(fetchMyRequests).mockResolvedValue(request())
    vi.mocked(amendRequest).mockRejectedValue(new Error('down'))
    wrap(<MyRequests csrfToken={CSRF} />)
    fireEvent.click(await screen.findByRole('button', { name: '写一条补充' }))
    fireEvent.change(screen.getByLabelText('补充的内容'), { target: { value: '改第 6 步' } })
    fireEvent.click(screen.getByRole('button', { name: '提交补充' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('没有提交成功')
    expect(screen.getByLabelText('补充的内容')).toHaveValue('改第 6 步')
  })
})

describe('提交一个想法', () => {
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

  it('needs consent, then submits the method, cases and runtime and goes to the list', async () => {
    vi.mocked(fetchRuntimes).mockResolvedValue(['knowbench'])
    vi.mocked(submitRequest).mockResolvedValue(REQUEST)
    wrap(<RequestForm csrfToken={CSRF} />)
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
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/knowbots'))
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
    wrap(<RequestForm csrfToken={CSRF} />)
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
    wrap(<RequestForm csrfToken={CSRF} />)
    await waitFor(() => expect(screen.getByLabelText('在哪里运行')).toHaveValue('knowbench'))
    fill()
    fireEvent.click(screen.getByLabelText(/我同意/))
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('没通过检查')
    expect(router.push).not.toHaveBeenCalled()
  })
})
