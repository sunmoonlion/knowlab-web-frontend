import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { MyQuestions } from '@/components/knowbots/my-questions'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav')
  return { title: t('questions'), robots: { index: false, follow: false } }
}

// 待我回答（SDD 0037 §四.2）：全部要我答的问题，按创意分组
export default async function QuestionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const session = await requireBrowserSession(locale, `/${locale}/questions`)
  const t = await getTranslations('nav')
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t('questions')}</h1>
      <MyQuestions csrfToken={session.csrf_token} />
    </>
  )
}
