import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { MyData } from '@/components/knowbots/my-data'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('data'), robots: { index: false, follow: false } }
}

// 我的数据（SDD 0037 §四.2）：上传、看版本、删；一份数据可被几个创意用
export default async function DataPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const session = await requireBrowserSession(locale, `/${locale}/data`)
  return <MyData csrfToken={session.csrf_token} />
}
