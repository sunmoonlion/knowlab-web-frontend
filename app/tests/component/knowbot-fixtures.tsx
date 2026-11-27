import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import type { ExpertItem } from '@/contracts/knowbots'
import messages from '@/messages/zh-CN.json'

// 申请、审核、专家三栏与详情页的测试共用（SDD 0037）：样例数据与渲染。

export const CSRF = 'csrf-token-value-that-is-long-enough-1234'
export const REQUEST = '0b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'
export const EXPERT = '6b8a6c3e-1f2d-4c5b-9a7e-6d5c4b3a2f10'

export function expertItem(overrides: Partial<ExpertItem> = {}): ExpertItem {
  return {
    expert_id: EXPERT,
    version: 2,
    title: '财务分析与预测',
    name: null,
    knowbot_id: null,
    trial: false,
    market_status: null,
    held_reason: null,
    ...overrides,
  }
}

export function renderWith(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh-CN" messages={messages} timeZone="Asia/Shanghai">
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}

export const router = { push: () => {}, replace: () => {}, refresh: () => {} }

/** next-intl 的导航在测试里换成普通链接：href 照拼。 */
export function linkMock() {
  return {
    Link: ({
      href,
      children,
      ...rest
    }: {
      href: string | { pathname: string; query?: Record<string, string> }
      children: React.ReactNode
    }) => (
      <a
        href={
          typeof href === 'string'
            ? href
            : `${href.pathname}?${new URLSearchParams(href.query ?? {}).toString()}`
        }
        {...rest}
      >
        {children}
      </a>
    ),
    usePathname: () => '/applications',
    useRouter: () => router,
  }
}
