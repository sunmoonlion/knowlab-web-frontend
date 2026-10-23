'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import type { Application, Detail, Version } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import { acceptConsent, fetchApplications, fetchDetail } from '@/lib/knowbots/client'

import { summaryParts } from './name-view'
import { AmendmentList, Cases, Method } from './reference'
import { Badge, Card, ColumnLayout, KEY, useWhen, type Tone } from './shared'
import { SidePanel } from './side-panel'

// 申请（SDD 0037 第八节）：提交、修改创意，改一次出一个新版本，名称不变。右边是创意的各个版本
// 和每一版受理没有；不受理的写着理由，改了再交就是新版本。

const FILTERS = ['working', 'has_expert', 'rejected'] as const
type Filter = (typeof FILTERS)[number]

const TONE: Record<Filter, Tone> = { working: 'running', has_expert: 'good', rejected: 'bad' }

export function ApplicationsView({
  csrfToken,
  picked: initial,
}: {
  csrfToken: string
  picked?: string
}) {
  const t = useTranslations('knowbots')
  const list = useQuery({ queryKey: [...KEY, 'applications'], queryFn: fetchApplications })
  const [picked, setPicked] = useState<string | null>(initial ?? null)
  return (
    <ColumnLayout<Filter, Application>
      title={t('columns.applications')}
      filters={FILTERS}
      defaultFilter="working"
      items={list.data ?? []}
      categoryOf={(item) => item.category}
      keyOf={(item) => item.request_id}
      picked={picked}
      onPick={setPicked}
      empty={list.data?.length === 0 ? t('applications.empty') : t('empty')}
      failed={list.isError}
      pending={list.isPending}
      actions={
        <Link href="/applications/new" className={buttonVariants()}>
          {t('applications.new')}
        </Link>
      }
      renderRow={(item) => (
        <>
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">{item.title}</span>
            <Badge tone={TONE[item.category]}>{t(`categories.${item.category}`)}</Badge>
          </span>
          <span className="text-muted-foreground mt-1 block truncate text-xs">
            {summaryParts(item.summary, t).join(' · ')}
          </span>
        </>
      )}
    >
      {(current) =>
        current ? (
          <ApplicationProcess key={current.request_id} item={current} csrfToken={csrfToken} />
        ) : null
      }
    </ColumnLayout>
  )
}

function ApplicationProcess({ item, csrfToken }: { item: Application; csrfToken: string }) {
  const t = useTranslations('knowbots')
  const detail = useQuery({
    queryKey: [...KEY, 'detail', item.request_id],
    queryFn: () => fetchDetail(item.request_id),
  })
  const latest = detail.data?.versions.find((v) => v.version === item.latest_version)
  return (
    <>
      <section aria-label={item.title} className="min-w-0 flex-1 space-y-4">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">{item.title}</h2>
          <p className="text-muted-foreground text-sm">
            {summaryParts(item.summary, t).join(' · ')} ·{' '}
            <Link href={`/names/${item.request_id}`} className="underline underline-offset-2">
              {t('toName')}
            </Link>
          </p>
        </header>
        <ConsentNotice item={item} csrfToken={csrfToken} />
        <Card title={t('applications.now')}>
          <p>{latest ? acceptanceLine(latest, t) : t('loading')}</p>
          <Link
            href={`/applications/${item.request_id}/revise`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('applications.revise')}
          </Link>
          <p className="text-muted-foreground text-xs">{t('applications.reviseHint')}</p>
        </Card>
        {detail.isError ? <p className="text-destructive text-sm">{t('loadFailed')}</p> : null}
      </section>
      {detail.data ? (
        <SidePanel label={t('side.label')} tabs={versionTabs(detail.data, t)} />
      ) : null}
    </>
  )
}

function acceptanceLine(version: Version, t: ReturnType<typeof useTranslations<'knowbots'>>) {
  const a = version.acceptance
  if (!a) return t('applications.pending', { version: version.version })
  if (!a.accepted)
    return t('applications.rejected', { version: version.version, reason: a.reason ?? '' })
  return t('applications.accepted', { version: version.version })
}

/** 右边：创意的各个版本（新的在前）、每一版受理没有；以前写的补充（只看）。 */
function versionTabs(detail: Detail, t: ReturnType<typeof useTranslations<'knowbots'>>) {
  const tabs = [
    {
      key: 'versions',
      label: t('tabs.versions'),
      count: detail.versions.length,
      content: <Versions versions={detail.versions} />,
    },
  ]
  if (detail.amendments.length > 0)
    tabs.push({
      key: 'amendments',
      label: t('tabs.amendments'),
      count: detail.amendments.length,
      content: <AmendmentList amendments={detail.amendments} />,
    })
  return tabs
}

function Versions({ versions }: { versions: Version[] }) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  return (
    <ul className="space-y-3">
      {[...versions].reverse().map((v, i) => (
        <li key={v.version}>
          <details open={i === 0} className="rounded-lg border">
            <summary className="cursor-pointer px-3 py-2">
              <span className="font-medium">{t('ideaVersion', { version: v.version })}</span>
              <span className="text-muted-foreground ml-2 text-xs">
                {when(v.created_at)} · {acceptanceLine(v, t)}
              </span>
            </summary>
            <div className="space-y-4 border-t p-3">
              <Method idea={v.idea} />
              <Cases cases={v.cases} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  )
}

/** 这个创意是在旧的测试数据说明下提交的：同意新说明之前，测试产出不取、不显示（审读 10-19）。 */
function ConsentNotice({ item, csrfToken }: { item: Application; csrfToken: string }) {
  const t = useTranslations('knowbots')
  const client = useQueryClient()
  const accept = useMutation({
    mutationFn: () => acceptConsent(item.request_id, csrfToken),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  })
  if (item.consent_version >= item.consent_current) return null
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 p-4 text-sm" role="status">
      <p>{t('consent.needed')}</p>
      <p className="text-muted-foreground">{t('consent.text')}</p>
      {accept.isError ? (
        <p className="text-destructive" role="alert">
          {t('consent.failed')}
        </p>
      ) : null}
      <Button size="sm" disabled={accept.isPending} onClick={() => accept.mutate()}>
        {t('consent.accept')}
      </Button>
    </div>
  )
}
