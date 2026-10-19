import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExpertsView } from '@/components/knowbots/experts-view'
import { Overview } from '@/components/knowbots/overview'
import type { Knowbot } from '@/contracts/knowbots'
import { fetchMyKnowbots, fetchMyQuestions, fetchMyRequests } from '@/lib/knowbots/client'

import {
  DRAFT,
  DRAFT2,
  REQUEST,
  draft,
  mine,
  question,
  renderWith,
  request,
} from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({
  fetchMyKnowbots: vi.fn(),
  fetchMyQuestions: vi.fn(),
  fetchMyRequests: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

function expert(overrides: Partial<Knowbot> = {}): Knowbot {
  return {
    knowbot_id: 'kb-1',
    name: '茅台财务体检',
    version: '1',
    revision: 2,
    draft_id: DRAFT,
    request_id: REQUEST,
    title: '财务分析与预测',
    delivered_at: '2026-10-18T08:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(fetchMyKnowbots).mockReset()
  vi.mocked(fetchMyQuestions).mockReset().mockResolvedValue([])
  vi.mocked(fetchMyRequests).mockReset()
})

describe('专家', () => {
  it('lists experts by their own names and shows where each came from', async () => {
    vi.mocked(fetchMyKnowbots).mockResolvedValue([
      expert(),
      expert({
        draft_id: DRAFT2,
        version: '2',
        revision: 1,
        name: '茅台财务体检 2',
        delivered_at: '2026-10-19T08:00:00Z',
      }),
    ])
    renderWith(<ExpertsView />)
    const box = await screen.findByRole('button', { name: '专家' })
    expect(box).toHaveTextContent('茅台财务体检 2')
    fireEvent.click(box)
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('茅台财务体检 2')
    expect(options[1]).toHaveTextContent('茅台财务体检')
    expect(screen.queryByText(/我的专家/)).toBeNull()
    fireEvent.click(options[1])
    const main = screen.getByRole('region', { name: '茅台财务体检' })
    expect(within(main).getByRole('link', { name: '财务分析与预测' })).toHaveAttribute(
      'href',
      `/ideas?request=${REQUEST}`,
    )
    expect(within(main).getByRole('link', { name: '分身 1.2' })).toHaveAttribute(
      'href',
      `/avatars?draft=${DRAFT}`,
    )
    expect(within(main).getByText(/去 knowbench 工作台请它/)).toBeInTheDocument()
    const versions = within(main).getByRole('region', { name: '这个创意做出来的各版' })
    expect(within(versions).getAllByRole('listitem')).toHaveLength(2)
  })

  it('says so when there is none', async () => {
    vi.mocked(fetchMyKnowbots).mockResolvedValue([])
    renderWith(<ExpertsView />)
    expect(await screen.findByText(/还没有做出来的专家/)).toBeInTheDocument()
  })
})

describe('首页', () => {
  it('shows what waits for me, ideas in progress, latest results and experts by name', async () => {
    vi.mocked(fetchMyQuestions).mockResolvedValue([question()])
    vi.mocked(fetchMyRequests).mockResolvedValue(
      mine(
        request({
          drafts: [
            draft({
              status: 'failed',
              report: {
                status: 'failed',
                cases: [
                  { case_id: 'c1', status: 'passed', steps: [], expectations: [], note: null },
                  { case_id: 'c2', status: 'failed', steps: [], expectations: [], note: null },
                ],
                cost: null,
                finished_at: '2026-10-19T08:00:00Z',
              },
            }),
          ],
        }),
      ),
    )
    vi.mocked(fetchMyKnowbots).mockResolvedValue([expert()])
    renderWith(<Overview />)
    const asks = screen.getByRole('region', { name: '待我回答' })
    expect(await within(asks).findByText(/有 1 个问题等你回答/)).toBeInTheDocument()
    expect(within(asks).getByRole('link', { name: '去回答' })).toHaveAttribute('href', '/questions')
    const ideas = screen.getByRole('region', { name: '进行中的创意' })
    expect(await within(ideas).findByText('等你回答')).toBeInTheDocument()
    const results = screen.getByRole('region', { name: '最近的测试结果' })
    expect(
      within(results).getByRole('link', { name: '分身 1.1 · 财务分析与预测' }),
    ).toBeInTheDocument()
    expect(within(results).getByText('1/2 条用例通过')).toBeInTheDocument()
    const experts = screen.getByRole('region', { name: '专家' })
    expect(await within(experts).findByRole('link', { name: '茅台财务体检' })).toHaveAttribute(
      'href',
      `/experts?draft=${DRAFT}`,
    )
  })
})
