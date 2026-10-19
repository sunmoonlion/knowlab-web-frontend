import { CommonReference } from '@/components/common/common-reference'
import { FeedbackProvider } from '@/components/common/common-kernel'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CommonToolkitPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  await requireBrowserSession(locale)
  return (
    // 外壳已有 <main>（SDD 0037）：这里不再套一层
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Frontend Common Kernel</h1>
        <p className="text-muted-foreground mt-2">
          Neutral, adapter-driven capabilities shared with the Admin surface.
        </p>
      </div>
      <FeedbackProvider><CommonReference /></FeedbackProvider>
    </div>
  )
}
