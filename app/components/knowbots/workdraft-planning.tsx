'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { planningSchema, selectionSchema, type Planning, type Step } from '@/contracts/workdraft'

import { Card } from './shared'
import { CellMarks, INPUT } from './workdraft-cells'

const initial = (value?: Planning | null): Planning =>
  value ?? {
    method_text: '',
    final_units: [],
    max_steps: 30,
    max_replans: 2,
    reserve: '0.05',
    input_max_chars: 8000,
  }

export function PlanningCard({
  value,
  steps,
  disabled,
  onSave,
}: {
  value?: Planning | null
  steps: Step[]
  disabled: boolean
  onSave: (value: Planning) => void
}) {
  const t = useTranslations('workdraft.planning')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Planning>(() => initial(value))
  const valid =
    planningSchema.safeParse(draft).success &&
    Boolean(draft.method_text.trim()) &&
    Number(draft.reserve) > 0 &&
    draft.final_units.every((id) => steps.some((step) => step.id === id))
  return (
    <Card title={t('title')}>
      <p>{t(value ? 'dynamic' : 'fixed')}</p>
      <CellMarks path="planning" filled={Boolean(value)} />
      {!editing ? (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            setDraft(initial(value))
            setEditing(true)
          }}
        >
          {t(value ? 'edit' : 'enable')}
        </Button>
      ) : (
        <fieldset disabled={disabled} className="space-y-3">
          <label className="block">
            {t('instructions')}
            <textarea
              className={INPUT}
              rows={4}
              maxLength={20000}
              value={draft.method_text}
              onChange={(e) => setDraft({ ...draft, method_text: e.target.value })}
            />
          </label>
          <fieldset className="space-y-1">
            <legend>{t('finals')}</legend>
            {steps.map((step) => (
              <label className="flex gap-2" key={step.id}>
                <input
                  type="checkbox"
                  checked={draft.final_units.includes(step.id)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      final_units: e.target.checked
                        ? [...draft.final_units, step.id]
                        : draft.final_units.filter((id) => id !== step.id),
                    })
                  }
                />
                {step.title || step.id}
              </label>
            ))}
            {draft.final_units
              .filter((id) => !steps.some((s) => s.id === id))
              .map((id) => (
                <label key={id} className="flex gap-2">
                  <input
                    type="checkbox"
                    checked
                    onChange={() =>
                      setDraft({ ...draft, final_units: draft.final_units.filter((v) => v !== id) })
                    }
                  />
                  {t('missing', { id })}
                </label>
              ))}
          </fieldset>
          {(['max_steps', 'max_replans', 'input_max_chars'] as const).map((key) => (
            <label className="block" key={key}>
              {t(key)}
              <input
                className={INPUT}
                type="number"
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label className="block">
            {t('reserve')}
            <input
              className={INPUT}
              value={draft.reserve}
              onChange={(e) => setDraft({ ...draft, reserve: e.target.value })}
            />
          </label>
          <p className="text-muted-foreground text-xs">{t('bounds')}</p>
          <div className="flex gap-2">
            <Button
              disabled={!valid}
              onClick={() => {
                onSave(draft)
                setEditing(false)
              }}
            >
              {t('save')}
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t('cancel')}
            </Button>
          </div>
        </fieldset>
      )}
    </Card>
  )
}

export function SelectionEditor({
  step,
  onChange,
}: {
  step: Step
  onChange: (step: Step) => void
}) {
  const t = useTranslations('workdraft.planning')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(
    () => step.selection ?? { applies_when: '', required: false, max_calls: 1 },
  )
  const valid = selectionSchema.safeParse(draft).success && Boolean(draft.applies_when.trim())
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p>
        {step.selection
          ? t('selectionSummary', {
              condition: step.selection.applies_when,
              count: step.selection.max_calls,
              required: step.selection.required ? 'yes' : 'no',
            })
          : t('selectionMissing')}
      </p>
      <CellMarks path={`steps/${step.id}/selection`} filled={Boolean(step.selection)} />
      {!editing ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDraft(step.selection ?? { applies_when: '', required: false, max_calls: 1 })
            setEditing(true)
          }}
        >
          {t('selectionEdit')}
        </Button>
      ) : (
        <div className="space-y-2">
          <label className="block">
            {t('applies')}
            <textarea
              className={INPUT}
              maxLength={4000}
              value={draft.applies_when}
              onChange={(e) => setDraft({ ...draft, applies_when: e.target.value })}
            />
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
            />
            {t('required')}
          </label>
          <label className="block">
            {t('calls')}
            <input
              className={INPUT}
              type="number"
              min={1}
              max={100}
              value={draft.max_calls}
              onChange={(e) => setDraft({ ...draft, max_calls: Number(e.target.value) })}
            />
          </label>
          <div className="flex gap-2">
            <Button
              disabled={!valid}
              onClick={() => {
                onChange({ ...step, selection: draft })
                setEditing(false)
              }}
            >
              {t('selectionSave')}
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
