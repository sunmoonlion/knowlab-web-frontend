'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { Knowbot } from '@/contracts/knowbots'
import { Link } from '@/i18n/navigation'

import { Picker, rememberPick, type PickerGroup } from './picker'
import { Card, avatarName, useMyKnowbots, useWhen } from './shared'

// 专家（SDD 0037 §四.3）：测试通过、交付了的各版。列表直接写专家的名字，不叫「我的专家」（所有者 2026-10-18）。
// 请专家在 knowbench 工作台；这个应用还没有登记去工作台的链接，只写一句怎么去。

function expertName(k: Knowbot): string {
  return k.name ?? k.title
}

function newer(a: Knowbot, b: Knowbot): number {
  return (b.delivered_at ?? '').localeCompare(a.delivered_at ?? '')
}

export function ExpertsView({ picked: initial }: { picked?: string }) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  const list = useMyKnowbots()
  const [picked, setPicked] = useState<string | null>(initial ?? null)
  const experts = [...(list.data ?? [])].sort(newer)
  const current = experts.find((k) => k.draft_id === picked) ?? experts[0] ?? null
  const groups: PickerGroup[] = [
    {
      key: 'experts',
      label: t('experts.list'),
      items: experts.map((k) => {
        const at = when(k.delivered_at)
        return {
          id: k.draft_id,
          title: expertName(k),
          sub:
            t('experts.version', { version: k.version }) +
            (at ? ` · ${t('experts.deliveredAt', { at })}` : ''),
        }
      }),
    },
  ]

  return (
    <div className="mt-6 space-y-4">
      {list.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {t('loadFailed')}
        </p>
      ) : list.isPending ? (
        <p className="text-muted-foreground text-sm">{t('loading')}</p>
      ) : experts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('experts.empty')}</p>
      ) : (
        <>
          <Picker
            label={t('experts.list')}
            groups={groups}
            value={current?.draft_id ?? null}
            onPick={(id) => {
              setPicked(id)
              rememberPick({ draft: id })
            }}
          />
          {current ? (
            <div className="flex flex-col items-start gap-6 lg:flex-row">
              <Detail
                key={current.draft_id}
                expert={current}
                versions={experts.filter((k) => k.request_id === current.request_id)}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function Detail({ expert, versions }: { expert: Knowbot; versions: Knowbot[] }) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  const at = when(expert.delivered_at)
  return (
    <section aria-label={expertName(expert)} className="min-w-0 flex-1 space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{expertName(expert)}</h2>
        <p className="text-muted-foreground text-sm">
          {t('experts.version', { version: expert.version })}
          {at ? ` · ${t('experts.deliveredAt', { at })}` : ''}
        </p>
      </header>
      <Card>
        <p>
          {t('experts.fromIdea')}
          <Link
            href={{ pathname: '/ideas', query: { request: expert.request_id } }}
            className="underline underline-offset-2"
          >
            {expert.title}
          </Link>
        </p>
        <p>
          {t('experts.fromAvatar')}
          <Link
            href={{ pathname: '/avatars', query: { draft: expert.draft_id } }}
            className="underline underline-offset-2"
          >
            {avatarName(t, expert)}
          </Link>
        </p>
        <p className="text-muted-foreground">{t('experts.hint', { name: expertName(expert) })}</p>
      </Card>
      <Card title={t('experts.versions')}>
        <ul className="space-y-1">
          {versions.map((v) => {
            const vAt = when(v.delivered_at)
            return (
              <li key={v.draft_id}>
                {t('experts.version', { version: v.version })} · {avatarName(t, v)}
                {vAt ? ` · ${t('experts.deliveredAt', { at: vAt })}` : ''}
              </li>
            )
          })}
        </ul>
      </Card>
    </section>
  )
}
