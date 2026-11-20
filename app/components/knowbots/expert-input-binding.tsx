'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { formalCallerBindingSchema, type FormalDefinition } from '@/contracts/formal-methods'
import { same } from '@/lib/knowbots/workdraft'

type Graph = Extract<FormalDefinition['procedure'], { kind: 'orchestration' }>
type Step = Graph['steps'][number]
type Binding = Step['inputs'][string]['binding']
const field = 'bg-background mt-1 w-full rounded border p-2'

export function ExpertInputBinding({
  graph,
  onChange,
}: {
  graph: Graph
  onChange: (graph: Graph) => void
}) {
  const t = useTranslations('formalMethod')
  const [selected, setSelected] = useState('')
  const slots = graph.steps.flatMap((step) =>
    Object.keys(step.inputs).map((name) => ({ step, name })),
  )
  const item = slots.find(({ step, name }) => step.id + '.' + name === selected)
  if (!slots.length) return null
  return (
    <fieldset className="space-y-2 rounded border p-3 text-sm">
      <legend>{t('editBinding')}</legend>
      <label>
        {t('targetInput')}
        <select
          className={field}
          value={item ? selected : ''}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">{t('chooseInput')}</option>
          {slots.map(({ step, name }) => {
            const key = step.id + '.' + name
            return (
              <option key={key} value={key}>
                {key}
              </option>
            )
          })}
        </select>
      </label>
      {item && (
        <BindingChoice
          key={selected + JSON.stringify(item.step.inputs[item.name].binding)}
          graph={graph}
          step={item.step}
          name={item.name}
          onAdopt={(binding) => {
            const step = item.step
            const inputs = { ...step.inputs, [item.name]: { ...step.inputs[item.name], binding } }
            onChange({
              ...graph,
              steps: graph.steps.map((s) => (s.id === step.id ? { ...s, inputs } : s)),
            })
          }}
        />
      )}
    </fieldset>
  )
}

function BindingChoice({
  graph,
  step,
  name,
  onAdopt,
}: {
  graph: Graph
  step: Step
  name: string
  onAdopt: (binding: Binding) => void
}) {
  const t = useTranslations('formalMethod')
  const { slot, binding } = step.inputs[name]
  const [choice, setChoice] = useState(
    binding.source === 'caller'
      ? 'caller'
      : binding.source === 'step'
        ? binding.step + '.' + binding.output
        : '',
  )
  const [alias, setAlias] = useState(binding.source === 'caller' ? binding.name : name)
  const outputs = graph.steps
    .filter((s) => step.depends_on.includes(s.id))
    .flatMap((s) =>
      Object.entries(s.outputs)
        .filter(
          ([, out]) =>
            same(slot.schema, out.schema) &&
            same(slot.meaning, out.meaning) &&
            (!slot.required || (s.always_required && out.required)),
        )
        .map(([output]) => ({ key: s.id + '.' + output, step: s.id, output })),
    )
  const output = outputs.find((o) => o.key === choice)
  const aliasConflict = graph.steps.some((s) =>
    Object.entries(s.inputs).some(
      ([key, input]) =>
        (s.id !== step.id || key !== name) &&
        input.binding.source === 'caller' &&
        input.binding.name === alias &&
        !same(slot, input.slot),
    ),
  )
  const validAlias =
    formalCallerBindingSchema.safeParse({ source: 'caller', name: alias }).success && !aliasConflict
  const proposal: Binding | null =
    choice === 'caller' && validAlias
      ? { source: 'caller', name: alias }
      : output
        ? { source: 'step', step: output.step, output: output.output }
        : null
  return (
    <div className="space-y-2">
      <p>{slot.description}</p>
      <label>
        {t('bindFrom')}
        <select className={field} value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">{t('chooseBinding')}</option>
          <option value="caller">{t('bindingSources.caller')}</option>
          {outputs.map((o) => (
            <option key={o.key} value={o.key}>
              {o.key}
            </option>
          ))}
        </select>
      </label>
      {choice === 'caller' && (
        <label className="block">
          {t('callerName')}
          <input className={field} value={alias} onChange={(e) => setAlias(e.target.value)} />
        </label>
      )}
      {choice === 'caller' && !validAlias && (
        <p role="alert">{t(aliasConflict ? 'aliasConflict' : 'invalidAlias')}</p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={!proposal || same(binding, proposal)}
        onClick={() => proposal && onAdopt(proposal)}
      >
        {t('adoptBinding')}
      </Button>
    </div>
  )
}
