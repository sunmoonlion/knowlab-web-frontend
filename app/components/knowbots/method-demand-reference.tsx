'use client'

import { useTranslations } from 'next-intl'

import type { Detail } from '@/contracts/knowbots'

import { Card } from './shared'

/** Demand-side analysis remains a reference until the author accepts draft cells. */
export function MethodDemandReference({ origin }: { origin: Detail['origin'] }) {
  const t = useTranslations('knowbots.methodDemand')
  const demand = origin?.method_demand
  if (!demand) return null
  return (
    <Card title={t('title')}>
      <p className="text-muted-foreground text-sm">{t('hint')}</p>
      <ul className="space-y-3">
        {demand.requirements.map((req) => (
          <li key={req.id}>
            <p className="font-medium">{req.statement}</p>
            <p className="text-muted-foreground text-sm">
              {t(req.origin)} · {req.rationale}
            </p>
            <blockquote className="border-s-2 ps-3 text-sm">{req.question_quote}</blockquote>
            {demand.gaps
              .filter((gap) => gap.requirement_id === req.id)
              .map((gap, i) => (
                <p key={i} className="text-sm">
                  {t(gap.status)}：{gap.reason}
                </p>
              ))}
          </li>
        ))}
      </ul>
      {demand.method_proposals.length ? (
        <details className="space-y-2">
          <summary className="cursor-pointer">{t('proposals')}</summary>
          <ul className="space-y-3">
            {demand.method_proposals.map((proposal) => (
              <li key={proposal.id}>
                <p className="font-medium">{proposal.approach}</p>
                <p className="text-sm">{proposal.reason}</p>
                <p className="text-muted-foreground text-sm">
                  {t('addresses')}：
                  {demand.requirements
                    .filter((req) => proposal.requirement_ids.includes(req.id))
                    .map((req) => req.statement)
                    .join('；')}
                </p>
                {proposal.data_requirements.length ? (
                  <p className="text-sm">
                    {t('data')}：{proposal.data_requirements.join('；')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {demand.clarification ? (
        <p className="text-sm">
          {t('clarification')}：{demand.clarification}
        </p>
      ) : null}
    </Card>
  )
}
