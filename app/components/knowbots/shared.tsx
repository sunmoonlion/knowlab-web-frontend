'use client'

import { useFormatter } from 'next-intl'

import { cn } from '@/lib/utils'

export const KEY = ['web', 'knowbots'] as const

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

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap', TONE[tone])}>
      {children}
    </span>
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
