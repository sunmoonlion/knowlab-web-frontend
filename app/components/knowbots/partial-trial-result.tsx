'use client'

import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { FormalExecutionResult } from '@/contracts/formal-method-execution'
import { receiveTrialBranch } from '@/lib/knowbots/formal-method-execution'

export function PartialTrialResult({
  result,
  trialCase,
  csrfToken,
  onReceived,
}: {
  result: FormalExecutionResult
  trialCase: FormalExecutionResult['cases'][number]
  csrfToken: string
  onReceived: () => void
}) {
  const t = useTranslations('formalExecution')
  const receipt = useMutation({
    mutationFn: (step: string) => receiveTrialBranch(result, trialCase, step, csrfToken),
    onSuccess: onReceived,
  })
  const report = trialCase.partial
  if (!report) return null
  return (
    <section className="space-y-2">
      <h4>{t('branchProgress')}</h4>
      {Object.entries(report.missing_promises).map(([id, p]) => (
        <p key={id}>
          {t('branchMissing', { promise: p.description, outputs: p.missing_outputs.join(', ') })}
        </p>
      ))}
      <ul>
        {report.steps.map((s) => (
          <li key={s.step} className="my-2">
            <p>
              {s.step} · {t(`branchState.${s.state}`)} {s.detail}
            </p>
            {s.depends_on.length > 0 && (
              <p>{t('branchDepends', { steps: s.depends_on.join(', ') })}</p>
            )}
            {s.artifact && s.artifact.output_names.length > 0 && s.state === 'accepted' && (
              <>
                <p className="break-all">
                  {s.artifact.output_names.join(', ')} · {s.artifact.id} · v{s.artifact.version} ·{' '}
                  {s.artifact.digest}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    receipt.isPending || ['running', 'pending', 'waiting'].includes(result.status)
                  }
                  onClick={() => receipt.mutate(s.step)}
                >
                  {t(
                    report.received.includes(s.step) || receipt.data?.step === s.step
                      ? 'branchOpen'
                      : 'branchReceive',
                    { step: s.step },
                  )}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {receipt.isError && <p role="alert">{t('branchUnavailable')}</p>}
      {receipt.data && (
        <details open>
          <summary>{t('branchReceived', { step: receipt.data.step })}</summary>
          <pre className="break-all whitespace-pre-wrap">
            {JSON.stringify(receipt.data.outputs, null, 2)}
          </pre>
        </details>
      )}
    </section>
  )
}
