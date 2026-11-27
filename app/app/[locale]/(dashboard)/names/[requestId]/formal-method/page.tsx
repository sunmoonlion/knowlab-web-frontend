import { redirect } from 'next/navigation'

export default async function FormalMethodBookmark({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; requestId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale, requestId } = await params
  const previous = await searchParams
  const query = new URLSearchParams({ workdraft: requestId })
  for (const key of ['method', 'run', 'revision', 'version', 'execution']) {
    if (typeof previous[key] === 'string') query.set(key, previous[key])
  }
  redirect(`/${locale}/studio?${query}`)
}
