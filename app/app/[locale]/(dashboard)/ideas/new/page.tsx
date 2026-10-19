import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { RequestForm } from '@/components/knowbots/request-form'
import { Link } from '@/i18n/navigation'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowbotRequests')
  return { title: t('newRequest'), robots: { index: false, follow: false } }
}

// 提交一个创意；提交完回到创意页
export default async function NewIdeaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const session = await requireBrowserSession(locale, `/${locale}/ideas/new`)
  const t = await getTranslations('knowbotRequests')
  const tNav = await getTranslations('nav')

  return (
    <>
      <Link
        href="/ideas"
        className="text-muted-foreground text-sm underline-offset-4 hover:underline"
      >
        {tNav('ideas')}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('newRequest')}</h1>
      <p className="text-muted-foreground mt-2">{t('form.intro')}</p>
      <RequestForm csrfToken={session.csrf_token} />
    </>
  )
}
