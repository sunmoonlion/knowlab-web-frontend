import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { RequestForm } from '@/components/knowbots/request-form'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowbotRequests')
  return { title: t('newRequest'), robots: { index: false, follow: false } }
}

export default async function NewKnowbotRequestPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await requireBrowserSession(locale, `/${locale}/knowbots/new`)
  const t = await getTranslations('knowbotRequests')

  return (
    <div className="bg-background min-h-screen" data-route-class="authenticated-workspace">
      <header className="flex items-center border-b px-6 py-3">
        <Link href={`/${locale}/knowbots`} className="text-muted-foreground text-sm">
          {t('title')}
        </Link>
      </header>
      <main className="p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t('newRequest')}</h1>
        <p className="text-muted-foreground mt-2">{t('form.intro')}</p>
        <RequestForm csrfToken={session.csrf_token} />
      </main>
    </div>
  )
}
