'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { CrossAppLink } from '@/components/common/cross-app-link'
import { Button } from '@/components/ui/button'
import { ApiClientError } from '@/lib/common/api-client'
import type { Delivery, Expert } from '@/contracts/knowbots'
import { declineExpert, submitDelivery, withdrawDelivery } from '@/lib/knowbots/client'

import { Badge, Card, KEY, useWhen, type Tone } from './shared'

// 交付（SDD 0046 第五节）：作者选这一版、定自用或公开、授权审核员看这次交付，点「提交交付」就是
// 用户同意门。自用的能自动查的自动查，都过马上进 knowmart 小店；公开的平台完整审核，自助测的还要
// 平台在你的账号下、你的电脑上重跑一次。审核进度（自动查的结果、审核结论、重跑结论）都在这里看。

const STATUS_TONE: Record<Delivery['status'], Tone> = {
  reviewing: 'running',
  approved: 'good',
  rejected: 'bad',
  withdrawn: 'muted',
}

type Mode = 'submit' | 'public' | null

/** 这一版现在能做什么：待提交的可以提交（自用或公开）；上架了的自用版本可以转公开。 */
export function deliveryMode(expert: Expert): Mode {
  const open = expert.deliveries.some(
    (d) => d.status === 'reviewing' || (d.status === 'approved' && !d.delivered_at),
  )
  if (open) return null
  if (expert.stage === 'awaiting_user') return 'submit'
  if (expert.stage === 'listed' && expert.review_listing === 'self') return 'public'
  return null
}

export function DeliveryPanel({ expert, csrfToken }: { expert: Expert; csrfToken: string }) {
  const td = useTranslations('knowbots.delivery')
  const mode = deliveryMode(expert)
  const open = expert.deliveries.some(
    (d) => d.status === 'reviewing' || (d.status === 'approved' && !d.delivered_at),
  )
  return (
    <>
      {expert.market_status === 'held' ? (
        <p className="text-destructive text-sm" role="status">
          {td('held', {
            reason: td.has(`heldReason.${expert.held_reason}`)
              ? td(`heldReason.${expert.held_reason}`)
              : (expert.held_reason ?? ''),
          })}
        </p>
      ) : null}
      {mode ? <SubmitForm expert={expert} mode={mode} csrfToken={csrfToken} /> : null}
      {open ? <Withdraw expert={expert} csrfToken={csrfToken} /> : null}
      {expert.deliveries.length > 0 ? (
        <Card title={td('progressTitle')}>
          <ul className="space-y-4" data-testid="delivery-progress">
            {expert.deliveries.map((d) => (
              <DeliveryProgress key={d.delivery_id} delivery={d} />
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  )
}

function SubmitForm({
  expert,
  mode,
  csrfToken,
}: {
  expert: Expert
  mode: Exclude<Mode, null>
  csrfToken: string
}) {
  const td = useTranslations('knowbots.delivery')
  const client = useQueryClient()
  const [listing, setListing] = useState<'self' | 'public'>(mode === 'public' ? 'public' : 'self')
  const [agree, setAgree] = useState(false)
  const [budget, setBudget] = useState('5')
  // 自用转公开：冻结时只许本人用的那几份，作者勾「我有权」往高改（决定 10-30）
  const [raiseFrozen, setRaiseFrozen] = useState(false)
  // 公开、自助测的：平台要在你的电脑上重跑一次，费用上限你设（decisions ⑯）
  const rerun = listing === 'public' && expert.test_mode !== 'platform'
  const submit = useMutation({
    mutationFn: () =>
      submitDelivery(
        expert.expert_id,
        {
          listing,
          ...(rerun ? { budget_limit: budget } : {}),
          ...(mode === 'public' && raiseFrozen ? { raise_frozen: true } : {}),
        },
        csrfToken,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  })
  const decline = useMutation({
    mutationFn: () => declineExpert(expert.expert_id, csrfToken),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  })
  const busy = submit.isPending || decline.isPending
  // 同后端：大于 0、不超过 1000 元、最多两位小数；重跑各次加起来不超过它
  const budgetShape = /^[0-9]{1,4}(\.[0-9]{1,2})?$/.test(budget)
  const budgetOk = !rerun || (budgetShape && Number(budget) > 0 && Number(budget) <= 1000)
  return (
    <Card title={mode === 'public' ? td('toPublicTitle') : td('submitTitle')}>
      <p className="text-muted-foreground">
        {mode === 'public' ? td('toPublicLead') : td('submitLead')}
      </p>
      {mode === 'submit' ? (
        <fieldset className="space-y-1">
          <legend className="text-muted-foreground">{td('listing')}</legend>
          {(['self', 'public'] as const).map((value) => (
            <label key={value} className="flex items-start gap-2">
              <input
                type="radio"
                name={`listing-${expert.expert_id}`}
                value={value}
                checked={listing === value}
                onChange={() => setListing(value)}
              />
              <span>
                <span className="font-medium">{td(`listingKind.${value}`)}</span>
                <span className="text-muted-foreground block text-xs">
                  {td(`listingHint.${value}`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {rerun ? (
        <label className="block space-y-1">
          <span>{td('rerunBudget')}</span>
          <span className="text-muted-foreground block text-xs">{td('rerunHint')}</span>
          <input
            className="w-32 rounded-md border px-2 py-1"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value.trim())}
            aria-label={td('rerunBudget')}
          />
          {budgetOk ? null : (
            <span className="text-destructive block text-xs" role="alert">
              {td('budgetRange')}
            </span>
          )}
        </label>
      ) : null}
      {mode === 'public' ? (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={raiseFrozen}
            onChange={(e) => setRaiseFrozen(e.target.checked)}
          />
          <span>{td('raiseFrozen')}</span>
        </label>
      ) : null}
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{td('authorize')}</span>
      </label>
      {submit.isError ? (
        <p className="text-destructive" role="alert">
          {problemText(submit.error, td)}
        </p>
      ) : null}
      {decline.isError ? (
        <p className="text-destructive" role="alert">
          {td('failed')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !agree || !budgetOk} onClick={() => submit.mutate()}>
          {td('submit')}
        </Button>
        {mode === 'submit' ? (
          <Button variant="outline" disabled={busy} onClick={() => decline.mutate()}>
            {td('decline')}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

/** 撤回没走完的那一次：停在跑的平台重跑、撤给审核员的授权；要再点一次确认。 */
function Withdraw({ expert, csrfToken }: { expert: Expert; csrfToken: string }) {
  const td = useTranslations('knowbots.delivery')
  const client = useQueryClient()
  const [sure, setSure] = useState(false)
  const withdraw = useMutation({
    mutationFn: () => withdrawDelivery(expert.expert_id, csrfToken),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  })
  return (
    <Card title={td('withdrawTitle')}>
      <p className="text-muted-foreground">{td('withdrawLead')}</p>
      {withdraw.isError ? (
        <p className="text-destructive" role="alert">
          {td('failed')}
        </p>
      ) : null}
      <Button
        variant="outline"
        disabled={withdraw.isPending}
        onClick={() => (sure ? withdraw.mutate() : setSure(true))}
      >
        {sure ? td('withdrawSure') : td('withdraw')}
      </Button>
    </Card>
  )
}

type Translate = ReturnType<typeof useTranslations>

/** 提交不成时说清为什么：所绑数据的许可不够、在审着、要设上限……别的照一般的话说。 */
function problemText(error: unknown, td: Translate): string {
  const code = error instanceof ApiClientError ? error.problem.code : ''
  return td.has(`problem.${code}`) ? td(`problem.${code}`) : td('failed')
}

function DeliveryProgress({ delivery }: { delivery: Delivery }) {
  const td = useTranslations('knowbots.delivery')
  const tt = useTranslations('knowbots.testStatus')
  const when = useWhen()
  const findings = delivery.auto_check?.findings ?? []
  return (
    <li className="space-y-1.5 border-b pb-3 last:border-0 last:pb-0">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {delivery.conversion ? td('conversion') : td(`listingKind.${delivery.listing}`)}
        </span>
        <Badge tone={STATUS_TONE[delivery.status]}>{td(`status.${delivery.status}`)}</Badge>
        <span className="text-muted-foreground text-xs">
          {td('submittedAt', { at: when(delivery.submitted_at) ?? '—' })}
        </span>
      </p>
      {delivery.auto_check ? (
        <p>
          {delivery.auto_check.passed
            ? td('autoPassed')
            : td('autoFailed', {
                items: findings
                  .map((f) =>
                    f.kind === 'flagged_word'
                      ? td('finding.flagged_word', { word: f.word ?? '', case: f.case_id ?? '' })
                      : td(`finding.${f.kind}`, { case: f.case_id ?? '' }),
                  )
                  .join('；'),
              })}
        </p>
      ) : null}
      {delivery.bindings.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {td('bindings', { count: delivery.bindings.length })}
        </p>
      ) : null}
      {delivery.needs_rerun ? (
        <p>
          {delivery.rerun
            ? td('rerun', {
                number: delivery.rerun.number,
                status: tt(delivery.rerun.status),
              })
            : td('rerunWaiting')}
        </p>
      ) : null}
      {delivery.status === 'withdrawn' ? (
        <p>
          {td('withdrawnAt', {
            at: when(delivery.withdrawn_at) ?? '—',
            reason: delivery.withdraw_reason ?? '',
          })}
        </p>
      ) : delivery.status !== 'reviewing' ? (
        <p>
          {delivery.status === 'approved'
            ? td('approvedAt', { at: when(delivery.decided_at) ?? '—' })
            : td('rejectedAt', {
                at: when(delivery.decided_at) ?? '—',
                reason: delivery.reason ?? '',
              })}
        </p>
      ) : null}
      {delivery.status === 'approved' ? (
        delivery.delivered_at ? (
          <p>
            {td('inShop', { at: when(delivery.delivered_at) ?? '—' })}{' '}
            <CrossAppLink
              to="knowmart.shop"
              values={{}}
              refValue={delivery.delivery_id}
              className="underline underline-offset-2"
              fallback={null}
            >
              {td('toShop')}
            </CrossAppLink>
          </p>
        ) : (
          <p className="text-muted-foreground">{td('delivering')}</p>
        )
      ) : null}
      <p className="text-muted-foreground text-xs">
        {delivery.consent_ended_at
          ? td('consentEnded', { at: when(delivery.consent_ended_at) ?? '—' })
          : td('consentLive')}
      </p>
    </li>
  )
}
