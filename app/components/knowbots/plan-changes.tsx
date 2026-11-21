'use client'

import { useTranslations } from 'next-intl'
import type { FormalDefinition } from '@/contracts/formal-methods'
import { same } from '@/lib/knowbots/workdraft'

export function PlanChanges({
  before,
  after,
}: {
  before: FormalDefinition
  after: FormalDefinition
}) {
  const t = useTranslations('formalMethod')
  const graph = before.procedure,
    next = after.procedure
  if (graph.kind !== 'orchestration' || next.kind !== 'orchestration') return null
  const rows: { path: string; old: unknown; value: unknown }[] = []
  function compare(path: string, old: unknown, value: unknown) {
    if (!same(old ?? null, value ?? null)) rows.push({ path, old, value })
  }
  for (const step of next.steps) {
    const original = graph.steps.find((s) => s.id === step.id)
    compare(step.id + '.candidates', original?.candidates, step.candidates)
    compare(step.id + '.depends_on', original?.depends_on, step.depends_on)
    for (const name of new Set([
      ...Object.keys(original?.inputs ?? {}),
      ...Object.keys(step.inputs),
    ]))
      compare(step.id + '.inputs.' + name, original?.inputs[name], step.inputs[name])
    compare(step.id + '.outputs', original?.outputs, step.outputs)
  }
  compare(t('graphExports'), graph.exports, next.exports)
  compare('max_steps', graph.max_steps, next.max_steps)
  compare('max_expansions', graph.max_expansions, next.max_expansions)
  compare(t('permissions'), before.access_requirements, after.access_requirements)
  compare(t('approvals'), before.what_requires_approval, after.what_requires_approval)
  return (
    <details>
      <summary>{t('p1Changes', { count: rows.length })}</summary>
      <ul>
        {rows.map((r) => (
          <li key={r.path}>
            <strong>{r.path}</strong>
            <pre className="break-all whitespace-pre-wrap">
              {JSON.stringify(r.old) ?? '∅'} → {JSON.stringify(r.value) ?? '∅'}
            </pre>
          </li>
        ))}
      </ul>
    </details>
  )
}
