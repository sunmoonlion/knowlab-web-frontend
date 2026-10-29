// 专家孵化方案第十三节第 5 条：专家能用了，从申请、专家页都能去 knowbench 请它；申请是在 knowbench
// 找专家没找到时建的，链接再带那一轮找专家的编号（knowbench 取回当初的问题与项目）。
import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApplicationsView } from '@/components/knowbots/applications-view'
import { ExpertsView } from '@/components/knowbots/experts-view'
import { fetchApplications, fetchDetail, fetchExperts } from '@/lib/knowbots/client'

import {
  CSRF,
  EXPERT,
  REQUEST,
  application,
  detail,
  expert,
  expertItem,
  renderWith,
} from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({
  acceptConsent: vi.fn(),
  fetchApplications: vi.fn(),
  fetchDetail: vi.fn(),
  fetchExperts: vi.fn(),
  stopExpert: vi.fn(),
}))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())

const KNOWBOT = '9c1d2e3f-4a5b-4c6d-8e7f-001122334455'
const TASK = '7d1d2e3f-4a5b-4c6d-8e7f-001122334455'
const listed = { stage: 'listed' as const, knowbot_id: KNOWBOT, listing_status: 'active' }

function links(targets: Record<string, { web_base_url: string }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      if (String(input) === '/api/web/v1/cross-app/links') {
        return new Response(JSON.stringify({ app: 'knowlab', targets }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('{}', { status: 404 })
    }),
  )
}

beforeEach(() => vi.resetAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('去 knowbench 请它', () => {
  it('从 knowbench 找专家来的：带这一版和那一轮找专家的编号，新标签页打开', async () => {
    links({ knowbench: { web_base_url: 'https://knowbench.example.test' } })
    vi.mocked(fetchExperts).mockResolvedValue([expertItem({ category: 'usable', ...listed })])
    vi.mocked(fetchDetail).mockResolvedValue(
      detail({
        origin: { app: 'knowbench', project_id: 'p-1', task_id: TASK },
        experts: [expert(listed)],
      }),
    )
    renderWith(<ExpertsView csrfToken={CSRF} />)
    const link = await screen.findByRole('link', { name: '带着当初那句问题去 knowbench 请它' })
    const href = new URL(link.getAttribute('href')!)
    expect(href.origin + href.pathname).toBe('https://knowbench.example.test/zh-CN/workbench')
    expect(Object.fromEntries(href.searchParams)).toEqual({
      knowbot: `${KNOWBOT}@2`,
      task: TASK,
      from: 'knowlab',
      ref: EXPERT,
    })
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('申请页：有能用的一版就给链接；自己在 knowlab 交的申请不带找专家的编号', async () => {
    links({ knowbench: { web_base_url: 'https://knowbench.example.test' } })
    vi.mocked(fetchApplications).mockResolvedValue([application({ category: 'has_expert' })])
    vi.mocked(fetchDetail).mockResolvedValue(detail({ origin: null, experts: [expert(listed)] }))
    renderWith(<ApplicationsView csrfToken={CSRF} picked={REQUEST} />)
    expect(await screen.findByText('专家 v2 能用了')).toBeInTheDocument()
    const link = await screen.findByRole('link', { name: '去 knowbench 请它' })
    const href = new URL(link.getAttribute('href')!)
    expect(href.searchParams.get('knowbot')).toBe(`${KNOWBOT}@2`)
    expect(href.searchParams.has('task')).toBe(false)
  })

  it('没配 knowbench 的地址：只写一句怎么去', async () => {
    links({})
    vi.mocked(fetchExperts).mockResolvedValue([expertItem({ category: 'usable', ...listed })])
    vi.mocked(fetchDetail).mockResolvedValue(detail({ experts: [expert(listed)] }))
    renderWith(<ExpertsView csrfToken={CSRF} />)
    expect(await screen.findByText(/去 knowbench 工作台请它/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /knowbench 请它/ })).toBeNull()
  })
})
