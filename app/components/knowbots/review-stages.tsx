'use client'

import { useTranslations } from 'next-intl'
import type { ReviewComparison } from '@/contracts/formal-methods'

export function ReviewStages({
  comparison,
  available,
  firstRound,
  onChange,
}: {
  comparison?: ReviewComparison
  available: string[]
  firstRound: string[]
  onChange: (comparison?: ReviewComparison) => void
}) {
  const t = useTranslations('formalExecution')
  return (
    <fieldset className="space-y-2">
      <label>
        {t('reviewStage')}{' '}
        <select
          value={comparison ? 'strict' : 'single'}
          onChange={(e) =>
            onChange(
              e.target.value === 'strict'
                ? { assessment_output: available[0], max_reworks: 0 }
                : undefined,
            )
          }
        >
          <option value="single">{t('reviewSingle')}</option>
          <option value="strict" disabled={!available.length}>
            {t('reviewStrict')}
          </option>
        </select>
      </label>
      {!available.length && <p>{t('reviewNeedSlot')}</p>}
      {comparison && (
        <>
          <label>
            {t('reviewAssessment')}{' '}
            <select
              value={comparison.assessment_output}
              onChange={(e) => onChange({ ...comparison, assessment_output: e.target.value })}
            >
              {available.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <p>{t('reviewFirst', { outputs: firstRound.join(', ') })}</p>
          <p>{t('reviewDeferred', { output: comparison.assessment_output })}</p>
          <p>{t('reviewExtraRound')}</p>
          <label>
            {t('reviewReworks')}{' '}
            <select
              value={comparison.max_reworks}
              onChange={(e) => onChange({ ...comparison, max_reworks: Number(e.target.value) })}
            >
              {[0, 1, 2].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          {comparison.max_reworks > 0 && <p>{t('ordinaryReworkOutput')}</p>}
          <p>{t('reviewDisposition')}</p>
        </>
      )}
    </fieldset>
  )
}
