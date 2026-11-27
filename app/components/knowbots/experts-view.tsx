'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { ExpertItem } from '@/contracts/knowbots'
import { fetchExperts, stopExpert } from '@/lib/knowbots/client'

import { AskInKnowbench } from './ask-in-knowbench'
import { Badge, Card, ColumnLayout, EXPERT_TONE, KEY } from './shared'

const FILTERS = ['usable'] as const
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
      defaultFilter="usable"
      items={items}
      categoryOf={() => 'usable'}
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
            <Badge tone={EXPERT_TONE.listed}>{t('expertStage.listed')}</Badge>
          </span>
          <span className="text-muted-foreground mt-1 block text-xs">
            {t('expertVersion', { version: item.version })}
          </span>
        </>
      )}
    >
      {(current) =>
        current ? <ExpertPage key={current.expert_id} item={current} csrfToken={csrfToken} /> : null
      }
    </ColumnLayout>
  )
}

function ExpertPage({ item, csrfToken }: { item: ExpertItem; csrfToken: string }) {
  const t = useTranslations('knowbots')
  const td = useTranslations('knowbots.delivery')
  const client = useQueryClient()
  const [reason, setReason] = useState('')
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
            <Badge tone={EXPERT_TONE.listed}>{t('expertStage.listed')}</Badge>
          </div>
        </header>
        <Card>
          <p>{t('experts.now.listed')}</p>
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
          <AskInKnowbench expert={item} name={item.name ?? item.title} />
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
        </Card>
      </section>
    </>
  )
}
