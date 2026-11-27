import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MethodStudioHome, type StudioInitialParams } from '@/components/knowbots/method-studio'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('studio'), robots: { index: false, follow: false } }
}

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<StudioInitialParams>
}) {
  const { locale } = await params
  const query = await searchParams
  const session = await requireBrowserSession(locale, `/${locale}/studio`)
  const t = await getTranslations('studio')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">{t('lead')}</p>
      <MethodStudioHome csrfToken={session.csrf_token} initial={query} />
    </>
  )
}
