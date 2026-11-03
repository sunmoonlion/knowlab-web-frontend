'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { Step } from '@/contracts/workdraft'
import { SELECT } from './workdraft-cells'

export function InputRequirements({
  step,
  earlier,
  onChange,
}: {
  step: Step
  earlier: Step[]
  onChange: (step: Step) => void
}) {
  const t = useTranslations('workdraft.optionalInputs')
  const [draft, setDraft] = useState<Step | null>(null)
  const value = draft ?? step
  const required = value.input_required ?? Object.fromEntries(value.uses.map((id) => [id, true]))
  const optional = value.uses.filter((id) => !required[id])
  const valid =
    !optional.includes(value.on_fail.back_to ?? '') &&
    value.checks.every((check) => {
      const guard = check.when_input_present
      if (guard && (check.template === 'required' || !optional.includes(guard))) return false
      if (check.template === 'covers') {
        const source = String(check.params.source_step ?? '')
        return (!optional.includes(source) || guard === source) && (!guard || guard === source)
      }
      return true
    })
  return (
    <section className="space-y-2 rounded border p-3">
      <p className="text-sm">{t('lead')}</p>
      {!draft ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDraft({ ...step, input_required: required })}
        >
          {t('edit')}
        </Button>
      ) : (
        <>
          {value.uses.map((id) => (
            <label key={id} className="flex gap-2">
              <input
                type="checkbox"
                checked={required[id]}
                onChange={(e) =>
                  setDraft({ ...value, input_required: { ...required, [id]: e.target.checked } })
                }
              />
              {earlier.find((s) => s.id === id)?.title || id} · {t('required')}
            </label>
          ))}
          {value.checks.map((check, index) => (
            <label key={index} className="block text-sm">
              {t('guard', { n: index + 1 })}
              <select
                className={SELECT}
                value={check.when_input_present ?? ''}
                disabled={check.template === 'required'}
                onChange={(e) =>
                  setDraft({
                    ...value,
                    checks: value.checks.map((c, i) => {
                      if (i !== index) return c
                      const next = { ...c }
                      delete next.when_input_present
                      return e.target.value ? { ...next, when_input_present: e.target.value } : next
                    }),
                  })
                }
              >
                <option value="">{t('always')}</option>
                {optional.map((id) => (
                  <option key={id} value={id}>
                    {earlier.find((s) => s.id === id)?.title || id}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {!valid ? (
            <p role="status" className="text-sm">
              {t('invalid')}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!valid}
              onClick={() => {
                onChange(value)
                setDraft(null)
              }}
            >
              {t('save')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
              {t('cancel')}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
