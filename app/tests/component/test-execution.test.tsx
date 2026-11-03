import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { expect, it, vi } from 'vitest'
import { TestExecution } from '@/components/knowbots/test-execution'
import { testExecutionSchema } from '@/contracts/test-execution'
import { fetchTestExecution } from '@/lib/knowbots/test-execution'
import messages from '@/messages/zh-CN.json'

vi.mock('@/lib/knowbots/test-execution', () => ({ fetchTestExecution: vi.fn() }))

it('shows running methods in knowlab and expands only the requested case output', async () => {
  const base = {
    contract: 'knowbot-test-execution/v1',
    run_id: 'test-run-0001',
    status: 'running',
    cases: [
      {
        case_id: 'c1',
        state: 'RUNNING',
        spent: '1.25',
        title: '勾稽',
        activity: '正在核对',
        steps: [
          {
            step_id: 'check_1',
            index: 1,
            title: '勾稽',
            status: 'running',
            selection_reason: '本题使用财报',
            attempts: 1,
            spent: '1.25',
            tools: { compute: 3 },
            latest_activity: [],
          },
        ],
      },
    ],
  }
  vi.mocked(fetchTestExecution).mockImplementation(async (_test, caseId) =>
    testExecutionSchema.parse(
      caseId
        ? {
            ...base,
            cases: [
              {
                ...base.cases[0],
                outputs: {
                  contract: 'knowbot-test-run/v1',
                  run_id: base.run_id,
                  case_id: 'c1',
                  steps: [
                    {
                      step_id: 'check_1',
                      title: '勾稽',
                      outcome: 'accepted',
                      artifact: { checked: true },
                      checks: [{ label: '原式验证', passed: true }],
                    },
                  ],
                },
              },
            ],
          }
        : base,
    ),
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh-CN" messages={messages}>
        <TestExecution testId="test-id" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
  expect(await screen.findByText(/用例 c1/)).toHaveTextContent('已用 1.25 元')
  expect(screen.getByText(/compute × 3/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看过程与交回物' }))
  await waitFor(() => expect(fetchTestExecution).toHaveBeenLastCalledWith('test-id', 'c1'))
  expect(await screen.findByText(/原式验证/)).toBeInTheDocument()
  expect(screen.queryByRole('link')).toBeNull()
})
