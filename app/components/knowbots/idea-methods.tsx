'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { MethodVersion } from '@/contracts/author-methods'
import type { MethodChoice } from '@/contracts/method-choice'
import type { WorkdraftBody } from '@/contracts/workdraft'
import { fetchDetail } from '@/lib/knowbots/client'
import { getMethodVersion } from '@/lib/knowbots/methods'
import { MethodVersionBrowser } from './method-version-browser'
import { Card, KEY } from './shared'
import { SELECT } from './workdraft-cells'

function ChoiceRow({
  choice,
  children,
}: {
  choice: MethodChoice
  children?: (method: MethodVersion | undefined) => React.ReactNode
}) {
  const t = useTranslations('ideaMethods')
  const exact = useQuery({
    queryKey: ['author-method-version', choice.method_id, choice.version],
    queryFn: () => getMethodVersion(choice.method_id, choice.version),
    retry: false,
  })
  const method = exact.data?.digest === choice.digest && !exact.isError ? exact.data : undefined
  return (
    <li className="space-y-2 rounded-lg border p-3">
      <p className="font-medium">
        {method?.definition.step.title || t('chosenMethod')} ·{' '}
        {t('version', { version: choice.version })}
      </p>
      {exact.isError || (exact.data && !method) ? <p role="alert">{t('unavailable')}</p> : null}
      {method ? (
        <p className="text-muted-foreground text-sm">{method.definition.step.does}</p>
      ) : null}
      {children?.(method)}
    </li>
  )
}

export function IdeaMethodChoices({ choices }: { choices: MethodChoice[] }) {
  const t = useTranslations('ideaMethods')
  if (!choices.length) return null
  return (
    <section className="mt-3 space-y-2" aria-label={t('title')}>
      <h3 className="font-medium">{t('title')}</h3>
      <p className="text-sm">{t('hint')}</p>
      <ul className="space-y-2">
        {choices.map((choice) => (
          <ChoiceRow key={choice.method_id} choice={choice} />
        ))}
      </ul>
    </section>
  )
}

export function IdeaMethodChooser({
  choices,
  onChange,
  disabled,
}: {
  choices: MethodChoice[]
  onChange: (choices: MethodChoice[]) => void
  disabled: boolean
}) {
  const t = useTranslations('ideaMethods')
  const [open, setOpen] = useState(false)
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-sm font-medium">{t('title')}</legend>
      <p className="text-muted-foreground text-sm">{t('hint')}</p>
      <ul className="space-y-2">
        {choices.map((choice) => (
          <ChoiceRow key={`${choice.method_id}:${choice.version}`} choice={choice}>
            {() => (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange(choices.filter((c) => c.method_id !== choice.method_id))}
              >
                {t('remove')}
              </Button>
            )}
          </ChoiceRow>
        ))}
      </ul>
      <Button type="button" variant="outline" onClick={() => setOpen(!open)}>
        {t(open ? 'close' : 'browse')}
      </Button>
      {open ? (
        <section aria-label={t('browse')} className="space-y-3 rounded-lg border p-4">
          <MethodVersionBrowser disabled={disabled}>
            {(method) => (
              <div className="space-y-2">
                <h3>{method.definition.step.title}</h3>
                <p className="whitespace-pre-wrap">{method.definition.step.does}</p>
                <p>
                  {t('inputs', {
                    names: Object.keys(method.definition.input_schemas).join('、') || t('none'),
                  })}
                </p>
                <p>
                  {t('outputs', {
                    names: method.definition.step.outputs.map((o) => o.name).join('、'),
                  })}
                </p>
                <Button
                  type="button"
                  disabled={
                    disabled ||
                    (choices.length >= 30 && !choices.some((c) => c.method_id === method.method_id))
                  }
                  onClick={() => {
                    onChange([
                      ...choices.filter((c) => c.method_id !== method.method_id),
                      {
                        method_id: method.method_id,
                        version: method.version,
                        digest: method.digest,
                      },
                    ])
                    setOpen(false)
                  }}
                >
                  {t('chooseVersion', { version: method.version })}
                </Button>
              </div>
            )}
          </MethodVersionBrowser>
        </section>
      ) : null}
    </fieldset>
  )
}

/** Picks stay in the immutable idea version until the author explicitly binds them. */
export function IdeaMethodsToAssemble({
  requestId,
  body,
  disabled,
  onChoose,
}: {
  requestId: string
  body: WorkdraftBody
  disabled: boolean
  onChoose: (choice: MethodChoice, alias: string) => void
}) {
  const t = useTranslations('ideaMethods')
  const detail = useQuery({
    queryKey: [...KEY, 'detail', requestId],
    queryFn: () => fetchDetail(requestId),
  })
  if (detail.isError) return <p role="alert">{t('loadFailed')}</p>
  const choices =
    detail.data?.versions.find((v) => v.version === detail.data.latest_version)?.idea
      .method_choices ?? []
  if (!choices.length) return null
  return (
    <Card title={t('toAssemble')}>
      <p>{t('assemblyHint')}</p>
      {!body.planning ? <p>{t('enablePlanning')}</p> : null}
      <ul className="space-y-2">
        {choices.map((choice) => (
          <AssemblyChoice
            key={`${choice.method_id}:${choice.version}`}
            choice={choice}
            body={body}
            disabled={disabled}
            onChoose={onChoose}
          />
        ))}
      </ul>
    </Card>
  )
}

function AssemblyChoice({
  choice,
  body,
  disabled,
  onChoose,
}: {
  choice: MethodChoice
  body: WorkdraftBody
  disabled: boolean
  onChoose: (choice: MethodChoice, alias: string) => void
}) {
  const t = useTranslations('ideaMethods')
  const [target, setTarget] = useState('')
  const bound = Object.entries(body.method_refs ?? {}).filter(
    ([, ref]) =>
      ref.method_id === choice.method_id &&
      ref.version === choice.version &&
      ref.digest === choice.digest,
  )
  const available = body.steps.filter((s) => !body.method_refs?.[s.id])
  const validTarget = available.some((s) => s.id === target)
  return (
    <ChoiceRow choice={choice}>
      {(method) =>
        bound.length ? (
          <p>
            {t('bound', {
              names: bound
                .map(([id]) => body.steps.find((s) => s.id === id)?.title || id)
                .join('、'),
            })}
          </p>
        ) : (
          <fieldset disabled={disabled || !body.planning || !method} className="space-y-2">
            {available.length ? (
              <label>
                {t('target')}
                <select
                  className={SELECT}
                  value={validTarget ? target : ''}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">{t('chooseTarget')}</option>
                  {available.map((step) => (
                    <option key={step.id} value={step.id}>
                      {step.title || step.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>{t('addPosition')}</p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={!validTarget || !method || !body.planning || disabled}
              onClick={() => onChoose(choice, target)}
            >
              {t('assemble')}
            </Button>
          </fieldset>
        )
      }
    </ChoiceRow>
  )
}
