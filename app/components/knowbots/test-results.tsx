'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import type { CaseOutputs, CaseResult, KnowbotDraft, StepOutput } from '@/contracts/knowbots'
import { fetchOutputs } from '@/lib/knowbots/client'
import { cn } from '@/lib/utils'

import { Markdown } from './markdown'
import { caseName, caseQuestion, useWhen } from './shared'

// 分身的测试结果（SDD 0037 §四.3、§五）：每条用例一块——你的问题、结论、期望对上了几条、没过的白话原因；
// 下面先放成稿（验收依据，C-L3），各步交回物收在「每一步的结果」里、默认折叠。
// 不显示验收规则的内部名字；平台的错不让用户背，原因全文只在管理端。

const RESULT_TONE: Record<CaseResult['status'], string> = {
  passed: 'text-emerald-700 dark:text-emerald-400',
  failed: 'text-red-700 dark:text-red-400',
  needs_human: 'text-amber-700 dark:text-amber-400',
  error: 'text-muted-foreground',
}

const OUTCOME_TONE: Record<StepOutput['outcome'], string> = {
  accepted: 'text-emerald-700 dark:text-emerald-400',
  rejected: 'text-red-700 dark:text-red-400',
  failed: 'text-red-700 dark:text-red-400',
  over_budget: 'text-amber-700 dark:text-amber-400',
  cancelled: 'text-muted-foreground',
  running: 'text-muted-foreground',
  not_reached: 'text-muted-foreground',
}

export function TestResults({
  draft,
  cases,
}: {
  draft: KnowbotDraft
  cases: Record<string, unknown>[] | undefined
}) {
  const t = useTranslations('knowbots')
  const when = useWhen()
  const report = draft.report
  const done = report?.cases.length ?? 0
  const outputs = useQuery({
    queryKey: ['web', 'knowbot-outputs', draft.draft_id, done],
    queryFn: () => fetchOutputs(draft.draft_id),
    enabled: done > 0,
  })
  if (!report || done === 0) return null
  const finished = when(report.finished_at)
  return (
    <section className="space-y-3" aria-label={t('results.title')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{t('results.title')}</h3>
        {finished ? (
          <p className="text-muted-foreground text-xs">
            {t('results.finishedAt', { at: finished })}
          </p>
        ) : null}
      </div>
      {report.cases.map((c) => {
        const found = outputs.data?.cases.find((o) => o.case_id === c.case_id)
        return (
          <CaseBlock
            key={c.case_id}
            result={c}
            cases={cases}
            outputs={found?.outputs ?? null}
            state={outputs.isPending ? 'loading' : outputs.isError ? 'failed' : 'ready'}
          />
        )
      })}
    </section>
  )
}

function CaseBlock({
  result,
  cases,
  outputs,
  state,
}: {
  result: CaseResult
  cases: Record<string, unknown>[] | undefined
  outputs: CaseOutputs | null
  state: 'loading' | 'failed' | 'ready'
}) {
  const t = useTranslations('knowbots')
  const question = caseQuestion(cases?.find((c) => c.case_id === result.case_id))
  const steps = outputs?.steps ?? []
  const met = result.expectations.filter(Boolean).length
  const platform = result.status === 'error'
  return (
    <article
      aria-label={caseName(t, result.case_id, cases)}
      className="bg-card space-y-3 rounded-xl border p-4 text-sm shadow-sm"
    >
      <header className="space-y-1">
        <p>
          <span className="font-medium">{caseName(t, result.case_id, cases)}</span> ·{' '}
          <span className={cn('font-medium', RESULT_TONE[result.status])}>
            {t(`result.${result.status}`)}
          </span>
          {result.expectations.length > 0 && !platform
            ? ` · ${t('result.expectationsMet', { met, total: result.expectations.length })}`
            : ''}
        </p>
        {question ? (
          <p className="text-muted-foreground whitespace-pre-wrap">
            {t('result.question', { question })}
          </p>
        ) : null}
      </header>
      {platform ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t('result.platformError')}
        </p>
      ) : (
        <>
          <FailedSteps result={result} steps={steps} />
          {result.note && result.status !== 'failed' ? (
            <p className="text-muted-foreground">{result.note}</p>
          ) : null}
          <Deliverable outputs={outputs} state={state} />
          {steps.length > 0 ? (
            <details className="rounded-lg border">
              <summary className="cursor-pointer px-3 py-2">{t('outputs.steps')}</summary>
              <ol className="space-y-3 border-t p-3">
                {steps.map((s, i) => (
                  <li key={s.step_id}>
                    <StepBlock step={s} n={i + 1} />
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </>
      )}
    </article>
  )
}

/** 没过的步骤：第几步、叫什么，一句白话原因（报告里的说明，没有就用这一步没过的验收说明）。 */
function FailedSteps({ result, steps }: { result: CaseResult; steps: StepOutput[] }) {
  const t = useTranslations('knowbots')
  const failed = result.steps.filter((s) => !s.accepted)
  if (failed.length === 0) return null
  return (
    <ul className="space-y-2">
      {failed.map((s) => {
        const at = steps.findIndex((x) => x.step_id === s.step_id)
        const out = at >= 0 ? steps[at] : undefined
        const n = at >= 0 ? at + 1 : result.steps.indexOf(s) + 1
        const reasons = s.details?.length
          ? s.details
          : (out?.checks ?? [])
              .filter((c) => c.passed === false && c.message)
              .map((c) => c.message as string)
        return (
          <li key={s.step_id} className="text-red-800 dark:text-red-300">
            <p>{t('result.failedStep', { step: stepName(t, n, out?.title) })}</p>
            <ul className="text-muted-foreground list-disc pl-5 text-xs">
              {(reasons.length > 0 ? reasons : [t('result.noReason')]).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}

function stepName(t: ReturnType<typeof useTranslations<'knowbots'>>, n: number, title?: string) {
  return title ? t('outputs.step', { n, title }) : t('outputs.stepN', { n })
}

function Deliverable({
  outputs,
  state,
}: {
  outputs: CaseOutputs | null
  state: 'loading' | 'failed' | 'ready'
}) {
  const t = useTranslations('knowbots')
  let body: React.ReactNode
  if (state === 'loading') body = <p className="text-muted-foreground">{t('loading')}</p>
  else if (state === 'failed') body = <p className="text-destructive">{t('outputs.loadFailed')}</p>
  else if (!outputs || outputs.error)
    body = <p className="text-muted-foreground">{t('outputs.none')}</p>
  else if (!outputs.deliverable)
    body = (
      <p className="text-muted-foreground">
        {outputs.deliverable_note
          ? t('outputs.noDeliverableWhy', { why: outputs.deliverable_note })
          : t('outputs.noDeliverable')}
      </p>
    )
  else
    body = (
      <div className="bg-background max-h-[70vh] overflow-y-auto rounded-md border p-3">
        {outputs.deliverable.truncated ? (
          <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
            {t('outputs.truncated')}
          </p>
        ) : null}
        <Markdown>{outputs.deliverable.text}</Markdown>
      </div>
    )
  return (
    <div>
      <h4 className="text-muted-foreground mb-1 text-xs">{t('outputs.deliverable')}</h4>
      {body}
    </div>
  )
}

function StepBlock({ step, n }: { step: StepOutput; n: number }) {
  const t = useTranslations('knowbots')
  const checks = step.checks ?? []
  return (
    <div className="space-y-1">
      <p>
        {stepName(t, n, step.title)} ·{' '}
        <span className={cn('font-medium', OUTCOME_TONE[step.outcome])}>
          {t(`outputs.outcome.${step.outcome}`)}
        </span>
      </p>
      {checks.length > 0 ? (
        <ul className="space-y-0.5 text-xs">
          {checks.map((c, i) => (
            <li key={i} className={cn(c.passed === false && 'text-red-700 dark:text-red-400')}>
              {c.passed === true ? '✓' : c.passed === false ? '✗' : '·'} {c.message || c.label}
            </li>
          ))}
        </ul>
      ) : null}
      {step.artifact_omitted_bytes != null ? (
        <p className="text-muted-foreground text-xs">
          {t('outputs.omitted', { bytes: step.artifact_omitted_bytes })}
        </p>
      ) : step.artifact != null ? (
        <pre className="bg-muted max-h-96 overflow-auto rounded-md p-2 text-xs">
          {JSON.stringify(step.artifact, null, 2)}
        </pre>
      ) : null}
      {step.outcome === 'rejected' && step.returned_raw ? (
        <div>
          <p className="text-muted-foreground text-xs">{t('outputs.raw')}</p>
          <pre className="bg-muted max-h-96 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
            {step.returned_raw}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
