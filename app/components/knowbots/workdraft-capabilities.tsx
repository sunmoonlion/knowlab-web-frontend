'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  publicCapabilitySchema,
  capabilityBindingSchema,
  type PublicCapability,
  type CapabilityBinding,
  type WorkdraftBody,
} from '@/contracts/workdraft'
import { freshId } from '@/lib/knowbots/workdraft'
import { Card } from './shared'
import { INPUT, CellMarks } from './workdraft-cells'

type Row = { capability: PublicCapability; binding: CapabilityBinding }
const rowsOf = (body: WorkdraftBody): Row[] =>
  (body.public_capabilities ?? []).map((capability) => ({
    capability,
    binding: body.planning?.capability_bindings?.[capability.id] ?? {
      required_units: [],
      evidence_outputs: [],
    },
  }))
const lines = (text: string) =>
  text
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)

// Public declarations and their private implementation support are one author edit.
// Never derive or publish promises from candidate method names automatically.
export function CapabilityCard({
  body,
  disabled,
  onSave,
}: {
  body: WorkdraftBody
  disabled: boolean
  onSave: (body: WorkdraftBody) => void
}) {
  const t = useTranslations('workdraft.capabilities')
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  if (!body.planning) return null
  const valid =
    rows.length > 0 &&
    rows.length <= 30 &&
    rows.every(
      ({ capability, binding }) =>
        publicCapabilitySchema.safeParse({
          ...capability,
          conditions: lines(capability.conditions.join('\n')),
          exclusions: lines(capability.exclusions.join('\n')),
          delivers: lines(capability.delivers.join('\n')),
        }).success &&
        capabilityBindingSchema.safeParse(binding).success &&
        binding.required_units.every((id) => body.steps.some((s) => s.id === id)) &&
        binding.evidence_outputs.every(
          (out) =>
            binding.required_units.includes(out.method) &&
            body.steps.some(
              (s) => s.id === out.method && s.outputs.some((o) => o.name === out.field),
            ),
        ),
    ) &&
    new Set(rows.map((r) => r.capability.id)).size === rows.length
  const update = (index: number, row: Row) => setRows(rows.map((r, i) => (i === index ? row : r)))
  return (
    <Card title={t('title')}>
      <p className="text-sm">{t('lead')}</p>
      <CellMarks path="public_capabilities" filled={Boolean(body.public_capabilities?.length)} />
      {!editing ? (
        <>
          <ul className="list-disc pl-5">
            {(body.public_capabilities ?? []).map((cap) => (
              <li key={cap.id}>{cap.statement}</li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              setRows(rowsOf(body))
              setEditing(true)
            }}
          >
            {t('edit')}
          </Button>
        </>
      ) : (
        <fieldset disabled={disabled} className="space-y-4">
          {rows.map((row, index) => (
            <section key={row.capability.id} className="space-y-3 rounded border p-3">
              <label className="block">
                {t('statement')}
                <textarea
                  className={INPUT}
                  value={row.capability.statement}
                  maxLength={2000}
                  onChange={(e) =>
                    update(index, {
                      ...row,
                      capability: { ...row.capability, statement: e.target.value },
                    })
                  }
                />
              </label>
              {(['conditions', 'exclusions', 'delivers'] as const).map((field) => (
                <label className="block" key={field}>
                  {t(field)}
                  <textarea
                    className={INPUT}
                    value={row.capability[field].join('\n')}
                    onChange={(e) =>
                      update(index, {
                        ...row,
                        capability: { ...row.capability, [field]: e.target.value.split('\n') },
                      })
                    }
                  />
                </label>
              ))}
              <fieldset>
                <legend>{t('support')}</legend>
                {body.steps.map((step) => (
                  <label key={step.id} className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={row.binding.required_units.includes(step.id)}
                      onChange={(e) =>
                        update(index, {
                          ...row,
                          binding: {
                            required_units: e.target.checked
                              ? [...row.binding.required_units, step.id]
                              : row.binding.required_units.filter((id) => id !== step.id),
                            evidence_outputs: e.target.checked
                              ? row.binding.evidence_outputs
                              : row.binding.evidence_outputs.filter(
                                  (out) => out.method !== step.id,
                                ),
                          },
                        })
                      }
                    />
                    {step.title || step.id}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>{t('evidence')}</legend>
                {body.steps
                  .filter((step) => row.binding.required_units.includes(step.id))
                  .flatMap((step) =>
                    step.outputs.map((output) => (
                      <label key={`${step.id}.${output.name}`} className="flex gap-2">
                        <input
                          type="checkbox"
                          checked={row.binding.evidence_outputs.some(
                            (out) => out.method === step.id && out.field === output.name,
                          )}
                          onChange={(e) =>
                            update(index, {
                              ...row,
                              binding: {
                                ...row.binding,
                                evidence_outputs: e.target.checked
                                  ? [
                                      ...row.binding.evidence_outputs,
                                      { method: step.id, field: output.name },
                                    ]
                                  : row.binding.evidence_outputs.filter(
                                      (out) => out.method !== step.id || out.field !== output.name,
                                    ),
                              },
                            })
                          }
                        />
                        {step.title || step.id} · {output.name}
                      </label>
                    )),
                  )}
              </fieldset>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
              >
                {t('remove')}
              </Button>
            </section>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={rows.length >= 30}
            onClick={() =>
              setRows([
                ...rows,
                {
                  capability: {
                    id: freshId(
                      'cap',
                      rows.map((r) => r.capability.id),
                    ),
                    statement: '',
                    conditions: [],
                    exclusions: [],
                    delivers: [],
                  },
                  binding: { required_units: [], evidence_outputs: [] },
                },
              ])
            }
          >
            {t('add')}
          </Button>
          <p className="text-muted-foreground text-xs">{t('privateNote')}</p>
          {!valid ? (
            <p role="status" className="text-sm">
              {t('incomplete')}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              disabled={!valid}
              onClick={() => {
                onSave({
                  ...body,
                  public_capabilities: rows.map(({ capability }) => ({
                    ...capability,
                    conditions: lines(capability.conditions.join('\n')),
                    exclusions: lines(capability.exclusions.join('\n')),
                    delivers: lines(capability.delivers.join('\n')),
                  })),
                  planning: {
                    ...body.planning!,
                    capability_bindings: Object.fromEntries(
                      rows.map((row) => [row.capability.id, row.binding]),
                    ),
                  },
                })
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
