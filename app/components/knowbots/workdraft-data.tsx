'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CrossAppLink } from '@/components/common/cross-app-link'
import { Button } from '@/components/ui/button'
import type { Material } from '@/contracts/knowbots'
import type { DataFormat } from '@/contracts/workdraft'
import { fetchLibrary } from '@/lib/knowbots/client'

import { Card, KEY } from './shared'
import { LINK } from './workdraft-cells'

// 工作稿的「数据」一栏（专家孵化方案第 7.1 节「从我的知识库挑」）：只能从知识库栏里挑（你在 knowbase
// 展示给 knowlab 的资料）。挑的时候后端记下每份的格式（名字、文件类型、描述、就绪的读法）；AI 一轮交
// 给模型的就是这些，不给内容（第 8.2 节）。交付时挑的数据再冻结成绑定。挑数据不算你写的方法，不要出处。

/** 一份资料的描述，一行：主体 · 类型 · 期间。 */
export function describe(d: {
  subject?: string | null
  doc_type?: string | null
  period_start?: string | null
  period_end?: string | null
}): string {
  const period = [d.period_start, d.period_end].filter(Boolean).join(' ~ ')
  return [d.subject, d.doc_type, period].filter(Boolean).join(' · ')
}

export function DataCard({
  picks,
  formats,
  busy,
  error,
  onPick,
}: {
  picks: string[]
  formats: Record<string, DataFormat>
  busy: boolean
  error: string | null
  onPick: (picks: string[]) => void
}) {
  const t = useTranslations('workdraft.data')
  const [open, setOpen] = useState(false)
  return (
    <Card title={t('title')}>
      <p className="text-muted-foreground text-xs">{t('hint')}</p>
      {picks.length === 0 ? (
        <p className="text-muted-foreground">{t('none')}</p>
      ) : (
        <ul className="space-y-1" data-testid="data-picks">
          {picks.map((id) => {
            const fmt = formats[id]
            const name = fmt?.name ?? id
            return (
              <li key={id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{name}</span>
                {fmt ? (
                  <span className="text-muted-foreground text-xs">
                    {[
                      describe(fmt.description),
                      fmt.readings.length ? t('readings', { list: fmt.readings.join('、') }) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={LINK}
                  disabled={busy}
                  aria-label={t('remove', { id: name })}
                  onClick={() => onPick(picks.filter((p) => p !== id))}
                >
                  {t('drop')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {open ? (
        <Picker
          picks={picks}
          busy={busy}
          onPick={(id) => onPick([...picks, id])}
          onClose={() => setOpen(false)}
        />
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}>
          {t('add')}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </Card>
  )
}

function Picker({
  picks,
  busy,
  onPick,
  onClose,
}: {
  picks: string[]
  busy: boolean
  onPick: (id: string) => void
  onClose: () => void
}) {
  const t = useTranslations('workdraft.data')
  const library = useQuery({ queryKey: [...KEY, 'library'], queryFn: fetchLibrary })
  const left: Material[] = (library.data ?? []).filter((m) => !picks.includes(m.material_id))
  return (
    <div className="space-y-2 rounded-lg border p-3" data-testid="data-picker">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">{t('pickTitle')}</p>
        <button type="button" className={LINK} onClick={onClose}>
          {t('close')}
        </button>
      </div>
      {library.isPending ? (
        <p className="text-muted-foreground">{t('loading')}</p>
      ) : library.isError ? (
        <p className="text-destructive">{t('loadFailed')}</p>
      ) : left.length === 0 ? (
        <p className="text-muted-foreground">
          {library.data?.length ? t('allPicked') : t('empty')}{' '}
          <CrossAppLink to="knowbase.library" className="underline underline-offset-2">
            {t('toKnowbase')}
          </CrossAppLink>
        </p>
      ) : (
        <ul className="space-y-1">
          {left.map((m) => (
            <li key={m.material_id} className="flex flex-wrap items-baseline gap-x-2">
              <span>{m.name}</span>
              <span className="text-muted-foreground text-xs">{describe(m.description)}</span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={busy}
                onClick={() => onPick(m.material_id)}
              >
                {t('pick')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
