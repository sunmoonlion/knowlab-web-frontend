'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { boundedExecutionJson } from '@/contracts/formal-method-execution'
import { formalCallerBindingSchema, type FormalDefinition } from '@/contracts/formal-methods'
import { bindStepInput, reachableOutputs } from '@/lib/knowbots/formal-orchestration'
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
          key={selected + JSON.stringify(item.step.inputs[item.name])}
          graph={graph}
          step={item.step}
          name={item.name}
          onAdopt={(binding) => onChange(bindStepInput(graph, item.step.id, item.name, binding))}
        />
      )}
    </fieldset>
  )
}

// Compare JSON decimal spellings before a browser number can round the author's value.
// 1.20e1 and 12 describe the same coefficient and power of ten.
function canonicalDecimal(token: string) {
  const [mantissa, exponent = '0'] = token.toLowerCase().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const digits = (whole + fraction).replace(/^-?0*/, '')
  if (!digits) return '0'
  const coefficient = digits.replace(/0+$/, '')
  const power = Number(exponent) - fraction.length + digits.length - coefficient.length
  return (mantissa.startsWith('-') ? '-' : '') + coefficient + 'e' + power
}

// The author may store an unfinished draft. The compiler checks the entire
// slot schema against the pinned child before the graph can run or freeze.
function readLiteral(name: string, text: string, schema: Record<string, unknown>): Binding | null {
  const declared = schema.type
  let value: unknown = text
  if (declared !== 'string') {
    try {
      value = JSON.parse(text)
      // Syntax is already valid. Skip whole quoted strings, including escaped quotes.
      for (const [token] of text.matchAll(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)) {
        if (token.startsWith('"')) continue
        const number = Number(token)
        if (
          !Number.isFinite(number) ||
          (Number.isInteger(number) && !Number.isSafeInteger(number)) ||
          canonicalDecimal(token) !== canonicalDecimal(String(number))
        )
          return null
      }
    } catch {
      return null
    }
  }
  const types = Array.isArray(declared) ? declared : [declared]
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  if (
    declared !== undefined &&
    !types.includes(type) &&
    !(type === 'number' && Number.isInteger(value) && types.includes('integer'))
  )
    return null
  return boundedExecutionJson({ [name]: value }) ? { source: 'literal', value } : null
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
        : binding.source === 'literal'
          ? 'literal'
          : '',
  )
  const [alias, setAlias] = useState(binding.source === 'caller' ? binding.name : name)
  const [literal, setLiteral] = useState(() => {
    if (binding.source !== 'literal') return ''
    return slot.schema.type === 'string' && typeof binding.value === 'string'
      ? binding.value
      : JSON.stringify(binding.value)
  })
  const outputs = reachableOutputs(graph, step, slot).map((binding) => ({
    ...binding,
    key: binding.step + '.' + binding.output,
  }))
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
      : choice === 'literal'
        ? readLiteral(name, literal, slot.schema)
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
          <option value="literal">{t('bindingSources.literal')}</option>
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
      {choice === 'literal' && (
        <>
          <label className="block">
            {t(slot.schema.type === 'string' ? 'fixedText' : 'fixedJson')}
            <textarea
              className={field}
              value={literal}
              onChange={(e) => setLiteral(e.target.value)}
            />
          </label>
          <details>
            <summary>{t('fixedSchema')}</summary>
            <pre className="whitespace-pre-wrap">{JSON.stringify(slot.schema, null, 2)}</pre>
          </details>
          {!proposal && <p role="alert">{t('invalidFixedValue')}</p>}
        </>
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
