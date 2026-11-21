'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  reviewCriteriaSchema,
  type BranchDelivery,
  type ReviewCriteria,
} from '@/contracts/formal-method-execution'
import { prepareTrialReview } from '@/lib/knowbots/formal-method-execution'

type Rule = ReviewCriteria['assertions'][number]
function editRule(rule: Rule) {
  const [, output, ...parts] = rule.pointer.split('/')
  return {
    output,
    path: parts.map((x) => '/' + x).join(''),
    kind: rule.kind,
    value: rule.kind === 'equals' ? JSON.stringify(rule.value) : String(rule.value),
    tolerance: rule.kind === 'approx' ? String(rule.absolute_tolerance) : '0',
  }
}
export function BranchReviewForm({
  receipt,
  csrfToken,
}: {
  receipt: BranchDelivery
  csrfToken: string
}) {
  const t = useTranslations('formalExecution')
  const empty = {
    output: receipt.artifact.output_names[0],
    path: '',
    kind: 'equals' as Rule['kind'],
    value: '',
    tolerance: '0',
  }
  const [rules, setRules] = useState(
    () => receipt.review?.criteria.assertions.map(editRule) ?? [empty],
  )
  const [family, setFamily] = useState(
    receipt.review?.criteria.reviewer === 'different_model_family',
  )
  const [invalid, setInvalid] = useState(false)
  const [saved, setSaved] = useState(receipt)
  const [dirty, setDirty] = useState(false)
  const save = useMutation({
    mutationFn: (criteria: ReviewCriteria) => prepareTrialReview(saved, criteria, csrfToken),
    onSuccess: (updated) => {
      setSaved(updated)
      setDirty(false)
    },
  })
  function change(next: typeof rules) {
    setRules(next)
    setDirty(true)
    setInvalid(false)
  }
  function submit() {
    try {
      const assertions = rules.map((r) => {
        if (r.path && !r.path.startsWith('/')) throw Error()
        const pointer = '/' + r.output + r.path
        if (r.kind === 'approx')
          return {
            kind: r.kind,
            pointer,
            value: JSON.parse(r.value),
            absolute_tolerance: JSON.parse(r.tolerance),
          }
        return { kind: r.kind, pointer, value: r.kind === 'equals' ? JSON.parse(r.value) : r.value }
      })
      const criteria = reviewCriteriaSchema.parse({
        outputs: [...new Set(rules.map((r) => r.output))],
        assertions,
        reviewer: family ? 'different_model_family' : 'isolated_reviewer',
      })
      setInvalid(false)
      save.mutate(criteria)
    } catch {
      setInvalid(true)
    }
  }
  return (
    <fieldset disabled={save.isPending} className="space-y-2">
      <legend>{t('reviewPrepare')}</legend>
      <p>{t('reviewScope')}</p>
      {rules.map((r, i) => {
        const update = (patch: Partial<typeof r>) =>
          change(rules.map((v, j) => (i === j ? { ...v, ...patch } : v)))
        return (
          <div key={i} className="flex flex-wrap gap-2">
            <label>
              {t('reviewOutput')}{' '}
              <select value={r.output} onChange={(e) => update({ output: e.target.value })}>
                {receipt.artifact.output_names.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              {t('reviewPath')}{' '}
              <input
                value={r.path}
                maxLength={510}
                onChange={(e) => update({ path: e.target.value })}
              />
            </label>
            <label>
              {t('reviewRuleKind')}{' '}
              <select
                value={r.kind}
                onChange={(e) => update({ kind: e.target.value as Rule['kind'] })}
              >
                <option value="equals">{t('reviewEquals')}</option>
                <option value="contains">{t('reviewContains')}</option>
                <option value="approx">{t('reviewApprox')}</option>
              </select>
            </label>
            <label>
              {r.kind === 'contains' ? t('reviewContains') : t('reviewExpected')}{' '}
              <input value={r.value} onChange={(e) => update({ value: e.target.value })} />
            </label>
            {r.kind === 'approx' && (
              <label>
                {t('reviewTolerance')}{' '}
                <input
                  value={r.tolerance}
                  onChange={(e) => update({ tolerance: e.target.value })}
                />
              </label>
            )}
            {rules.length > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => change(rules.filter((_, j) => i !== j))}
              >
                {t('reviewRemove')}
              </Button>
            )}
          </div>
        )
      })}
      <Button
        type="button"
        variant="outline"
        disabled={rules.length >= 64}
        onClick={() => change([...rules, empty])}
      >
        {t('reviewAdd')}
      </Button>
      <label>
        <input
          type="checkbox"
          checked={family}
          onChange={(e) => {
            setFamily(e.target.checked)
            setDirty(true)
          }}
        />{' '}
        {t('reviewFamily')}
      </label>
      <Button type="button" onClick={submit}>
        {t('reviewSave')}
      </Button>
      {invalid && <p role="alert">{t('reviewInvalid')}</p>}
      {save.isError && <p role="alert">{t('reviewConflict')}</p>}
      {!dirty && saved.review && (
        <div role="status">
          <p>{t(saved.review.status === 'v0_failed' ? 'reviewFailed' : 'reviewWaiting')}</p>
          {Object.entries(saved.review.handoff).map(([name, digest]) => (
            <p key={name} className="break-all">
              {name} · {digest}
            </p>
          ))}
          {saved.review.checks.map((c) => (
            <p key={c.index}>
              {saved.review!.criteria.assertions[c.index].pointer} ·{' '}
              {t(c.passed ? 'reviewCheckPass' : 'reviewCheckFail')}
            </p>
          ))}
        </div>
      )}
    </fieldset>
  )
}
