'use client'

import { useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'

import type { KnowbotDraft, KnowbotRequest, MyQuestion } from '@/contracts/knowbots'
import { fetchMyKnowbots, fetchMyQuestions, fetchMyRequests } from '@/lib/knowbots/client'
import { cn } from '@/lib/utils'

// 创意、分身、专家几页共用（SDD 0037 §四）：同一份数据（我的创意连同各个分身、要我答的问题），
// 各页按自己的事排；状态用用户的说法。查询键相同，切页不重复取。
export const MY_REQUESTS_KEY = ['web', 'knowbot-requests'] as const
export const QUESTIONS_KEY = ['web', 'knowbot-questions'] as const
export const KNOWBOTS_KEY = ['web', 'knowbots'] as const

export type Translate = ReturnType<typeof useTranslations<'knowbots'>>

// 创意（用户的说法）：已提交等孵化 · 分身在做 · 等你回答 · 没通过在改 · 已出专家
export type IdeaStatus = 'hatching' | 'working' | 'waiting' | 'failed' | 'expert'
// 分身（用户的说法）：孵化中留给将来的孵化记录，现在走不到
export type AvatarStatus =
  | 'hatching'
  | 'pending'
  | 'testing'
  | 'waiting'
  | 'failed'
  | 'passed'
  | 'delivered'

export type Idea = {
  request: KnowbotRequest
  drafts: KnowbotDraft[] // 新的在前
  latest: KnowbotDraft | undefined
  status: IdeaStatus
  questions: MyQuestion[]
}

export type Avatar = {
  draft: KnowbotDraft
  request: KnowbotRequest
  status: AvatarStatus
  latest: boolean // 是这个创意最新的分身
  questions: MyQuestion[]
}

export function newestFirst(a: KnowbotDraft, b: KnowbotDraft): number {
  return Number(b.version) - Number(a.version) || b.revision - a.revision
}

// 问题带着它是哪个分身的（draft_id）；旧后端没有时才按创意标题与分身编号对
function asksOf(asks: MyQuestion[], title: string, draft: KnowbotDraft): MyQuestion[] {
  return asks.filter((q) =>
    q.draft_id
      ? q.draft_id === draft.draft_id
      : q.title === title && q.version === draft.version && q.revision === draft.revision,
  )
}

export function avatarStatusOf(draft: KnowbotDraft, asks: MyQuestion[]): AvatarStatus {
  if (asks.length > 0) return 'waiting'
  if (draft.status === 'pending_test') return 'pending'
  return draft.status
}

function ideaStatusOf(latest: KnowbotDraft | undefined, asks: MyQuestion[]): IdeaStatus {
  if (asks.length > 0) return 'waiting'
  if (!latest) return 'hatching'
  if (latest.status === 'failed') return 'failed'
  return latest.status === 'delivered' ? 'expert' : 'working'
}

export function useMyQuestions() {
  return useQuery({ queryKey: QUESTIONS_KEY, queryFn: fetchMyQuestions })
}

export function useMyKnowbots() {
  return useQuery({ queryKey: KNOWBOTS_KEY, queryFn: fetchMyKnowbots })
}

/** 我的创意与分身，连同各自要我答的问题。问题取不到不挡页面（当作没有）。 */
export function useMine() {
  const requests = useQuery({ queryKey: MY_REQUESTS_KEY, queryFn: fetchMyRequests })
  const questions = useMyQuestions()
  const asks = questions.data ?? []
  const ideas: Idea[] = []
  const avatars: Avatar[] = []
  for (const request of requests.data?.requests ?? []) {
    const drafts = [...request.drafts].sort(newestFirst)
    const latest = drafts[0]
    const theirs = drafts.flatMap((d) => asksOf(asks, request.title, d))
    ideas.push({
      request,
      drafts,
      latest,
      status: ideaStatusOf(latest, theirs),
      questions: theirs,
    })
    for (const draft of drafts) {
      const mine = asksOf(asks, request.title, draft)
      avatars.push({
        draft,
        request,
        status: avatarStatusOf(draft, mine),
        latest: draft.draft_id === latest?.draft_id,
        questions: mine,
      })
    }
  }
  ideas.sort((a, b) => (b.request.created_at ?? '').localeCompare(a.request.created_at ?? ''))
  return {
    ideas,
    avatars,
    questions: asks,
    error: requests.error,
    pending: requests.isPending,
  }
}

/** 「分身 1.3」 */
export function avatarName(t: Translate, draft: { version: string; revision: number }): string {
  return t('avatar', { version: draft.version, revision: draft.revision })
}

/** 结果一句：「2/3 条用例通过」；还没有测完的用例就没有。 */
export function casesLine(t: Translate, draft: KnowbotDraft): string | null {
  const cases = draft.report?.cases ?? []
  if (cases.length === 0) return null
  return t('casesPassed', {
    met: cases.filter((c) => c.status === 'passed').length,
    total: cases.length,
  })
}

/** 「你的第 2 条用例」：按创意里用例的先后数；不知道用例时按 c2 这样的编号数，再不行写编号。 */
export function caseName(t: Translate, caseId: string, cases?: Record<string, unknown>[]): string {
  const at = cases?.findIndex((c) => c.case_id === caseId) ?? -1
  if (at >= 0) return t('caseN', { n: at + 1 })
  const n = /^c(\d+)$/.exec(caseId)
  return n ? t('caseN', { n: Number(n[1]) }) : t('caseId', { id: caseId })
}

/** 用例里我问的那句话。 */
export function caseQuestion(raw: Record<string, unknown> | undefined): string | null {
  const input = (raw?.input ?? {}) as { question?: unknown }
  return typeof input.question === 'string' ? input.question : null
}

export function useWhen() {
  const format = useFormatter()
  return (at: string | null | undefined) =>
    at ? format.dateTime(new Date(at), { dateStyle: 'short', timeStyle: 'short' }) : null
}

const TONE = {
  muted: 'bg-muted text-muted-foreground',
  todo: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  running: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  bad: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
} as const

const IDEA_TONE: Record<IdeaStatus, keyof typeof TONE> = {
  hatching: 'muted',
  working: 'running',
  waiting: 'todo',
  failed: 'bad',
  expert: 'good',
}

const AVATAR_TONE: Record<AvatarStatus, keyof typeof TONE> = {
  hatching: 'muted',
  pending: 'muted',
  testing: 'running',
  waiting: 'todo',
  failed: 'bad',
  passed: 'good',
  delivered: 'good',
}

export function Badge({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap', TONE[tone])}>
      {children}
    </span>
  )
}

export function IdeaBadge({ status }: { status: IdeaStatus }) {
  const t = useTranslations('knowbots')
  return <Badge tone={IDEA_TONE[status]}>{t(`ideaStatus.${status}`)}</Badge>
}

export function AvatarBadge({ status }: { status: AvatarStatus }) {
  const t = useTranslations('knowbots')
  return <Badge tone={AVATAR_TONE[status]}>{t(`avatarStatus.${status}`)}</Badge>
}

/** 一串步骤，走到第 at 步（从 0 起，等于步数即全走完）；bad 时当前那一步标红。 */
export function Progress({
  steps,
  at,
  bad,
  label,
}: {
  steps: readonly string[]
  at: number
  bad?: boolean
  label: string
}) {
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2 text-xs" aria-label={label}>
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span
            aria-current={i === at ? 'step' : undefined}
            className={cn(
              'rounded-full border px-2.5 py-1',
              i < at && 'border-emerald-300 text-emerald-800 dark:text-emerald-300',
              i === at &&
                (bad
                  ? 'border-red-400 font-medium text-red-800 dark:text-red-300'
                  : 'border-primary bg-primary text-primary-foreground font-medium'),
              i > at && 'text-muted-foreground',
            )}
          >
            {i < at ? '✓ ' : ''}
            {s}
          </span>
          {i < steps.length - 1 ? <span className="text-muted-foreground">→</span> : null}
        </li>
      ))}
    </ol>
  )
}

/** 列表里的一行。 */
export function Row({
  selected,
  onPick,
  children,
}: {
  selected: boolean
  onPick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onPick}
      className={cn(
        'bg-card w-full rounded-lg border p-3 text-left text-sm transition-colors',
        selected ? 'border-primary ring-primary/30 ring-2' : 'hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}

/** 主栏里的一块。 */
export function Card({
  title,
  children,
  className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={cn('bg-card space-y-3 rounded-xl border p-4 text-sm shadow-sm', className)}
    >
      {title ? <h3 className="font-medium">{title}</h3> : null}
      {children}
    </section>
  )
}
