import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MethodDirectory } from '@/components/knowbots/method-directory'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('methods'), robots: { index: false, follow: false } }
}
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  await requireBrowserSession(locale, `/${locale}/methods`)
  const t = await getTranslations('nav')
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">{t('methods')}</h1>
      <MethodDirectory />
    </>
  )
}
