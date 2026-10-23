import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ReviseForm } from '@/components/knowbots/revise-form'
import { Link } from '@/i18n/navigation'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowbots.applications')
  return { title: t('revise'), robots: { index: false, follow: false } }
}

// 改创意：出一个新版本（SDD 0037 第八节）
export default async function ReviseApplicationPage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>
}) {
  const { locale, requestId } = await params
  const session = await requireBrowserSession(
    locale,
    `/${locale}/applications/${encodeURIComponent(requestId)}/revise`,
  )
  const t = await getTranslations('knowbots.applications')
  const tNav = await getTranslations('nav')
  return (
    <>
      <Link
        href={{ pathname: '/applications', query: { item: requestId } }}
        className="text-muted-foreground text-sm underline-offset-4 hover:underline"
      >
        {tNav('applications')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('revise')}</h1>
      <ReviseForm csrfToken={session.csrf_token} requestId={requestId} />
    </>
  )
}
