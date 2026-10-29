'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Detail, Grant } from '@/contracts/knowbots'
import { askPlatform, renewPlatform, takeBack } from '@/lib/knowbots/client'

import { Card, KEY, useWhen } from './shared'

// 孵化自己来还是请平台（SDD 0046 第四节）：名称页上标出现在的模式，切换不跳转——
// 「请平台孵化」弹确认框写明平台会看到什么、到什么时候、用谁的 key、谁出钱，同意就是本人授权；
// 「我自己来」平台的授权立即撤销，顶上提示一句。生效了的授权最长 30 天，快到期、到期了一键续。

const FIELD = 'mt-1 w-full rounded-md border px-3 py-2 text-sm'
const SOON_MS = 3 * 24 * 3600 * 1000

function incubation(life: Detail): Grant | undefined {
  return [...life.grants].reverse().find((g) => g.kind === 'incubate')
}

export function IncubationMode({ life, csrfToken }: { life: Detail; csrfToken: string }) {
  const t = useTranslations('knowbots.mode')
  const when = useWhen()
  const client = useQueryClient()
  const id = useId()
  const [asking, setAsking] = useState(false)
  const [confirmBack, setConfirmBack] = useState(false)
  const [budget, setBudget] = useState('20')
  const [notice, setNotice] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  // 页面打开那一刻：快到期了没有按它算（渲染里不调 Date.now）
  const [openedAt] = useState(() => Date.now())
  const grant = incubation(life)
  const platform = life.incubation_mode === 'platform'
  const refresh = () => client.invalidateQueries({ queryKey: KEY })
  const run = useMutation({
    mutationFn: async (action: 'ask' | 'back' | 'renew') => {
      if (action === 'ask') await askPlatform(life.request_id, budget, csrfToken)
      else if (action === 'back') await takeBack(life.request_id, csrfToken)
      else await renewPlatform(life.request_id, csrfToken)
      return action
    },
    onSuccess: async (action) => {
      setFailed(false)
      setAsking(false)
      setConfirmBack(false)
      setNotice(action === 'back' ? t('revoked') : action === 'renew' ? t('renewed') : null)
      await refresh()
    },
    onError: () => setFailed(true),
  })
  const budgetOk = /^[0-9]{1,4}(\.[0-9]{1,2})?$/.test(budget) && Number(budget) > 0
  const expires = grant?.expires_at ? new Date(grant.expires_at).getTime() : null
  const renewable =
    platform &&
    grant !== undefined &&
    (grant.state === 'expired' ||
      (grant.state === 'active' && expires !== null && expires - openedAt < SOON_MS))

  return (
    <Card title={t('title')}>
      <p className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
            platform ? 'border-sky-400 text-sky-700 dark:text-sky-300' : ''
          }`}
          data-testid="incubation-mode"
        >
          {t(platform ? 'platform' : 'self')}
        </span>
        {platform && grant ? (
          <span className="text-muted-foreground text-xs">
            {t(`state.${grant.state}`, {
              until: when(grant.expires_at) ?? '—',
              budget: grant.budget_limit,
            })}
          </span>
        ) : null}
      </p>
      {notice ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {notice}
        </p>
      ) : null}
      {!platform && grant?.state === 'declined' && grant.reason ? (
        <p className="text-muted-foreground text-sm">{t('declined', { reason: grant.reason })}</p>
      ) : null}
      {failed ? (
        <p className="text-destructive text-sm" role="alert">
          {t('failed')}
        </p>
      ) : null}

      {platform ? (
        <div className="flex flex-wrap gap-2">
          {renewable ? (
            <Button size="sm" disabled={run.isPending} onClick={() => run.mutate('renew')}>
              {t('renew')}
            </Button>
          ) : null}
          {confirmBack ? (
            <div
              role="dialog"
              aria-labelledby={id}
              className="w-full space-y-2 rounded-lg border p-3"
            >
              <p id={id} className="text-sm">
                {t('backConfirm')}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={run.isPending}
                  onClick={() => run.mutate('back')}
                >
                  {t('backYes')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmBack(false)}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setConfirmBack(true)}>
              {t('takeBack')}
            </Button>
          )}
        </div>
      ) : asking ? (
        <div role="dialog" aria-labelledby={id} className="space-y-2 rounded-lg border p-3 text-sm">
          <p id={id} className="font-medium">
            {t('askTitle')}
          </p>
          <ul className="text-muted-foreground list-disc space-y-0.5 pl-5">
            {(['who', 'until', 'key', 'pay'] as const).map((line) => (
              <li key={line}>{t(`askLines.${line}`)}</li>
            ))}
          </ul>
          <label className="block">
            {t('budget')}
            <input
              className={FIELD}
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              aria-invalid={!budgetOk}
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!budgetOk || run.isPending}
              onClick={() => run.mutate('ask')}
            >
              {t('agree')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
          {t('ask')}
        </Button>
      )}
    </Card>
  )
}
