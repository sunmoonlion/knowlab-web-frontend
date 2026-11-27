import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WebShell } from '@/components/shell/web-shell'
import { useUiStore } from '@/store/ui'

import { CSRF, renderWith } from './knowbot-fixtures'

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
  useUiStore.setState({ sidebarCollapsed: false, mobileNavigationOpen: false })
})

describe('web端外壳', () => {
  it('lists the 4 formal-first primary pages without a historical archive', async () => {
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
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
    expect(screen.queryByTestId('nav-group-archive')).toBeNull()
    expect(screen.getByText('页面内容')).toBeInTheDocument()
  })

  it('collapses the sidebar and remembers it', async () => {
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
