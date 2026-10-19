import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { AvatarsView } from '@/components/knowbots/avatars-view'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('avatars'), robots: { index: false, follow: false } }
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

// 分身（SDD 0037 §四.3）：?draft=<id> 打开那一个
export default async function AvatarsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const query = await searchParams
  const session = await requireBrowserSession(locale, `/${locale}/avatars`)
  const t = await getTranslations('knowbots.avatars')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('intro')}</p>
      <AvatarsView csrfToken={session.csrf_token} picked={one(query.draft)} />
    </>
  )
}
