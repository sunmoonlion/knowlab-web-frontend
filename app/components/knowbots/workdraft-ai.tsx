'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { type RoundStart } from '@/contracts/workdraft'
import { CrossAppLink } from '@/components/common/cross-app-link'
import { fetchRoundComputers } from '@/lib/knowbots/client'

import { KEY } from './shared'
import { INPUT, SELECT } from './workdraft-cells'
import { Panel } from './workdraft-panels'

const BUDGET = /^[0-9]{1,6}(\.[0-9]{1,2})?$/
export function RoundPanel({
  requestId,
  action,
  busy,
  error,
  initialInstruction = '',
  onStart,
  onClose,
}: {
  requestId: string
  action: 'draft' | 'revise'
  busy: boolean
  error: string | null
  initialInstruction?: string
  onStart: (body: RoundStart) => void
  onClose: () => void
}) {
  const t = useTranslations('workdraft.ai')
  const ts = useTranslations('selection')
  const computers = useQuery({
    queryKey: [...KEY, 'round-computers', requestId],
    queryFn: () => fetchRoundComputers(requestId),
  })
  const [instruction, setInstruction] = useState(initialInstruction)
  const [budget, setBudget] = useState('20')
  const [picked, setPicked] = useState<string | null>(null)
  const [root, setRoot] = useState<string | null>(null)
  const noKey = computers.data?.model_key === false
  const list = computers.data?.computers ?? []
  const last = computers.data?.last ?? null
  const online = list.filter((c) => c.online)
  // 默认：上次用的那台；没有就只有一台在线的那台
  const fallback =
    list.find((c) => c.environment_id === last?.environment_id) ??
    (online.length === 1 ? online[0] : undefined)
  const env = list.find((c) => c.environment_id === (picked ?? fallback?.environment_id))
  const folder =
    root ??
    (env && last?.environment_id === env.environment_id && last.workspace_root
      ? last.workspace_root
      : env?.roots[0]) ??
    ''
  const okBudget = BUDGET.test(budget) && Number(budget) > 0
  const ready =
    !noKey && okBudget && Boolean(env && folder) && (action === 'draft' || instruction.trim())
  return (
    <Panel title={action === 'draft' ? t('draftTitle') : t('reviseTitle')} onClose={onClose}>
      <p className="text-muted-foreground">{ts('roundHint')}</p>
      {action === 'revise' ? (
        <>
          <label className="block">
            <span className="text-xs">{t('instruction')}</span>
            <textarea
              className={INPUT}
              rows={2}
              maxLength={4000}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>
        </>
      ) : null}
      {noKey ? (
        <p className="text-amber-700" role="alert" data-testid="no-model-key">
          {t('noModelKey')}{' '}
          <CrossAppLink to="knowbench.settings" className="underline underline-offset-2">
            {t('toSettings')}
          </CrossAppLink>
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {computers.isPending ? (
          <span className="text-muted-foreground">{t('loadingComputers')}</span>
        ) : list.length === 0 ? (
          <span className="text-amber-700">{t('noComputer')}</span>
        ) : (
          <>
            <select
              aria-label={t('computer')}
              className={SELECT}
              value={env?.environment_id ?? ''}
              onChange={(e) => {
                setPicked(e.target.value)
                setRoot(null)
              }}
            >
              <option value="">{t('chooseComputer')}</option>
              {list.map((c) => (
                <option key={c.environment_id} value={c.environment_id}>
                  {c.online ? c.name : t('offline', { name: c.name })}
                </option>
              ))}
            </select>
            {env ? (
              <select
                aria-label={t('folder')}
                className={SELECT}
                value={folder}
                onChange={(e) => setRoot(e.target.value)}
              >
                {env.roots.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : null}
          </>
        )}
        <label className="flex items-center gap-1">
          {t('budget')}
          <input
            aria-label={t('budget')}
            className={`${SELECT} w-20`}
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
      </div>
      <p className="text-muted-foreground text-xs">{t('keyNote')}</p>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        size="sm"
        disabled={busy || !ready}
        onClick={() =>
          env &&
          onStart({
            action,
            ...(action === 'revise' ? { instruction: instruction.trim() } : {}),
            budget_limit: budget,
            environment_id: env.environment_id,
            workspace_root: folder,
          })
        }
      >
        {busy ? t('starting') : t('start')}
      </Button>
    </Panel>
  )
}
