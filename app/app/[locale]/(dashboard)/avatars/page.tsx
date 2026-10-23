import { redirect } from '@/i18n/navigation'

// 旧的「分身」栏（SDD 0037 第九节）：分身就是准专家，跳到「申请」
export default async function OldPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: '/applications', locale })
}
