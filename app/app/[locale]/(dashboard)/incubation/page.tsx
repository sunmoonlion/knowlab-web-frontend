import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { IncubationColumn } from '@/components/knowbots/lab-columns'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('incubation'), robots: { index: false, follow: false } }
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

// 孵化（SDD 0046 第六节）：按名称列、标现在的模式；?item=<名称> 打开那一个
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const query = await searchParams
  const session = await requireBrowserSession(locale, `/${locale}/incubation`)
  const t = await getTranslations('knowbots.incubationColumn')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('intro')}</p>
      <IncubationColumn csrfToken={session.csrf_token} picked={one(query.item)} />
    </>
  )
}
