'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { formalDefinitionSchema, type FormalDefinition } from '@/contracts/formal-methods'
import { getFormalVersion, matchingToolOutputs } from '@/lib/knowbots/formal-methods'
import { expertFromTool } from '@/lib/knowbots/formal-orchestration'
import { same } from '@/lib/knowbots/workdraft'
import { FormalOrchestrationSummary } from './formal-orchestration-summary'

function prepend(
  draft: FormalDefinition,
  input: string,
  upstream: FormalDefinition,
  output: string,
) {
  const graph = draft.procedure,
    source = upstream.procedure
  if (graph.kind !== 'orchestration' || graph.steps.length !== 1 || source.kind !== 'orchestration')
    return null
  const target = graph.steps[0],
    gap = target.inputs[input]?.slot
  const provider = source.steps[0],
    provided = provider.outputs[output]
  if (
    !provided ||
    !gap ||
    !same(provided.schema, gap.schema) ||
    !same(provided.meaning, gap.meaning) ||
    (gap.required && !provided.required)
  )
    return null
  const id = target.id === 'prepare' ? 'prepare_1' : 'prepare'
  const requirements = [...draft.access_requirements]
  const approvals = [...draft.what_requires_approval]
  for (const need of upstream.access_requirements) {
    const existing = requirements.find((r) => same(r, need))
    let key = need.requirement_id
    if (!existing) {
      let n = 0
      while (requirements.some((r) => r.requirement_id === key)) key = 'prepare_access_' + ++n
      requirements.push({ ...need, requirement_id: key })
    }
    for (const rule of upstream.what_requires_approval.filter(
      (r) => r.requirement_id === need.requirement_id,
    )) {
      const item = { ...rule, requirement_id: key }
      if (!approvals.some((r) => same(r, item))) approvals.push(item)
    }
  }
  const inputs = structuredClone(provider.inputs)
  const aliases = new Map(
    Object.entries(target.inputs)
      .filter(([name, value]) => name !== input && value.binding.source === 'caller')
      .flatMap(([, value]) =>
        value.binding.source === 'caller' ? [[value.binding.name, value.slot] as const] : [],
      ),
  )
  for (const entry of Object.values(inputs)) {
    if (entry.binding.source !== 'caller') return null
    let key = entry.binding.name,
      n = 0
    while (aliases.has(key) && !same(aliases.get(key), entry.slot)) key = 'prepare_input_' + ++n
    entry.binding.name = key
    aliases.set(key, entry.slot)
  }
  const result = formalDefinitionSchema.safeParse({
    ...draft,
    access_requirements: requirements,
    what_requires_approval: approvals,
    procedure: {
      ...graph,
      max_steps: Math.max(graph.max_steps, 2),
      max_expansions: Math.max(graph.max_expansions, 3),
      steps: [
        { ...provider, id, inputs },
        {
          ...target,
          depends_on: [id],
          inputs: {
            ...target.inputs,
            [input]: { slot: gap, binding: { source: 'step', step: id, output } },
          },
        },
      ],
    },
  })
  return result.success ? result.data : null
}

export function P1Predecessor({
  draft,
  requestId,
  methodId,
  csrfToken,
  onAdopt,
}: {
  draft: FormalDefinition
  requestId: string
  methodId: string
  csrfToken: string
  onAdopt: (value: FormalDefinition) => void
}) {
  const t = useTranslations('formalMethod')
  const [input, setInput] = useState('')
  const [offset, setOffset] = useState(0)
  const [choice, setChoice] = useState('')
  const graph = draft.procedure
  const step = graph.kind === 'orchestration' && graph.steps.length === 1 ? graph.steps[0] : null
  const slot = step?.inputs[input]?.slot
  const matches = useQuery({
    queryKey: ['p1-output-matches', requestId, methodId, slot, offset],
    enabled: !!slot,
    retry: false,
    queryFn: () => matchingToolOutputs(requestId, methodId, slot, offset, csrfToken),
  })
  const key = (r: NonNullable<typeof matches.data>['items'][number]) =>
    [r.reference.method_id, r.reference.version, r.reference.digest, r.output].join(':')
  const selected = matches.data?.items.find((r) => key(r) === choice)
  const version = useQuery({
    queryKey: ['p1-provider', requestId, selected?.reference],
    enabled: !!selected,
    retry: false,
    queryFn: async () => {
      if (!selected) throw Error('missing_version')
      const v = await getFormalVersion(selected.reference.method_id, selected.reference.version)
      if (v.digest !== selected.reference.digest) throw Error('method_integrity')
      return expertFromTool(v)
    },
  })
  if (!step || !Object.keys(step.inputs).length) return null
  const preview =
    selected && version.data ? prepend(draft, input, version.data, selected.output) : null
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend>{t('p1Find')}</legend>
      <label>
        {t('p1Input')}{' '}
        <select
          value={slot ? input : ''}
          onChange={(e) => {
            setInput(e.target.value)
            setOffset(0)
            setChoice('')
          }}
        >
          <option value="">{t('chooseInput')}</option>
          {Object.keys(step.inputs).map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      {slot && matches.isSuccess && (
        <>
          <label>
            {t('p1Provider')}{' '}
            <select value={selected ? choice : ''} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{t('chooseRegisteredTool')}</option>
              {matches.data.items.map((r) => (
                <option key={key(r)} value={key(r)}>
                  {r.title} · v{r.reference.version} · {r.output}
                </option>
              ))}
            </select>
          </label>
          {!matches.data.items.length && <p>{t('noToolsOnPage')}</p>}
          {offset > 0 && (
            <Button
              type="button"
              onClick={() => {
                setOffset(Math.max(0, offset - 20))
                setChoice('')
              }}
            >
              {t('previous')}
            </Button>
          )}
          {matches.data.next !== null && (
            <Button
              type="button"
              onClick={() => {
                setOffset(matches.data.next!)
                setChoice('')
              }}
            >
              {t('next')}
            </Button>
          )}
        </>
      )}
      {slot &&
        (matches.isError || version.isError || (selected && version.isSuccess && !preview)) && (
          <p role="alert">{t('versionUnavailable')}</p>
        )}
      {preview && selected && (
        <>
          <p>
            {selected.title} · {selected.reference.digest} · {selected.output} → {step.id}.{input}
          </p>
          <FormalOrchestrationSummary definition={preview} />
          <details>
            <summary>{t('permissions')}</summary>
            <pre>
              {JSON.stringify(
                { access: preview.access_requirements, approval: preview.what_requires_approval },
                null,
                2,
              )}
            </pre>
          </details>
          <Button
            type="button"
            disabled={matches.isFetching || version.isFetching}
            onClick={() => onAdopt(preview)}
          >
            {t('p1Adopt')}
          </Button>
        </>
      )}
    </fieldset>
  )
}
