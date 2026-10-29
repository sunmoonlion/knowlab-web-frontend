import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { TestsColumn } from '@/components/knowbots/lab-columns'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('tests'), robots: { index: false, follow: false } }
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

// 测试（SDD 0046 第六节）：用例、测试集、确认数据、发起、历次测试；?item=<名称> 打开那一个
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const query = await searchParams
  const session = await requireBrowserSession(locale, `/${locale}/tests`)
  const t = await getTranslations('knowbots.testsColumn')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('intro')}</p>
      <TestsColumn csrfToken={session.csrf_token} picked={one(query.item)} />
    </>
  )
}
