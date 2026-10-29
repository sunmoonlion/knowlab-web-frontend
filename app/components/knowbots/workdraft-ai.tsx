'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  ACTIVE_ROUNDS,
  type Gap,
  type Round,
  type RoundStart,
  type Step,
} from '@/contracts/workdraft'
import { Link } from '@/i18n/navigation'
import { ApiClientError } from '@/lib/common/api-client'
import { CrossAppLink } from '@/components/common/cross-app-link'
import { fetchDetail, fetchRoundComputers } from '@/lib/knowbots/client'

import { Card, KEY } from './shared'
import { INPUT, SELECT } from './workdraft-cells'
import { Panel } from './workdraft-panels'

// 工作稿上的 AI（专家孵化方案第八节）：「AI 起草」「让 AI 改…」发起一轮（费用上限、选电脑，默认
// 上次那台）；顶上一行是进行中的那一轮与历次；页面底下「待你定的（缺口）」链到审核栏去答，答完
// 可以点「让 AI 改…」带上答复。格子旁边的建议在 workdraft-suggestions。

// ---------- 发起一轮 ----------
const BUDGET = /^[0-9]{1,6}(\.[0-9]{1,2})?$/
export const START_CODES = [
  'author_has_no_computer',
  'incubation_running',
  'incubation_unconfigured',
  'model_key_missing',
  'test_report_missing',
] as const

/**
 * 「AI 起草」「让 AI 改…」：动作、那句话与哪一步、费用上限、电脑与目录（默认上次）。模型 key 没填的
 * 发起前就拦，给去 knowbench 填的链接（SDD 0046 第三节）。「让 AI 改…」可以带上最近一次测试的报告
 * （专家孵化方案第 8.4 节）：最近一次没通过时默认勾上。
 */
export function RoundPanel({
  requestId,
  action,
  steps,
  busy,
  error,
  initialInstruction = '',
  onStart,
  onClose,
}: {
  requestId: string
  action: 'draft' | 'revise'
  steps: Step[]
  busy: boolean
  error: string | null
  initialInstruction?: string
  onStart: (body: RoundStart) => void
  onClose: () => void
}) {
  const t = useTranslations('workdraft.ai')
  const computers = useQuery({
    queryKey: [...KEY, 'round-computers', requestId],
    queryFn: () => fetchRoundComputers(requestId),
  })
  const [instruction, setInstruction] = useState(initialInstruction)
  const [stepId, setStepId] = useState('')
  const [budget, setBudget] = useState('20')
  const [picked, setPicked] = useState<string | null>(null)
  const [root, setRoot] = useState<string | null>(null)
  const detail = useQuery({
    queryKey: [...KEY, 'detail', requestId],
    queryFn: () => fetchDetail(requestId),
    enabled: action === 'revise',
  })
  const finished = (detail.data?.tests ?? []).filter(
    (x) => x.status === 'passed' || x.status === 'failed',
  )
  const latestTest = finished.reduce<(typeof finished)[number] | null>(
    (a, x) => (a && a.number > x.number ? a : x),
    null,
  )
  const [withTest, setWithTest] = useState<boolean | null>(null)
  const carryTest = latestTest !== null && (withTest ?? latestTest.status === 'failed')
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
      <p className="text-muted-foreground">
        {action === 'draft' ? t('draftHint') : t('reviseHint')}
      </p>
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
          <label className="block">
            <span className="text-xs">{t('whichStep')}</span>
            <select
              aria-label={t('whichStep')}
              className={`${SELECT} ml-2`}
              value={stepId}
              onChange={(e) => setStepId(e.target.value)}
            >
              <option value="">{t('anyStep')}</option>
              {steps.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {t('stepN', { n: i + 1, title: s.title || s.id })}
                </option>
              ))}
            </select>
          </label>
          {latestTest ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={carryTest}
                onChange={(e) => setWithTest(e.target.checked)}
              />
              <span>
                {t('withTest', {
                  number: latestTest.number,
                  status: t(`testOutcome.${latestTest.status}` as never),
                })}
              </span>
            </label>
          ) : null}
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
            ...(action === 'revise' && stepId ? { step_id: stepId } : {}),
            ...(action === 'revise' && carryTest ? { with_test: true } : {}),
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

/** 没发起成的话：认得的错误码说清楚，别的说「再试一次」。 */
export function startFailure(error: unknown, t: (key: string) => string): string {
  const code = error instanceof ApiClientError ? error.problem.code : ''
  return (START_CODES as readonly string[]).includes(code) ? t(`errors.${code}`) : t('startFailed')
}

// ---------- 进行中的一轮与历次 ----------
export function RoundBar({
  rounds,
  current,
  busy,
  onCancel,
}: {
  rounds: Round[]
  current: Round | undefined
  busy: boolean
  onCancel: () => void
}) {
  const t = useTranslations('workdraft.ai')
  const [open, setOpen] = useState(false)
  if (!current) return null
  const active = ACTIVE_ROUNDS.includes(current.status)
  const earlier = rounds.filter((r) => r.incubation_id !== current.incubation_id).reverse()
  return (
    <div className="space-y-1 rounded-lg border p-2 text-sm" data-testid="round-bar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">
          {t('round', { n: current.round })} · {t(`action.${current.action}`)}
        </span>
        <span role="status" className={active ? 'text-amber-700' : 'text-muted-foreground'}>
          {t(`status.${current.status}`)}
          {current.waiting_for ? ` · ${t(`waiting.${current.waiting_for}` as never)}` : ''}
        </span>
        <span className="text-muted-foreground text-xs">
          {t('spent', { spent: current.spent ?? '0', limit: current.budget_limit })}
        </span>
        {active ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={onCancel}>
            {t('cancel')}
          </Button>
        ) : null}
        {earlier.length ? (
          <button
            type="button"
            className="text-muted-foreground ml-auto text-xs underline"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {t('history', { count: earlier.length })}
          </button>
        ) : null}
      </div>
      {current.instruction ? (
        <p className="text-muted-foreground text-xs">
          {t('instructionWas', { text: current.instruction })}
        </p>
      ) : null}
      {current.error && current.status !== 'succeeded' ? (
        <p className="text-destructive text-xs">{t('error', { error: current.error })}</p>
      ) : null}
      {open ? (
        <ul className="text-muted-foreground space-y-0.5 text-xs" data-testid="round-history">
          {earlier.map((r) => (
            <li key={r.incubation_id}>
              {t('round', { n: r.round })} · {t(`action.${r.action}`)} · {t(`status.${r.status}`)} ·{' '}
              {t('spent', { spent: r.spent ?? '0', limit: r.budget_limit })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// ---------- 待你定的（缺口） ----------
export function GapsCard({ gaps, onRevise }: { gaps: Gap[]; onRevise: () => void }) {
  const t = useTranslations('workdraft.ai')
  if (gaps.length === 0) return null
  const open = gaps.filter((g) => !g.answered).length
  return (
    <Card title={t('gapsTitle', { count: gaps.length })}>
      <p className="text-muted-foreground text-xs">{t('gapsHint')}</p>
      <ul className="space-y-2" data-testid="gaps">
        {gaps.map((g) => (
          <li key={g.gap_id} className="space-y-0.5">
            <p className="whitespace-pre-wrap">{g.question}</p>
            {g.proposal ? (
              <p className="text-muted-foreground text-xs">
                {t('proposal', { proposal: g.proposal })}
              </p>
            ) : null}
            {g.answered ? (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">{t('gapAnswered')}</p>
            ) : g.question_id ? (
              <Link
                href={`/review?item=${encodeURIComponent(g.question_id)}`}
                className="text-xs underline underline-offset-2"
              >
                {t('toReview')}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {open < gaps.length ? (
        <Button size="sm" variant="outline" onClick={onRevise}>
          {t('reviseWithAnswers')}
        </Button>
      ) : null}
    </Card>
  )
}
