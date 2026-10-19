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

// 专家（SDD 0037 §四.3）：?draft=<id> 打开那一版
export default async function ExpertsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const query = await searchParams
  await requireBrowserSession(locale, `/${locale}/experts`)
  const t = await getTranslations('knowbots.experts')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('intro')}</p>
      <ExpertsView picked={one(query.draft)} />
    </>
  )
}
