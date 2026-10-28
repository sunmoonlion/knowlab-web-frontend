import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { WorkdraftView } from '@/components/knowbots/workdraft-view'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('workdraft')
  return { title: t('title'), robots: { index: false, follow: false } }
}

// 名称的「孵化」栏：工作稿（专家孵化方案第六节），地址独立
export default async function WorkdraftPage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>
}) {
  const { locale, requestId } = await params
  const session = await requireBrowserSession(
    locale,
    `/${locale}/names/${encodeURIComponent(requestId)}/workdraft`,
  )
  const t = await getTranslations('workdraft')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('intro')}</p>
      <WorkdraftView requestId={requestId} csrfToken={session.csrf_token} />
    </>
  )
}
