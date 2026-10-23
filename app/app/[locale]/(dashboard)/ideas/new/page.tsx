import { redirect } from '@/i18n/navigation'

// 提交一个创意搬到了 /applications/new（SDD 0037）
export default async function OldPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: '/applications/new', locale })
}
