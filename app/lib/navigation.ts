import { Hammer, House, Library, Wrench, type LucideIcon } from 'lucide-react'

export type WebNavigationItem = {
  key: 'dashboard' | 'studio' | 'methods' | 'knowledge'
  path: string
  icon: LucideIcon
}

export const webNavigation: readonly WebNavigationItem[] = [
  { key: 'dashboard', path: '/dashboard', icon: House },
  { key: 'studio', path: '/studio', icon: Hammer },
  { key: 'methods', path: '/methods', icon: Wrench },
  { key: 'knowledge', path: '/knowledge', icon: Library },
]

export function findNavigationItem(pathname: string) {
  const path = pathname.replace(/^\/(?:en|zh-CN)(?=\/|$)/, '') || '/'
  return webNavigation.find((item) => path === item.path || path.startsWith(`${item.path}/`))
}
