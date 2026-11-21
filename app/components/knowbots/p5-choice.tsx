'use client'

import { useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { previewCandidateChoice } from '@/lib/knowbots/formal-methods'
import { useTranslations } from 'next-intl'
import type { FormalDefinition } from '@/contracts/formal-methods'
import { combinedRequirements } from '@/lib/knowbots/formal-orchestration'
import { same } from '@/lib/knowbots/workdraft'
import { ExpertFromTool } from './expert-from-tool'
import { PlanChanges } from './plan-changes'

type Graph = Extract<FormalDefinition['procedure'], { kind: 'orchestration' }>
type Step = Graph['steps'][number]
type Props = {
  draft: FormalDefinition
  requestId: string
  methodId: string
  csrfToken: string
  revision: number
  onAdopt: (next: FormalDefinition) => void
}
function ports(step: Step) {
  return Object.keys(step.inputs).filter((name) => {
    const i = step.inputs[name]
    return i.binding.source === 'caller' && i.slot.required && i.slot.schema.type === 'string'
  })
}
// Use the same required slots, output guarantees, shapes and meanings as compilation.
function compatible(step: Step, other: Step) {
  return (
    Object.entries(other.inputs).every(
      ([k, i]) => !i.slot.required || !!step.inputs[k]?.slot.required,
    ) &&
    Object.entries(step.inputs).every(
      ([k, i]) =>
        other.inputs[k] &&
        same(i.slot.schema, other.inputs[k].slot.schema) &&
        same(i.slot.meaning, other.inputs[k].slot.meaning),
    ) &&
    Object.entries(step.outputs).every(
      ([k, o]) =>
        other.outputs[k] &&
        (!o.required || other.outputs[k].required) &&
        same(o.schema, other.outputs[k].schema) &&
        same(o.meaning, other.outputs[k].meaning),
    )
  )
}
export function P5Choice(props: Props) {
  const t = useTranslations('formalMethod')
  const graph = props.draft.procedure
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState('')
  if (
    graph.kind !== 'orchestration' ||
    graph.object_batch ||
    graph.max_replans ||
    graph.steps.some(
      (s) => !s.always_required || (!s.candidate_choice && s.candidates.length !== 1),
    )
  )
    return null
  const eligible = graph.steps.filter((s) => ports(s).length)
  if (!eligible.length) return null
  const step =
    eligible.find((s) => s.id === selected) ??
    eligible.find((s) => s.candidate_choice) ??
    eligible[0]
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend>{t('p5Title')}</legend>
      {!open && !graph.steps.some((s) => s.candidate_choice) ? (
        <button type="button" onClick={() => setOpen(true)}>
          {t('p5Configure')}
        </button>
      ) : (
        <>
          <label>
            {t('p5Step')}{' '}
            <select value={step.id} onChange={(e) => setSelected(e.target.value)}>
              {eligible.map((s) => (
                <option key={s.id}>{s.id}</option>
              ))}
            </select>
          </label>
          <ChoiceEditor key={step.id} {...props} graph={graph} step={step} />
        </>
      )}
    </fieldset>
  )
}
function ChoiceEditor({
  draft,
  graph,
  step,
  revision,
  requestId,
  methodId,
  csrfToken,
  onAdopt,
}: Props & { graph: Graph; step: Step }) {
  const t = useTranslations('formalMethod')
  const choice = step.candidate_choice
  const [input, setInput] = useState(choice?.input ?? ports(step)[0])
  const [values, setValues] = useState(
    step.candidates.map((ref) => choice?.cases.find((c) => same(c.candidate, ref))?.equals ?? ''),
  )
  const [newValue, setNewValue] = useState('')
  const [sample, setSample] = useState('')
  const [limits, setLimits] = useState({
    max_depth: graph.max_depth,
    max_expansions: graph.max_expansions,
    max_steps: graph.max_steps,
  })
  const validLimits =
    Number.isInteger(limits.max_depth) &&
    limits.max_depth >= 2 &&
    limits.max_depth <= 16 &&
    Number.isInteger(limits.max_steps) &&
    limits.max_steps >= graph.steps.length &&
    limits.max_steps <= 1000 &&
    Number.isInteger(limits.max_expansions) &&
    limits.max_expansions > graph.steps.length &&
    limits.max_expansions <= 1000
  const build = (candidate?: FormalDefinition): FormalDefinition | null => {
    const other =
      candidate?.procedure.kind === 'orchestration' ? candidate.procedure.steps[0] : null
    if (
      other &&
      (!compatible(step, other) ||
        step.candidates.some(
          (r) =>
            r.method_id === other.candidates[0].method_id &&
            r.version === other.candidates[0].version,
        ))
    )
      return null
    const candidates = other ? [...step.candidates, other.candidates[0]] : step.candidates
    const labels = other ? [...values, newValue] : values
    if (
      !validLimits ||
      candidates.length < 2 ||
      candidates.length > 8 ||
      new Set(labels).size !== labels.length ||
      labels.some((v) => !v.trim() || [...v].length > 128)
    )
      return null
    const updated = {
      ...step,
      candidates,
      candidate_choice: {
        input,
        cases: candidates.map((ref, i) => ({ equals: labels[i], candidate: ref })),
      },
    }
    return {
      ...draft,
      ...(candidate ? combinedRequirements(draft, candidate) : {}),
      procedure: {
        ...graph,
        ...limits,
        steps: graph.steps.map((s) => (s.id === step.id ? updated : s)),
      },
    }
  }
  const edited = choice ? build() : null
  const sampleIndex = values.indexOf(sample)
  return (
    <>
      <p>{t('p5Help')}</p>
      <label>
        {t('p5Input')}{' '}
        <select value={input} onChange={(e) => setInput(e.target.value)}>
          {ports(step).map((k) => {
            const binding = step.inputs[k].binding
            return (
              <option key={k} value={k}>
                {binding.source === 'caller' && binding.name !== k ? k + ' ← ' + binding.name : k}
              </option>
            )
          })}
        </select>
      </label>
      {step.candidates.map((ref, i) => (
        <label key={ref.digest + ref.method_id + ref.version} className="block">
          {t('p5Equals', { method: ref.method_id, version: ref.version })}
          <input
            value={values[i]}
            onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
          />
        </label>
      ))}
      {(['max_depth', 'max_steps', 'max_expansions'] as const).map((key) => (
        <label className="block" key={key}>
          {t(key)}
          <input
            type="number"
            min={key === 'max_depth' ? 2 : 1}
            max={key === 'max_depth' ? 16 : 1000}
            value={limits[key] || ''}
            onChange={(e) => setLimits({ ...limits, [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <p>{t('p1PreviewRevision', { revision })}</p>
      {choice && (
        <>
          <label>
            {t('p5Sample')} <input value={sample} onChange={(e) => setSample(e.target.value)} />
          </label>
          <p>
            {edited && sampleIndex >= 0
              ? t('p5Match', {
                  method: step.candidates[sampleIndex].method_id,
                  version: step.candidates[sampleIndex].version,
                })
              : t('p5NoMatch')}
          </p>
          {edited && !same(edited, draft) && (
            <CheckedChoice
              key={JSON.stringify(edited)}
              {...{ requestId, methodId, revision, csrfToken, draft }}
              next={edited}
              confirm={(ready) => (
                <button type="button" disabled={!ready} onClick={() => ready && onAdopt(ready)}>
                  {t('p5Update')}
                </button>
              )}
            />
          )}
        </>
      )}
      {step.candidates.length < 8 && (
        <>
          <label>
            {t('p5NewValue')}{' '}
            <input value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          </label>
          <ExpertFromTool
            candidate
            requestId={requestId}
            targetMethodId={methodId}
            csrfToken={csrfToken}
            onAdopt={onAdopt}
            preview={(method, confirm) => {
              const next = build(method)
              return next ? (
                <CheckedChoice
                  key={JSON.stringify(next)}
                  {...{ requestId, methodId, revision, csrfToken, draft }}
                  next={next}
                  confirm={confirm}
                />
              ) : (
                <>
                  <p role="status">{t('p5Invalid')}</p>
                  {confirm(null)}
                </>
              )
            }}
          />
        </>
      )}
    </>
  )
}

function CheckedChoice({
  requestId,
  methodId,
  revision,
  csrfToken,
  draft,
  next,
  confirm,
}: Omit<Props, 'onAdopt'> & {
  next: FormalDefinition
  confirm: (ready: FormalDefinition | null) => ReactNode
}) {
  const t = useTranslations('formalMethod')
  const check = useMutation({
    mutationFn: () => previewCandidateChoice(requestId, methodId, revision, next, csrfToken),
  })
  return (
    <>
      <PlanChanges before={draft} after={next} />
      <button type="button" disabled={check.isPending} onClick={() => check.mutate()}>
        {t('p5Check')}
      </button>
      {check.data && (
        <p role="status">
          {t(check.data.fits ? 'p5Fits' : 'p5Limits', {
            depth: check.data.depth,
            steps: check.data.steps,
            expansions: check.data.expansions,
          })}
        </p>
      )}
      {check.isError && <p role="alert">{t('p5CheckFailed')}</p>}
      {confirm(check.isSuccess && check.data.fits ? next : null)}
    </>
  )
}
