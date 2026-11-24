'use client'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { FormalSource } from '@/contracts/formal-methods'
import { DirectoryFacets } from '@/components/common/directory-facets'
import { allMethods } from '@/lib/directory-facets'
import { Button } from '@/components/ui/button'
import { CrossAppLink } from '@/components/common/cross-app-link'
import {
  formalSources,
  browseIncubationDirectory,
  listFormalMethods,
  sharedIncubationTools,
} from '@/lib/knowbots/formal-methods'

export type DirectoryPick = {
  reference: { method_id: string; version: number; digest: string }
  title: string
}
type DirectoryProps = {
  requestId?: string
  revision?: number
  onPick?: (row: DirectoryPick) => void
  onSource?: (source: FormalSource) => void
}

export function DraftMethodDirectory(props: DirectoryProps) {
  const [open, setOpen] = useState(false)
  const t = useTranslations('methodDirectory')
  return (
    <div>
      <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('title')}
      </Button>
      {open && <MethodDirectory {...props} />}
    </div>
  )
}

export function MethodDirectory({ requestId, revision, onPick, onSource }: DirectoryProps) {
  const t = useTranslations('methodDirectory')
  const [tab, setTab] = useState<'owned' | 'shared' | 'sources'>(onSource ? 'sources' : 'owned')
  const [facet, setFacet] = useState(allMethods)
  const [offset, setOffset] = useState(0)
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const after = cursors[cursors.length - 1]
  const prefix = ['incubation-directory', requestId ?? null, revision ?? null]
  const owned = useQuery({
    queryKey: [...prefix, 'owned', offset],
    queryFn: () => listFormalMethods(offset, requestId),
    enabled: tab === 'owned' && !facet.kind,
    retry: false,
  })
  const shared = useQuery({
    queryKey: [...prefix, 'shared', after],
    queryFn: () => sharedIncubationTools(requestId, after),
    enabled: tab === 'shared' && !facet.kind,
    retry: false,
  })
  const sources = useQuery({
    queryKey: [...prefix, 'sources'],
    queryFn: () => formalSources(requestId),
    enabled: tab === 'sources',
    retry: false,
  })
  const filtered = useQuery({
    queryKey: [...prefix, 'browse', tab, facet, offset],
    enabled: tab !== 'sources' && !!facet.kind,
    queryFn: () =>
      browseIncubationDirectory(tab === 'shared' ? 'shared' : 'owned', facet, offset, requestId),
  })
  const query =
    tab !== 'sources' && facet.kind
      ? filtered
      : tab === 'owned'
        ? owned
        : tab === 'shared'
          ? shared
          : sources
  const methods = facet.kind
    ? (filtered.data?.items ?? []).map((m) => ({
        title: m.title,
        summary: m.usable ? m.summary : t('needsInstallation'),
        usable: m.usable,
        reference: { method_id: m.method_id, version: m.latest_version, digest: m.digest },
      }))
    : tab === 'owned'
      ? (owned.data ?? []).map((m) => ({
          title: m.title,
          summary: m.summary,
          usable: true,
          reference: { method_id: m.method_id, version: m.latest_version, digest: m.digest },
        }))
      : (shared.data?.items ?? []).map((m) => ({
          title: m.title,
          summary: m.selected ? '' : t('needsInstallation'),
          usable: !!m.selected,
          reference: m.reference,
        }))
  const next = shared.data?.next
  return (
    <section className="space-y-3" aria-label={t('title')}>
      <div className="flex flex-wrap gap-2">
        {(['owned', 'shared', 'sources'] as const).map((k) => (
          <Button
            key={k}
            type="button"
            variant={k === tab ? 'default' : 'outline'}
            aria-pressed={k === tab}
            onClick={() => {
              setTab(k)
              setFacet(allMethods)
              setOffset(0)
              setCursors([null])
            }}
          >
            {t(k)}
          </Button>
        ))}
      </div>
      {tab !== 'sources' && (
        <DirectoryFacets
          shared={tab === 'shared'}
          value={facet}
          change={(v) => {
            setFacet(v)
            setOffset(0)
            setCursors([null])
          }}
          categories={filtered.data?.categories}
          total={filtered.data?.total}
        />
      )}
      {query.isError ? (
        <p role="alert">
          {t('failed')}{' '}
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t('retry')}
          </Button>
        </p>
      ) : query.isPending ? (
        <p role="status">{t('loading')}</p>
      ) : tab === 'sources' ? (
        <>
          <ul className="space-y-2">
            {sources.data?.map((s) => (
              <li
                key={JSON.stringify([
                  s.kind,
                  s.source,
                  s.entry,
                  s.version,
                  s.digest,
                  s.asset_id,
                  s.asset_revision,
                ])}
                className="rounded border p-3"
              >
                <strong>{s.entry}</strong> · v{s.version}
                <p className="text-sm break-all">
                  {s.source} · {s.digest}
                </p>
                {onSource && s.license_basis !== 'pending' && (
                  <Button type="button" variant="outline" onClick={() => onSource(s)}>
                    {t('pickSource')}
                  </Button>
                )}
                {s.license_basis === 'pending' && <p>{t('pending')}</p>}
              </li>
            ))}
          </ul>
          {!sources.data?.length && <p>{t('empty')}</p>}
          <CrossAppLink to="knowbench.methods" className="underline">
            {t('manageSources')}
          </CrossAppLink>
        </>
      ) : (
        <>
          <ul className="space-y-2">
            {methods.map((m) => (
              <li key={JSON.stringify(m.reference)} className="space-y-1 rounded border p-3">
                <strong>{m.title}</strong> · v{m.reference.version}
                {m.summary && <p>{m.summary}</p>}
                <details>
                  <summary>{t('version')}</summary>
                  <code className="break-all">
                    {m.reference.method_id} · {m.reference.digest}
                  </code>
                </details>
                {onPick && m.usable && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onPick({ reference: m.reference, title: m.title })}
                  >
                    {t('pick')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!methods.length && <p>{t('empty')}</p>}
        </>
      )}
      {(tab === 'owned' || (tab === 'shared' && facet.kind)) && (
        <div className="flex gap-2">
          {offset > 0 && (
            <Button variant="outline" onClick={() => setOffset(offset - 30)}>
              {t('previous')}
            </Button>
          )}
          {(facet.kind ? filtered.data?.next != null : owned.data?.length === 30) && (
            <Button variant="outline" onClick={() => setOffset(offset + 30)}>
              {t('next')}
            </Button>
          )}
        </div>
      )}
      {tab === 'shared' && !facet.kind && (
        <div className="flex gap-2">
          {cursors.length > 1 && (
            <Button variant="outline" onClick={() => setCursors(cursors.slice(0, -1))}>
              {t('previous')}
            </Button>
          )}
          {next && (
            <Button variant="outline" onClick={() => setCursors([...cursors, next])}>
              {t('next')}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
