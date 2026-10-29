'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import type { Detail, Event, Summary } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import { fetchDetail } from '@/lib/knowbots/client'

import { IncubationMode } from './incubation-mode'
import { PlatformView } from './platform-asks'
import { AmendmentList } from './reference'
import { SelfTests } from './self-test'
import { Card, KEY, useWhen, type Translate } from './shared'

// 一个名称的详情页（SDD 0037 第九节）：顶上一行每个过程最新的一项；平台孵化时有平台视图（0046
// 第四节）；「孵化」栏进工作稿（专家孵化方案第六节）；左边栏的孵化、测试、交付是同一批东西的另一种入口；下面按时间排的记录，每条写哪个过程、输入、输出、何时，点了去那一栏看。没交回
// 我的专家不列；谁做的不写。

export function NameView({
  requestId,
  csrfToken,
  published,
}: {
  requestId: string
  csrfToken?: string
  published?: string
}) {
  const t = useTranslations('knowbots')
  const detail = useQuery({
    queryKey: [...KEY, 'detail', requestId],
    queryFn: () => fetchDetail(requestId),
  })
  if (detail.isError)
    return (
      <p className="text-destructive mt-6 text-sm" role="alert">
        {t('loadFailed')}
      </p>
    )
  if (detail.isPending) return <p className="text-muted-foreground mt-6 text-sm">{t('loading')}</p>
  const life = detail.data
  return (
    <div className="mt-6 space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{life.title}</h2>
        <p className="text-sm font-medium" aria-label={t('name.summary')}>
          {summaryParts(life.summary, t).join(' · ')}
        </p>
      </header>
      {published ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {t('name.published', { label: published })}
        </p>
      ) : null}
      {/* 自己来还是请平台（SDD 0046 第四节）：切换不跳转 */}
      {csrfToken ? <IncubationMode life={life} csrfToken={csrfToken} /> : null}
      {/* 平台视图：进度、在等你什么、平台人员问了什么 */}
      {life.incubation_mode === 'platform' || life.platform_asks.length ? (
        <PlatformView life={life} progress={summaryParts(life.summary, t).join(' · ')} />
      ) : null}
      {/* 孵化栏（专家孵化方案第六节）：点进去是这个专家的工作稿 */}
      <Card title={t('name.incubation')}>
        <p className="text-muted-foreground">{t('name.incubationHint')}</p>
        <Link
          href={`/names/${requestId}/workdraft`}
          className="inline-block underline underline-offset-2"
        >
          {t('name.openWorkdraft')}
        </Link>
      </Card>
      {csrfToken ? <SelfTests life={life} csrfToken={csrfToken} /> : null}
      <Card title={t('name.timeline')}>
        <Timeline life={life} />
        {life.tests.some((x) => x.backfilled) ? (
          <p className="text-muted-foreground text-xs">{t('name.backfilled')}</p>
        ) : null}
      </Card>
      {life.amendments.length > 0 ? (
        <Card title={t('tabs.amendments')}>
          <AmendmentList amendments={life.amendments} />
        </Card>
      ) : null}
    </div>
  )
}

/** 顶上一行：每个过程最新的一项（创意 v3 · 受理了 · 准专家 1.3 · 测试 5 通过 · 专家第 1 版）。 */
export function summaryParts(summary: Summary, t: Translate): string[] {
  const parts = [t('ideaVersion', { version: summary.version })]
  parts.push(
    summary.acceptance ? t(`summary.${summary.acceptance}`) : t('summary.acceptancePending'),
  )
  if (summary.draft) parts.push(t('draftLabel', { label: summary.draft }))
  if (summary.test)
    parts.push(
      `${t('testNumber', { number: summary.test.number })} ${t(`testStatus.${summary.test.status}`)}`,
    )
  if (summary.expert)
    parts.push(
      `${t('expertVersion', { version: summary.expert.version })} · ${t(`expertStage.${summary.expert.stage}`)}`,
    )
  return parts
}

type Target = string | { pathname: string; query: Record<string, string> }

function targetOf(event: Event, life: Detail): Target | null {
  const s = (key: string) => (typeof event[key] === 'string' ? (event[key] as string) : '')
  switch (event.kind) {
    case 'version':
    case 'acceptance':
      return { pathname: '/applications', query: { item: life.request_id } }
    case 'review_requested':
    case 'review_answered':
      return { pathname: '/review', query: { item: s('draft_id') } }
    default:
      return s('expert_id') ? { pathname: '/experts', query: { item: s('expert_id') } } : null
  }
}

function Timeline({ life }: { life: Detail }) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  if (life.timeline.length === 0) return <p className="text-muted-foreground">—</p>
  return (
    <ol className="space-y-2">
      {life.timeline.map((event, i) => {
        const target = targetOf(event, life)
        const line = eventLine(event, t)
        return (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-muted-foreground w-36 shrink-0 text-xs">{when(event.at)}</span>
            {target ? (
              <Link href={target} className="underline underline-offset-2">
                {line}
              </Link>
            ) : (
              <span>{line}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** 一条记录的话（用户的说法）。 */
export function eventLine(event: Event, t: Translate): string {
  const v = (key: string) => {
    const value = event[key]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  }
  switch (event.kind) {
    case 'version':
      return v('version') === '1'
        ? t('event.submitted')
        : t('event.revised', { version: v('version') })
    case 'acceptance':
      return t(event.accepted ? 'event.accepted' : 'event.rejected', { version: v('version') })
    case 'draft':
      return t('event.draft', { version: v('request_version'), label: v('label') })
    case 'review_requested':
      return t('event.reviewRequested', { label: v('label') })
    case 'review_answered':
      return t(event.ok ? 'event.reviewOk' : 'event.reviewNotOk', { label: v('label') })
    case 'test_started':
      return t('event.testStarted', { label: v('label'), number: v('number') })
    case 'test_finished':
      return t('event.testFinished', {
        number: v('number'),
        status: t(`testStatus.${v('status')}` as never),
      })
    case 'expert':
      return t('event.expert', { number: v('test_number') || '—', version: v('version') })
    case 'returned':
      return t('event.returned', { version: v('version') })
    case 'user_decided':
      return t(event.accepted ? 'event.userAccepted' : 'event.userDeclined', {
        version: v('version'),
      })
    case 'reviewed':
      return event.approved
        ? t('event.approved', { version: v('version') })
        : t('event.reviewRejected', { version: v('version') })
    case 'listed':
      return t('event.listed', { version: v('version') })
    case 'stopped':
      return t('event.stopped', { version: v('version') })
    default:
      return event.kind
  }
}
