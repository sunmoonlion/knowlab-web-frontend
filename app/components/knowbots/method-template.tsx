'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { MethodTemplate, WorkdraftBody } from '@/contracts/workdraft'
import { Button } from '@/components/ui/button'

const fields = ['goal', 'deliverable', 'check', 'evidence'] as const

export function TemplateSummary({ template }: { template: MethodTemplate }) {
  const t = useTranslations('methodTemplate')
  return (
    <section className="space-y-2 rounded border p-4">
      <h2 className="font-medium">{t('title')}</h2>
      <dl>
        {fields.map((key) => (
          <div key={key}>
            <dt className="text-sm font-medium">{t(key)}</dt>
            <dd className="whitespace-pre-wrap">{template[key]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm">{t('fixed')}</p>
    </section>
  )
}

export function MethodTemplateForm({
  body,
  title,
  preferred,
  disabled,
  onAdopt,
}: {
  body: WorkdraftBody
  title: string
  preferred: boolean
  disabled: boolean
  onAdopt: (value: MethodTemplate | null) => Promise<void>
}) {
  const t = useTranslations('methodTemplate')
  const saved = body.method_template
  const [opened, setOpened] = useState(preferred || !!saved)
  const [value, setValue] = useState<MethodTemplate>(
    () =>
      saved ?? {
        template: 'checked_delivery/v1',
        goal: body.scope.does || body.tagline || title,
        deliverable: '',
        check: '',
        evidence: '',
      },
  )
  return (
    <fieldset disabled={disabled} className="space-y-2 rounded border p-4">
      <legend>{t('overall')}</legend>
      <button type="button" aria-expanded={opened} onClick={() => setOpened(!opened)}>
        {t('title')}
      </button>
      {opened && (
        <>
          <p className="text-sm">{t('fixed')}</p>
          {fields.map((key) => (
            <label className="block text-sm" key={key}>
              {t(key)}
              <textarea
                required
                maxLength={2000}
                className="block w-full rounded border p-2"
                value={value[key]}
                onChange={(e) => setValue({ ...value, [key]: e.target.value })}
              />
            </label>
          ))}
          <Button
            type="button"
            disabled={fields.some((key) => !value[key].trim())}
            onClick={() => void onAdopt(value)}
          >
            {t('adopt')}
          </Button>
          {saved && (
            <Button type="button" variant="outline" onClick={() => void onAdopt(null)}>
              {t('remove')}
            </Button>
          )}
        </>
      )}
    </fieldset>
  )
}
