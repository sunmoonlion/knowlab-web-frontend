import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WebShell } from '@/components/shell/web-shell'
import { fetchMyQuestions } from '@/lib/knowbots/client'
import { useUiStore } from '@/store/ui'

import { CSRF, question, renderWith } from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({ fetchMyQuestions: vi.fn() }))
vi.mock('@/i18n/navigation', async () => (await import('./knowbot-fixtures')).linkMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))

function shell() {
  return renderWith(
    <WebShell locale="zh-CN" csrfToken={CSRF} userLabel="张三" email="z@example.com">
      <p>页面内容</p>
    </WebShell>,
  )
}

beforeEach(() => {
  vi.mocked(fetchMyQuestions).mockReset()
  useUiStore.setState({ sidebarCollapsed: false, mobileNavigationOpen: false })
})

describe('web端外壳', () => {
  it('lists the first-level pages in the user order, with no tab strip', async () => {
    vi.mocked(fetchMyQuestions).mockResolvedValue([])
    shell()
    const nav = screen.getByRole('navigation', { name: '主导航' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard',
      '/questions',
      '/ideas',
      '/avatars',
      '/experts',
      '/data',
    ])
    expect(links.map((a) => a.textContent?.replace(/\d+$/, ''))).toEqual([
      '首页',
      '待我回答',
      '创意',
      '分身',
      '专家',
      '我的数据',
    ])
    // 不叫「我的专家」「我的分身」
    expect(screen.queryByText('我的专家')).toBeNull()
    expect(screen.queryByText('我的分身')).toBeNull()
    expect(within(nav).getByRole('link', { name: '创意' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('页面内容')).toBeInTheDocument()
    expect(screen.getByText('当前用户：张三')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退出登录' })).toBeInTheDocument()
    // 没有数字时是灰的 0
    const badge = await screen.findByTestId('nav-badge-questions')
    expect(badge).toHaveTextContent('0')
    expect(badge.className).toContain('bg-muted')
  })

  it('shows how many questions wait for me', async () => {
    vi.mocked(fetchMyQuestions).mockResolvedValue([
      question(),
      question({ question_id: '7b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10' }),
    ])
    shell()
    await waitFor(() => expect(screen.getByTestId('nav-badge-questions')).toHaveTextContent('2'))
    expect(screen.getByTestId('nav-badge-questions').className).toContain('bg-amber-500')
  })

  it('collapses the sidebar and remembers it', async () => {
    vi.mocked(fetchMyQuestions).mockResolvedValue([])
    shell()
    fireEvent.click(screen.getByRole('button', { name: '收起导航' }))
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    expect(screen.getByRole('button', { name: '展开导航' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('sunmoonai-knowlab-web-ui-v1') ?? '{}').state).toEqual(
      expect.objectContaining({ sidebarCollapsed: true }),
    )
    fireEvent.click(screen.getByRole('button', { name: '打开导航' }))
    expect(useUiStore.getState().mobileNavigationOpen).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '关上导航' }))
    expect(useUiStore.getState().mobileNavigationOpen).toBe(false)
  })
})
