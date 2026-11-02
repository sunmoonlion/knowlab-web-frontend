'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { MethodVersion } from '@/contracts/author-methods'
import type { MethodChoice } from '@/contracts/method-choice'
import { getMethodVersion, listMethods } from '@/lib/knowbots/methods'
import { INPUT } from './workdraft-cells'
import { MethodVersionChanges } from './method-version-changes'

const PAGE = 30

/** One source of version discovery for idea shortlists and workdraft bindings. */
export function MethodVersionBrowser({
  initialChoice,
  disabled = false,
  children,
}: {
  initialChoice?: MethodChoice
  disabled?: boolean
  children: (method: MethodVersion) => React.ReactNode
}) {
  const t = useTranslations('workdraft.methods')
  const [page, setPage] = useState(0)
  const [chosen, setChosen] = useState<{ id: string; version: number } | null>(
    initialChoice ? { id: initialChoice.method_id, version: initialChoice.version } : null,
  )
  const list = useQuery({
    queryKey: ['author-methods', page],
    queryFn: () => listMethods(page * PAGE, PAGE),
    retry: false,
  })
  const exact = useQuery({
    queryKey: ['author-method-version', chosen?.id, chosen?.version],
    enabled: chosen !== null,
    queryFn: () => getMethodVersion(chosen!.id, chosen!.version),
    retry: false,
  })
  const changing = Boolean(
    initialChoice &&
    chosen &&
    (chosen.id !== initialChoice.method_id || chosen.version !== initialChoice.version),
  )
  const original = useQuery({
    queryKey: ['author-method-version', initialChoice?.method_id, initialChoice?.version],
    enabled: changing,
    queryFn: () => getMethodVersion(initialChoice!.method_id, initialChoice!.version),
    retry: false,
  })
  const originalInvalid =
    changing &&
    (original.isError || Boolean(original.data && original.data.digest !== initialChoice?.digest))
  const comparisonReady =
    !changing || Boolean(original.data && !original.isFetching && !originalInvalid)
  const mismatch = Boolean(
    initialChoice &&
    exact.data &&
    initialChoice.method_id === exact.data.method_id &&
    initialChoice.version === exact.data.version &&
    initialChoice.digest !== exact.data.digest,
  )
  return (
    <>
      <fieldset disabled={disabled} className="space-y-3">
        {list.isError ? (
          <p role="alert">{t('loadFailed')}</p>
        ) : !list.data ? (
          <p>{t('loading')}</p>
        ) : !list.data.length ? (
          <p>{t('empty')}</p>
        ) : (
          <ul className="space-y-2">
            {list.data.map((item) => (
              <li key={item.method_id}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setChosen({
                      id: item.method_id,
                      version: item.latest_version,
                    })
                  }
                >
                  {item.title || item.method_id} · {t('version', { version: item.latest_version })}
                </Button>
                {item.method_id === chosen?.id && item.latest_version > chosen.version ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setChosen({ id: item.method_id, version: item.latest_version })}
                  >
                    {t('viewLatest', { version: item.latest_version })}
                  </Button>
                ) : null}
                {item.summary ? (
                  <p className="text-muted-foreground text-xs">{item.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page === 0 || list.isFetching}
            onClick={() => setPage(page - 1)}
          >
            {t('previous')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!list.data || list.data.length < PAGE || list.isFetching}
            onClick={() => setPage(page + 1)}
          >
            {t('next')}
          </Button>
        </div>
        {chosen ? (
          <label className="block">
            {t('versionLabel')}
            <input
              className={INPUT}
              type="number"
              min={1}
              max={999999}
              value={chosen.version}
              onChange={(event) => {
                const version = Number(event.target.value)
                if (Number.isInteger(version) && version >= 1 && version <= 999999)
                  setChosen({ ...chosen, version })
              }}
            />
          </label>
        ) : null}
      </fieldset>
      {chosen && (exact.isError || mismatch) ? <p role="alert">{t('versionFailed')}</p> : null}
      {originalInvalid ? <p role="alert">{t('originalFailed')}</p> : null}
      {changing && original.isFetching ? <p>{t('loading')}</p> : null}
      {chosen && exact.isFetching ? <p>{t('loading')}</p> : null}
      {chosen &&
      exact.data &&
      !exact.isFetching &&
      !exact.isError &&
      !mismatch &&
      comparisonReady ? (
        <>
          {changing && original.data ? (
            <MethodVersionChanges before={original.data} after={exact.data} />
          ) : null}
          {children(exact.data)}
        </>
      ) : null}
    </>
  )
}
