'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { FormalDefinition } from '@/contracts/formal-methods'
import { getFormalVersion, listFormalMethods } from '@/lib/knowbots/formal-methods'
import { expertFromTool } from '@/lib/knowbots/formal-orchestration'

export function ExpertFromTool({
  targetMethodId,
  onAdopt,
}: {
  targetMethodId: string
  onAdopt: (definition: FormalDefinition) => void
}) {
  const t = useTranslations('formalMethod')
  const [page, setPage] = useState(0)
  const [digestKey, setDigestKey] = useState('')
  const catalog = useQuery({
    queryKey: ['formal-methods', page],
    queryFn: () => listFormalMethods(page * 30),
    retry: false,
  })
  const tools = catalog.data?.filter(
    (item) => item.method_kind === 'tool' && item.method_id !== targetMethodId,
  )
  const key = (item: NonNullable<typeof tools>[number]) =>
    [item.method_id, item.latest_version, item.digest].join(':')
  const selected = tools?.find((item) => key(item) === digestKey)
  const version = useQuery({
    queryKey: [
      'expert-source-version',
      selected?.method_id,
      selected?.latest_version,
      selected?.digest,
    ],
    enabled: !!selected,
    retry: false,
    queryFn: async () => {
      if (!selected) throw new Error('missing_version')
      const value = await getFormalVersion(selected.method_id, selected.latest_version)
      if (value.digest !== selected.digest) throw new Error('method_integrity')
      return value
    },
  })
  const proposed = selected && version.data ? expertFromTool(version.data) : null
  const go = (next: number) => {
    setDigestKey('')
    setPage(next)
  }
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend>{t('startExpert')}</legend>
      <label className="block text-sm">
        {t('registeredTool')}
        <select
          className="bg-background mt-1 w-full rounded border p-2"
          value={selected ? digestKey : ''}
          onChange={(e) => setDigestKey(e.target.value)}
        >
          <option value="">{t('chooseRegisteredTool')}</option>
          {tools?.map((item) => (
            <option key={key(item)} value={key(item)}>
              {item.title} · v{item.latest_version}
            </option>
          ))}
        </select>
      </label>
      {catalog.isPending && <p role="status">{t('loading')}</p>}
      {catalog.isError && <p role="alert">{t('methodsFailed')}</p>}
      {catalog.isSuccess && !tools?.length && <p role="status">{t('noToolsOnPage')}</p>}
      {(page > 0 || catalog.data?.length === 30) && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!page || catalog.isFetching}
            onClick={() => go(page - 1)}
          >
            {t('previous')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={catalog.data?.length !== 30 || catalog.isFetching}
            onClick={() => go(page + 1)}
          >
            {t('next')}
          </Button>
        </div>
      )}
      {selected && version.isError && <p role="alert">{t('versionUnavailable')}</p>}
      {selected && version.isSuccess && !proposed && <p role="alert">{t('hostToolRequired')}</p>}
      {proposed?.procedure.kind === 'orchestration' && (
        <div className="space-y-1 text-sm">
          <p>{proposed.capability_declaration.purpose}</p>
          <p>
            {t('inputs')}: {Object.keys(proposed.procedure.steps[0].inputs).join(', ') || t('none')}
          </p>
          <p>
            {t('outputs')}: {Object.keys(proposed.procedure.exports).join(', ')}
          </p>
          <p>{t('reviewToolDraft')}</p>
        </div>
      )}
      <Button
        type="button"
        disabled={
          !proposed ||
          version.isError ||
          catalog.isError ||
          version.isFetching ||
          catalog.isFetching
        }
        onClick={() => proposed && onAdopt(proposed)}
      >
        {t('useToolAsStep')}
      </Button>
    </fieldset>
  )
}
