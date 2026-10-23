'use client'

import { useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import type { ExpertStage, TestStatus } from '@/contracts/knowbots'
import { fetchCounts } from '@/lib/knowbots/client'
import { cn } from '@/lib/utils'

// 申请、审核、专家三栏与详情页共用（SDD 0037 第八、第九节）。状态用用户的说法。
export const KEY = ['web', 'knowbots'] as const

export type Translate = ReturnType<typeof useTranslations<'knowbots'>>

/** 左边栏旁的数：审核数「要你做的」，专家数「新交回」。取不到就不显示。 */
export function useCounts() {
  return useQuery({ queryKey: [...KEY, 'counts'], queryFn: fetchCounts })
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

export type Tone = keyof typeof TONE

export const TEST_TONE: Record<TestStatus, Tone> = {
  queued: 'running',
  running: 'running',
  waiting: 'todo',
  passed: 'good',
  failed: 'bad',
  platform_error: 'muted',
}

export const EXPERT_TONE: Record<ExpertStage, Tone> = {
  to_return: 'muted',
  awaiting_user: 'todo',
  declined: 'muted',
  to_review: 'running',
  rejected: 'bad',
  to_deliver: 'running',
  listed: 'good',
  stopped: 'muted',
}

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap', TONE[tone])}>
      {children}
    </span>
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

/** 大类：每类带条数。 */
function Filters<F extends string>({
  filters,
  value,
  onChange,
  count,
  label,
  name,
}: {
  filters: readonly F[]
  value: F
  onChange: (f: F) => void
  count: (f: F) => number
  label: string
  name: (f: F) => string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {filters.map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={value === f}
          onClick={() => onChange(f)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs',
            value === f ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent',
          )}
        >
          {name(f)} · {count(f)}
        </button>
      ))}
    </div>
  )
}

/**
 * 一栏的样子：左边大类与列表，中间是选中那一条，右边栏放结果。从别处点进来带着 picked：
 * 先落在它所在的大类。
 */
export function ColumnLayout<F extends string, I>({
  title,
  filters,
  defaultFilter,
  items,
  categoryOf,
  keyOf,
  picked,
  onPick,
  renderRow,
  empty,
  children,
  failed,
  pending,
  actions,
}: {
  title: string
  filters: readonly F[]
  defaultFilter: F
  items: I[]
  categoryOf: (item: I) => F
  keyOf: (item: I) => string
  picked: string | null
  onPick: (key: string) => void
  renderRow: (item: I) => React.ReactNode
  empty: string
  children: (current: I | null) => React.ReactNode
  failed: boolean
  pending: boolean
  actions?: React.ReactNode
}) {
  const t = useTranslations('knowbots')
  const [chosen, setChosen] = useState<F | null>(null)
  const pickedItem = items.find((item) => keyOf(item) === picked)
  const filter = chosen ?? (pickedItem ? categoryOf(pickedItem) : defaultFilter)
  const shown = items.filter((item) => categoryOf(item) === filter)
  const current =
    (pickedItem && categoryOf(pickedItem) === filter ? pickedItem : null) ?? shown[0] ?? null
  return (
    <div className="mt-6 space-y-4">
      {actions}
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {t('loadFailed')}
        </p>
      ) : pending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : (
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <aside aria-label={title} className="w-full space-y-3 lg:w-72 lg:shrink-0">
            <Filters
              filters={filters}
              value={filter}
              onChange={setChosen}
              count={(f) => items.filter((item) => categoryOf(item) === f).length}
              label={t('category')}
              name={(f) => t(`categories.${f}` as never)}
            />
            {shown.length === 0 ? (
              <p className="text-muted-foreground text-sm">{empty}</p>
            ) : (
              <ul className="space-y-2">
                {shown.map((item) => (
                  <li key={keyOf(item)}>
                    <Row
                      selected={current !== null && keyOf(item) === keyOf(current)}
                      onPick={() => onPick(keyOf(item))}
                    >
                      {renderRow(item)}
                    </Row>
                  </li>
                ))}
              </ul>
            )}
          </aside>
          {children(current)}
        </div>
      )}
    </div>
  )
}
