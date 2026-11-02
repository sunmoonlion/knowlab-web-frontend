'use client'

import { useTranslations } from 'next-intl'

import type { MethodVersion } from '@/contracts/author-methods'
import { same } from '@/lib/knowbots/workdraft'

/** Compare the immutable definitions, not the expert's local aliases or bounds. */
export function MethodVersionChanges({
  before,
  after,
}: {
  before: MethodVersion
  after: MethodVersion
}) {
  const t = useTranslations('workdraft.methods.changes')
  const fields = [
    'title',
    'does',
    'why',
    'uses',
    'rules',
    'ask_before',
    'outputs',
    'checks',
    'on_fail',
    'advanced',
    'selection',
  ] as const
  const changes = [
    {
      name: 'input_schemas' as const,
      before: before.definition.input_schemas,
      after: after.definition.input_schemas,
    },
    ...fields.map((name) => ({
      name,
      before: before.definition.step[name],
      after: after.definition.step[name],
    })),
  ].filter((change) => !same(change.before, change.after))
  const display = (value: unknown) =>
    typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return (
    <section
      className="space-y-3 rounded-lg border p-3"
      aria-label={t('heading', { from: before.version, to: after.version })}
    >
      <h3 className="font-medium">{t('heading', { from: before.version, to: after.version })}</h3>
      {before.method_id !== after.method_id ? <p>{t('differentMethod')}</p> : null}
      <p className="text-muted-foreground text-sm">{t('hint')}</p>
      {changes.length ? (
        changes.map((change) => (
          <details key={change.name}>
            <summary>{t(change.name)}</summary>
            <dl className="grid gap-2 py-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium">{t('before')}</dt>
                <dd className="break-words whitespace-pre-wrap">{display(change.before)}</dd>
              </div>
              <div>
                <dt className="font-medium">{t('after')}</dt>
                <dd className="break-words whitespace-pre-wrap">{display(change.after)}</dd>
              </div>
            </dl>
          </details>
        ))
      ) : (
        <p>{t('sameDefinition')}</p>
      )}
    </section>
  )
}
