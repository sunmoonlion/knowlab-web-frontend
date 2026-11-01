'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { ExpertItem } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'
import { fetchDetail, fetchExperts, stopExpert } from '@/lib/knowbots/client'

import { AskInKnowbench } from './ask-in-knowbench'
import { Badge, Card, ColumnLayout, EXPERT_TONE, KEY, useWhen } from './shared'
import { SidePanel } from './side-panel'
import { TestResults } from './test-results'

// 专家（SDD 0037 第八节）：成品，唯一不是过程的一栏，列我看得到的各版（平台孵化、平台测的交回了才
// 看得到）。待提交的去「交付」提交（SDD 0046 第五节）；审过就能在 knowbench 工作台请；能用的可以停用。
// 请专家在 knowbench 工作台：能用的那一版给一个去工作台的链接（没配工作台地址时只写一句怎么去）。

const FILTERS = ['new', 'accepted', 'usable', 'stopped', 'not_listed'] as const
type Filter = (typeof FILTERS)[number]

export function ExpertsView({
  csrfToken,
  picked: initial,
}: {
  csrfToken: string
  picked?: string
}) {
  const t = useTranslations('knowbots')
  const list = useQuery({ queryKey: [...KEY, 'experts'], queryFn: fetchExperts })
  const [picked, setPicked] = useState<string | null>(initial ?? null)
  const items = list.data ?? []
  return (
    <ColumnLayout<Filter, ExpertItem>
      title={t('columns.experts')}
      filters={FILTERS}
      defaultFilter={items.some((i) => i.category === 'new') ? 'new' : 'usable'}
      items={items}
      categoryOf={(item) => item.category}
      keyOf={(item) => item.expert_id}
      picked={picked}
      onPick={setPicked}
      empty={items.length === 0 ? t('experts.empty') : t('empty')}
      failed={list.isError}
      pending={list.isPending}
      renderRow={(item) => (
        <>
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">{item.name ?? item.title}</span>
            <Badge tone={EXPERT_TONE[item.stage]}>{t(`expertStage.${item.stage}`)}</Badge>
          </span>
          <span className="text-muted-foreground mt-1 block text-xs">
            {t('expertVersion', { version: item.version })}
          </span>
        </>
      )}
    >
      {(current) =>
        current ? (
          <ExpertPage
            key={current.expert_id}
            item={current}
            versions={items.filter((i) => i.request_id === current.request_id)}
            csrfToken={csrfToken}
          />
        ) : null
      }
    </ColumnLayout>
  )
}

function ExpertPage({
  item,
  versions,
  csrfToken,
}: {
  item: ExpertItem
  versions: ExpertItem[]
  csrfToken: string
}) {
  const t = useTranslations('knowbots')
  const td = useTranslations('knowbots.delivery')
  const when = useWhen()
  const client = useQueryClient()
  const [reason, setReason] = useState('')
  const detail = useQuery({
    queryKey: [...KEY, 'detail', item.request_id],
    queryFn: () => fetchDetail(item.request_id),
  })
  const test = detail.data?.tests.find((x) => x.test_id === item.test_id)
  const draft = detail.data?.drafts.find((d) => d.draft_id === item.draft_id)
  const version = detail.data?.versions.find((v) => v.version === draft?.request_version)
  const stop = useMutation({
    mutationFn: () => stopExpert(item.expert_id, reason.trim(), csrfToken),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  })
  return (
    <>
      <section aria-label={item.name ?? item.title} className="min-w-0 flex-1 space-y-4">
        <header className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">
              {item.name ?? item.title} · {t('expertVersion', { version: item.version })}
            </h2>
            <Badge tone={EXPERT_TONE[item.stage]}>{t(`expertStage.${item.stage}`)}</Badge>
          </div>
          <Link href={`/names/${item.request_id}`} className="text-sm underline underline-offset-2">
            {t('toName')}
          </Link>
        </header>
        <Card>
          <p>
            {item.stage === 'rejected'
              ? t('experts.now.rejected', { reason: item.review_reason ?? '' })
              : t(`experts.now.${item.stage}`)}
          </p>
          {item.market_status === 'held' ? (
            <p className="text-destructive text-xs" role="status">
              {td('held', {
                reason: td.has(`heldReason.${item.held_reason}`)
                  ? td(`heldReason.${item.held_reason}`)
                  : (item.held_reason ?? ''),
              })}
            </p>
          ) : null}
          {item.trial ? (
            <p className="text-muted-foreground text-xs">{t('experts.trial')}</p>
          ) : null}
          {item.stage === 'awaiting_user' ||
          (item.stage === 'listed' && item.review_listing === 'self') ? (
            <Link
              href={{ pathname: '/delivery', query: { item: item.expert_id } }}
              className="font-medium underline underline-offset-2"
            >
              {item.stage === 'listed' ? t('experts.toPublic') : t('experts.toDelivery')}
            </Link>
          ) : null}
          {item.stage === 'listed' ? (
            <>
              <AskInKnowbench
                expert={item}
                origin={detail.data?.origin}
                name={item.name ?? item.title}
              />
              <label className="block">
                {t('experts.stopReason')}
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {stop.isError ? (
                <p className="text-destructive" role="alert">
                  {t('experts.stopFailed')}
                </p>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                disabled={stop.isPending || !reason.trim()}
                onClick={() => stop.mutate()}
              >
                {t('experts.stop')}
              </Button>
            </>
          ) : null}
          {item.stopped_at ? (
            <p className="text-muted-foreground text-xs">
              {t('experts.stoppedAt', {
                at: when(item.stopped_at) ?? '—',
                reason: item.stop_reason ?? '',
              })}
            </p>
          ) : null}
        </Card>
        {test ? <TestResults test={test} cases={version?.cases} /> : null}
      </section>
      <SidePanel
        label={t('experts.versions')}
        tabs={[
          {
            key: 'versions',
            label: t('experts.versions'),
            count: versions.length,
            content: (
              <ul className="space-y-2">
                {versions.map((v) => (
                  <li key={v.expert_id} className="flex flex-wrap items-center gap-2">
                    <span className={v.expert_id === item.expert_id ? 'font-medium' : undefined}>
                      {t('expertVersion', { version: v.version })}
                    </span>
                    <Badge tone={EXPERT_TONE[v.stage]}>{t(`expertStage.${v.stage}`)}</Badge>
                    <span className="text-muted-foreground text-xs">{when(v.returned_at)}</span>
                  </li>
                ))}
              </ul>
            ),
          },
        ]}
      />
    </>
  )
}
