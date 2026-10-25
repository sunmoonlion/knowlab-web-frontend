import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApplicationsView } from '@/components/knowbots/applications-view'
import { RequestForm } from '@/components/knowbots/request-form'
import { ApiClientError } from '@/lib/common/api-client'
import {
  acceptConsent,
  fetchApplications,
  fetchDetail,
  fetchRuntimes,
  reviseRequest,
  submitRequest,
} from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

import { CSRF, REQUEST, application, detail, renderWith, version } from './knowbot-fixtures'

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))

vi.mock('@/lib/knowbots/client', () => ({
  acceptConsent: vi.fn(),
  fetchApplications: vi.fn(),
  fetchDetail: vi.fn(),
  fetchRuntimes: vi.fn(),
  reviseRequest: vi.fn(),
  submitRequest: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => ({
  ...(await import('./knowbot-fixtures')).linkMock(),
  useRouter: () => router,
}))

const k = messages.knowbots

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchDetail).mockResolvedValue(detail())
})

describe('申请', () => {
  it('列出我的申请，按大类分；打开的那一个写着最新一版受理没有，右边是各版本', async () => {
    vi.mocked(fetchApplications).mockResolvedValue([
      application(),
      application({
        request_id: '9b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10',
        title: '另一个',
        category: 'rejected',
      }),
    ])
    renderWith(<ApplicationsView csrfToken={CSRF} />)
    expect(
      await screen.findByRole('heading', { level: 2, name: '财务分析与预测' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '在做 · 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '没受理 · 1' })).toBeInTheDocument()
    expect(
      await screen.findByText('创意 v2 受理了：我们照它孵化、测试，有要你做的会在「审核」里。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: k.applications.revise })).toHaveAttribute(
      'href',
      `/applications/${REQUEST}/revise`,
    )
    expect(screen.getByRole('link', { name: k.toName })).toHaveAttribute(
      'href',
      `/names/${REQUEST}`,
    )
    expect(screen.getByText('# 第二版方法')).toBeInTheDocument() // 右边：最新一版先展开
    expect(screen.getAllByText(/创意 v2 · 受理了 · 准专家 2.3/).length).toBeGreaterThan(0)
  })

  it('没受理的写着理由，改了再交是新版本', async () => {
    vi.mocked(fetchApplications).mockResolvedValue([application({ category: 'rejected' })])
    vi.mocked(fetchDetail).mockResolvedValue(
      detail({
        versions: [
          version(),
          version({
            version: 2,
            acceptance: {
              accepted: false,
              reason: '要给买卖建议，这类不做',
              decided_at: '2026-10-24T08:00:00Z',
              trial: false,
            },
          }),
        ],
      }),
    )
    renderWith(<ApplicationsView csrfToken={CSRF} picked={REQUEST} />)
    expect(
      await screen.findByText('创意 v2 没受理：要给买卖建议，这类不做。改一改再交，就是新版本。'),
    ).toBeInTheDocument()
  })

  it('旧说明下提交的，先同意新说明', async () => {
    vi.mocked(fetchApplications).mockResolvedValue([application({ consent_version: 1 })])
    vi.mocked(acceptConsent).mockResolvedValue(undefined)
    renderWith(<ApplicationsView csrfToken={CSRF} />)
    fireEvent.click(await screen.findByRole('button', { name: k.consent.accept }))
    await waitFor(() => expect(acceptConsent).toHaveBeenCalledWith(REQUEST, CSRF))
  })

  it('读不出来、还没有都照说', async () => {
    vi.mocked(fetchApplications).mockResolvedValue([])
    renderWith(<ApplicationsView csrfToken={CSRF} />)
    expect(await screen.findByText(k.applications.empty)).toBeInTheDocument()
  })
})

describe('申请一个创意', () => {
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

  it('要同意才能交；交上方法、用例、运行方，回到申请里那一个', async () => {
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
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/applications?item=${REQUEST}`))
    const [body, token] = vi.mocked(submitRequest).mock.calls[0]!
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

  it('选了 skill 就交 skill，不交六问', async () => {
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
    expect(vi.mocked(submitRequest).mock.calls[0]![0].idea).toEqual({
      kind: 'skill',
      skill: '# 我的方法',
    })
  })

  it('被拒了照说，不离开这一页', async () => {
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

  it('改创意：从上一版带过来，名称与运行方不填，交了出新版本；预先给的答案照带', async () => {
    vi.mocked(reviseRequest).mockResolvedValue(3)
    renderWith(<RequestForm csrfToken={CSRF} revise={{ requestId: REQUEST, version: version() }} />)
    expect(screen.queryByLabelText('名字')).toBeNull()
    expect(screen.queryByLabelText('在哪里运行')).toBeNull()
    expect(screen.getByLabelText('skill 原文')).toHaveValue('# 我的方法')
    fireEvent.change(screen.getByLabelText('skill 原文'), { target: { value: '# 改过的方法' } })
    fireEvent.click(screen.getByLabelText(/我同意/))
    fireEvent.click(
      screen.getByRole('button', { name: messages.knowbotRequests.form.submitRevision }),
    )
    await waitFor(() =>
      expect(reviseRequest).toHaveBeenCalledWith(
        REQUEST,
        {
          idea: { kind: 'skill', skill: '# 改过的方法' },
          cases: [
            {
              case_id: 'c1',
              input: { question: '茅台近三年营收？', answers: { period: '3y' } },
              expectations: [
                {
                  artifact: 'official',
                  path: 'revenue',
                  kind: 'approx',
                  value: 1708.99,
                  tolerance: 0.001,
                },
              ],
            },
          ],
          consent_test_data: true,
        },
        CSRF,
      ),
    )
    expect(router.push).toHaveBeenCalledWith(`/applications?item=${REQUEST}`)
    expect(submitRequest).not.toHaveBeenCalled()
  })

  it('改创意：带过来的用例留原编号，删掉的号不再给新用例（Fable 评审 P1-6）', async () => {
    vi.mocked(reviseRequest).mockResolvedValue(3)
    const base = version()
    const two = version({
      cases: [
        { ...base.cases[0]!, case_id: 'c1', input: { question: '问 A' } },
        { ...base.cases[0]!, case_id: 'c2', input: { question: '问 B' } },
      ],
    })
    renderWith(<RequestForm csrfToken={CSRF} revise={{ requestId: REQUEST, version: two }} />)
    fireEvent.click(
      screen.getAllByRole('button', { name: messages.knowbotRequests.form.removeCase })[0]!,
    )
    fireEvent.click(screen.getByText(messages.knowbotRequests.form.addCase))
    fireEvent.change(screen.getByLabelText('用例 2：问它什么'), { target: { value: '问 C' } })
    fireEvent.click(screen.getByLabelText(/我同意/))
    fireEvent.click(
      screen.getByRole('button', { name: messages.knowbotRequests.form.submitRevision }),
    )
    await waitFor(() => expect(reviseRequest).toHaveBeenCalled())
    const body = vi.mocked(reviseRequest).mock.calls[0]![1]
    expect(body.cases.map((c) => [c.case_id, c.input.question])).toEqual([
      ['c2', '问 B'],
      ['c3', '问 C'],
    ])
  })
})
