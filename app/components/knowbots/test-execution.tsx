'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { fetchTestExecution } from '@/lib/knowbots/test-execution'
import { Deliverable, StepBlock } from './test-results'
import { KEY, useWhen } from './shared'

const TERMINAL = new Set(['passed', 'failed', 'error', 'timeout', 'cancelled'])

export function TestExecution({ testId }: { testId: string }) {
  const t = useTranslations('knowbots.execution')
  const when = useWhen()
  const [selected, setSelected] = useState<string | undefined>()
  const view = useQuery({
    queryKey: [...KEY, 'execution', testId, selected ?? null],
    queryFn: () => fetchTestExecution(testId, selected),
    refetchInterval: (query) =>
      query.state.data && TERMINAL.has(query.state.data.status) ? false : 5000,
  })
  return (
    <section aria-label={t('title')} className="space-y-3 rounded-lg border p-3 text-sm">
      <h3 className="font-medium">{t('title')}</h3>
      {view.isError ? (
        <p role="alert">
          {t('failed')}{' '}
          <button type="button" className="underline" onClick={() => void view.refetch()}>
            {t('retry')}
          </button>
        </p>
      ) : null}
      {!view.data && view.isPending ? <p>{t('loading')}</p> : null}
      {selected ? (
        <button type="button" className="underline" onClick={() => setSelected(undefined)}>
          {t('allCases')}
        </button>
      ) : null}
      {view.data?.cases.map((c) => (
        <article key={c.case_id} className="space-y-2 border-t pt-2">
          <p className="font-medium">
            {t('case', { id: c.case_id })} ·{' '}
            {t.has(`state.${c.state}`) ? t(`state.${c.state}`) : c.state} ·{' '}
            {t('spent', { amount: c.spent })}
          </p>
          {c.title ? (
            <p>
              {c.title} · {c.activity}
            </p>
          ) : null}
          {c.last_event_at ? (
            <p className="text-muted-foreground">
              {t('lastActivity', { at: when(c.last_event_at) ?? c.last_event_at })}
            </p>
          ) : null}
          {c.plan ? (
            <p>
              {c.plan.planning ? t('planning') : t('plan', { version: c.plan.version ?? 0 })}{' '}
              {c.plan.reason}
            </p>
          ) : null}
          {!selected ? (
            <button type="button" className="underline" onClick={() => setSelected(c.case_id)}>
              {t('details')}
            </button>
          ) : null}
          <ol className="space-y-2">
            {c.steps.map((step) => (
              <li key={step.step_id}>
                <p>
                  {step.index}. {step.title} ·{' '}
                  {t.has(`step.${step.status}`) ? t(`step.${step.status}`) : step.status} ·{' '}
                  {t('attempts', { n: step.attempts })}
                </p>
                {step.selection_reason ? (
                  <p className="text-muted-foreground">{step.selection_reason}</p>
                ) : null}
                {Object.keys(step.tools).length ? (
                  <p className="text-muted-foreground">
                    {t('tools')}{' '}
                    {Object.entries(step.tools)
                      .map(([name, count]) => `${name} × ${count}`)
                      .join(' · ')}
                  </p>
                ) : null}
                {step.latest_activity.map((item, i) => (
                  <p className="text-xs" key={i}>
                    {item.ok ? '✓' : '·'} {item.name} {item.at ? when(item.at) : ''}
                  </p>
                ))}
              </li>
            ))}
          </ol>
          {c.outputs ? (
            <>
              <Deliverable outputs={c.outputs} state="ready" />
              {c.outputs.steps?.map((step, i) => (
                <details key={step.step_id} className="rounded border p-2">
                  <summary>{step.title || step.step_id}</summary>
                  <StepBlock step={step} n={i + 1} />
                </details>
              ))}
            </>
          ) : null}
        </article>
      ))}
    </section>
  )
}
