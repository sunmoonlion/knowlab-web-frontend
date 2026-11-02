'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { MethodVersion } from '@/contracts/author-methods'
import { STEP_ID, type Step } from '@/contracts/workdraft'
import { ApiClientError } from '@/lib/common/api-client'
import { freezeMethod, listMethods } from '@/lib/knowbots/methods'

import { INPUT, SELECT } from './workdraft-cells'
import { Panel } from './workdraft-panels'

export function MethodFreezePanel({
  requestId,
  revision,
  step,
  csrfToken,
  onDone,
  onClose,
}: {
  requestId: string
  revision: number
  step: Step
  csrfToken: string
  onDone: (method: MethodVersion) => void
  onClose: () => void
}) {
  const t = useTranslations('workdraft.freeze')
  // A new persisted identity, generated once so retrying a lost response is idempotent.
  const [newId] = useState(() => crypto.randomUUID())
  const [target, setTarget] = useState<{
    method_id: string
    latest_version: number
    title: string
  } | null>(null)
  const [page, setPage] = useState(0)
  const [slots, setSlots] = useState<Record<string, string>>({})
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const methods = useQuery({
    queryKey: ['author-methods', page],
    queryFn: () => listMethods(page * 30, 30),
    retry: false,
  })
  const version = target ? target.latest_version + 1 : 1
  const valid =
    version <= 999999 &&
    step.uses.every((alias) => STEP_ID.test(slots[alias] ?? '') && slots[alias] !== 'method') &&
    new Set(step.uses.map((alias) => slots[alias])).size === step.uses.length
  const freeze = async () => {
    if (!valid) return
    setWorking(true)
    setError(null)
    try {
      const got = await freezeMethod(
        target?.method_id ?? newId,
        version,
        {
          request_id: requestId,
          revision,
          step_id: step.id,
          input_slots: Object.fromEntries(step.uses.map((alias) => [alias, slots[alias]])),
        },
        csrfToken,
      )
      onDone(got)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.problem.code : 'contract_or_network_error')
    } finally {
      setWorking(false)
    }
  }
  return (
    <Panel
      title={t('title', { title: step.title || step.id })}
      onClose={() => {
        if (!working) onClose()
      }}
    >
      <p>{t('hint')}</p>
      <fieldset disabled={working} className="space-y-3">
        <label className="block">
          {t('target')}
          <select
            className={SELECT}
            value={target?.method_id ?? ''}
            onChange={(e) =>
              setTarget(methods.data?.find((m) => m.method_id === e.target.value) ?? null)
            }
          >
            <option value="">{t('new')}</option>
            {target && !methods.data?.some((m) => m.method_id === target.method_id) ? (
              <option value={target.method_id}>{target.title || target.method_id}</option>
            ) : null}
            {methods.data?.map((m) => (
              <option key={m.method_id} value={m.method_id}>
                {m.title || m.method_id} · {t('existing', { version: m.latest_version })}
              </option>
            ))}
          </select>
        </label>
        {methods.isError ? <p role="alert">{t('listFailed')}</p> : null}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || methods.isFetching}
            onClick={() => {
              setPage(page - 1)
            }}
          >
            {t('previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={methods.isFetching || !methods.data || methods.data.length < 30}
            onClick={() => {
              setPage(page + 1)
            }}
          >
            {t('next')}
          </Button>
        </div>
        <p>{t('version', { version })}</p>
        {step.uses.map((alias) => (
          <label className="block" key={alias}>
            {t('slot', { alias })}
            <input
              className={INPUT}
              value={slots[alias] ?? ''}
              maxLength={48}
              onChange={(e) => setSlots({ ...slots, [alias]: e.target.value })}
            />
          </label>
        ))}
        {step.uses.length ? <p className="text-muted-foreground text-xs">{t('slotHint')}</p> : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {t(
              error === 'method_source_invalid'
                ? 'sourceInvalid'
                : error === 'workdraft_revision' || error === 'method_version_conflict'
                  ? 'conflict'
                  : 'failed',
              { code: error },
            )}
          </p>
        ) : null}
        <Button disabled={!valid} onClick={() => void freeze()}>
          {t('confirm')}
        </Button>
      </fieldset>
    </Panel>
  )
}
