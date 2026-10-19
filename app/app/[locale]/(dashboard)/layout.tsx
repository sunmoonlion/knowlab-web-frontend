import { WebShell } from '@/components/shell/web-shell'
import { signedInName } from '@/components/auth/signed-in-as'
import { getBrowserSession } from '@/lib/server/auth-session'

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
  // 外壳只读会话用来显示，不在这里逼登录：各页自己带着「登录完回到哪」去登录，外壳先跳
  // 就把那一页丢了（审读 10-19 第 16 条）
  const session = await getBrowserSession()
  if (!session) return children

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
