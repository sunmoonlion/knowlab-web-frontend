'use client'

import { useTranslations } from 'next-intl'
import type { FormalDefinition } from '@/contracts/formal-methods'

type Graph = Extract<FormalDefinition['procedure'], { kind: 'orchestration' }>
export function FormalOrchestrationSummary({
  definition,
  collaboration,
}: {
  definition: FormalDefinition
  collaboration?: Graph['collaboration']
}) {
  const t = useTranslations('formalMethod')
  const graph = definition.procedure
  if (graph.kind !== 'orchestration') return null
  const roles = collaboration ?? graph.collaboration
  return (
    <div className="space-y-3 text-sm">
      <p>{t('orchestrationScope')}</p>
      <ul className="space-y-3">
        {graph.steps.map((step) => {
          const role = roles?.[step.id]
          return (
            <li key={step.id} className="space-y-1 rounded border p-3">
              <h3 className="font-medium">{step.id}</h3>
              <p>
                {t('stepRequirement')}: {t(step.always_required ? 'required' : 'conditional')}
              </p>
              <p>
                {t('predecessors')}: {step.depends_on.join(', ') || t('none')}
              </p>
              <p>
                {t('stepConditions')}:{' '}
                {step.candidate_choice
                  ? t('p5ByInput', { input: step.candidate_choice.input })
                  : step.select_when}{' '}
                · {step.required_when}
              </p>
              {step.candidate_choice?.cases.map((c) => (
                <p key={c.equals}>
                  {c.equals} → {c.candidate.method_id} · v{c.candidate.version}
                </p>
              ))}
              {role?.isolation_group && <p>{t('p3Group', { group: role.isolation_group })}</p>}
              {!!role?.handoff_from.length && (
                <p>{t('p3Handoffs', { sources: role.handoff_from.join(', ') })}</p>
              )}
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
                        : binding.source === 'collect_pack'
                          ? binding.items
                              .map((item) => `${item.tag}: ${item.step}.${item.output}`)
                              .join(', ')
                          : JSON.stringify(binding.value)}
                </p>
              ))}
              {!Object.keys(step.inputs).length ? <p>{t('none')}</p> : null}
              <p>
                {t('outputs')}: {Object.keys(step.outputs).join(', ') || t('none')}
              </p>
            </li>
          )
        })}
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
