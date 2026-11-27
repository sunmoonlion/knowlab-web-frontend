import {
  BadgeCheck,
  ClipboardList,
  FileText,
  FlaskConical,
  Hammer,
  House,
  Library,
  PackageCheck,
  Sprout,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

// KnowLab Web 一级导航（正式方法优先 4 栏 + 历史兼容归档折叠组）：
// 主导航聚焦五要素正式方法孵化全链路：概览(/dashboard) · 方法工坊(/studio) · 方法与技能(/methods) · 授权资料(/knowledge)；
// 仍在有效期内的历史 SCHEMA_V3 流程页收折在底部「历史兼容归档」折叠组中。
export type WebNavigationKey =
  | 'dashboard'
  | 'studio'
  | 'methods'
  | 'knowledge'
  | 'applications'
  | 'incubation'
  | 'tests'
  | 'delivery'
  | 'review'
  | 'experts'

export type WebNavigationGroup = 'primary' | 'archive'

export type WebNavigationItem = {
  key: WebNavigationKey
  path: string
  icon: LucideIcon
  group: WebNavigationGroup
}

export const webNavigation: readonly WebNavigationItem[] = [
  { key: 'dashboard', path: '/dashboard', icon: House, group: 'primary' },
  { key: 'studio', path: '/studio', icon: Hammer, group: 'primary' },
  { key: 'methods', path: '/methods', icon: Wrench, group: 'primary' },
  { key: 'knowledge', path: '/knowledge', icon: Library, group: 'primary' },
  { key: 'applications', path: '/applications', icon: FileText, group: 'archive' },
  { key: 'incubation', path: '/incubation', icon: Sprout, group: 'archive' },
  { key: 'tests', path: '/tests', icon: FlaskConical, group: 'archive' },
  { key: 'delivery', path: '/delivery', icon: PackageCheck, group: 'archive' },
  { key: 'review', path: '/review', icon: ClipboardList, group: 'archive' },
  { key: 'experts', path: '/experts', icon: BadgeCheck, group: 'archive' },
]

export const webNavigationGroups: readonly WebNavigationGroup[] = ['primary', 'archive']

/** 当前路径属于哪一项（/studio/[id] 算方法工坊）；不在导航里的返回 undefined。 */
export function findNavigationItem(pathname: string) {
  const path = pathname.replace(/^\/(?:en|zh-CN)(?=\/|$)/, '') || '/'
  return webNavigation.find((item) => path === item.path || path.startsWith(`${item.path}/`))
}
