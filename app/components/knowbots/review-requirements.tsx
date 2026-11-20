'use client'

import { useTranslations } from 'next-intl'
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
    else delete reviews[producer]
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
        Array.from(sources).map((producer) => (
          <label className="block text-sm" key={reviewer + ':' + producer}>
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
        )),
      )}
    </>
  )
}
