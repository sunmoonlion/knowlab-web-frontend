import { redirect } from '@/i18n/navigation'

// 旧的「待我回答」（SDD 0037 第八节）：问题都在「审核」里
export default async function OldPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: '/review', locale })
}
