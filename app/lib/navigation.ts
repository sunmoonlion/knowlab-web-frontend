import { BadgeCheck, ClipboardList, Database, FileText, House, type LucideIcon } from 'lucide-react'

// web端一级导航（SDD 0037 第八节）：按用户的事排——申请 · 审核 · 专家；「审核」数要你做的，
// 「专家」数新交回的。没有多页签。导航项只叫「专家」，不叫「我的专家」（所有者 2026-10-18）。
// 知识库（测试用的数据）照旧在最后。
export type WebNavigationItem = {
  key: 'dashboard' | 'applications' | 'review' | 'experts' | 'data'
  path: string
  icon: LucideIcon
}

export const webNavigation: readonly WebNavigationItem[] = [
  { key: 'dashboard', path: '/dashboard', icon: House },
  { key: 'applications', path: '/applications', icon: FileText },
  { key: 'review', path: '/review', icon: ClipboardList },
  { key: 'experts', path: '/experts', icon: BadgeCheck },
  { key: 'data', path: '/data', icon: Database },
]

/** 当前路径属于哪一项（/applications/new 算申请）；不在导航里的（如 /toolkit）返回 undefined。 */
export function findNavigationItem(pathname: string) {
  const path = pathname.replace(/^\/(?:en|zh-CN)(?=\/|$)/, '') || '/'
  return webNavigation.find((item) => path === item.path || path.startsWith(`${item.path}/`))
}
