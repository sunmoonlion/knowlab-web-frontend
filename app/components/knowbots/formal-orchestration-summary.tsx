'use client'

import { useTranslations } from 'next-intl'
import type { FormalDefinition } from '@/contracts/formal-methods'

export function FormalOrchestrationSummary({ definition }: { definition: FormalDefinition }) {
  const t = useTranslations('formalMethod')
  const graph = definition.procedure
  if (graph.kind !== 'orchestration') return null
  return (
    <div className="space-y-3 text-sm">
      <p>{t('orchestrationScope')}</p>
      <ul className="space-y-3">
        {graph.steps.map((step) => (
          <li key={step.id} className="space-y-1 rounded border p-3">
            <h3 className="font-medium">{step.id}</h3>
            <p>
              {t('stepRequirement')}: {t(step.always_required ? 'required' : 'conditional')}
            </p>
            <p>
              {t('predecessors')}: {step.depends_on.join(', ') || t('none')}
            </p>
            <p>
              {t('stepConditions')}: {step.select_when} · {step.required_when}
            </p>
            <p>{t('exactDependencies')}</p>
            {step.candidates.map((ref) => (
              <p key={`${ref.method_id}:${ref.version}:${ref.digest}`} className="break-all">
                {ref.method_id} · {t('version')} {ref.version} · {ref.digest}
              </p>
            ))}
            <p>{t('inputBindings')}</p>
            {Object.entries(step.inputs).map(([name, { binding }]) => (
              <p key={name} className="break-all">
                {name} ← {t(`bindingSources.${binding.source}`)}:{' '}
                {binding.source === 'caller' || binding.source === 'object_item'
                  ? binding.name
                  : binding.source === 'step' || binding.source === 'object_rows'
                    ? `${binding.step}.${binding.output}`
                    : binding.source === 'resource'
                      ? `${binding.requirement_id}.${binding.role}`
                      : JSON.stringify(binding.value)}
              </p>
            ))}
            {!Object.keys(step.inputs).length ? <p>{t('none')}</p> : null}
            <p>
              {t('outputs')}: {Object.keys(step.outputs).join(', ') || t('none')}
            </p>
          </li>
        ))}
      </ul>
      <h3 className="font-medium">{t('graphExports')}</h3>
      {Object.entries(graph.exports).map(([name, ref]) => (
        <p key={name}>
          {name} ← {ref.step}.{ref.output} · {t(ref.always_present ? 'required' : 'conditional')}
        </p>
      ))}
    </div>
  )
}
