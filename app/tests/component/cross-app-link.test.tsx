import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CrossAppLink } from '@/components/common/cross-app-link'
import { ReturnToOrigin } from '@/components/common/return-to-origin'

let search = new URLSearchParams()

vi.mock('next-intl', () => ({ useLocale: () => 'zh-CN' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => search }))
vi.mock('@/lib/cross-app/destinations', () => ({
  destinations: {
    'info.request': { target: 'knowfeed', segments: ['requests', 'new'], params: ['code'] },
    'elsewhere.page': { target: 'elsewhere', segments: ['page'] },
  },
}))

function answer(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function page(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

const LINKS = {
  app: 'investment',
  targets: { knowfeed: { web_base_url: 'https://knowfeed.example.test' } },
}

describe('CrossAppLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    search = new URLSearchParams()
  })

  it('opens the other application in a new tab and carries no identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(LINKS))
    vi.stubGlobal('fetch', fetchMock)
    page(
      <CrossAppLink to={'info.request' as never} values={{ code: '600519' }} refValue="task:42">
        申请入库
      </CrossAppLink>,
    )
    const link = await screen.findByRole('link', { name: '申请入库' })
    expect(link).toHaveAttribute(
      'href',
      'https://knowfeed.example.test/zh-CN/requests/new?code=600519&from=investment&ref=task%3A42',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/web/v1/cross-app/links')
  })

  it('shows nothing when the target application is not configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(LINKS))
    vi.stubGlobal('fetch', fetchMock)
    page(
      <CrossAppLink to={'elsewhere.page' as never} fallback={<span>没有配置</span>}>
        去别处
      </CrossAppLink>,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(await screen.findByText('没有配置')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows nothing when the backend answer breaks the contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        answer({ app: 'investment', targets: { knowfeed: { web_base_url: 'javascript:alert(1)' } } }),
      )
    vi.stubGlobal('fetch', fetchMock)
    page(<CrossAppLink to={'info.request' as never}>申请入库</CrossAppLink>)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('ReturnToOrigin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    search = new URLSearchParams()
  })

  it('uses the address the backend gives, never one from the address bar', async () => {
    search = new URLSearchParams({
      from: 'investment',
      ref: 'task:42',
      return_url: 'https://evil.example.test/',
    })
    const fetchMock = vi.fn().mockResolvedValue(
      answer({
        app: 'investment',
        ref: 'task:42',
        return_url: 'https://investment.example.test/zh-CN/workbench/back?ref=task%3A42',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    page(<ReturnToOrigin>回到原处</ReturnToOrigin>)
    const link = await screen.findByRole('link', { name: '回到原处' })
    expect(link).toHaveAttribute(
      'href',
      'https://investment.example.test/zh-CN/workbench/back?ref=task%3A42',
    )
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/web/v1/cross-app/origin?from=investment&ref=task%3A42',
    )
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('evil')
  })

  it('shows nothing when nobody brought the person here', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    page(<ReturnToOrigin>回到原处</ReturnToOrigin>)
    expect(screen.queryByRole('link')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows nothing when the source has no way back registered', async () => {
    search = new URLSearchParams({ from: 'knowbase' })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(answer({ app: 'knowbase', ref: null, return_url: null }))
    vi.stubGlobal('fetch', fetchMock)
    page(<ReturnToOrigin>回到原处</ReturnToOrigin>)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('does not ask the backend about a source that cannot be an application name', async () => {
    search = new URLSearchParams({ from: 'https://evil.example.test' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    page(<ReturnToOrigin>回到原处</ReturnToOrigin>)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
