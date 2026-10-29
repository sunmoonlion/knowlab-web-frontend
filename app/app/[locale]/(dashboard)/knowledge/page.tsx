import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { KnowledgeView } from '@/components/knowbots/knowledge-view'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('knowledge'), robots: { index: false, follow: false } }
}

// 知识库（SDD 0046 第六节）：只展示你在 knowbase 给了 knowlab 的资料，链到 knowbase 去管
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  await requireBrowserSession(locale, `/${locale}/knowledge`)
  const t = await getTranslations('knowbots.knowledge')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('intro')}</p>
      <KnowledgeView />
    </>
  )
}
