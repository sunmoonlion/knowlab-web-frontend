import {
  BadgeCheck,
  ClipboardList,
  FileText,
  FlaskConical,
  House,
  Library,
  PackageCheck,
  Sprout,
  type LucideIcon,
} from 'lucide-react'

// web端一级导航（SDD 0046 第六节）：首页之下，左边是过程——申请 · 孵化 · 测试 · 交付 · 待办，
// 右边是结果——专家 · 知识库；侧栏里上下两组。「待办」数要你做的，「专家」数新交回的。导航项只叫
// 「专家」，不叫「我的专家」（所有者 2026-10-18）。「知识库」只列你在 knowbase 展示给 knowlab 的
// 资料，在 knowbase 管（decisions ⑰：用户的数据在 knowbase）。名称页保留，各栏是另一种入口。
export type WebNavigationKey =
  | 'dashboard'
  | 'applications'
  | 'incubation'
  | 'tests'
  | 'delivery'
  | 'review'
  | 'experts'
  | 'knowledge'

export type WebNavigationGroup = 'home' | 'process' | 'results'

export type WebNavigationItem = {
  key: WebNavigationKey
  path: string
  icon: LucideIcon
  group: WebNavigationGroup
}

export const webNavigation: readonly WebNavigationItem[] = [
  { key: 'dashboard', path: '/dashboard', icon: House, group: 'home' },
  { key: 'applications', path: '/applications', icon: FileText, group: 'process' },
  { key: 'incubation', path: '/incubation', icon: Sprout, group: 'process' },
  { key: 'tests', path: '/tests', icon: FlaskConical, group: 'process' },
  { key: 'delivery', path: '/delivery', icon: PackageCheck, group: 'process' },
  { key: 'review', path: '/review', icon: ClipboardList, group: 'process' },
  { key: 'experts', path: '/experts', icon: BadgeCheck, group: 'results' },
  { key: 'knowledge', path: '/knowledge', icon: Library, group: 'results' },
]

export const webNavigationGroups: readonly WebNavigationGroup[] = ['home', 'process', 'results']

/** 当前路径属于哪一项（/applications/new 算申请）；不在导航里的（如 /toolkit、名称页）返回 undefined。 */
export function findNavigationItem(pathname: string) {
  const path = pathname.replace(/^\/(?:en|zh-CN)(?=\/|$)/, '') || '/'
  return webNavigation.find((item) => path === item.path || path.startsWith(`${item.path}/`))
}
