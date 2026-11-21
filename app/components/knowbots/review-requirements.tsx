'use client'

import { useTranslations } from 'next-intl'
import { ReviewStages } from './review-stages'
import type { FormalDefinition } from '@/contracts/formal-methods'
import type { WorkdraftBody } from '@/contracts/workdraft'

type Roles = NonNullable<WorkdraftBody['collaboration']>
type Requirement = NonNullable<Roles[string]['review_requirements']>[string]

export function ReviewRequirements({
  definition,
  collaboration,
  onChange,
}: {
  definition: FormalDefinition | null
  collaboration: Roles | null
  onChange: (roles: Roles | null) => void
}) {
  const t = useTranslations('formalMethod')
  const graph = definition?.procedure
  const edges = new Map<string, Set<string>>()
  if (graph?.kind === 'orchestration') {
    for (const step of graph.steps) {
      edges.set(
        step.id,
        new Set(
          Object.values(step.inputs).flatMap(({ binding }) =>
            binding.source === 'step' && step.depends_on.includes(binding.step)
              ? [binding.step]
              : [],
          ),
        ),
      )
    }
  }
  // Retain requirements from the saved graph until the author explicitly clears them.
  for (const [step, role] of Object.entries(collaboration ?? {})) {
    const sources = edges.get(step) ?? new Set<string>()
    for (const source of Object.keys(role.review_requirements ?? {})) sources.add(source)
    edges.set(step, sources)
  }
  function update(step: string, producer: string, requirement: Requirement | '') {
    const roles = { ...collaboration }
    const role = { ...(roles[step] ?? { isolation_group: null, handoff_from: [] }) }
    const reviews = { ...role.review_requirements }
    if (requirement) reviews[producer] = requirement
    else {
      delete reviews[producer]
      delete role.comparison
    }
    if (Object.keys(reviews).length) role.review_requirements = reviews
    else delete role.review_requirements
    if (role.review_requirements || role.isolation_group || role.handoff_from.length)
      roles[step] = role
    else delete roles[step]
    onChange(Object.keys(roles).length ? roles : null)
  }
  return (
    <>
      {Array.from(edges).flatMap(([reviewer, sources]) =>
        Array.from(sources).map((producer) => {
          const role = collaboration?.[reviewer]
          const step = graph?.kind === 'orchestration' && graph.steps.find((s) => s.id === reviewer)
          const bindings = step ? Object.values(step.inputs).map((f) => f.binding) : []
          const direct =
            step &&
            step.depends_on.length === 1 &&
            step.depends_on[0] === producer &&
            bindings.every((b) => b.source === 'step' && b.step === producer)
          const outputs = direct
            ? [...new Set(bindings.flatMap((b) => (b.source === 'step' ? [b.output] : [])))]
            : []
          return (
            <div key={reviewer + ':' + producer}>
              <label className="block text-sm">
                {t('reviewEdge', { reviewer, producer })}{' '}
                <select
                  value={collaboration?.[reviewer]?.review_requirements?.[producer] ?? ''}
                  onChange={(event) =>
                    update(reviewer, producer, event.target.value as Requirement | '')
                  }
                >
                  <option value="">{t('noReview')}</option>
                  <option value="isolated_reviewer">{t('isolatedReview')}</option>
                  <option value="different_model_family">{t('familyReview')}</option>
                </select>
              </label>
              {role?.review_requirements?.[producer] && (
                <ReviewStages
                  comparison={role.comparison}
                  available={outputs.length >= 2 ? outputs : []}
                  firstRound={outputs.filter((n) => n !== role.comparison?.assessment_output)}
                  onChange={(value) => {
                    const next = { ...role }
                    if (value) next.comparison = value
                    else delete next.comparison
                    onChange({ ...collaboration, [reviewer]: next })
                  }}
                />
              )}
            </div>
          )
        }),
      )}
    </>
  )
}
