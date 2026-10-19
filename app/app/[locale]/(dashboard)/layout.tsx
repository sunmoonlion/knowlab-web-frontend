import { WebShell } from '@/components/shell/web-shell'
import { signedInName } from '@/components/auth/signed-in-as'
import { requireBrowserSession } from '@/lib/server/auth-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 登录后的各页共用一套外壳（SDD 0037 §四）：左边一级导航、顶上一行写着登录的是谁和退出
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await requireBrowserSession(locale)

  return (
    <WebShell
      locale={locale}
      csrfToken={session.csrf_token}
      userLabel={signedInName(session.user)}
      email={session.user.email}
    >
      {children}
    </WebShell>
  )
}
