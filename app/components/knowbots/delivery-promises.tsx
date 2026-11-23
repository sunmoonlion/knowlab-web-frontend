'use client'

import { useTranslations } from 'next-intl'
import type { FormalDefinition } from '@/contracts/formal-methods'
import { Button } from '@/components/ui/button'

export function DeliveryPromises({
  definition,
  fixedTemplate = false,
  onChange,
}: {
  definition: FormalDefinition
  fixedTemplate?: boolean
  onChange: (value: FormalDefinition) => void
}) {
  const t = useTranslations('formalMethod')
  const { capability_declaration: declaration, procedure, how_to_validate: rules } = definition
  const change = (next: typeof declaration, nextRules = rules) =>
    onChange({ ...definition, capability_declaration: next, how_to_validate: nextRules })
  const inputs =
    procedure.kind === 'direct'
      ? Object.keys(procedure.inputs)
      : [
          ...new Set(
            procedure.steps.flatMap((step) =>
              Object.values(step.inputs).flatMap(({ binding }) =>
                binding.source === 'caller' || binding.source === 'object_item'
                  ? [binding.name]
                  : [],
              ),
            ),
          ),
        ]
  const outputs = Object.keys(procedure.kind === 'direct' ? procedure.outputs : procedure.exports)
  const setCondition = (id: string, when: string, slots: string[]) => {
    const { conditions = {}, ...rest } = declaration
    const next = { ...conditions }
    if (when) next[id] = { when, input_slots: slots }
    else delete next[id]
    change(Object.keys(next).length ? { ...rest, conditions: next } : rest)
  }
  const add = () => {
    let number = 1
    while (Object.hasOwn(declaration.promises, 'promise_' + number)) number++
    const id = 'promise_' + number
    change({ ...declaration, promises: { ...declaration.promises, [id]: '' } }, [
      ...rules,
      { promise_id: id, outputs: [], check: '', evidence: '', on_failure: 'fail' },
    ])
  }
  const remove = (id: string) => {
    const { conditions = {}, ...rest } = declaration
    const next = { ...conditions },
      promises = { ...rest.promises }
    delete promises[id]
    delete next[id]
    change(
      { ...rest, promises, ...(Object.keys(next).length ? { conditions: next } : {}) },
      rules.filter((rule) => rule.promise_id !== id),
    )
  }
  return (
    <div className="space-y-3">
      {(['applies_when', 'excludes'] as const).map((key) => (
        <label key={key} className="block text-sm">
          {t(key === 'applies_when' ? 'applicableLines' : 'excludedLines')}
          <textarea
            className="block w-full rounded border p-2"
            value={declaration[key].join('\n')}
            onChange={(e) =>
              change({ ...declaration, [key]: e.target.value ? e.target.value.split('\n') : [] })
            }
          />
        </label>
      ))}
      {Object.entries(declaration.promises)
        .filter(([id]) => !fixedTemplate || id !== 'template_delivery')
        .map(([id, promise]) => {
          const condition = declaration.conditions?.[id]
          return (
            <fieldset key={id} className="space-y-2 rounded border p-3 text-sm">
              <legend>{id}</legend>
              <label className="block">
                {t('promiseText')}
                <input
                  className="block w-full rounded border p-2"
                  value={promise}
                  onChange={(e) =>
                    change({
                      ...declaration,
                      promises: { ...declaration.promises, [id]: e.target.value },
                    })
                  }
                />
              </label>
              <label className="block">
                {t('promiseWhen')}
                <input
                  className="block w-full rounded border p-2"
                  value={condition?.when ?? ''}
                  onChange={(e) => setCondition(id, e.target.value, condition?.input_slots ?? [])}
                />
              </label>
              {condition && (
                <fieldset>
                  <legend>{t('conditionInputs')}</legend>
                  {inputs.map((name) => (
                    <label key={name} className="mr-3">
                      <input
                        type="checkbox"
                        checked={condition.input_slots.includes(name)}
                        onChange={(e) =>
                          setCondition(
                            id,
                            condition.when,
                            e.target.checked
                              ? [...condition.input_slots, name]
                              : condition.input_slots.filter((item) => item !== name),
                          )
                        }
                      />{' '}
                      {name}
                    </label>
                  ))}
                </fieldset>
              )}
              {rules.map(
                (rule, index) =>
                  rule.promise_id === id && (
                    <div key={index}>
                      <fieldset>
                        <legend>{t('promiseOutputs')}</legend>
                        {outputs.map((name) => (
                          <label key={name} className="mr-3">
                            <input
                              type="checkbox"
                              checked={rule.outputs.includes(name)}
                              onChange={(e) =>
                                change(
                                  declaration,
                                  rules.map((r, i) =>
                                    i === index
                                      ? {
                                          ...r,
                                          outputs: e.target.checked
                                            ? [...r.outputs, name]
                                            : r.outputs.filter((item) => item !== name),
                                        }
                                      : r,
                                  ),
                                )
                              }
                            />{' '}
                            {name}
                          </label>
                        ))}
                      </fieldset>
                      <label className="block">
                        {t('validationRules')}
                        <textarea
                          className="block w-full rounded border p-2"
                          value={rule.check}
                          onChange={(e) =>
                            change(
                              declaration,
                              rules.map((r, i) =>
                                i === index ? { ...r, check: e.target.value } : r,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="block">
                        {t('promiseEvidence')}
                        <input
                          className="block w-full rounded border p-2"
                          value={rule.evidence}
                          onChange={(e) =>
                            change(
                              declaration,
                              rules.map((r, i) =>
                                i === index ? { ...r, evidence: e.target.value } : r,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                  ),
              )}
              {Object.keys(declaration.promises).length > 1 && (
                <Button type="button" variant="outline" onClick={() => remove(id)}>
                  {t('removePromise')}
                </Button>
              )}
            </fieldset>
          )
        })}
      <Button
        type="button"
        variant="outline"
        disabled={Object.keys(declaration.promises).length >= 30}
        onClick={add}
      >
        {t('addPromise')}
      </Button>
    </div>
  )
}
