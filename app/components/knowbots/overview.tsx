'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { fetchApplications, fetchExperts, fetchInbox } from '@/lib/knowbots/client'

import { summaryParts } from './name-view'
import { keyOf } from './review-view'
import { Card, KEY } from './shared'

// 首页（SDD 0037 第八节）：进来先知道到哪了、要我做什么。顶上一条「你的创意『…』测试通过了，
// 去确认」，直达审核里那一条；下面是要我做的、在做的申请、能用的专家，各几条。

const FEW = 5

export function Overview() {
  const t = useTranslations('knowbots')
  const inbox = useQuery({ queryKey: [...KEY, 'inbox'], queryFn: fetchInbox })
  const applications = useQuery({ queryKey: [...KEY, 'applications'], queryFn: fetchApplications })
  const experts = useQuery({ queryKey: [...KEY, 'experts'], queryFn: fetchExperts })
  const todo = (inbox.data?.items ?? []).filter((i) => i.state === 'todo')
  const returned = todo.filter((i) => i.type === 'expert')
  const working = (applications.data ?? []).filter((a) => a.category === 'working')
  const usable = (experts.data ?? []).filter((e) => e.category === 'usable')
  return (
    <div className="mt-6 space-y-4">
      {returned.map((item) => (
        <p
          key={keyOf(item)}
          role="status"
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-950"
        >
          <Link
            href={{ pathname: '/review', query: { item: keyOf(item) } }}
            className="font-medium underline underline-offset-2"
          >
            {t('home.passed', { title: item.title })}
          </Link>
        </p>
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('home.todo')} className={todo.length > 0 ? 'border-amber-300' : undefined}>
          {inbox.isError ? (
            <p className="text-destructive">{t('loadFailed')}</p>
          ) : inbox.isPending ? (
            <p className="text-muted-foreground">{t('loading')}</p>
          ) : todo.length === 0 ? (
            <p className="text-muted-foreground">{t('home.todoNone')}</p>
          ) : (
            <>
              <p>{t('home.todoSome', { n: todo.length })}</p>
              <ul className="space-y-1">
                {todo.slice(0, 3).map((item) => (
                  <li key={keyOf(item)} className="truncate">
                    <span className="text-muted-foreground">{item.title} · </span>
                    {item.type === 'question'
                      ? item.text
                      : item.type === 'draft'
                        ? t('home.reviewDraft', { label: item.label })
                        : t('home.decideExpert', { version: item.version })}
                  </li>
                ))}
              </ul>
              <Link href="/review" className="font-medium underline underline-offset-2">
                {t('home.toReview')}
              </Link>
            </>
          )}
        </Card>
        <Card title={t('home.applications')}>
          {applications.isError ? (
            <p className="text-destructive">{t('loadFailed')}</p>
          ) : applications.isPending ? (
            <p className="text-muted-foreground">{t('loading')}</p>
          ) : working.length === 0 ? (
            <p className="text-muted-foreground">{t('home.applicationsNone')}</p>
          ) : (
            <ul className="space-y-2">
              {working.slice(0, FEW).map((a) => (
                <li key={a.request_id}>
                  <Link
                    href={`/names/${a.request_id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {a.title}
                  </Link>
                  <span className="text-muted-foreground block text-xs">
                    {summaryParts(a.summary, t).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/applications"
            className="text-muted-foreground text-xs underline underline-offset-2"
          >
            {t('home.allApplications')}
          </Link>
        </Card>
        <Card title={t('home.experts')}>
          {experts.isError ? (
            <p className="text-destructive">{t('loadFailed')}</p>
          ) : experts.isPending ? (
            <p className="text-muted-foreground">{t('loading')}</p>
          ) : usable.length === 0 ? (
            <p className="text-muted-foreground">{t('home.expertsNone')}</p>
          ) : (
            <ul className="space-y-1">
              {usable.slice(0, FEW).map((e) => (
                <li key={e.expert_id}>
                  <Link
                    href={{ pathname: '/experts', query: { item: e.expert_id } }}
                    className="underline-offset-2 hover:underline"
                  >
                    {e.name ?? e.title}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {' '}
                    · {t('expertVersion', { version: e.version })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
