import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { Overview } from '@/components/knowbots/overview'
import { ReferenceWorkspace } from '@/components/platform/reference-workspace'
import { serverEnv } from '@/env/server'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')

  return {
    title: t('workspaceTitle'),
    robots: {
      index: false,
      follow: false,
    },
  }
}

// 首页：我的进展一览（SDD 0037 §四.2）
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const session = await requireBrowserSession(locale)
  const t = await getTranslations('knowbots.home')

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground mt-2">{t('intro')}</p>
      <Overview />
      {serverEnv.REFERENCE_UI_ENABLED ? (
        <ReferenceWorkspace
          runId="00000000-0000-5000-8000-000000000001"
          csrfToken={session.csrf_token}
        />
      ) : null}
    </>
  )
}
