import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { LogoutButton } from '@/components/auth/logout-button'
import { SignedInAs, signedInName } from '@/components/auth/signed-in-as'
import { MyData } from '@/components/knowbots/my-data'
import { MyQuestions } from '@/components/knowbots/my-questions'
import { MyRequests } from '@/components/knowbots/my-requests'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('knowbotRequests')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function KnowbotRequestsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await requireBrowserSession(locale, `/${locale}/knowbots`)
  const t = await getTranslations('knowbotRequests')
  const tAuth = await getTranslations('auth')
  const tNav = await getTranslations('nav')

  return (
    <div className="bg-background min-h-screen" data-route-class="authenticated-workspace">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <Link href={`/${locale}/dashboard`} className="text-muted-foreground text-sm">
          {tNav('dashboard')}
        </Link>
        <div className="flex items-center gap-4">
          <SignedInAs
            label={tAuth('signedInAs', { name: signedInName(session.user) })}
            email={session.user.email}
          />
          <LogoutButton
            csrfToken={session.csrf_token}
            locale={locale}
            label={tAuth('logout')}
            errorLabel={tAuth('logoutFailed')}
          />
        </div>
      </header>
      <main className="p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-2">{t('intro')}</p>
        <p className="mt-4">
          <Link
            href={`/${locale}/knowbots/new`}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            {t('newRequest')}
          </Link>
        </p>
        <MyQuestions csrfToken={session.csrf_token} />
        <MyRequests />
        <MyData csrfToken={session.csrf_token} />
      </main>
    </div>
  )
}
