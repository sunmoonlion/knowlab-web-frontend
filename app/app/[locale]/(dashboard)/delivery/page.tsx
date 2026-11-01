import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { DeliveryColumn } from '@/components/knowbots/lab-columns'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('delivery'), robots: { index: false, follow: false } }
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

// 交付（SDD 0046 第五、六节）：选一版、定自用或公开、授权审核员、提交、看审核进度；?item=<专家版本> 打开那一版
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const query = await searchParams
  const session = await requireBrowserSession(locale, `/${locale}/delivery`)
  const t = await getTranslations('knowbots.deliveryColumn')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('intro')}</p>
      <DeliveryColumn csrfToken={session.csrf_token} picked={one(query.item)} />
    </>
  )
}
