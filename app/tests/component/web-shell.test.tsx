import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WebShell } from '@/components/shell/web-shell'
import { fetchCounts } from '@/lib/knowbots/client'
import { useUiStore } from '@/store/ui'

import { CSRF, renderWith } from './knowbot-fixtures'

vi.mock('@/lib/knowbots/client', () => ({ fetchCounts: vi.fn() }))
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
  vi.mocked(fetchCounts).mockReset()
  useUiStore.setState({ sidebarCollapsed: false, mobileNavigationOpen: false })
})

describe('web端外壳', () => {
  it('lists the 4 formal-first primary pages and folds legacy routes into the archive group', async () => {
    vi.mocked(fetchCounts).mockResolvedValue({ inbox: 0, experts_new: 0 })
    shell()
    const nav = screen.getByRole('navigation', { name: '主导航' })
    const primaryLinks = within(screen.getByTestId('nav-group-primary')).getAllByRole('link')
    expect(primaryLinks.map((a) => a.getAttribute('href'))).toEqual([
      '/dashboard',
      '/studio',
      '/methods',
      '/knowledge',
    ])
    expect(primaryLinks.map((a) => a.textContent?.trim())).toEqual([
      '首页',
      '方法工坊',
      '方法与技能',
      '知识库',
    ])
    // fixture 默认路径在 /applications，归档组自动展开并高亮「申请」
    const archiveGroup = screen.getByTestId('nav-group-archive')
    expect(within(archiveGroup).getByRole('button', { name: /历史兼容归档/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(
      within(archiveGroup)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/applications', '/incubation', '/tests', '/delivery', '/review', '/experts'])
    expect(screen.queryByText('我的专家')).toBeNull()
    expect(within(nav).getByRole('link', { name: /申请/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('页面内容')).toBeInTheDocument()
    expect(screen.getByText('当前用户：张三')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退出登录' })).toBeInTheDocument()
    const badge = await screen.findByTestId('nav-badge-review')
    expect(badge).toHaveTextContent('0')
    expect(badge.className).toContain('bg-muted')

    // 点击折叠历史归档组后收起旧页面链接
    fireEvent.click(within(archiveGroup).getByRole('button', { name: /历史兼容归档/ }))
    expect(within(archiveGroup).queryByRole('link', { name: /申请/ })).toBeNull()
  })

  it('counts what waits for me under Review and new experts under Experts', async () => {
    vi.mocked(fetchCounts).mockResolvedValue({ inbox: 2, experts_new: 1 })
    shell()
    await waitFor(() => expect(screen.getByTestId('nav-badge-review')).toHaveTextContent('2'))
    expect(screen.getByTestId('nav-badge-review').className).toContain('bg-amber-500')
    expect(screen.getByTestId('nav-badge-experts')).toHaveTextContent('1')
  })

  it('collapses the sidebar and remembers it', async () => {
    vi.mocked(fetchCounts).mockResolvedValue({ inbox: 0, experts_new: 0 })
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
