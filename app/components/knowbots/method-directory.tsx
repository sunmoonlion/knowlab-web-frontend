'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
import type { FormalSource } from '@/contracts/formal-methods'
import { DirectoryFacets } from '@/components/common/directory-facets'
import { allMethods } from '@/lib/directory-facets'
import { Button } from '@/components/ui/button'
import { CrossAppLink } from '@/components/common/cross-app-link'
import {
  chooseToolInstallation,
  formalSources,
  browseIncubationDirectory,
  listFormalMethods,
  registerDirectorySource,
  sharedIncubationTools,
  submitSelfListing,
} from '@/lib/knowbots/formal-methods'

export type DirectoryPick = {
  reference: { method_id: string; version: number; digest: string }
  title: string
}
type DirectoryProps = {
  requestId?: string
  revision?: number
  csrfToken?: string
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

export function MethodDirectory({
  requestId,
  revision,
  csrfToken,
  onPick,
  onSource,
}: DirectoryProps) {
  const t = useTranslations('methodDirectory')
  const locale = useLocale()
  const client = useQueryClient()
  const [tab, setTab] = useState<'owned' | 'shared' | 'sources'>(onSource ? 'sources' : 'owned')
  const [facet, setFacet] = useState(allMethods)
  const [offset, setOffset] = useState(0)
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [sourceEditorOpen, setSourceEditorOpen] = useState(false)
  const [sourceKind, setSourceKind] = useState<'script' | 'instruction'>('script')
  const [sourceName, setSourceName] = useState('')
  const [sourceContent, setSourceContent] = useState('')
  const [selfListed, setSelfListed] = useState<Record<string, string>>({})
  const after = cursors[cursors.length - 1]
  const prefix = ['incubation-directory', requestId ?? null, revision ?? null]
  const standalone = !onPick && !onSource && !requestId

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

  const createSource = useMutation({
    mutationFn: () =>
      registerDirectorySource(
        crypto.randomUUID(),
        1,
        {
          kind: sourceKind,
          name: sourceName.trim(),
          content: sourceContent,
          ...(requestId ? { request_id: requestId } : {}),
        },
        csrfToken!,
      ),
    onSuccess: async () => {
      setSourceEditorOpen(false)
      setSourceName('')
      setSourceContent('')
      await client.invalidateQueries({ queryKey: [...prefix, 'sources'] })
    },
  })

  const bindInstall = useMutation({
    mutationFn: (input: {
      reference: { method_id: string; version: number; digest: string }
      asset_id: string
      revision: number
    }) =>
      chooseToolInstallation(
        requestId!,
        input.reference,
        { asset_id: input.asset_id, revision: input.revision },
        csrfToken!,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: [...prefix, 'shared'] }),
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
        method_kind: m.method_kind,
        summary: m.usable ? m.summary : t('needsInstallation'),
        usable: m.usable,
        reference: { method_id: m.method_id, version: m.latest_version, digest: m.digest },
        installations: [] as {
          asset_id: string
          revision: number
          name: string
          account: string | null
        }[],
        selected: null as string | null,
      }))
    : tab === 'owned'
      ? (owned.data ?? []).map((m) => ({
          title: m.title,
          method_kind: m.method_kind,
          summary: m.summary,
          usable: true,
          reference: { method_id: m.method_id, version: m.latest_version, digest: m.digest },
          installations: [] as {
            asset_id: string
            revision: number
            name: string
            account: string | null
          }[],
          selected: null as string | null,
        }))
      : (shared.data?.items ?? []).map((m) => ({
          title: m.title,
          method_kind: 'tool' as const,
          summary: m.selected ? '' : t('needsInstallation'),
          usable: !!m.selected,
          reference: m.reference,
          installations: m.installations ?? [],
          selected: m.selected ?? null,
        }))
  const next = shared.data?.next
  return (
    <section className="space-y-4" aria-label={t('title')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        {standalone ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={`/${locale}/studio`} className="font-medium underline">
              {t('openStudio')}
            </Link>
            <CrossAppLink to="knowmart.knowbots" className="underline">
              {t('browseMarket')}
            </CrossAppLink>
            <CrossAppLink to="knowmart.shop" className="underline">
              {t('openShop')}
            </CrossAppLink>
          </div>
        ) : null}
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
          {csrfToken ? (
            <div className="space-y-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSourceEditorOpen(!sourceEditorOpen)}
              >
                {t('registerSourceInline')}
              </Button>
              {sourceEditorOpen ? (
                <form
                  className="space-y-3 rounded-lg border p-4 text-sm"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (sourceName.trim() && sourceContent.trim()) createSource.mutate()
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      {t('sourceKind')}
                      <select
                        className="mt-1 w-full rounded border bg-background p-2 text-sm"
                        value={sourceKind}
                        onChange={(e) =>
                          setSourceKind(e.target.value as 'script' | 'instruction')
                        }
                      >
                        <option value="script">{t('script')}</option>
                        <option value="instruction">{t('instruction')}</option>
                      </select>
                    </label>
                    <label>
                      {t('sourceName')}
                      <input
                        required
                        maxLength={200}
                        className="mt-1 w-full rounded border bg-background p-2 text-sm"
                        value={sourceName}
                        onChange={(e) => setSourceName(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block">
                    {t('sourceContent')}
                    <textarea
                      required
                      rows={5}
                      maxLength={262144}
                      className="mt-1 w-full rounded border bg-background p-2 font-mono text-sm"
                      value={sourceContent}
                      onChange={(e) => setSourceContent(e.target.value)}
                    />
                  </label>
                  <Button type="submit" size="sm" disabled={createSource.isPending}>
                    {t('saveSource')}
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
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
                className="space-y-1.5 rounded-lg border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong>{s.entry}</strong> · v{s.version} ·{' '}
                    <span className="text-muted-foreground text-xs">{s.kind}</span>
                  </div>
                  {s.delivery_terms ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                      {t('hasDeliveryTerms')}
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs break-all">
                  {s.source} · {s.digest}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {onSource && s.license_basis !== 'pending' && (
                    <Button type="button" size="sm" variant="outline" onClick={() => onSource(s)}>
                      {t('pickSource')}
                    </Button>
                  )}
                  {standalone && s.license_basis !== 'pending' ? (
                    <Link
                      href={`/${locale}/studio?method_kind=tool&source_kind=${encodeURIComponent(s.kind)}&source_name=${encodeURIComponent(s.entry)}`}
                      className="text-xs underline"
                    >
                      {t('wrapAsTool')}
                    </Link>
                  ) : null}
                </div>
                {s.license_basis === 'pending' && <p className="text-xs">{t('pending')}</p>}
              </li>
            ))}
          </ul>
          {!sources.data?.length && <p>{t('empty')}</p>}
          <CrossAppLink to="knowbench.methods" className="text-sm underline">
            {t('manageSources')}
          </CrossAppLink>
        </>
      ) : (
        <>
          <ul className="space-y-2">
            {methods.map((m) => {
              const refKey = `${m.reference.method_id}:${m.reference.version}`
              return (
                <li key={JSON.stringify(m.reference)} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong>{m.title}</strong> · v{m.reference.version}
                      <span className="text-muted-foreground ml-2 text-xs">
                        {t(`methodKind.${m.method_kind}`)}
                      </span>
                    </div>
                    {standalone && tab === 'owned' ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {csrfToken ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={selfListed[refKey] === 'listed'}
                            onClick={async () => {
                              const status = await submitSelfListing(m.reference, csrfToken)
                              setSelfListed({ ...selfListed, [refKey]: status })
                            }}
                          >
                            {selfListed[refKey]
                              ? t(`selfStatus.${selfListed[refKey]}`)
                              : t('syncSelf')}
                          </Button>
                        ) : null}
                        {m.method_kind === 'expert' ? (
                          <CrossAppLink
                            to="knowbench.summonFormal"
                            values={{
                              mode: 'expert',
                              formal_method: `${m.reference.method_id}@${m.reference.version}`,
                            }}
                            className="underline"
                          >
                            {t('tryInWorkbench')}
                          </CrossAppLink>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {m.summary && <p className="text-sm">{m.summary}</p>}
                  {tab === 'shared' && requestId && csrfToken && m.installations.length > 0 ? (
                    <label className="block text-xs">
                      {t('bindInstallation')}{' '}
                      <select
                        className="rounded border bg-background p-1"
                        value={m.selected ?? ''}
                        onChange={(e) => {
                          const found = m.installations.find((x) => x.asset_id === e.target.value)
                          if (found)
                            bindInstall.mutate({
                              reference: m.reference,
                              asset_id: found.asset_id,
                              revision: found.revision,
                            })
                        }}
                      >
                        <option value="">{t('chooseInstallation')}</option>
                        {m.installations.map((inst) => (
                          <option key={inst.asset_id} value={inst.asset_id}>
                            {inst.name}
                            {inst.account ? ` · ${inst.account}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <details className="text-xs">
                    <summary className="cursor-pointer">{t('version')}</summary>
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
              )
            })}
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
