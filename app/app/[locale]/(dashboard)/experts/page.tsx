import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ExpertsView } from '@/components/knowbots/experts-view'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('experts'), robots: { index: false, follow: false } }
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

// SDD 0037 第八节：?item=<哪一条> 打开那一条
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const query = await searchParams
  const session = await requireBrowserSession(locale, `/${locale}/experts`)
  const t = await getTranslations('knowbots.experts')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('intro')}</p>
      <ExpertsView csrfToken={session.csrf_token} picked={one(query.item)} />
    </>
  )
}
