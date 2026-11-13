'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import type { Step } from '@/contracts/workdraft'

type Requirements = NonNullable<Step['advanced']['managed_capabilities']>

export function ManagedCapabilitiesEditor({
  value,
  onChange,
}: {
  requestId?: string
  value: Requirements | null | undefined
  onChange: (value: Requirements | null) => void
}) {
  const t = useTranslations('workdraft.managed')
  const hasBindings = !!(value?.tools.length || value?.skills.length)
  return (
    <section className="space-y-3 rounded border p-3">
      <h4 className="font-medium">{t('title')}</h4>
      <p role="status" className="text-muted-foreground text-sm">
        {t('authoringPaused')}
      </p>
      {hasBindings ? (
        <>
          <ul className="list-inside list-disc text-sm">
            {value?.tools.map((tool) => (
              <li key={`${tool.url}:${tool.name}`}>{tool.name}</li>
            ))}
            {value?.skills.map((skill) => (
              <li key={skill.name}>
                {skill.name} · {skill.version}
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" onClick={() => onChange(null)}>
            {t('clearBindings')}
          </Button>
        </>
      ) : null}
    </section>
  )
}
