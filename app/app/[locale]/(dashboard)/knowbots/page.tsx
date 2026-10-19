import { redirect } from '@/i18n/navigation'

// 旧的「我在做的专家」页拆成了创意、分身、专家、我的数据几页（SDD 0037）：旧链接转到创意
export default async function KnowbotsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  redirect({ href: '/ideas', locale })
}
