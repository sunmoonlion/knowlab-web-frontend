'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { FormalDefinition } from '@/contracts/formal-methods'
import { listFormalMethods, sharedIncubationTools } from '@/lib/knowbots/formal-methods'
import { AdoptTool, ToolInstallationChoice, useToolVersion } from './tool-version-choice'

export function ExpertFromTool({
  csrfToken,
  requestId,
  targetMethodId,
  onAdopt,
}: {
  csrfToken: string
  requestId: string
  targetMethodId: string
  onAdopt: (definition: FormalDefinition) => void
}) {
  const t = useTranslations('formalMethod')
  const [shared, setShared] = useState(false)
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const after = cursors[cursors.length - 1]
  const [page, setPage] = useState(0)
  const [digestKey, setDigestKey] = useState('')
  const catalog = useQuery({
    queryKey: ['formal-methods', page],
    queryFn: () => listFormalMethods(page * 30),
    retry: false,
  })
  const owned = catalog.data?.filter(
    (item) => item.method_kind === 'tool' && item.method_id !== targetMethodId,
  )
  const grants = useQuery({
    queryKey: ['incubation-tools', requestId, after],
    queryFn: () => sharedIncubationTools(requestId, after),
    enabled: shared,
    retry: false,
  })
  const directory = shared ? grants : catalog
  const tools = shared
    ? grants.data?.items
        .filter((x) => x.reference.method_id !== targetMethodId)
        .map((x) => ({ ...x.reference, title: x.title, latest_version: x.reference.version }))
    : owned
  const key = (item: NonNullable<typeof tools>[number]) =>
    [item.method_id, item.latest_version, item.digest].join(':')
  const selected = tools?.find((item) => key(item) === digestKey)
  const ref = selected && {
    method_id: selected.method_id,
    version: selected.latest_version,
    digest: selected.digest,
  }
  const { version, item, binding, proposed } = useToolVersion(requestId, ref, shared, csrfToken)
  const go = (next: number) => {
    setDigestKey('')
    if (shared) {
      if (next < page) setCursors(cursors.slice(0, -1))
      else if (grants.data?.next) setCursors([...cursors, grants.data.next])
    }
    setPage(next)
  }
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend>{t('startExpert')}</legend>
      <label className="block text-sm">
        {t('toolDirectory')}
        <select
          value={shared ? 'shared' : 'owned'}
          onChange={(e) => {
            setShared(e.target.value === 'shared')
            setPage(0)
            setCursors([null])
            setDigestKey('')
          }}
        >
          <option value="owned">{t('ownTools')}</option>
          <option value="shared">{t('sharedTools')}</option>
        </select>
      </label>
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
      {directory.isPending && <p role="status">{t('loading')}</p>}
      {directory.isError && <p role="alert">{t('methodsFailed')}</p>}
      {directory.isSuccess && !tools?.length && <p role="status">{t('noToolsOnPage')}</p>}
      {(page > 0 || (shared ? !!grants.data?.next : catalog.data?.length === 30)) && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!page || directory.isFetching}
            onClick={() => go(page - 1)}
          >
            {t('previous')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              (shared ? !grants.data?.next : catalog.data?.length !== 30) || directory.isFetching
            }
            onClick={() => go(page + 1)}
          >
            {t('next')}
          </Button>
        </div>
      )}
      <ToolInstallationChoice
        item={item}
        pending={binding.isPending || version.isFetching}
        failed={binding.isError}
        onChoose={(id) => binding.mutate(id)}
      />
      {selected && version.isError && <p role="alert">{t('versionUnavailable')}</p>}
      {selected && version.isSuccess && !version.data?.draft && (
        <p role="alert">{t('hostToolRequired')}</p>
      )}
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
      <AdoptTool
        key={JSON.stringify([requestId, digestKey, item?.selected, item?.installations])}
        requestId={requestId}
        item={item}
        disabled={
          !proposed ||
          binding.isPending ||
          directory.isError ||
          directory.isFetching ||
          version.isFetching
        }
        label={t('useToolAsStep')}
        onAdopt={() => proposed && onAdopt(proposed)}
        onUnavailable={() => {
          void version.refetch()
        }}
      />
    </fieldset>
  )
}
