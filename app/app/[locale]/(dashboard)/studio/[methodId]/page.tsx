import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MethodStudioEditor, type StudioResume } from '@/components/knowbots/method-studio'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('studio'), robots: { index: false, follow: false } }
}

export default async function StudioDetailPage({
  params,
  searchParams,
}: {
  searchParams: Promise<StudioResume>
  params: Promise<{ locale: string; methodId: string }>
}) {
  const { locale, methodId } = await params
  const query = Object.fromEntries(
    Object.entries(await searchParams).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
  const next = new URLSearchParams(query).toString()
  const session = await requireBrowserSession(
    locale,
    `/${locale}/studio/${encodeURIComponent(methodId)}${next ? '?' + next : ''}`,
  )
  const t = await getTranslations('studio')
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t('editorTitle')}</h1>
      <MethodStudioEditor methodId={methodId} csrfToken={session.csrf_token} resume={query} />
    </>
  )
}
