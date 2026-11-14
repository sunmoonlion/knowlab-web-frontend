import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { FormalMethodEditor } from '@/components/knowbots/formal-method-editor'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('formalMethod')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function FormalMethodPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; requestId: string }>
  searchParams: Promise<{ method?: string; run?: string; revision?: string; version?: string }>
}) {
  const { locale, requestId } = await params
  const query = await searchParams
  const session = await requireBrowserSession(
    locale,
    `/${locale}/names/${encodeURIComponent(requestId)}/formal-method`,
  )
  const t = await getTranslations('formalMethod')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('intro')}</p>
      <FormalMethodEditor requestId={requestId} csrfToken={session.csrf_token} resume={query} />
    </>
  )
}
