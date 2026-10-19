import { redirect } from '@/i18n/navigation'

// 提交一个创意搬到了 /ideas/new（SDD 0037）
export default async function NewKnowbotRequestPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect({ href: '/ideas/new', locale })
}
