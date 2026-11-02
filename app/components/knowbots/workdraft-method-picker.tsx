'use client'

import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { BindMethodCommand, BindingPreview, MethodVersion } from '@/contracts/author-methods'
import type { MethodReference, Step } from '@/contracts/workdraft'
import { ApiClientError } from '@/lib/common/api-client'
import { getMethodVersion, listMethods, previewMethodBinding } from '@/lib/knowbots/methods'
import { same } from '@/lib/knowbots/workdraft'

import { INPUT, SELECT } from './workdraft-cells'
import { Panel } from './workdraft-panels'

const PAGE = 30

export function MethodPickerPanel({
  requestId,
  revision,
  step,
  sources,
  currentRef,
  csrfToken,
  onApply,
  onClose,
}: {
  requestId: string
  revision: number
  step: Step
  sources: Step[]
  currentRef?: MethodReference
  csrfToken: string
  onApply: (methodId: string, version: number, command: BindMethodCommand) => Promise<void>
  onClose: () => void
}) {
  const t = useTranslations('workdraft.methods')
  const [page, setPage] = useState(0)
  const [chosen, setChosen] = useState<{ id: string; version: number } | null>(
    currentRef ? { id: currentRef.method_id, version: currentRef.version } : null,
  )
  const [busy, setBusy] = useState(false)
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
  const close = () => {
    if (!busy) onClose()
  }
  return (
    <Panel title={t('title', { title: step.title || step.id })} onClose={close}>
      <p>{t('hint')}</p>
      {currentRef ? <p>{t('current', { version: currentRef.version })}</p> : null}
      <fieldset disabled={busy} className="space-y-3">
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
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setChosen({
                      id: item.method_id,
                      version:
                        item.method_id === currentRef?.method_id
                          ? currentRef.version
                          : item.latest_version,
                    })
                  }
                >
                  {item.title || item.method_id} · {t('version', { version: item.latest_version })}
                </Button>
                {item.summary ? (
                  <p className="text-muted-foreground text-xs">{item.summary}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0 || list.isFetching}
            onClick={() => setPage(page - 1)}
          >
            {t('previous')}
          </Button>
          <Button
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
              onChange={(e) => {
                const version = Number(e.target.value)
                if (Number.isInteger(version) && version >= 1 && version <= 999999)
                  setChosen({ ...chosen, version })
              }}
            />
          </label>
        ) : null}
      </fieldset>
      {chosen && exact.isError ? <p role="alert">{t('versionFailed')}</p> : null}
      {chosen && exact.isFetching ? <p>{t('loading')}</p> : null}
      {chosen && exact.data && !exact.isFetching && !exact.isError ? (
        <BindingForm
          key={`${chosen.id}:${chosen.version}`}
          method={exact.data}
          requestId={requestId}
          revision={revision}
          step={step}
          sources={sources}
          currentRef={currentRef}
          csrfToken={csrfToken}
          onApply={onApply}
          setBusy={setBusy}
        />
      ) : null}
    </Panel>
  )
}

function BindingForm({
  method,
  requestId,
  revision,
  step,
  sources,
  currentRef,
  csrfToken,
  onApply,
  setBusy,
}: {
  method: MethodVersion
  requestId: string
  revision: number
  step: Step
  sources: Step[]
  currentRef?: MethodReference
  csrfToken: string
  onApply: (id: string, version: number, command: BindMethodCommand) => Promise<void>
  setBusy: (busy: boolean) => void
}) {
  const t = useTranslations('workdraft.methods')
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    currentRef?.method_id === method.method_id ? { ...currentRef.inputs } : {},
  )
  const [required, setRequired] = useState(step.selection?.required ?? false)
  const [maxCalls, setMaxCalls] = useState(
    Math.min(step.selection?.max_calls ?? 1, method.definition.step.selection.max_calls),
  )
  const [preview, setPreview] = useState<{
    command: BindMethodCommand
    value: BindingPreview
  } | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slots = Object.keys(method.definition.input_schemas)
  const selectedInputs = Object.fromEntries(
    slots.filter((s) => inputs[s]).map((s) => [s, inputs[s]]),
  )
  const command: BindMethodCommand = {
    request_id: requestId,
    revision,
    alias: step.id,
    digest: method.digest,
    inputs: selectedInputs,
    required,
    max_calls: maxCalls,
  }
  const valid =
    slots.every((s) => sources.some((e) => e.id === inputs[s])) &&
    new Set(Object.values(selectedInputs)).size === slots.length
  const checked = preview !== null && same(preview.command, command)
  const run = async (apply: boolean) => {
    setWorking(true)
    setBusy(true)
    setError(null)
    try {
      if (apply) {
        if (!checked) return
        await onApply(method.method_id, method.version, command)
      } else {
        setPreview(null)
        const value = await previewMethodBinding(
          method.method_id,
          method.version,
          command,
          csrfToken,
        )
        setPreview({ command, value })
      }
    } catch (err) {
      setPreview(null)
      setError(err instanceof ApiClientError ? err.problem.code : 'contract_or_network_error')
    } finally {
      setWorking(false)
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3 border-t pt-3">
      <h3 className="font-medium">
        {method.definition.step.title} · {t('version', { version: method.version })}
      </h3>
      <p className="whitespace-pre-wrap">{method.definition.step.does}</p>
      <p className="text-muted-foreground text-xs">
        {t('applies')}: {method.definition.step.selection.applies_when}
      </p>
      <details>
        <summary>{t('identity')}</summary>
        <p className="text-xs break-all">
          {method.method_id}
          <br />
          {method.digest}
        </p>
      </details>
      <fieldset disabled={working} className="space-y-3">
        {slots.map((slot) => (
          <label key={slot} className="block">
            {t('input', { slot })}
            <select
              className={SELECT}
              value={inputs[slot] ?? ''}
              onChange={(e) => setInputs({ ...inputs, [slot]: e.target.value })}
            >
              <option value="">{t('chooseInput')}</option>
              {sources.map((source) => (
                <option value={source.id} key={source.id}>
                  {source.title || source.id}
                </option>
              ))}
            </select>
          </label>
        ))}
        {slots.length > 0 && sources.length === 0 ? <p>{t('noInput')}</p> : null}
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          {t('required')}
        </label>
        <label className="block">
          {t('maxCalls')}
          <input
            className={INPUT}
            type="number"
            min={1}
            max={method.definition.step.selection.max_calls}
            value={maxCalls}
            onChange={(e) => {
              const value = Number(e.target.value)
              if (
                Number.isInteger(value) &&
                value >= 1 &&
                value <= method.definition.step.selection.max_calls
              )
                setMaxCalls(value)
            }}
          />
        </label>
      </fieldset>
      {error ? (
        <p role="alert" className="text-destructive">
          {t(error === 'workdraft_revision' ? 'conflict' : 'failed', { code: error })}
        </p>
      ) : null}
      {checked ? <p role="status">{t('previewReady')}</p> : null}
      <div className="flex gap-2">
        <Button variant="outline" disabled={!valid || working} onClick={() => void run(false)}>
          {t('preview')}
        </Button>
        <Button disabled={!valid || working || !checked} onClick={() => void run(true)}>
          {t(currentRef ? 'replace' : 'bind')}
        </Button>
      </div>
    </div>
  )
}
