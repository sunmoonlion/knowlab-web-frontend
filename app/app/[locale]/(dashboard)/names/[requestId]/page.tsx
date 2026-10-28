import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { NameView } from '@/components/knowbots/name-view'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowbots.name')
  return { title: t('title'), robots: { index: false, follow: false } }
}

// 一个名称的详情页（SDD 0037 第九节）：地址独立
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

// ?published=<准专家版本>：刚从工作稿出了一版，顶上说一声
export default async function NamePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; requestId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale, requestId } = await params
  const query = await searchParams
  const session = await requireBrowserSession(
    locale,
    `/${locale}/names/${encodeURIComponent(requestId)}`,
  )
  const t = await getTranslations('knowbots.name')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('intro')}</p>
      <NameView
        requestId={requestId}
        csrfToken={session.csrf_token}
        published={one(query.published)}
      />
    </>
  )
}
