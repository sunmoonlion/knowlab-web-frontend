import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SelfTests, choiceOf } from '@/components/knowbots/self-test'
import type { TestDataRequest } from '@/contracts/knowbots'
import { ApiClientError } from '@/lib/common/api-client'
import {
  confirmTestData,
  declineTestData,
  fetchComputers,
  fetchTestData,
  refreshMyTest,
  startSelfTest,
} from '@/lib/knowbots/client'
import messages from '@/messages/zh-CN.json'

import { CSRF, DRAFT, TEST, detail, draft, testRecord } from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({
  fetchComputers: vi.fn(),
  startSelfTest: vi.fn(),
  refreshMyTest: vi.fn(),
  fetchTestData: vi.fn(),
  confirmTestData: vi.fn(),
  declineTestData: vi.fn(),
}))

const ENV = '9b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
const Q = '8b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
const proposed: TestDataRequest = {
  question_id: Q,
  case_id: 'c1',
  status: 'proposed',
  missing: [],
  incomplete: [],
  needs: [
    {
      key: 'req1_1',
      name: '最近一年的年报',
      subject: '600519.SH',
      doc_type: 'annual_report',
      period: { kind: 'fixed', start: '2025-01-01', end: '2025-12-31' },
      required: true,
    },
    {
      key: 'req1_2',
      name: '上一年比较',
      subject: '600519.SH',
      doc_type: 'annual_report',
      period: { kind: 'fixed', start: '2024-01-01', end: '2024-12-31' },
      required: false,
    },
  ],
  items: [
    {
      ref: 'req1_1:a',
      need_key: 'req1_1',
      key: { subject: '600519.SH', period_start: '2025-01-01', period_end: '2025-12-31' },
      status: 'resolved',
      chosen: [{ material_id: 'm-2025', version_no: 1, name: '贵州茅台2025年年度报告.pdf' }],
      candidates: [],
    },
    {
      ref: 'req1_2:b',
      need_key: 'req1_2',
      key: { subject: '600519.SH', period_start: '2024-01-01', period_end: '2024-12-31' },
      status: 'to_confirm',
      chosen: [],
      candidates: [],
    },
  ],
}

function page(life = detail()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh-CN" messages={messages}>
        <SelfTests life={life} csrfToken={CSRF} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(fetchComputers)
    .mockReset()
    .mockResolvedValue({
      computers: [
        { environment_id: ENV, name: '我的电脑', online: true, roots: ['/home/me/work'] },
      ],
      last: null,
    })
  vi.mocked(startSelfTest).mockReset().mockResolvedValue(TEST)
  vi.mocked(refreshMyTest).mockReset().mockResolvedValue()
  vi.mocked(fetchTestData).mockReset().mockResolvedValue([proposed])
  vi.mocked(confirmTestData).mockReset().mockResolvedValue('supplying')
  vi.mocked(declineTestData).mockReset().mockResolvedValue('answered')
})

describe('自助测试（SDD 0046 第三节）', () => {
  it('只有一台在线就默认它，设费用上限后自己测一次', async () => {
    page(detail({ drafts: [draft({ status: 'pending_test', draft_id: DRAFT })], tests: [] }))
    const start = within(await screen.findByTestId('self-test-start'))
    fireEvent.change(start.getByRole('textbox', { name: '费用上限（元）' }), {
      target: { value: '5' },
    })
    fireEvent.click(start.getByRole('button', { name: '自己测一次' }))
    await waitFor(() =>
      expect(startSelfTest).toHaveBeenCalledWith(
        DRAFT,
        { environment_id: ENV, workspace_root: '/home/me/work', budget_limit: '5' },
        CSRF,
      ),
    )
  })

  it.each([
    ['test_computer_unavailable', messages.knowbots.selfTest.errors.test_computer_unavailable],
    ['author_has_no_computer', messages.knowbots.selfTest.errors.author_has_no_computer],
  ])('后端说电脑用不了（%s）：说先去 knowbench 接入一台电脑再回来测', async (code, text) => {
    vi.mocked(startSelfTest).mockRejectedValue(
      new ApiClientError(code === 'author_has_no_computer' ? 409 : 502, {
        code,
        message_key: 'errors.requestFailed',
        retryable: false,
        correlation_id: 'c',
      }),
    )
    page(detail({ drafts: [draft({ status: 'pending_test', draft_id: DRAFT })], tests: [] }))
    const start = within(await screen.findByTestId('self-test-start'))
    fireEvent.click(start.getByRole('button', { name: '自己测一次' }))
    expect(await start.findByRole('alert')).toHaveTextContent(text)
    expect(text).toMatch(/先去 knowbench 接入一台电脑/)
  })

  it('别的错误：照旧说再试一次', async () => {
    vi.mocked(startSelfTest).mockRejectedValue(new Error('boom'))
    page(detail({ drafts: [draft({ status: 'pending_test', draft_id: DRAFT })], tests: [] }))
    const start = within(await screen.findByTestId('self-test-start'))
    fireEvent.click(start.getByRole('button', { name: '自己测一次' }))
    expect(await start.findByRole('alert')).toHaveTextContent(
      messages.knowbots.selfTest.startFailed,
    )
  })

  it('没有在线的电脑：说先去 knowbench 接入', async () => {
    vi.mocked(fetchComputers).mockResolvedValue({
      computers: [{ environment_id: ENV, name: '我的电脑', online: false, roots: ['/w'] }],
      last: null,
    })
    page(detail({ drafts: [draft({ status: 'pending_test' })], tests: [] }))
    expect(await screen.findByText(/先去 knowbench 接入/)).toBeInTheDocument()
  })
})

describe('测试里专家提出的数据（decisions ⑭）', () => {
  it('列出每一样；去掉一样后确认，带去掉的条目编号', async () => {
    page(detail({ drafts: [], tests: [testRecord({ status: 'waiting', test_id: TEST })] }))
    const panel = within(await screen.findByTestId('test-data-request'))
    expect(refreshMyTest).toHaveBeenCalledWith(TEST, CSRF)
    expect(panel.getByText('贵州茅台2025年年度报告.pdf')).toBeInTheDocument()
    expect(panel.getByText('缺，要去取')).toBeInTheDocument()
    fireEvent.click(panel.getAllByRole('button', { name: '不要这一样' })[1])
    fireEvent.click(panel.getByRole('button', { name: '确认，去取' }))
    await waitFor(() =>
      expect(confirmTestData).toHaveBeenCalledWith(Q, { dropped: ['req1_2:b'] }, CSRF),
    )
  })

  it('没取到的：照现有的接着测', async () => {
    vi.mocked(fetchTestData).mockResolvedValue([
      { ...proposed, status: 'missing', missing: ['上一年比较：没取到'] },
    ])
    page(detail({ drafts: [], tests: [testRecord({ status: 'waiting' })] }))
    const missing = within(await screen.findByTestId('test-data-missing'))
    fireEvent.click(missing.getByRole('button', { name: '照现有的接着测' }))
    await waitFor(() => expect(declineTestData).toHaveBeenCalledWith(Q, CSRF))
  })

  it('改了主体：带整份，去掉的不带', () => {
    expect(
      choiceOf(proposed, {
        picks: {},
        dropped: ['req1_1:a'],
        edits: { req1_2: { subject: '000858.SZ', from: 2023, to: 2023 } },
        added: [],
      }),
    ).toEqual({
      needs: [
        {
          ...proposed.needs[1],
          subject: '000858.SZ',
          period: { kind: 'fixed', start: '2023-01-01', end: '2023-12-31' },
        },
      ],
    })
  })
})
