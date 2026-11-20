'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { FormalDefinition } from '@/contracts/formal-methods'
import {
  getFormalVersion,
  listFormalMethods,
  sharedIncubationTools,
  chooseToolInstallation,
} from '@/lib/knowbots/formal-methods'
import { expertFromTool, expertFromToolContract } from '@/lib/knowbots/formal-orchestration'

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
  const version = useQuery({
    queryKey: [
      'expert-source-version',
      requestId,
      shared,
      selected?.method_id,
      selected?.latest_version,
      selected?.digest,
    ],
    enabled: !!selected,
    retry: false,
    queryFn: async () => {
      if (!selected) throw new Error('missing_version')
      if (shared) {
        const ref = {
          method_id: selected.method_id,
          version: selected.latest_version,
          digest: selected.digest,
        }
        const item = (await sharedIncubationTools(requestId, null, ref)).items[0]
        if (!item?.interface) throw new Error('missing_version')
        return { draft: expertFromToolContract(ref, item.interface), item }
      }
      const value = await getFormalVersion(selected.method_id, selected.latest_version)
      if (value.digest !== selected.digest) throw new Error('method_integrity')
      return { draft: expertFromTool(value), item: null }
    },
  })
  const item = version.data?.item
  const binding = useMutation({
    mutationFn: async (id: string) => {
      const installation = item?.installations.find((x) => x.asset_id === id)
      if (!installation || !item) throw new Error('missing_installation')
      await chooseToolInstallation(requestId, item.reference, installation, csrfToken)
    },
    onSuccess: () => version.refetch(),
  })
  const proposed = selected && (!item || item.selected) ? version.data?.draft : null
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
      {item && (item.installations.length > 1 || !item.selected) && (
        <label className="block text-sm">
          {t('executionInstallation')}
          <select
            value={item.selected ?? ''}
            disabled={binding.isPending || version.isFetching}
            onChange={(e) => binding.mutate(e.target.value)}
          >
            <option value="" disabled>
              {t('chooseInstallation')}
            </option>
            {item.installations.map((x) => (
              <option key={x.asset_id} value={x.asset_id}>
                {x.name}
                {x.account ? ' · ' + x.account : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {binding.isError && <p role="alert">{t('versionUnavailable')}</p>}
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
      <Button
        type="button"
        disabled={
          !proposed ||
          binding.isPending ||
          version.isError ||
          directory.isError ||
          version.isFetching ||
          directory.isFetching
        }
        onClick={() => proposed && onAdopt(proposed)}
      >
        {t('useToolAsStep')}
      </Button>
    </fieldset>
  )
}
