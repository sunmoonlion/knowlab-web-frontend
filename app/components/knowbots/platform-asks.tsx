'use client'

import { useTranslations } from 'next-intl'

import type { Detail, PlatformAsk } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'

import { Badge, Card, useWhen } from './shared'

// 平台视图（SDD 0046 第四节「切换不跳转」：转平台后页面换成平台视图——进度、在等你什么、平台人员问了
// 什么）：只列平台那一头来的。在等你的放上面，点了去处理的那一页；处理过的照实写你怎么答的。

type Target = string | { pathname: string; query: Record<string, string> }

function targetOf(ask: PlatformAsk, requestId: string): Target {
  const item = ask.question_id ?? ask.draft_id ?? ask.expert_id
  if (ask.kind === 'proposal') return `/names/${requestId}/workdraft`
  return item ? { pathname: '/review', query: { item } } : '/review'
}

// progress：顶上那一行每个过程最新的一项（name-view 的 summaryParts 拼好传进来）
export function PlatformView({ life, progress }: { life: Detail; progress: string }) {
  const t = useTranslations('knowbots')
  const asks = life.platform_asks
  const open = asks.filter((a) => a.state === 'open')
  const done = asks.filter((a) => a.state === 'done').reverse()
  return (
    <Card title={t('platformView.title')}>
      <p data-testid="platform-progress">
        <span className="text-muted-foreground mr-1">{t('platformView.progress')}</span>
        {progress}
      </p>
      <section aria-label={t('platformView.waiting')} className="space-y-1">
        <h4 className="font-medium">{t('platformView.waiting')}</h4>
        {open.length === 0 ? (
          <p className="text-muted-foreground">{t('platformView.waitingNone')}</p>
        ) : (
          <AskList asks={open} requestId={life.request_id} />
        )}
      </section>
      {done.length ? (
        <details className="space-y-1">
          <summary className="cursor-pointer font-medium">
            {t('platformView.asked', { count: done.length })}
          </summary>
          <AskList asks={done} requestId={life.request_id} />
        </details>
      ) : null}
    </Card>
  )
}

function AskList({ asks, requestId }: { asks: PlatformAsk[]; requestId: string }) {
  const t = useTranslations('knowbots.platformView')
  const when = useWhen()
  return (
    <ul className="space-y-1.5" data-testid="platform-asks">
      {asks.map((ask, i) => (
        <li key={`${ask.kind}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
          <Badge tone={ask.state === 'open' ? 'todo' : 'muted'}>{t(`kind.${ask.kind}`)}</Badge>
          <Link href={targetOf(ask, requestId)} className="underline underline-offset-2">
            {ask.kind === 'review'
              ? t('review', { label: ask.label ?? '' })
              : ask.kind === 'expert'
                ? t('expert', { version: ask.label ?? '' })
                : (ask.text ?? '')}
          </Link>
          {ask.state === 'done' && ask.answer ? (
            <span className="text-muted-foreground text-xs">
              {t('answer', {
                answer:
                  ask.kind === 'question' || ask.kind === 'gap'
                    ? ask.answer
                    : t(`answers.${ask.answer}` as never),
              })}
            </span>
          ) : null}
          {ask.at ? <span className="text-muted-foreground text-xs">{when(ask.at)}</span> : null}
        </li>
      ))}
    </ul>
  )
}
