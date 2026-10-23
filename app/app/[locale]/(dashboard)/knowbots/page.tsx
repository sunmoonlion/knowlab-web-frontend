import { redirect } from '@/i18n/navigation'

// 更早的「我在做的专家」页（SDD 0037 第九节）：跳到「申请」
export default async function OldPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: '/applications', locale })
}
