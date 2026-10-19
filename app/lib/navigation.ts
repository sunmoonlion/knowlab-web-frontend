import {
  BadgeCheck,
  Bot,
  Database,
  House,
  Lightbulb,
  MessageCircleQuestionMark,
  type LucideIcon,
} from 'lucide-react'

// web端一级导航（SDD 0037 §四.2）：按用户的事排，「待我回答」带数字。没有多页签。
// 列表直接写专家名，导航项只叫「专家」，不叫「我的专家」「我的分身」（所有者 2026-10-18）。
export type WebNavigationItem = {
  key: 'dashboard' | 'questions' | 'ideas' | 'avatars' | 'experts' | 'data'
  path: string
  icon: LucideIcon
}

export const webNavigation: readonly WebNavigationItem[] = [
  { key: 'dashboard', path: '/dashboard', icon: House },
  { key: 'questions', path: '/questions', icon: MessageCircleQuestionMark },
  { key: 'ideas', path: '/ideas', icon: Lightbulb },
  { key: 'avatars', path: '/avatars', icon: Bot },
  { key: 'experts', path: '/experts', icon: BadgeCheck },
  { key: 'data', path: '/data', icon: Database },
]

/** 当前路径属于哪一项（/ideas/new 算创意）；不在导航里的（如 /toolkit）返回 undefined。 */
export function findNavigationItem(pathname: string) {
  const path = pathname.replace(/^\/(?:en|zh-CN)(?=\/|$)/, '') || '/'
  return webNavigation.find((item) => path === item.path || path.startsWith(`${item.path}/`))
}
