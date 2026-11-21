'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { FormalDefinition } from '@/contracts/formal-methods'
import { combinedRequirements } from '@/lib/knowbots/formal-orchestration'
import { same } from '@/lib/knowbots/workdraft'
import { PlanChanges } from './plan-changes'
import { ExpertFromTool } from './expert-from-tool'

type Graph = Extract<FormalDefinition['procedure'], { kind: 'orchestration' }>
type Policy = NonNullable<Graph['object_batch']>
type Step = Graph['steps'][number]

function usesRelativeReference(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  return Object.hasOwn(value, '$ref') || Object.values(value).some(usesRelativeReference)
}

function ComparisonChoice({
  draft,
  worker,
  policy,
  confirm,
}: {
  draft: FormalDefinition
  worker: FormalDefinition
  policy: Policy
  confirm: (d: FormalDefinition | null) => ReactNode
}) {
  const t = useTranslations('formalMethod')
  const [selectedInput, setInput] = useState('')
  const [selectedOutput, setOutput] = useState('')
  const [selectedRows, setRows] = useState('')
  const graph = draft.procedure,
    from = worker.procedure
  if (graph.kind !== 'orchestration' || from.kind !== 'orchestration') return null
  const unit = from.steps[0],
    collector = graph.steps[0]
  const keys = Object.keys(unit.inputs).filter((name) => {
    const item = unit.inputs[name]
    return (
      item.slot.required &&
      item.binding.source === 'caller' &&
      [{ type: 'string' }, { type: 'string', minLength: 1 }].some((s) => same(s, item.slot.schema))
    )
  })
  const input = keys.includes(selectedInput) ? selectedInput : keys[0]
  const ports = Object.entries(collector.inputs).filter(
    ([, i]) => i.binding.source === 'caller' && i.slot.required,
  )
  const matches = new Map<string, string[]>()
  if (input) {
    for (const [output, result] of Object.entries(unit.outputs)) {
      if (!result.required || usesRelativeReference(result.schema)) continue
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['object_id', 'value'],
          properties: { object_id: unit.inputs[input].slot.schema, value: result.schema },
        },
      }
      const compatible = ports
        .filter(([, i]) => same(i.slot.meaning, result.meaning) && same(i.slot.schema, schema))
        .map(([name]) => name)
      if (compatible.length) matches.set(output, compatible)
    }
  }
  const output = matches.has(selectedOutput) ? selectedOutput : [...matches.keys()][0]
  const rowPorts = matches.get(output) ?? []
  const rows = rowPorts.includes(selectedRows) ? selectedRows : rowPorts[0]
  const keyPicker = keys.length > 0 && (
    <label>
      {t('p4ObjectInput')}{' '}
      <select value={input} onChange={(e) => setInput(e.target.value)}>
        {keys.map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
    </label>
  )
  if (!rows)
    return (
      <>
        {keyPicker}
        <p role="status">{t('p4Unavailable')}</p>
      </>
    )
  const choice = { input, output, rows }
  const id = collector.id === 'per_object' ? 'per_object_2' : 'per_object'
  const used = new Set(
    Object.entries(collector.inputs).flatMap(([name, i]) =>
      name !== choice.rows && i.binding.source === 'caller' ? [i.binding.name] : [],
    ),
  )
  const removed = collector.inputs[choice.rows].binding
  const dangling =
    removed.source === 'caller' &&
    !used.has(removed.name) &&
    Object.values(draft.capability_declaration.conditions ?? {}).some((c) =>
      c.input_slots.includes(removed.name),
    )
  const alias = (base: string) => {
    let name = base,
      n = 1
    while (used.has(name)) name = base.slice(0, 57) + '_' + n++
    used.add(name)
    return name
  }
  const list = alias('objects')
  const inputs: Step['inputs'] = {}
  for (const [name, value] of Object.entries(unit.inputs)) {
    inputs[name] = {
      slot: value.slot,
      binding:
        name === choice.input
          ? { source: 'object_item', name: list }
          : { source: 'caller', name: alias(name) },
    }
  }
  const batch: Graph = {
    ...graph,
    object_batch: policy,
    max_steps: policy.max_objects + 1,
    max_expansions: policy.max_objects + 2,
    steps: [
      { ...unit, id, inputs },
      {
        ...collector,
        depends_on: [id],
        inputs: {
          ...collector.inputs,
          [choice.rows]: {
            slot: collector.inputs[choice.rows].slot,
            binding: { source: 'object_rows', step: id, output: choice.output },
          },
        },
      },
    ],
  }
  const next = { ...draft, ...combinedRequirements(draft, worker), procedure: batch }
  return (
    <>
      {keyPicker}
      <label>
        {t('p4ObjectOutput')}{' '}
        <select value={output} onChange={(e) => setOutput(e.target.value)}>
          {[...matches.keys()].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label>
        {t('p4Binding')}{' '}
        <select value={rows} onChange={(e) => setRows(e.target.value)}>
          {rowPorts.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <p>
        {list} → {id}.{choice.input} · {id}.{choice.output} → {collector.id}.{choice.rows}
      </p>
      {validLimit(policy.max_objects) && <PlanChanges before={draft} after={next} />}
      {dangling && removed.source === 'caller' && (
        <p role="alert">{t('p2Condition', { slot: removed.name })}</p>
      )}
      {confirm(dangling || !validLimit(policy.max_objects) ? null : next)}
    </>
  )
}
function validLimit(n: number) {
  return Number.isInteger(n) && n >= 1 && n <= 99
}
export function P4Comparison({
  draft,
  methodId,
  requestId,
  csrfToken,
  onAdopt,
}: {
  draft: FormalDefinition
  methodId: string
  requestId: string
  csrfToken: string
  onAdopt: (d: FormalDefinition) => void
}) {
  const t = useTranslations('formalMethod')
  const graph = draft.procedure
  const saved = graph.kind === 'orchestration' ? graph.object_batch : undefined
  const [editing, setEditing] = useState(false)
  const [limit, setLimit] = useState(String(saved?.max_objects ?? 10))
  const [missing, setMissing] = useState<Policy['on_missing']>(saved?.on_missing ?? 'stop')
  if (
    graph.kind !== 'orchestration' ||
    (!saved &&
      (graph.steps.length !== 1 ||
        !graph.steps[0].always_required ||
        graph.steps[0].candidates.length !== 1 ||
        graph.max_replans !== 0))
  )
    return null
  const policy = { max_objects: Number(limit), on_missing: missing }
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend>{t('p4Title')}</legend>
      {!editing && !saved ? (
        <button type="button" onClick={() => setEditing(true)}>
          {t('p4Configure')}
        </button>
      ) : (
        <>
          <label>
            {t('p4Max')}{' '}
            <input
              type="number"
              min={1}
              max={99}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </label>
          <label>
            {t('p4Missing')}{' '}
            <select
              value={missing}
              onChange={(e) => setMissing(e.target.value as Policy['on_missing'])}
            >
              <option value="stop">{t('p4Stop')}</option>
              <option value="request_partial">{t('p4Partial')}</option>
            </select>
          </label>
          {saved ? (
            <button
              type="button"
              disabled={!validLimit(policy.max_objects) || same(policy, saved)}
              onClick={() =>
                onAdopt({
                  ...draft,
                  procedure: {
                    ...graph,
                    object_batch: policy,
                    max_steps: policy.max_objects + 1,
                    max_expansions: policy.max_objects + 2,
                  },
                })
              }
            >
              {t('p4Apply')}
            </button>
          ) : (
            <ExpertFromTool
              csrfToken={csrfToken}
              requestId={requestId}
              targetMethodId={methodId}
              onAdopt={onAdopt}
              preview={(worker, confirm) => (
                <ComparisonChoice
                  key={JSON.stringify(worker.procedure)}
                  draft={draft}
                  worker={worker}
                  policy={policy}
                  confirm={confirm}
                />
              )}
            />
          )}
        </>
      )}
    </fieldset>
  )
}
