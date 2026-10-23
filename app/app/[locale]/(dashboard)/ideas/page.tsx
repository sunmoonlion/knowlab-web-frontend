import { redirect } from '@/i18n/navigation'

// 旧的「创意」栏（SDD 0037 第九节）：?request=<id> 跳到「申请」里那一个
export default async function OldPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { locale } = await params
  const query = await searchParams
  redirect({
    href:
      typeof query.request === 'string'
        ? { pathname: '/applications', query: { item: query.request } }
        : '/applications',
    locale,
  })
}
